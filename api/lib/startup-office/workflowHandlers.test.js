const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createStartupOfficeWorkflowHandlers,
} = require("./workflowHandlers");

const membership = Object.freeze({
  team_id: "team-1",
  user_id: "user-1",
});

function baseDeps(overrides = {}) {
  const calls = {
    audits: [],
    loops: [],
    promotions: [],
    receipts: [],
    rest: [],
    writes: [],
  };
  const repository = {
    async createRun(_membership, body) {
      calls.createdRun = body;
      return { id: "run-1", ...body };
    },
    async createWorkerJob(_membership, body) {
      calls.createdWorkerJob = body;
      return { id: "job-1", ...body };
    },
    async findArtifact(_teamID, artifactID) {
      return artifactID ? { content: "Founder memo", id: artifactID, title: "Memo" } : null;
    },
    async findRun(_teamID, runID) {
      if (overrides.runRecord) {
        return { id: runID, ...overrides.runRecord };
      }
      return {
        id: runID,
        inputs: { prior: true },
        loop_id: "loop-1",
        metadata: { loop_slug: "idea-validation" },
        objective: "Validate idea",
        status: "queued",
      };
    },
    async updateRun(_teamID, runID, patch) {
      calls.updatedRun = { patch, runID };
      return { id: runID, ...patch };
    },
  };
  const deps = {
    calls,
    async applyStartupOfficeMemoryPromotion(args) {
      calls.promotions.push(args);
      return {
        diff: { pages: ["positioning"] },
        pages: [{ slug: "positioning" }],
      };
    },
    async companyProfileSnapshot() {
      return { name: "Acme", priority: "Validate the paid beta wedge" };
    },
    createHTTPError(status, message) {
      const err = new Error(message);
      err.status = status;
      return err;
    },
    async createStartupOfficeReceipt(_membership, body) {
      calls.receipts.push(body);
      return { id: `receipt-${calls.receipts.length}`, ...body };
    },
    async ensureStartupOfficeLoop(_membership, loopID) {
      calls.loops.push(loopID);
      return {
        id: "loop-1",
        name: "Idea Validation",
        objective: "Validate the founder idea",
        slug: "idea-validation",
      };
    },
    async findStartupOfficeApproval(_teamID, approvalID) {
      return {
        artifact_id: "artifact-1",
        id: approvalID,
        run_id: "run-1",
        status: "pending",
      };
    },
    nowISO() {
      return "2026-05-25T00:00:00.000Z";
    },
    objectValue(value) {
      return value && typeof value === "object" && !Array.isArray(value) ? value : {};
    },
    publicStartupOfficeApproval(row) {
      return row ? { ...row, public: "approval" } : null;
    },
    publicStartupOfficeArtifact(row) {
      return row ? { ...row, public: "artifact" } : null;
    },
    publicStartupOfficeRun(row) {
      return row ? { ...row, public: "run" } : null;
    },
    async readBody() {
      return {};
    },
    requirePermission(_membership, permission) {
      calls.permission = permission;
    },
    async requireUser() {
      return {
        membership,
        team: { id: "team-1", name: "Acme", slug: "acme" },
        user: { id: "user-1" },
      };
    },
    async runStartupOfficeLoop(args) {
      calls.loopRunArgs = args;
      return {
        approval: { id: "approval-1" },
        artifact: { id: "artifact-1" },
        receipt: { id: "receipt-result" },
        run: {
          id: args.run.id,
          metadata: {
            cost: {
              estimated_cents: 12,
              input_tokens: 10,
              model: "fake-model",
              output_tokens: 20,
              provider: "fake",
              total_tokens: 30,
            },
          },
          status: "approval_waiting",
        },
        status: "approval_waiting",
      };
    },
    async safeStartupOfficeRest(table, options) {
      calls.rest.push({ options, table });
      if (table === "startup_office_approvals") {
        return [{ id: "approval-1", ...options.body }];
      }
      if (table === "startup_office_runs") {
        return [{ id: "run-1", ...options.body }];
      }
      return [{ id: `${table}-${calls.rest.length}`, ...options.body }];
    },
    shortID() {
      return "short";
    },
    async startupOfficeApprovals(_teamID, options) {
      return [{ id: "approval-1", options }];
    },
    async startupOfficeArtifacts(_teamID, options) {
      return [{ id: "artifact-1", options }];
    },
    async startupOfficeBetaOpsSnapshot() {
      return {
        billing: {
          billing_state: "active",
          monthly_model_spend_cents: 10000,
          monthly_run_limit: 100,
        },
        usage: {
          model_spend_cents: 0,
          runs: 0,
        },
      };
    },
    startupOfficeModelClient() {
      return { provider: "fake" };
    },
    async startupOfficeReceipts(_teamID, options) {
      return [{ id: "receipt-1", options }];
    },
    startupOfficeRepository() {
      return repository;
    },
    truncateText(value, max) {
      return String(value || "").slice(0, max);
    },
    async writeAuditEvent(...args) {
      calls.audits.push(args);
    },
    writeJSON(_res, status, body) {
      calls.writes.push({ body, status });
    },
    ...overrides,
  };
  return deps;
}

