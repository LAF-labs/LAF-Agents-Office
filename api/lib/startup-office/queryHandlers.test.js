const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createStartupOfficeQueryHandlers,
  STARTUP_OFFICE_GROWTH_SUMMARY_QUERY_BUDGET,
  STARTUP_OFFICE_GROWTH_SUMMARY_SELECTS,
} = require("./queryHandlers");

const membership = Object.freeze({
  team_id: "team-1",
  user_id: "user-1",
});

function baseDeps(overrides = {}) {
  const calls = {
    activations: [],
    audits: [],
    betaOps: [],
    loops: [],
    memoryPages: [],
    permissions: [],
    rest: [],
    rows: [],
    writes: [],
  };
  const repository = {
    async memoryPages(_teamID, options) {
      calls.memoryPages.push(options);
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
    async recordStartupOfficeExportActivation(args) {
      calls.activations.push({ milestone: "first_export", ...args });
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
    async startupOfficeBetaOpsSnapshot(_teamID, options = {}) {
      calls.betaOps.push(options);
      return { billing: { plan: "founder_beta" }, usage: { monthly_runs: 2 } };
    },
    async startupOfficeLoops(_teamID, options = {}) {
      calls.loops.push(options);
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
  assert.equal(body.activity_notifications[0].id, "loop-1");
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

test("growth summary caps row counts and avoids wildcard selects", async () => {
  const deps = baseDeps();
  const handlers = createStartupOfficeQueryHandlers(deps);

  await handlers.growthSummary({ method: "GET" }, {});
  const body = deps.calls.writes[0].body;
  const notificationQuery = deps.calls.rest.find(
    (call) => call.table === "startup_office_notifications",
  ).options.query;

  assert.deepEqual(deps.calls.loops[0], {
    limit: STARTUP_OFFICE_GROWTH_SUMMARY_QUERY_BUDGET.loops,
    select: STARTUP_OFFICE_GROWTH_SUMMARY_SELECTS.loops,
  });
  assert.equal(body.recent_runs[0].options.limit, STARTUP_OFFICE_GROWTH_SUMMARY_QUERY_BUDGET.runs);
  assert.equal(body.recent_runs[0].options.select, STARTUP_OFFICE_GROWTH_SUMMARY_SELECTS.runs);
  assert.equal(body.recent_artifacts[0].options.limit, STARTUP_OFFICE_GROWTH_SUMMARY_QUERY_BUDGET.artifacts);
  assert.equal(body.recent_artifacts[0].options.select, STARTUP_OFFICE_GROWTH_SUMMARY_SELECTS.artifacts);
  assert.equal(body.pending_approvals[0].options.limit, STARTUP_OFFICE_GROWTH_SUMMARY_QUERY_BUDGET.approvals);
  assert.equal(body.pending_approvals[0].options.select, STARTUP_OFFICE_GROWTH_SUMMARY_SELECTS.approvals);
  assert.equal(body.recent_receipts[0].options.limit, STARTUP_OFFICE_GROWTH_SUMMARY_QUERY_BUDGET.receipts);
  assert.equal(body.recent_receipts[0].options.select, STARTUP_OFFICE_GROWTH_SUMMARY_SELECTS.receipts);
  assert.deepEqual(deps.calls.memoryPages[0], {
    limit: STARTUP_OFFICE_GROWTH_SUMMARY_QUERY_BUDGET.memory_pages,
    select: STARTUP_OFFICE_GROWTH_SUMMARY_SELECTS.memoryPages,
    status: "approved",
  });
  assert.deepEqual(
    deps.calls.rows.map((call) => [call.kind, call.options.limit, call.options.select]),
    [
      ["assets", STARTUP_OFFICE_GROWTH_SUMMARY_QUERY_BUDGET.assets, STARTUP_OFFICE_GROWTH_SUMMARY_SELECTS.assets],
      ["customers", STARTUP_OFFICE_GROWTH_SUMMARY_QUERY_BUDGET.customers, STARTUP_OFFICE_GROWTH_SUMMARY_SELECTS.customers],
      ["metrics", STARTUP_OFFICE_GROWTH_SUMMARY_QUERY_BUDGET.metrics, STARTUP_OFFICE_GROWTH_SUMMARY_SELECTS.metrics],
      ["signals", STARTUP_OFFICE_GROWTH_SUMMARY_QUERY_BUDGET.signals, STARTUP_OFFICE_GROWTH_SUMMARY_SELECTS.signals],
    ],
  );
  assert.equal(notificationQuery.limit, String(STARTUP_OFFICE_GROWTH_SUMMARY_QUERY_BUDGET.notifications));
  assert.equal(notificationQuery.select, STARTUP_OFFICE_GROWTH_SUMMARY_SELECTS.notifications);
  assert.deepEqual(deps.calls.betaOps[0], {
    activation_event_limit: STARTUP_OFFICE_GROWTH_SUMMARY_QUERY_BUDGET.activation_events,
    billing_documents_limit: STARTUP_OFFICE_GROWTH_SUMMARY_QUERY_BUDGET.billing_documents,
    invite_limit: STARTUP_OFFICE_GROWTH_SUMMARY_QUERY_BUDGET.invites,
    membership_limit: STARTUP_OFFICE_GROWTH_SUMMARY_QUERY_BUDGET.memberships,
    storage_row_limit: STARTUP_OFFICE_GROWTH_SUMMARY_QUERY_BUDGET.storage_rows_per_table,
    terms_acceptances_limit: STARTUP_OFFICE_GROWTH_SUMMARY_QUERY_BUDGET.terms_acceptances,
    usage_event_limit: STARTUP_OFFICE_GROWTH_SUMMARY_QUERY_BUDGET.usage_events,
  });
  for (const select of Object.values(STARTUP_OFFICE_GROWTH_SUMMARY_SELECTS)) {
    assert.notEqual(select, "*");
  }
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
    cursor: "",
    limit: 8,
    status: "pending",
  });
  assert.deepEqual(deps.calls.writes[0].body.pagination, {
    cursor: null,
    has_more: false,
    limit: 7,
    next_cursor: null,
  });
  assert.deepEqual(deps.calls.writes[1].body.receipts[0].options, {
    cursor: "",
    limit: 4,
  });
  assert.deepEqual(deps.calls.writes[1].body.pagination, {
    cursor: null,
    has_more: false,
    limit: 3,
    next_cursor: null,
  });
});

test("approvals handler returns cursor pagination metadata", async () => {
  let approvalOptions = null;
  const deps = baseDeps({
    async startupOfficeApprovals(_teamID, options) {
      approvalOptions = options;
      return [
        { id: "approval-3", requested_at: "2026-05-25T03:00:00.000Z" },
        { id: "approval-2", requested_at: "2026-05-25T02:00:00.000Z" },
        { id: "approval-1", requested_at: "2026-05-25T01:00:00.000Z" },
      ];
    },
  });
  const handlers = createStartupOfficeQueryHandlers(deps);

  await handlers.approvals(
    {
      method: "GET",
      query: { cursor: "2026-05-25T04:00:00Z", limit: "2", status: "pending" },
    },
    {},
  );

  assert.deepEqual(approvalOptions, {
    cursor: "2026-05-25T04:00:00Z",
    limit: 3,
    status: "pending",
  });
  assert.deepEqual(
    deps.calls.writes[0].body.approvals.map((approval) => approval.id),
    ["approval-3", "approval-2"],
  );
  assert.deepEqual(deps.calls.writes[0].body.pagination, {
    cursor: "2026-05-25T04:00:00Z",
    has_more: true,
    limit: 2,
    next_cursor: "2026-05-25T02:00:00.000Z",
  });
});

test("approvals handler rejects malformed cursors", async () => {
  const handlers = createStartupOfficeQueryHandlers(baseDeps());

  await assert.rejects(
    () => handlers.approvals({ method: "GET", query: { cursor: "bad" } }, {}),
    (err) => err.status === 400 && err.message === "cursor must be an ISO timestamp",
  );
});

test("receipts handler returns cursor pagination metadata", async () => {
  let receiptOptions = null;
  const deps = baseDeps({
    async startupOfficeReceipts(_teamID, options) {
      receiptOptions = options;
      return [
        { created_at: "2026-05-25T03:00:00.000Z", id: "receipt-3" },
        { created_at: "2026-05-25T02:00:00.000Z", id: "receipt-2" },
        { created_at: "2026-05-25T01:00:00.000Z", id: "receipt-1" },
      ];
    },
  });
  const handlers = createStartupOfficeQueryHandlers(deps);

  await handlers.receipts(
    {
      method: "GET",
      query: { cursor: "2026-05-25T04:00:00Z", limit: "2" },
    },
    {},
  );

  assert.deepEqual(receiptOptions, {
    cursor: "2026-05-25T04:00:00Z",
    limit: 3,
  });
  assert.deepEqual(
    deps.calls.writes[0].body.receipts.map((receipt) => receipt.id),
    ["receipt-3", "receipt-2"],
  );
  assert.deepEqual(deps.calls.writes[0].body.pagination, {
    cursor: "2026-05-25T04:00:00Z",
    has_more: true,
    limit: 2,
    next_cursor: "2026-05-25T02:00:00.000Z",
  });
});

test("receipts handler rejects malformed cursors", async () => {
  const handlers = createStartupOfficeQueryHandlers(baseDeps());

  await assert.rejects(
    () => handlers.receipts({ method: "GET", query: { cursor: "bad" } }, {}),
    (err) => err.status === 400 && err.message === "cursor must be an ISO timestamp",
  );
});

test("export handler includes schema version and restore notes", async () => {
  const deps = baseDeps();
  const handlers = createStartupOfficeQueryHandlers(deps);

  await handlers.export({ method: "GET" }, {});
  const bundle = deps.calls.writes[0].body.export;
  assert.equal(bundle.schema_version, "startup-office-export.v2");
  assert.equal(bundle.export_manifest.exported_tables.includes("startup_office_artifacts"), true);
  assert.equal(bundle.export_manifest.chunked_collections.some((item) => item.collection === "artifacts"), true);
  assert.equal(bundle.export_manifest.row_limit, 1000);
  assert.deepEqual(bundle.export_limits, {
    chunked_endpoint: "/startup-office/export?collection={collection}&cursor={next_cursor}",
    possibly_truncated_collections: [],
    row_limit: 1000,
  });
  assert.equal(bundle.export_chunks.max_limit, 100);
  assert.equal(bundle.export_chunks.collections.some((item) => item.collection === "memory_pages"), true);
  assert.equal(
    bundle.export_manifest.omitted_tables[0].name,
    "startup_office_outbox_events",
  );
  assert.equal(bundle.company_profile.name, "Acme");
  assert.equal(bundle.beta_ops.billing.plan, "founder_beta");
  assert.equal(bundle.workspace_billing.plan, "founder_beta");
  assert.equal(deps.calls.activations[0].milestone, "first_export");
  assert.equal(deps.calls.activations[0].membership.team_id, "team-1");
  assert.match(bundle.restore_notes, /approval decisions/);
  assert.equal(bundle.generated_at, "2026-05-25T00:00:00.000Z");
  assert.equal(bundle.artifacts[0].id, "artifact-1");
  assert.equal(bundle.assets[0].kind, "assets");
  assert.equal(bundle.loops.length, 2);
  assert.equal(bundle.runs[0].id, "run-1");
  assert.equal(bundle.team_invites[0].token_hash, undefined, "does not expose invite token hashes");
  assert.ok(
    deps.calls.rest.find(
      (call) =>
        call.table === "team_invites" &&
        !String(call.options.query.select).includes("token_hash"),
    ),
  );
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

test("export handler reports possibly truncated capped collections", async () => {
  const deps = baseDeps({
    async startupOfficeArtifacts(_teamID, options) {
      return Array.from({ length: options.limit }, (_, index) => ({ id: `artifact-${index}` }));
    },
  });
  const handlers = createStartupOfficeQueryHandlers(deps);

  await handlers.export({ method: "GET" }, {});
  const bundle = deps.calls.writes[0].body.export;

  assert.deepEqual(bundle.export_limits.possibly_truncated_collections, [
    { chunked: true, count: 1000, key: "artifacts", row_limit: 1000 },
  ]);
});

test("export handler returns cursor-paginated collection chunks", async () => {
  let artifactOptions = null;
  const deps = baseDeps({
    async startupOfficeArtifacts(_teamID, options) {
      artifactOptions = options;
      return [
        { created_at: "2026-05-25T03:00:00.000Z", id: "artifact-3" },
        { created_at: "2026-05-25T02:00:00.000Z", id: "artifact-2" },
        { created_at: "2026-05-25T01:00:00.000Z", id: "artifact-1" },
      ];
    },
  });
  const handlers = createStartupOfficeQueryHandlers(deps);

  await handlers.export(
    {
      method: "GET",
      query: {
        collection: "artifacts",
        cursor: "2026-05-25T04:00:00.000Z",
        limit: "2",
      },
    },
    {},
  );
  const chunk = deps.calls.writes[0].body.export_chunk;

  assert.deepEqual(artifactOptions, {
    cursor: "2026-05-25T04:00:00.000Z",
    limit: 3,
  });
  assert.equal(chunk.collection, "artifacts");
  assert.equal(chunk.cursor_field, "created_at");
  assert.deepEqual(
    chunk.items.map((item) => item.id),
    ["artifact-3", "artifact-2"],
  );
  assert.deepEqual(chunk.pagination, {
    cursor: "2026-05-25T04:00:00.000Z",
    has_more: true,
    limit: 2,
    next_cursor: "2026-05-25T02:00:00.000Z",
  });
  assert.equal(deps.calls.activations.length, 0);
});

test("export handler rejects unsupported chunk collections", async () => {
  const handlers = createStartupOfficeQueryHandlers(baseDeps());

  await assert.rejects(
    () => handlers.export({ method: "GET", query: { collection: "worker_jobs" } }, {}),
    (err) => err.status === 400 && err.message.includes("collection must be one of"),
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
