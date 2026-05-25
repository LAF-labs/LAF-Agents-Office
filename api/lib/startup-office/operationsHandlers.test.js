const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createStartupOfficeOperationsHandlers,
} = require("./operationsHandlers");

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
        usage: { monthly_runs: 1 },
      };
    },
    startupOfficeBillingStateValue(value) {
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

test("billing handler clamps beta limits and records an audit event", async () => {
  const deps = baseDeps({
    async readBody() {
      return {
        monthly_model_spend_cents: -10,
        monthly_run_limit: 200000,
        plan: "paid-beta",
        state: "active",
        storage_mb_limit: 42,
      };
    },
  });
  const handlers = createStartupOfficeOperationsHandlers(deps);

  await handlers.billing({ method: "PATCH" }, {});
  const patch = deps.calls.billingPatches[0];
  assert.equal(patch.billing_state, "active");
  assert.equal(patch.monthly_model_spend_cents, 0);
  assert.equal(patch.monthly_run_limit, 100000);
  assert.equal(patch.storage_mb_limit, 42);
  assert.equal(deps.calls.adminChecks[0].message, "owner or admin role required for billing changes");
  assert.equal(deps.calls.audits[0][1], "startup_office.billing_updated");
});

test("beta dashboard composes billing, failures, approvals, notifications, and stuck jobs", async () => {
  const deps = baseDeps({
    async safeStartupOfficeRest(table, options) {
      deps.calls.rest.push({ options, table });
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
  assert.deepEqual(dashboard.run_failures, [{ id: "run-1", status: "failed" }]);
  assert.deepEqual(dashboard.stuck_jobs, [{ id: "job-1" }]);
  assert.equal(dashboard.team.slug, "acme");
  assert.equal(deps.calls.rest[0].table, "startup_office_notifications");
  assert.equal(deps.calls.rest[0].options.query.team_id, "eq.team-1");
});

test("operations handlers preserve typed 405 errors", async () => {
  const handlers = createStartupOfficeOperationsHandlers(baseDeps());
  await assert.rejects(
    () => handlers.billing({ method: "POST" }, {}),
    (err) => err.status === 405 && err.message === "method not allowed",
  );
});