test("loopRun can queue a deferred run without executing the worker", async () => {
  const deps = baseDeps({
    async readBody() {
      return { defer: true, inputs: { market: "founders" }, title: "Validate wedge" };
    },
  });
  const handlers = createStartupOfficeWorkflowHandlers(deps);

  await handlers.loopRun({ method: "POST" }, {}, "idea-validation");

  assert.equal(deps.calls.permission, "memory:write_draft");
  assert.equal(deps.calls.createdRun.metadata.provider, "fake");
  assert.equal(deps.calls.createdWorkerJob.run_id, "run-1");
  assert.equal(deps.calls.receipts[0].event_type, "run.queued");
  assert.equal(deps.calls.audits[0][1], "startup_office.run_created");
  assert.equal(deps.calls.writes[0].status, 202);
  assert.equal(deps.calls.writes[0].body.status, "queued");
  assert.equal(deps.calls.loopRunArgs, undefined);
});

test("loopRun executes immediately and records usage plus notification events", async () => {
  const deps = baseDeps({
    async readBody() {
      return { inputs: { market: "founders" } };
    },
  });
  const handlers = createStartupOfficeWorkflowHandlers(deps);

  await handlers.loopRun({ method: "POST" }, {}, "idea-validation");

  assert.equal(deps.calls.loopRunArgs.modelClient.provider, "fake");
  assert.equal(deps.calls.writes[0].status, 200);
  assert.equal(deps.calls.writes[0].body.status, "approval_waiting");
  assert.deepEqual(
    deps.calls.rest.map((call) => call.table),
    ["startup_office_usage_events", "startup_office_notifications"],
  );
  assert.equal(deps.calls.rest[0].options.body.cost_cents, 12);
  assert.equal(deps.calls.rest[1].options.body.event_type, "approval_waiting");
});

test("run handler returns run detail and can cancel an unfinished run", async () => {
  const deps = baseDeps();
  const handlers = createStartupOfficeWorkflowHandlers(deps);

  await handlers.run({ method: "GET" }, {}, "run-1", "");
  assert.equal(deps.calls.writes[0].body.run.public, "run");
  assert.equal(deps.calls.writes[0].body.artifacts[0].options.run_id, "run-1");

  await handlers.run({ method: "POST" }, {}, "run-1", "cancel");
  assert.equal(deps.calls.updatedRun.patch.status, "canceled");
  assert.equal(deps.calls.receipts[0].event_type, "run.canceled");
  assert.equal(deps.calls.audits[0][1], "startup_office.run_canceled");
  assert.equal(deps.calls.writes[1].body.status, "canceled");
});

test("run handler retries failed runs through the worker path", async () => {
  const deps = baseDeps({
    runRecord: {
      inputs: { old: true },
      loop_id: "loop-1",
      metadata: { loop_slug: "idea-validation" },
      objective: "Old objective",
      status: "failed",
    },
  });
  const handlers = createStartupOfficeWorkflowHandlers(deps);

  await handlers.run({ method: "POST" }, {}, "run-1", "retry");

  assert.equal(deps.calls.createdWorkerJob.metadata.retry, true);
  assert.equal(deps.calls.receipts[0].event_type, "run.retry_queued");
  assert.equal(deps.calls.writes[0].body.status, "approval_waiting");
});

test("approval action approves, promotes memory, records receipt, and audits", async () => {
  const deps = baseDeps({
    async readBody() {
      return { note: "Approved for beta use" };
    },
  });
  const handlers = createStartupOfficeWorkflowHandlers(deps);

  await handlers.approvalAction({ method: "POST" }, {}, "approval-1", "approve");

  assert.equal(deps.calls.rest[0].table, "startup_office_approvals");
  assert.equal(deps.calls.rest[0].options.body.status, "approved");
  assert.equal(deps.calls.rest[1].table, "startup_office_runs");
  assert.equal(deps.calls.rest[1].options.body.status, "completed");
  assert.equal(deps.calls.promotions[0].approval.id, "approval-1");
  assert.equal(deps.calls.receipts[0].event_type, "approval.approved");
  assert.equal(deps.calls.audits[0][1], "startup_office.approved");
  assert.deepEqual(deps.calls.writes[0].body.memory_pages, [{ slug: "positioning" }]);
});

test("workflow handlers preserve run-limit and missing approval errors", async () => {
  const overLimit = createStartupOfficeWorkflowHandlers(baseDeps({
    async startupOfficeBetaOpsSnapshot() {
      return {
        billing: {
          billing_state: "active",
          monthly_model_spend_cents: 100,
          monthly_run_limit: 1,
        },
        usage: {
          model_spend_cents: 0,
          runs: 1,
        },
      };
    },
  }));
  await assert.rejects(
    () => overLimit.loopRun({ method: "POST" }, {}, "idea-validation"),
    (err) => err.status === 402 && err.message === "monthly Startup Office run limit reached",
  );

  const missingApproval = createStartupOfficeWorkflowHandlers(baseDeps({
    async findStartupOfficeApproval() {
      return null;
    },
  }));
  await assert.rejects(
    () => missingApproval.approvalAction({ method: "POST" }, {}, "missing", "approve"),
    (err) => err.status === 404 && err.message === "approval not found",
  );
});
