const assert = require("node:assert/strict");
const test = require("node:test");

const { runStartupOfficeLoop } = require("./loopRunner");

test("startup office loop runner creates AI artifact, approval, receipt, and cost metadata", async () => {
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
    truncateText,
    workerJob: { id: "job-1" },
  });

  assert.equal(result.status, "waiting_approval");
  assert.equal(result.run.status, "waiting_approval");
  assert.equal(result.run.metadata.cost.total_tokens, 30);
  assert.equal(result.artifact.title, "Idea Validation AI draft");
  assert.equal(result.approval.status, "pending");
  assert.equal(state.receipts.at(-1).event_type, "run.ai_draft_ready");
  assert.deepEqual(
    state.runPatches.map((patch) => patch.status),
    ["running", "waiting_approval"],
  );
  assert.deepEqual(
    state.jobPatches.map((patch) => patch.status),
    ["running", "completed"],
  );
});

test("startup office loop runner records failed model calls as receipted run failures", async () => {
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
    truncateText,
    workerJob: { id: "job-1" },
  });

  assert.equal(result.status, "failed");
  assert.equal(result.run.status, "failed");
  assert.equal(result.run.metadata.cost.pricing_source, "not_billed");
  assert.equal(state.receipts.at(-1).event_type, "run.failed");
  assert.equal(state.jobPatches.at(-1).status, "failed");
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

function fixedNow() {
  return "2026-05-24T00:00:00.000Z";
}

function truncateText(value, max) {
  return String(value || "").slice(0, max);
}
