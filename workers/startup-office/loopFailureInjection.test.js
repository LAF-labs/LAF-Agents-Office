const assert = require("node:assert/strict");
const test = require("node:test");

const { runStartupOfficeLoop } = require("./loopEngine");

test("core loop chaos: model failure leaves no business side effects", async () => {
  const state = fakeRepositoryState();
  const result = await runStartupOfficeLoop({
    inputs: {},
    loop: ideaValidationLoop(),
    membership: membership(),
    modelClient: failingModelClient(),
    nowISO: fixedNow,
    objective: "Inject a model outage.",
    profile: { name: "LAF Labs" },
    repository: fakeRepository(state),
    run: queuedRun(),
    truncateText,
    workerJob: { id: "job-1" },
  });

  assert.equal(result.status, "failed");
  assert.equal(result.run.status, "failed");
  assert.equal(state.artifacts.length, 0);
  assert.equal(state.approvals.length, 0);
  assert.equal(state.receipts.at(-1).event_type, "run.failed");
  assert.equal(state.jobPatches.at(-1).status, "failed");
});

test("core loop chaos: artifact write failure is visible and never creates approval", async () => {
  const state = fakeRepositoryState({ failAt: "artifact" });
  const result = await runStartupOfficeLoop({
    inputs: {},
    loop: ideaValidationLoop(),
    membership: membership(),
    modelClient: successfulModelClient(),
    nowISO: fixedNow,
    objective: "Inject an artifact write failure.",
    profile: { name: "LAF Labs" },
    repository: fakeRepository(state),
    run: queuedRun(),
    truncateText,
    workerJob: { id: "job-1" },
  });

  assert.equal(result.status, "failed");
  assert.match(result.error, /injected artifact write failure/);
  assert.equal(state.artifacts.length, 0);
  assert.equal(state.approvals.length, 0);
  assert.equal(state.audits.some((audit) => audit.action === "startup_office.run_waiting_approval"), false);
  assert.equal(state.receipts.at(-1).event_type, "run.failed");
});

test("core loop chaos: approval write failure fails closed after artifact creation", async () => {
  const state = fakeRepositoryState({ failAt: "approval" });
  const result = await runStartupOfficeLoop({
    inputs: {},
    loop: ideaValidationLoop(),
    membership: membership(),
    modelClient: successfulModelClient(),
    nowISO: fixedNow,
    objective: "Inject an approval write failure.",
    profile: { name: "LAF Labs" },
    repository: fakeRepository(state),
    run: queuedRun(),
    truncateText,
    workerJob: { id: "job-1" },
  });

  assert.equal(result.status, "failed");
  assert.match(result.error, /injected approval write failure/);
  assert.equal(state.artifacts.length, 1);
  assert.equal(state.artifacts[0].idempotency_key, "run-1:job-1:artifact");
  assert.equal(state.approvals.length, 0);
  assert.equal(state.audits.some((audit) => audit.action === "startup_office.approval.created"), false);
  assert.equal(state.audits.some((audit) => audit.action === "startup_office.run_waiting_approval"), false);
  assert.equal(state.runPatches.at(-1).status, "failed");
  assert.equal(state.jobPatches.at(-1).status, "failed");
  assert.equal(state.receipts.at(-1).event_type, "run.failed");
});

function fakeRepositoryState(overrides = {}) {
  return {
    approvals: [],
    artifacts: [],
    audits: [],
    failAt: "",
    jobPatches: [],
    receipts: [],
    runPatches: [],
    ...overrides,
  };
}

function fakeRepository(state) {
  return {
    artifacts: async () => [],
    approvals: async () => [],
    createApproval: async (membershipValue, body) => {
      if (state.failAt === "approval") throw new Error("injected approval write failure");
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
      if (state.failAt === "artifact") throw new Error("injected artifact write failure");
      const artifact = {
        id: `artifact-${state.artifacts.length + 1}`,
        created_at: fixedNow(),
        team_id: membershipValue.team_id,
        ...body,
      };
      state.artifacts.push(artifact);
      return artifact;
    },
    createAuditEvent: async (membershipValue, body) => {
      const audit = {
        id: `audit-${state.audits.length + 1}`,
        team_id: membershipValue.team_id,
        ...body,
      };
      state.audits.push(audit);
      return audit;
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
    generateStructured: async () => successfulModelOutput(),
  };
}

function failingModelClient() {
  return {
    model: "fake-model",
    provider: "fake",
    generateStructured: async () => {
      throw new Error("injected model outage");
    },
  };
}

function successfulModelOutput() {
  return {
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
      assumptions: [{
        claim: "Founders will pay for controlled validation.",
        confidence: "medium",
        evidence_needed: "Paid beta deposits.",
      }],
      customer_segment: "Solo B2B founders",
      icp_hypothesis: "Solo B2B founders validating paid demand before hiring operators.",
      next_actions: ["Ask five founders for paid beta commitments."],
      next_evidence: [{
        experiment: "Five discovery interviews",
        owner_action: "Ask each founder for a paid beta commitment.",
        success_signal: "Two deposits or signed commitments.",
      }],
      risk_level: "medium",
      risks: ["The wedge may still be too broad."],
      sources: [],
      summary: "A paid-beta validation wedge is plausible.",
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
  return "2026-05-26T00:00:00.000Z";
}

function truncateText(value, max) {
  return String(value || "").slice(0, max);
}
