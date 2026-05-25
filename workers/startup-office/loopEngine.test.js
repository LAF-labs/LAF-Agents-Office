const assert = require("node:assert/strict");
const test = require("node:test");

const { runStartupOfficeLoop } = require("./loopEngine");

test("startup office loop engine creates AI artifact, approval, receipt, and cost metadata", async () => {
  const state = fakeRepositoryState();
  const result = await runStartupOfficeLoop({
    inputs: { market: "AI operations" },
    loop: ideaValidationLoop(),
    membership: membership(),
    modelClient: successfulModelClient(),
    nowISO: fixedNow,
    objective: "Validate the first buyer segment",
    profile: { name: "LAF Labs" },
    repository: fakeRepository(state),
    run: queuedRun(),
    skillInvocations: skillInvocations(),
    truncateText,
    workerJob: { id: "job-1" },
  });

  assert.equal(result.status, "waiting_approval");
  assert.equal(result.run.status, "waiting_approval");
  assert.equal(result.run.metadata.cost.total_tokens, 30);
  assert.equal(result.run.metadata.skill_invocations[0].skill_name, "market-research");
  assert.equal(result.artifact.metadata.skill_invocations[0].reason, "Validate market evidence.");
  assert.equal(result.approval.metadata.skill_invocations[0].skill_name, "market-research");
  assert.equal(result.artifact.title, "Idea Validation AI draft");
  assert.equal(result.artifact.idempotency_key, "run-1:job-1:artifact");
  assert.equal(result.approval.status, "pending");
  assert.equal(result.approval.idempotency_key, "run-1:job-1:approval");
  assert.equal(state.receipts.at(-1).event_type, "run.ai_draft_ready");
  assert.equal(state.receipts.at(0).trace.skill_invocations[0].skill_name, "market-research");
  assert.equal(state.receipts.at(-1).trace.skill_invocations[0].input_snapshot.objective, "Validate the first buyer segment");
  assert.deepEqual(
    state.runPatches.map((patch) => patch.status),
    ["running", "waiting_approval"],
  );
  assert.deepEqual(
    state.jobPatches.map((patch) => patch.status),
    ["running", "completed"],
  );
});

test("startup office loop engine records failed model calls as receipted run failures", async () => {
  const state = fakeRepositoryState();
  const result = await runStartupOfficeLoop({
    inputs: {},
    loop: ideaValidationLoop(),
    membership: membership(),
    modelClient: failingModelClient(),
    nowISO: fixedNow,
    objective: "Validate the first buyer segment",
    profile: { name: "LAF Labs" },
    repository: fakeRepository(state),
    run: queuedRun(),
    skillInvocations: skillInvocations(),
    truncateText,
    workerJob: { id: "job-1" },
  });

  assert.equal(result.status, "failed");
  assert.equal(result.run.status, "failed");
  assert.equal(result.run.metadata.cost.pricing_source, "not_billed");
  assert.equal(result.run.metadata.skill_invocations[0].skill_name, "market-research");
  assert.equal(state.receipts.at(-1).event_type, "run.failed");
  assert.equal(state.receipts.at(-1).trace.skill_invocations[0].skill_name, "market-research");
  assert.equal(state.jobPatches.at(-1).status, "failed");
});

test("startup office loop engine blocks externally informed drafts without citations", async () => {
  const state = fakeRepositoryState();
  const result = await runStartupOfficeLoop({
    inputs: {
      sources: [{ label: "Market report", url: "https://example.com/market-report" }],
    },
    loop: ideaValidationLoop(),
    membership: membership(),
    modelClient: successfulModelClient(),
    nowISO: fixedNow,
    objective: "Validate the first buyer segment from an attached report",
    profile: { name: "LAF Labs" },
    repository: fakeRepository(state),
    run: queuedRun(),
    skillInvocations: skillInvocations(),
    truncateText,
    workerJob: { id: "job-1" },
  });

  assert.equal(result.status, "failed");
  assert.match(result.error, /externally informed outputs require source citations/);
  assert.equal(result.run.status, "failed");
  assert.equal(state.artifacts.length, 0);
  assert.equal(state.approvals.length, 0);
  assert.equal(state.receipts.at(-1).event_type, "run.failed");
});

