const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createStartupOfficeQueryHandlers,
} = require("./queryHandlers");

const membership = Object.freeze({
  team_id: "team-1",
  user_id: "user-1",
});

function baseDeps(overrides = {}) {
  const calls = {
    audits: [],
    permissions: [],
    rest: [],
    rows: [],
    writes: [],
  };
  const repository = {
    async memoryPages(_teamID, options) {
      return [{ options, slug: "positioning" }];
    },
    async uniqueLoopSlug(_teamID, seed) {
      return `${String(seed).toLowerCase().replace(/[^a-z0-9]+/g, "-")}-unique`;
    },
  };
  const deps = {
    calls,
    createHTTPError(status, message) {
      const err = new Error(message);
      err.status = status;
      return err;
    },
    async companyProfileSnapshot() {
      return { name: "Acme" };
    },
    normalizeStartupOfficeCadence(value) {
      return value || "weekly";
    },
    normalizeStartupOfficeLoopStatus(value) {
      return value || "active";
    },
    nowISO() {
      return "2026-05-25T00:00:00.000Z";
    },
    objectValue(value) {
      return value && typeof value === "object" && !Array.isArray(value) ? value : {};
    },
    publicStartupOfficeLoop(row) {
      return { ...row, public: "loop" };
    },
    async readBody() {
      return {};
    },
    requirePermission(value, permission) {
      calls.permissions.push({ membership: value, permission });
    },
    async requireUser() {
      return {
        membership,
        team: { id: "team-1", name: "Acme", slug: "acme" },
        user: { id: "user-1" },
      };
    },
    async safeStartupOfficeRest(table, options) {
      calls.rest.push({ options, table });
      return [{ id: "loop-1", ...options.body }];
    },
    async startupOfficeApprovals(_teamID, options) {
      return [{ id: "approval-1", options }];
    },
    async startupOfficeArtifacts(_teamID, options) {
      return [{ id: "artifact-1", options }];
    },
    async startupOfficeBetaOpsSnapshot() {
      return { billing: { plan: "founder_beta" }, usage: { monthly_runs: 2 } };
    },
    async startupOfficeLoops() {
      return [
        { id: "loop-1", status: "active" },
        { id: "loop-2", status: "paused" },
      ];
    },
    async startupOfficeObjectRows(teamID, kind, options) {
      calls.rows.push({ kind, options, teamID });
      if (kind === "metrics") {
        return [
          {
            id: "metric-2",
            metric_key: "mrr",
            metric_value: 1500,
            unit: "usd",
            updated_at: "2026-05-25T00:00:00Z",
          },
          {
            id: "metric-1",
            metric_key: "mrr",
            metric_value: 1000,
            unit: "usd",
            updated_at: "2026-05-24T00:00:00Z",
          },
        ];
      }
      return [{ id: `${kind}-1`, kind }];
    },
    async startupOfficeReceipts(_teamID, options) {
      return [{ id: "receipt-1", options }];
    },
    startupOfficeRepository() {
      return repository;
    },
    async startupOfficeRuns(_teamID, options) {
      return [{ id: "run-1", options, status: "completed" }];
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

test("growth summary composes pulse, memory, beta ops, and operating object summary", async () => {
  const deps = baseDeps();
  const handlers = createStartupOfficeQueryHandlers(deps);

  await handlers.growthSummary({ method: "GET" }, {});
  const body = deps.calls.writes[0].body;
  assert.equal(deps.calls.permissions[0].permission, "workspace:read");
  assert.equal(body.company_profile.name, "Acme");
  assert.equal(body.pulse.active_loops, 1);
  assert.equal(body.pulse.pending_approvals, 1);
  assert.equal(body.operating_objects.counts.assets, 1);
  assert.equal(body.operating_objects.counts.metrics, 2);
  assert.deepEqual(body.operating_objects.metrics_summary[0], {
    change: 500,
    latest_value: 1500,
    metric_key: "mrr",
    previous_value: 1000,
    unit: "usd",
    updated_at: "2026-05-25T00:00:00Z",
  });
  assert.equal(body.memory_pages[0].slug, "positioning");
});

test("loops handler lists loops and creates a loop with normalized fields", async () => {
  const deps = baseDeps({
    async readBody() {
      return {
        cadence: "daily",
        department: "Growth",
        name: "Founder Review",
        objective: "Review founder pipeline",
        policy: { approval_required: true },
        status: "active",
      };
    },
  });
  const handlers = createStartupOfficeQueryHandlers(deps);

  await handlers.loops({ method: "GET" }, {});
  assert.equal(deps.calls.permissions[0].permission, "workspace:read");
  assert.equal(deps.calls.writes[0].body.loops.length, 2);

  await handlers.loops({ method: "POST" }, {});
  assert.equal(deps.calls.permissions[1].permission, "workspace:manage");
  assert.equal(deps.calls.rest[0].table, "startup_office_loops");
  assert.equal(deps.calls.rest[0].options.body.slug, "founder-review-unique");
  assert.equal(deps.calls.rest[0].options.body.team_id, "team-1");
  assert.equal(deps.calls.audits[0][1], "startup_office.loop_created");
  assert.equal(deps.calls.writes[1].body.loop.public, "loop");
});

test("approvals and receipts handlers preserve query limits", async () => {
  const deps = baseDeps();
  const handlers = createStartupOfficeQueryHandlers(deps);

  await handlers.approvals({ method: "GET", query: { limit: "7", status: "pending" } }, {});
  await handlers.receipts({ method: "GET", query: { limit: "3" } }, {});

  assert.deepEqual(deps.calls.writes[0].body.approvals[0].options, {
    limit: 7,
    status: "pending",
  });
  assert.deepEqual(deps.calls.writes[1].body.receipts[0].options, {
    limit: 3,
  });
});

test("export handler includes schema version and restore notes", async () => {
  const deps = baseDeps();
  const handlers = createStartupOfficeQueryHandlers(deps);

  await handlers.export({ method: "GET" }, {});
  const bundle = deps.calls.writes[0].body.export;
  assert.equal(bundle.schema_version, "startup-office-export.v1");
  assert.match(bundle.restore_notes, /approval decisions/);
  assert.equal(bundle.generated_at, "2026-05-25T00:00:00.000Z");
  assert.equal(bundle.assets[0].kind, "assets");
  assert.equal(bundle.runs[0].id, "run-1");
  assert.deepEqual(
    deps.calls.rows.map((call) => [call.kind, call.options.limit]),
    [
      ["assets", 1000],
      ["customers", 1000],
      ["metrics", 1000],
      ["signals", 1000],
    ],
  );
});

test("query handlers preserve typed 400 and 405 errors", async () => {
  const deps = baseDeps();
  const handlers = createStartupOfficeQueryHandlers(deps);

  await assert.rejects(
    () => handlers.loops({ method: "POST" }, {}),
    (err) => err.status === 400 && err.message === "name is required",
  );
  const invalidPolicy = createStartupOfficeQueryHandlers(baseDeps({
    async readBody() {
      return { name: "Loop", policy: "yes" };
    },
  }));
  await assert.rejects(
    () => invalidPolicy.loops({ method: "POST" }, {}),
    (err) => err.status === 400 && err.message === "policy must be an object",
  );
  await assert.rejects(
    () => handlers.receipts({ method: "POST" }, {}),
    (err) => err.status === 405 && err.message === "method not allowed",
  );
});
