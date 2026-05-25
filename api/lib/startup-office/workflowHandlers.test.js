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
    activations: [],
    audits: [],
    loops: [],
    promotions: [],
    rateLimits: [],
    receiptMemory: [],
    receipts: [],
    rest: [],
    skillInvocationArgs: [],
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
    async findRunByIdempotencyKey(_teamID, key) {
      calls.findRunByIdempotencyKey = key;
      return overrides.idempotentRun || null;
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
    async enforceStartupOfficeRateLimit(membershipValue, action) {
      calls.rateLimits.push({ action, membership: membershipValue });
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
      if (overrides.approvalRecord) {
        return { id: approvalID, ...overrides.approvalRecord };
      }
      return {
        artifact_id: "artifact-1",
        id: approvalID,
        metadata: {},
        run_id: "run-1",
        status: "pending",
      };
    },
    async materializeStartupOfficeReceiptMemory(args) {
      calls.receiptMemory.push(args);
      return {
        pages: [{ slug: "loop-receipts" }, { slug: "learning-updates" }],
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
    async recordStartupOfficeApprovalActivation(args) {
      calls.activations.push({ milestone: "first_approval_decision", ...args });
    },
    async recordStartupOfficeRunActivation(args) {
      calls.activations.push({ milestone: "run_progress", ...args });
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
            skill_invocations: args.skillInvocations,
          },
          started_at: "2026-05-25T00:00:00.000Z",
          status: "approval_waiting",
          updated_at: "2026-05-25T00:01:00.000Z",
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
    startupOfficeBillingBlockReason(billing) {
      if (billing.payment_status === "blocked") return "blocked";
      return ["past_due", "paused", "canceled"].includes(billing.billing_state)
        ? billing.billing_state
        : "";
    },
    startupOfficeModelClient() {
      return { provider: "fake" };
    },
    startupOfficeLoopSkillInvocations(args) {
      calls.skillInvocationArgs.push(args);
      return [{
        input_keys: Object.keys(args.inputs || {}).sort(),
        input_snapshot: { objective: args.objective },
        reason: "Ground the loop in a reusable playbook.",
        selected_by: "startup_office_loop_manifest",
        sequence: 1,
        skill_name: "market-research",
      }];
    },
    startupOfficeReceiptMemoryPageSlugs: ["loop-receipts", "learning-updates"],
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
  assert.equal(deps.calls.rateLimits[0].action, "loop_run");
  assert.equal(deps.calls.createdRun.metadata.provider, "fake");
  assert.equal(deps.calls.createdRun.metadata.skill_invocations[0].skill_name, "market-research");
  assert.equal(deps.calls.createdWorkerJob.metadata.skill_invocations[0].reason, "Ground the loop in a reusable playbook.");
  assert.equal(deps.calls.createdWorkerJob.run_id, "run-1");
  assert.equal(deps.calls.receipts[0].event_type, "run.queued");
  assert.equal(deps.calls.receipts[0].trace.skill_invocations[0].input_keys[0], "market");
  assert.equal(deps.calls.audits[0][1], "startup_office.run_created");
  assert.equal(deps.calls.activations[0].milestone, "run_progress");
  assert.equal(deps.calls.activations[0].runID, "run-1");
  assert.equal(deps.calls.writes[0].status, 202);
  assert.equal(deps.calls.writes[0].body.status, "queued");
  assert.equal(deps.calls.loopRunArgs, undefined);
});

test("loopRun replays an existing idempotent run without duplicate side effects", async () => {
  const deps = baseDeps({
    idempotentRun: {
      id: "run-existing",
      idempotency_key: "run-key-1",
      metadata: {},
      status: "queued",
      title: "Existing run",
    },
  });
  const handlers = createStartupOfficeWorkflowHandlers(deps);

  await handlers.loopRun(
    { headers: { "idempotency-key": "run-key-1" }, method: "POST" },
    {},
    "idea-validation",
  );

  assert.equal(deps.calls.findRunByIdempotencyKey, "run-key-1");
  assert.equal(deps.calls.rateLimits.length, 0);
  assert.equal(deps.calls.createdRun, undefined);
  assert.equal(deps.calls.createdWorkerJob, undefined);
  assert.equal(deps.calls.receipts.length, 0);
  assert.equal(deps.calls.writes[0].status, 202);
  assert.equal(deps.calls.writes[0].body.idempotent, true);
  assert.equal(deps.calls.writes[0].body.run.id, "run-existing");
});

test("loopRun executes immediately and records usage plus notification events", async () => {
  const deps = baseDeps({
    async readBody() {
      return { inputs: { market: "founders" } };
    },
    startupOfficeApprovalPolicy(settings) {
      return settings.preferences.startup_office_approval_policy;
    },
    async workspaceSettings() {
      return {
        preferences: {
          startup_office_approval_policy: {
            action_modes: {
              external_send: "draft_only",
            },
          },
        },
      };
    },
  });
  const handlers = createStartupOfficeWorkflowHandlers(deps);

  await handlers.loopRun({ method: "POST" }, {}, "idea-validation");

  assert.equal(deps.calls.loopRunArgs.modelClient.provider, "fake");
  assert.equal(deps.calls.rateLimits[0].action, "loop_run");
  assert.equal(deps.calls.loopRunArgs.approvalPolicy.action_modes.external_send, "draft_only");
  assert.equal(deps.calls.createdRun.metadata.approval_policy.action_modes.external_send, "draft_only");
  assert.equal(deps.calls.createdWorkerJob.metadata.approval_policy.action_modes.external_send, "draft_only");
  assert.equal(deps.calls.loopRunArgs.skillInvocations[0].skill_name, "market-research");
  assert.equal(deps.calls.writes[0].status, 200);
  assert.equal(deps.calls.writes[0].body.status, "approval_waiting");
  assert.deepEqual(
    deps.calls.rest.map((call) => call.table),
    ["startup_office_usage_events", "startup_office_notifications"],
  );
  assert.equal(deps.calls.rest[0].options.body.cost_cents, 12);
  assert.equal(deps.calls.rest[0].options.body.idempotency_key, "run-1:model_run");
  assert.equal(deps.calls.rest[0].options.body.tool_calls, 1);
  assert.equal(deps.calls.rest[0].options.body.worker_duration_ms, 60000);
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
  assert.equal(deps.calls.rest[1].table, "startup_office_worker_jobs");
  assert.equal(deps.calls.rest[1].options.query.status, "in.(queued,running,failed)");
  assert.equal(deps.calls.rest[1].options.body.status, "canceled");
  assert.equal(deps.calls.receipts[0].event_type, "run.canceled");
  assert.equal(deps.calls.receipts[0].trace.canceled_worker_job_count, 1);
  assert.equal(deps.calls.audits[0][1], "startup_office.run_canceled");
  assert.equal(deps.calls.audits[0][4].canceled_worker_job_count, 1);
  assert.equal(deps.calls.writes[1].body.status, "canceled");
});

test("run cancel replays a matching idempotent cancellation without duplicate side effects", async () => {
  const deps = baseDeps({
    runRecord: {
      metadata: {
        cancellation_idempotency_key: "cancel-key-1",
        loop_slug: "idea-validation",
      },
      status: "canceled",
    },
  });
  const handlers = createStartupOfficeWorkflowHandlers(deps);

  await handlers.run(
    { headers: { "idempotency-key": "cancel-key-1" }, method: "POST" },
    {},
    "run-1",
    "cancel",
  );

  assert.equal(deps.calls.rateLimits.length, 0);
  assert.equal(deps.calls.updatedRun, undefined);
  assert.equal(deps.calls.receipts.length, 0);
  assert.equal(deps.calls.audits.length, 0);
  assert.equal(deps.calls.writes[0].body.idempotent, true);
  assert.equal(deps.calls.writes[0].body.run.status, "canceled");
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

  await handlers.run(
    { headers: { "idempotency-key": "retry-key-2" }, method: "POST" },
    {},
    "run-1",
    "retry",
  );

  assert.equal(deps.calls.createdWorkerJob.metadata.retry, true);
  assert.equal(deps.calls.updatedRun.patch.metadata.retry_idempotency_key, "retry-key-2");
  assert.equal(deps.calls.rateLimits[0].action, "loop_run");
  assert.equal(deps.calls.updatedRun.patch.metadata.skill_invocations[0].skill_name, "market-research");
  assert.equal(deps.calls.createdWorkerJob.metadata.skill_invocations[0].skill_name, "market-research");
  assert.equal(deps.calls.receipts[0].trace.skill_invocations[0].skill_name, "market-research");
  assert.equal(deps.calls.receipts[0].event_type, "run.retry_queued");
  assert.equal(deps.calls.audits[0][1], "startup_office.run_retry_queued");
  assert.equal(deps.calls.audits[0][4].worker_job_id, "job-1");
  assert.equal(deps.calls.writes[0].body.status, "approval_waiting");
});

test("run retry replays a matching idempotent retry without duplicate worker jobs", async () => {
  const deps = baseDeps({
    runRecord: {
      metadata: {
        loop_slug: "idea-validation",
        retry_idempotency_key: "retry-key-1",
      },
      status: "failed",
    },
  });
  const handlers = createStartupOfficeWorkflowHandlers(deps);

  await handlers.run(
    { headers: { "idempotency-key": "retry-key-1" }, method: "POST" },
    {},
    "run-1",
    "retry",
  );

  assert.equal(deps.calls.rateLimits.length, 0);
  assert.equal(deps.calls.updatedRun, undefined);
  assert.equal(deps.calls.createdWorkerJob, undefined);
  assert.equal(deps.calls.receipts.length, 0);
  assert.equal(deps.calls.audits.length, 0);
  assert.equal(deps.calls.writes[0].status, 200);
  assert.equal(deps.calls.writes[0].body.idempotent, true);
  assert.equal(deps.calls.writes[0].body.run.status, "failed");
});

test("approval action approves, promotes memory, records receipt, and audits", async () => {
  const deps = baseDeps({
    async readBody() {
      return { note: "Approved for beta use" };
    },
  });
  const handlers = createStartupOfficeWorkflowHandlers(deps);

  await handlers.approvalAction({ method: "POST" }, {}, "approval-1", "approve");

  assert.equal(deps.calls.rateLimits[0].action, "approval_action");
  assert.equal(deps.calls.rest[0].table, "startup_office_approvals");
  assert.equal(deps.calls.rest[0].options.body.status, "approved");
  assert.equal(deps.calls.rest[0].options.query.status, "eq.pending");
  assert.equal(deps.calls.rest[1].table, "startup_office_runs");
  assert.equal(deps.calls.rest[1].options.body.status, "completed");
  assert.equal(deps.calls.promotions[0].approval.id, "approval-1");
  assert.equal(deps.calls.receipts[0].event_type, "approval.approved");
  assert.deepEqual(deps.calls.receipts[0].trace.memory_pages, [
    "positioning",
    "loop-receipts",
    "learning-updates",
  ]);
  assert.equal(deps.calls.receiptMemory[0].approval.id, "approval-1");
  assert.equal(deps.calls.receiptMemory[0].receipt.id, "receipt-1");
  assert.equal(deps.calls.receiptMemory[0].run.status, "completed");
  assert.equal(deps.calls.audits[0][1], "startup_office.approved");
  assert.equal(deps.calls.activations[0].milestone, "first_approval_decision");
  assert.equal(deps.calls.activations[0].approval.id, "approval-1");
  assert.deepEqual(deps.calls.writes[0].body.memory_pages, [
    { slug: "positioning" },
    { slug: "loop-receipts" },
    { slug: "learning-updates" },
  ]);
});

test("approval action requests revision and queues a structured worker job", async () => {
  const deps = baseDeps({
    async readBody() {
      return { revision_note: "Tighten the ICP and remove the pricing claim." };
    },
    runRecord: {
      inputs: { market: "founders" },
      loop_id: "loop-1",
      metadata: { loop_slug: "idea-validation" },
      objective: "Validate idea",
      status: "waiting_approval",
    },
  });
  const handlers = createStartupOfficeWorkflowHandlers(deps);

  await handlers.approvalAction({ method: "POST" }, {}, "approval-1", "revise");

  assert.equal(deps.calls.rateLimits[0].action, "approval_action");
  assert.equal(deps.calls.rest[0].table, "startup_office_approvals");
  assert.equal(deps.calls.rest[0].options.body.status, "revision_requested");
  assert.equal(
    deps.calls.rest[0].options.body.metadata.revision_request.note,
    "Tighten the ICP and remove the pricing claim.",
  );
  assert.equal(deps.calls.rest[1].table, "startup_office_runs");
  assert.equal(deps.calls.rest[1].options.body.status, "queued");
  assert.equal(
    deps.calls.rest[1].options.body.metadata.revision_request.approval_id,
    "approval-1",
  );
  assert.equal(deps.calls.createdWorkerJob.metadata.revision, true);
  assert.equal(
    deps.calls.createdWorkerJob.metadata.revision_request.note,
    "Tighten the ICP and remove the pricing claim.",
  );
  assert.equal(deps.calls.createdWorkerJob.metadata.skill_invocations[0].skill_name, "market-research");
  assert.equal(deps.calls.createdWorkerJob.run_id, "run-1");
  assert.equal(deps.calls.receipts[0].event_type, "approval.revision_requested");
  assert.equal(deps.calls.receipts[0].trace.worker_job_id, "job-1");
  assert.equal(deps.calls.receipts[0].trace.revision_request.source, "approval_revision");
  assert.equal(deps.calls.audits[0][1], "startup_office.revision_requested");
  assert.equal(deps.calls.writes[0].body.status, "revision_queued");
  assert.equal(deps.calls.writes[0].body.worker_job.id, "job-1");
});

test("approval revision requires a concrete revision note", async () => {
  const handlers = createStartupOfficeWorkflowHandlers(baseDeps());

  await assert.rejects(
    () => handlers.approvalAction({ method: "POST" }, {}, "approval-1", "revise"),
    (err) => err.status === 400 && err.message === "revision_note is required",
  );
});

test("approval action replays a matching idempotent decision", async () => {
  const deps = baseDeps({
    approvalRecord: {
      artifact_id: "artifact-1",
      idempotency_key: "decision-key-1",
      metadata: {},
      run_id: "run-1",
      status: "approved",
    },
  });
  const handlers = createStartupOfficeWorkflowHandlers(deps);

  await handlers.approvalAction(
    { headers: { "idempotency-key": "decision-key-1" }, method: "POST" },
    {},
    "approval-1",
    "approve",
  );

  assert.equal(deps.calls.rest.length, 0);
  assert.equal(deps.calls.rateLimits.length, 0);
  assert.equal(deps.calls.receipts.length, 0);
  assert.equal(deps.calls.writes[0].body.idempotent, true);
  assert.equal(deps.calls.writes[0].body.approval.status, "approved");
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

  const blockedPayment = createStartupOfficeWorkflowHandlers(baseDeps({
    async startupOfficeBetaOpsSnapshot() {
      return {
        billing: {
          billing_state: "active",
          monthly_model_spend_cents: 100,
          monthly_run_limit: 10,
          payment_status: "blocked",
        },
        usage: {
          model_spend_cents: 0,
          runs: 0,
        },
      };
    },
  }));
  await assert.rejects(
    () => blockedPayment.loopRun({ method: "POST" }, {}, "idea-validation"),
    (err) => err.status === 402 && err.message === "billing state blocks AI runs: blocked",
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

  const invalidRunPayload = createStartupOfficeWorkflowHandlers(baseDeps({
    async readBody() {
      return { defer: "yes" };
    },
  }));
  await assert.rejects(
    () => invalidRunPayload.loopRun({ method: "POST" }, {}, "idea-validation"),
    (err) => err.status === 400 && err.message === "defer must be a boolean",
  );
});

test("workflow handlers honor central commercial entitlement blocks", async () => {
  const handlers = createStartupOfficeWorkflowHandlers(baseDeps({
    startupOfficeEntitlementBlock(snapshot, scope) {
      assert.equal(scope, "ai_runs");
      return snapshot.entitlements.blocks[0];
    },
    async startupOfficeBetaOpsSnapshot() {
      return {
        billing: { billing_state: "active" },
        entitlements: {
          blocks: [
            {
              message: "monthly Startup Office model spend limit reached",
              scope: "ai_runs",
            },
          ],
        },
        usage: { model_spend_cents: 100, runs: 1 },
      };
    },
  }));

  await assert.rejects(
    () => handlers.loopRun({ method: "POST" }, {}, "idea-validation"),
    (err) =>
      err.status === 402 &&
      err.message === "monthly Startup Office model spend limit reached",
  );
});

test("workflow handlers enforce workspace-user rate limits before mutations", async () => {
  const deps = baseDeps({
    async enforceStartupOfficeRateLimit(_membership, action) {
      deps.calls.rateLimits.push({ action });
      const err = new Error("rate limit exceeded");
      err.status = 429;
      throw err;
    },
  });
  const handlers = createStartupOfficeWorkflowHandlers(deps);

  await assert.rejects(
    () => handlers.loopRun({ method: "POST" }, {}, "idea-validation"),
    (err) => err.status === 429 && err.message === "rate limit exceeded",
  );
  assert.equal(deps.calls.rateLimits[0].action, "loop_run");
  assert.equal(deps.calls.createdRun, undefined);

  await assert.rejects(
    () => handlers.approvalAction({ method: "POST" }, {}, "approval-1", "approve"),
    (err) => err.status === 429 && err.message === "rate limit exceeded",
  );
  assert.equal(deps.calls.rateLimits[1].action, "approval_action");
  assert.equal(deps.calls.rest.length, 0);
});