function fakeRepositoryState() {
  return {
    approvals: [],
    artifacts: [],
    jobPatches: [],
    receipts: [],
    runPatches: [],
  };
}

function fakeRepository(state) {
  return {
    artifacts: async () => [],
    approvals: async () => [],
    createApproval: async (membershipValue, body) => {
      const approval = {
        id: `approval-${state.approvals.length + 1}`,
        requested_at: fixedNow(),
        team_id: membershipValue.team_id,
        ...body,
      };
      state.approvals.push(approval);
      return approval;
    },
    createArtifact: async (membershipValue, body) => {
      const artifact = {
        id: `artifact-${state.artifacts.length + 1}`,
        created_at: fixedNow(),
        team_id: membershipValue.team_id,
        ...body,
      };
      state.artifacts.push(artifact);
      return artifact;
    },
    createReceipt: async (membershipValue, body) => {
      const receipt = {
        id: `receipt-${state.receipts.length + 1}`,
        created_at: fixedNow(),
        team_id: membershipValue.team_id,
        ...body,
      };
      state.receipts.push(receipt);
      return receipt;
    },
    memoryPages: async () => [],
    receipts: async () => [],
    runs: async () => [],
    safeRest: async () => [],
    updateRun: async (teamID, runID, patch) => {
      state.runPatches.push(patch);
      return {
        ...queuedRun(),
        ...patch,
        id: runID,
        team_id: teamID,
      };
    },
    updateWorkerJob: async (teamID, jobID, patch) => {
      state.jobPatches.push(patch);
      return { id: jobID, team_id: teamID, ...patch };
    },
  };
}

function successfulModelClient() {
  return {
    model: "fake-model",
    provider: "fake",
    generateStructured: async () => ({
      cost: {
        currency: "USD",
        estimated_usd: null,
        input_tokens: 10,
        model: "fake-model",
        output_tokens: 20,
        pricing_source: "usage_tokens_only",
        provider: "fake",
        total_tokens: 30,
      },
      data: {
        assumptions: [
          {
            claim: "Founders will pay for controlled validation.",
            confidence: "medium",
            evidence_needed: "Paid beta deposits.",
          },
        ],
        customer_segment: "Solo B2B founders",
        icp_hypothesis:
          "Solo B2B founders who need a paid-beta validation package before hiring operators.",
        next_evidence: [
          {
            experiment: "Five discovery interviews",
            owner_action: "Ask each founder for a paid beta commitment.",
            success_signal: "Two deposits or signed commitments.",
          },
        ],
        next_actions: ["Ask five founders for paid beta commitments."],
        risk_level: "medium",
        risks: ["The wedge may still be too broad."],
        sources: [],
        summary: "A paid-beta validation wedge is plausible.",
      },
    }),
  };
}

function failingModelClient() {
  return {
    model: "fake-model",
    provider: "fake",
    generateStructured: async () => {
      throw new Error("model unavailable");
    },
  };
}

function membership() {
  return {
    team_id: "team-1",
    user_id: "user-1",
  };
}

function ideaValidationLoop() {
  return {
    id: "loop-1",
    name: "Idea Validation",
    slug: "idea-validation",
  };
}

function queuedRun() {
  return {
    id: "run-1",
    inputs: {},
    metadata: {},
    status: "queued",
    title: "Idea Validation",
  };
}

function skillInvocations() {
  return [{
    input_keys: ["market"],
    input_snapshot: { objective: "Validate the first buyer segment" },
    reason: "Validate market evidence.",
    selected_by: "startup_office_loop_manifest",
    sequence: 1,
    skill_name: "market-research",
  }];
}

function fixedNow() {
  return "2026-05-24T00:00:00.000Z";
}

function truncateText(value, max) {
  return String(value || "").slice(0, max);
}
