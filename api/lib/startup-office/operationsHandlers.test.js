const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createStartupOfficeOperationsHandlers,
} = require("./operationsHandlers");
const { startupOfficeApprovalPolicy } = require("./approvalPolicy");

const membership = Object.freeze({
  team_id: "team-1",
  user_id: "user-1",
});

function baseDeps(overrides = {}) {
  const calls = {
    audits: [],
    permissions: [],
    adminChecks: [],
    rest: [],
    settingsPatches: [],
    billingDocuments: [],
    billingPatches: [],
    writes: [],
  };
  const deps = {
    calls,
    clamp(value, min, max) {
      return Math.min(max, Math.max(min, value));
    },
    createHTTPError(status, message) {
      const err = new Error(message);
      err.status = status;
      return err;
    },
    nowISO() {
      return "2026-05-25T12:00:00.000Z";
    },
    objectValue(value) {
      return value && typeof value === "object" && !Array.isArray(value) ? value : {};
    },
    async readBody() {
      return {};
    },
    requireAdminRole(value, message) {
      calls.adminChecks.push({ message, membership: value });
    },
    requirePermission(value, permission) {
      calls.permissions.push({ membership: value, permission });
    },
    async requireUser() {
      return {
        membership,
        team: { id: "team-1", name: "Acme", slug: "acme" },
      };
    },
    async safeStartupOfficeRest(table, options) {
      calls.rest.push({ options, table });
      return [];
    },
    startupOfficeApprovalPolicy(settings) {
      return {
        require_citations_for_public_claims: Boolean(
          settings?.preferences?.startup_office_approval_policy
            ?.require_citations_for_public_claims,
        ),
      };
    },
    async startupOfficeApprovals() {
      return [];
    },
    async startupOfficeBetaOpsSnapshot() {
      return {
        billing: { support_notes: "" },
        billing_documents: [],
        usage: { monthly_runs: 1 },
      };
    },
    startupOfficeBillingProviderValue(value) {
      return String(value || "manual");
    },
    startupOfficeBillingStateValue(value) {
      return String(value || "trial");
    },
    startupOfficePaymentStatusValue(value) {
      return String(value || "trial");
    },
    async startupOfficeRuns() {
      return [];
    },
    async startupOfficeStuckJobs() {
      return [];
    },
    truncateText(value, max) {
      return String(value || "").slice(0, max);
    },
    async upsertStartupOfficeBilling(_teamID, patch) {
      calls.billingPatches.push(patch);
      return patch;
    },
    async upsertStartupOfficeBillingDocument(_membership, patch) {
      calls.billingDocuments.push(patch);
      return { id: "billing-document-1", ...patch };
    },
    async upsertWorkspaceSettings(_teamID, patch) {
      calls.settingsPatches.push(patch);
      return patch;
    },
    async workspaceSettings() {
      return { preferences: {} };
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

test("policy handler reads and updates approval policy through injected services", async () => {
  const deps = baseDeps({
    async readBody() {
      return {
        policy: {
          require_citations_for_public_claims: true,
        },
      };
    },
  });
  const handlers = createStartupOfficeOperationsHandlers(deps);

  await handlers.policy({ method: "GET" }, {});
  assert.deepEqual(deps.calls.permissions[0].permission, "workspace:read");
  assert.deepEqual(deps.calls.writes[0], {
    body: { policy: { require_citations_for_public_claims: false } },
    status: 200,
  });

  await handlers.policy({ method: "PATCH" }, {});
  assert.deepEqual(deps.calls.permissions[1].permission, "workspace:manage");
  assert.equal(
    deps.calls.settingsPatches[0].preferences.startup_office_approval_policy
      .require_citations_for_public_claims,
    true,
  );
  assert.equal(deps.calls.audits[0][1], "startup_office.policy_updated");
});

test("policy handler merges action modes without dropping existing approvals", async () => {
  const deps = baseDeps({
    startupOfficeApprovalPolicy,
    async workspaceSettings() {
      return {
        preferences: {
          startup_office_approval_policy: {
            action_modes: {
              external_send: "draft_only",
              payment: "approval_required",
            },
          },
        },
      };
    },
    async readBody() {
      return {
        policy: {
          action_modes: {
            publish: "draft_only",
          },
        },
      };
    },
  });
  const handlers = createStartupOfficeOperationsHandlers(deps);

  await handlers.policy({ method: "PATCH" }, {});

  const policy = deps.calls.settingsPatches[0].preferences.startup_office_approval_policy;
  assert.equal(policy.action_modes.external_send, "draft_only");
  assert.equal(policy.action_modes.payment, "approval_required");
  assert.equal(policy.action_modes.publish, "draft_only");
  assert.equal(policy.founder_approval_required.external_send, false);
  assert.equal(policy.founder_approval_required.payment, true);
  assert.equal(deps.calls.audits[0][4].action_modes.publish, "draft_only");
});

test("billing handler clamps beta limits and records an audit event", async () => {
  const deps = baseDeps({
    async readBody() {
      return {
        monthly_model_spend_cents: -10,
        monthly_run_limit: 200000,
        payment_status: "paid",
        plan: "paid-beta",
        provider: "manual",
        beta_agreement_url: "https://example.com/signed-beta-agreement.pdf",
        seat_limit: 7,
        state: "active",
        storage_mb_limit: 42,
      };
    },
  });
  const handlers = createStartupOfficeOperationsHandlers(deps);

  await handlers.billing({ method: "PATCH" }, {});
  const patch = deps.calls.billingPatches[0];
  assert.equal(patch.billing_state, "active");
  assert.equal(patch.billing_provider, "manual");
  assert.equal(patch.beta_agreement_url, "https://example.com/signed-beta-agreement.pdf");
  assert.equal(patch.monthly_model_spend_cents, 0);
  assert.equal(patch.monthly_run_limit, 100000);
  assert.equal(patch.payment_status, "paid");
  assert.equal(patch.seat_limit, 7);
  assert.equal(patch.storage_mb_limit, 42);
  assert.equal(deps.calls.billingDocuments[0].document_type, "agreement");
  assert.equal(
    deps.calls.billingDocuments[0].reference_url,
    "https://example.com/signed-beta-agreement.pdf",
  );
  assert.equal(deps.calls.adminChecks[0].message, "owner or admin role required for billing changes");
  assert.equal(deps.calls.audits[0][1], "startup_office.billing_updated");
  assert.equal(deps.calls.audits[0][4].billing_document_type, "agreement");
});

test("billing handler rejects paid beta state without contract or payment evidence", async () => {
  const deps = baseDeps({
    async readBody() {
      return {
        payment_status: "paid",
        provider: "manual",
        state: "active",
      };
    },
  });
  const handlers = createStartupOfficeOperationsHandlers(deps);

  await assert.rejects(
    () => handlers.billing({ method: "PATCH" }, {}),
    (err) =>
      err.status === 400 &&
      err.message === "paid beta requires signed agreement, paid invoice, or payment reference",
  );
  assert.equal(deps.calls.billingPatches.length, 0);
  assert.equal(deps.calls.billingDocuments.length, 0);
});

test("beta dashboard composes billing, failures, approvals, notifications, outbox, and stuck jobs", async () => {
  const deps = baseDeps({
    async safeStartupOfficeRest(table, options) {
      deps.calls.rest.push({ options, table });
      if (table === "startup_office_outbox_events") {
        return [{ event_type: "notification.approval_waiting", id: "outbox-1" }];
      }
      return [{ id: "notification-1" }];
    },
    async startupOfficeApprovals() {
      return [{ id: "approval-1" }];
    },
    async startupOfficeRuns() {
      return [
        { id: "run-1", status: "failed" },
        { id: "run-2", status: "completed" },
      ];
    },
    async startupOfficeStuckJobs() {
      return [{ id: "job-1" }];
    },
  });
  const handlers = createStartupOfficeOperationsHandlers(deps);

  await handlers.betaDashboard({ method: "GET" }, {});
  const dashboard = deps.calls.writes[0].body.dashboard;
  assert.deepEqual(dashboard.pending_approvals, [{ id: "approval-1" }]);
  assert.deepEqual(dashboard.notifications, [{ id: "notification-1" }]);
  assert.deepEqual(dashboard.outbox_events, [
    { event_type: "notification.approval_waiting", id: "outbox-1" },
  ]);
  assert.deepEqual(dashboard.run_failures, [{ id: "run-1", status: "failed" }]);
  assert.deepEqual(dashboard.stuck_jobs, [{ id: "job-1" }]);
  assert.equal(dashboard.team.slug, "acme");
  assert.equal(deps.calls.rest[0].table, "startup_office_notifications");
  assert.equal(deps.calls.rest[0].options.query.team_id, "eq.team-1");
  assert.equal(deps.calls.rest[1].table, "startup_office_outbox_events");
  assert.equal(deps.calls.rest[1].options.query.status, "in.(queued,failed,dead_letter)");
});

test("worker job retry requeues a dead-letter job and its run", async () => {
  const job = {
    attempts: 2,
    id: "job-1",
    metadata: { worker_id: "old-worker" },
    run_id: "run-1",
    status: "dead_letter",
  };
  const deps = baseDeps({
    async readBody() {
      return { note: "provider fixed" };
    },
    async safeStartupOfficeRest(table, options) {
      deps.calls.rest.push({ options, table });
      if (table === "startup_office_worker_jobs" && !options.method) return [job];
      return [{ id: table === "startup_office_runs" ? "run-1" : "job-1", ...options.body }];
    },
  });
  const handlers = createStartupOfficeOperationsHandlers(deps);

  await handlers.workerJobAction({ method: "POST" }, {}, "job-1", "retry");

  assert.equal(deps.calls.adminChecks[0].message, "owner or admin role required for worker job recovery");
  assert.equal(deps.calls.rest[0].table, "startup_office_worker_jobs");
  assert.equal(deps.calls.rest[1].table, "startup_office_worker_jobs");
  assert.equal(deps.calls.rest[1].options.method, "PATCH");
  assert.equal(deps.calls.rest[1].options.body.status, "queued");
  assert.equal(deps.calls.rest[1].options.body.attempts, 0);
  assert.equal(deps.calls.rest[1].options.body.metadata.previous_status, "dead_letter");
  assert.equal(deps.calls.rest[1].options.body.metadata.recovery_note, "provider fixed");
  assert.equal(deps.calls.rest[2].table, "startup_office_runs");
  assert.equal(deps.calls.rest[2].options.query.status, "in.(failed,canceled,queued)");
  assert.equal(deps.calls.rest[2].options.body.status, "queued");
  assert.equal(deps.calls.audits[0][1], "startup_office.worker_job_retried");
  assert.equal(deps.calls.writes[0].status, 200);
  assert.equal(deps.calls.writes[0].body.status, "queued");
});

test("worker job cancel closes the job and cancels an unfinished run", async () => {
  const job = {
    attempts: 1,
    id: "job-2",
    metadata: {},
    run_id: "run-2",
    status: "running",
  };
  const deps = baseDeps({
    async readBody() {
      return { reason: "duplicate claim" };
    },
    async safeStartupOfficeRest(table, options) {
      deps.calls.rest.push({ options, table });
      if (table === "startup_office_worker_jobs" && !options.method) return [job];
      return [{ id: table === "startup_office_runs" ? "run-2" : "job-2", ...options.body }];
    },
  });
  const handlers = createStartupOfficeOperationsHandlers(deps);

  await handlers.workerJobAction({ method: "POST" }, {}, "job-2", "cancel");

  assert.equal(deps.calls.rest[1].options.body.status, "canceled");
  assert.equal(deps.calls.rest[1].options.body.locked_at, null);
  assert.equal(deps.calls.rest[1].options.body.metadata.cancellation_note, "duplicate claim");
  assert.equal(deps.calls.rest[2].table, "startup_office_runs");
  assert.equal(deps.calls.rest[2].options.query.status, "in.(queued,running,failed)");
  assert.equal(deps.calls.rest[2].options.body.status, "canceled");
  assert.equal(deps.calls.audits[0][1], "startup_office.worker_job_canceled");
  assert.equal(deps.calls.writes[0].body.status, "canceled");
});

test("worker job recovery rejects unsafe state transitions", async () => {
  const deps = baseDeps({
    async safeStartupOfficeRest(table, options) {
      deps.calls.rest.push({ options, table });
      return [{ id: "job-3", status: "queued" }];
    },
  });
  const handlers = createStartupOfficeOperationsHandlers(deps);

  await assert.rejects(
    () => handlers.workerJobAction({ method: "POST" }, {}, "job-3", "retry"),
    (err) => err.status === 409 && /only failed/.test(err.message),
  );
});

test("operations handlers preserve typed 405 errors", async () => {
  const handlers = createStartupOfficeOperationsHandlers(baseDeps());
  await assert.rejects(
    () => handlers.billing({ method: "POST" }, {}),
    (err) => err.status === 405 && err.message === "method not allowed",
  );
});
