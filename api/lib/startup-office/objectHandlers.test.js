const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createStartupOfficeObjectHandlers,
} = require("./objectHandlers");
const {
  STARTUP_OFFICE_PAYLOAD_LIMITS,
} = require("./payloadLimits");

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
  const deps = {
    calls,
    createHTTPError(status, message) {
      const err = new Error(message);
      err.status = status;
      return err;
    },
    nowISO() {
      return "2026-05-25T00:00:00.000Z";
    },
    publicStartupOfficeAsset(row) {
      return { ...row, public: "asset" };
    },
    publicStartupOfficeSignal(row) {
      return { ...row, public: "signal" };
    },
    async readBody() {
      return {};
    },
    requirePermission(value, permission) {
      calls.permissions.push({ membership: value, permission });
    },
    async requireUser() {
      return { membership };
    },
    async safeStartupOfficeRest(table, options) {
      calls.rest.push({ options, table });
      return [{ id: "row-1", ...options.body }];
    },
    startupOfficeObjectDefinition(kind) {
      return {
        public(row) {
          return { ...row, kind };
        },
        responseKey: `${kind}_rows`,
        singularKey: kind.slice(0, -1),
        table: `startup_office_${kind}`,
      };
    },
    startupOfficeObjectPatch(kind, body) {
      return { ...body, patched_kind: kind };
    },
    startupOfficeObjectPayload(kind, value, body) {
      return { ...body, created_by: value.user_id, kind, team_id: value.team_id };
    },
    async startupOfficeObjectRows(teamID, kind, options) {
      calls.rows.push({ kind, options, teamID });
      return [{ id: "row-1", kind }];
    },
    startupOfficeRepository() {
      return {
        async findArtifact() {
          return {
            content: "Founder evidence",
            id: "artifact-1",
            kind: "memo",
            run_id: "run-1",
            title: "Evidence memo",
          };
        },
      };
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

test("object collection handler lists and creates typed operating objects", async () => {
  const deps = baseDeps({
    async readBody() {
      return { name: "Launch list", run_id: "run-1", status: "active" };
    },
  });
  const handlers = createStartupOfficeObjectHandlers(deps);

  await handlers.objectCollection(
    { method: "GET", query: { limit: "7", status: "active" } },
    {},
    "assets",
  );
  assert.equal(deps.calls.permissions[0].permission, "workspace:read");
  assert.deepEqual(deps.calls.rows[0], {
    kind: "assets",
    options: { limit: 7, status: "active" },
    teamID: "team-1",
  });
  assert.deepEqual(deps.calls.writes[0].body.assets_rows, [{ id: "row-1", kind: "assets" }]);

  await handlers.objectCollection({ method: "POST" }, {}, "assets");
  assert.equal(deps.calls.permissions[1].permission, "memory:write_draft");
  assert.equal(deps.calls.rest[0].table, "startup_office_assets");
  assert.equal(deps.calls.rest[0].options.body.team_id, "team-1");
  assert.equal(deps.calls.rest[0].options.body.run_id, "run-1");
  assert.equal(deps.calls.rest[0].options.body.status, "active");
  assert.equal(deps.calls.audits[0][1], "startup_office.assets.created");
  assert.equal(deps.calls.writes[1].body.asset.kind, "assets");
});

test("customer collection handler filters and links discovery loops", async () => {
  const deps = baseDeps({
    async readBody() {
      return { loop_id: "loop-1", name: "Beta buyer", status: "qualified" };
    },
    startupOfficeObjectPayload(kind, value, body) {
      return {
        created_by: value.user_id,
        loop_id: body.loop_id,
        name: body.name,
        status: body.status,
        team_id: value.team_id,
        typed_kind: kind,
      };
    },
  });
  const handlers = createStartupOfficeObjectHandlers(deps);

  await handlers.objectCollection(
    { method: "GET", query: { loop_id: "loop-1", status: "qualified" } },
    {},
    "customers",
  );
  assert.equal(deps.calls.permissions[0].permission, "workspace:read");
  assert.deepEqual(deps.calls.rows[0], {
    kind: "customers",
    options: { limit: 100, loop_id: "loop-1", status: "qualified" },
    teamID: "team-1",
  });

  await handlers.objectCollection({ method: "POST" }, {}, "customers");
  assert.equal(deps.calls.permissions[1].permission, "memory:write_draft");
  assert.equal(deps.calls.rest[0].table, "startup_office_customers");
  assert.equal(deps.calls.rest[0].options.body.loop_id, "loop-1");
  assert.equal(deps.calls.rest[0].options.body.status, "qualified");
  assert.equal(deps.calls.audits[0][1], "startup_office.customers.created");
  assert.equal(deps.calls.writes[1].body.customer.kind, "customers");
});

test("signal collection handler filters and links reusable evidence", async () => {
  const deps = baseDeps({
    async readBody() {
      return {
        body: "Buyer mentioned switching costs.",
        loop_id: "loop-1",
        run_id: "run-1",
        signal_type: "competitor",
        status: "triaged",
        title: "Competitor objection",
      };
    },
    startupOfficeObjectPayload(kind, value, body) {
      return {
        body: body.body,
        created_by: value.user_id,
        loop_id: body.loop_id,
        run_id: body.run_id,
        signal_type: body.signal_type,
        status: body.status,
        team_id: value.team_id,
        title: body.title,
        typed_kind: kind,
      };
    },
  });
  const handlers = createStartupOfficeObjectHandlers(deps);

  await handlers.objectCollection(
    {
      method: "GET",
      query: {
        loop_id: "loop-1",
        run_id: "run-1",
        signal_type: "competitor",
        status: "triaged",
      },
    },
    {},
    "signals",
  );
  assert.equal(deps.calls.permissions[0].permission, "workspace:read");
  assert.deepEqual(deps.calls.rows[0], {
    kind: "signals",
    options: {
      limit: 100,
      loop_id: "loop-1",
      run_id: "run-1",
      signal_type: "competitor",
      status: "triaged",
    },
    teamID: "team-1",
  });

  await handlers.objectCollection({ method: "POST" }, {}, "signals");
  assert.equal(deps.calls.permissions[1].permission, "memory:write_draft");
  assert.equal(deps.calls.rest[0].table, "startup_office_signals");
  assert.equal(deps.calls.rest[0].options.body.loop_id, "loop-1");
  assert.equal(deps.calls.rest[0].options.body.run_id, "run-1");
  assert.equal(deps.calls.rest[0].options.body.signal_type, "competitor");
  assert.equal(deps.calls.rest[0].options.body.status, "triaged");
  assert.equal(deps.calls.audits[0][1], "startup_office.signals.created");
});

test("metric collection handler records company metrics for growth summary", async () => {
  const deps = baseDeps({
    async readBody() {
      return {
        key: "mrr",
        metadata: { source: "manual" },
        period_end: "2026-05-31",
        period_start: "2026-05-01",
        unit: "usd",
        value: 1500,
      };
    },
    startupOfficeObjectPayload(kind, value, body) {
      return {
        created_by: value.user_id,
        metadata: body.metadata,
        metric_key: body.key,
        metric_value: body.value,
        period_end: body.period_end,
        period_start: body.period_start,
        team_id: value.team_id,
        typed_kind: kind,
        unit: body.unit,
        updated_at: "2026-05-25T00:00:00.000Z",
      };
    },
  });
  const handlers = createStartupOfficeObjectHandlers(deps);

  await handlers.objectCollection({ method: "POST" }, {}, "metrics");
  assert.equal(deps.calls.permissions[0].permission, "memory:write_draft");
  assert.equal(deps.calls.rest[0].table, "startup_office_metrics");
  assert.equal(deps.calls.rest[0].options.body.metric_key, "mrr");
  assert.equal(deps.calls.rest[0].options.body.metric_value, 1500);
  assert.equal(deps.calls.rest[0].options.body.updated_at, "2026-05-25T00:00:00.000Z");
  assert.equal(deps.calls.audits[0][1], "startup_office.metrics.created");
  assert.equal(deps.calls.writes[0].body.metric.kind, "metrics");
});

test("asset item handler updates run links and archives by status", async () => {
  const deps = baseDeps({
    async readBody() {
      return { archive: true, run_id: "run-2" };
    },
    startupOfficeObjectPatch(kind, body) {
      return {
        patched_kind: kind,
        run_id: body.run_id,
        status: body.archive ? "archived" : body.status,
      };
    },
  });
  const handlers = createStartupOfficeObjectHandlers(deps);

  await handlers.objectItem({ method: "PATCH" }, {}, "assets", "asset-1");
  assert.equal(deps.calls.permissions[0].permission, "memory:write_draft");
  assert.equal(deps.calls.rest[0].table, "startup_office_assets");
  assert.deepEqual(deps.calls.rest[0].options.query, {
    id: "eq.asset-1",
    team_id: "eq.team-1",
  });
  assert.deepEqual(deps.calls.rest[0].options.body, {
    patched_kind: "assets",
    run_id: "run-2",
    status: "archived",
  });
  assert.equal(deps.calls.audits[0][1], "startup_office.assets.updated");
});

test("asset writes reject oversized user payloads before database writes", async () => {
  const oversized = "x".repeat(STARTUP_OFFICE_PAYLOAD_LIMITS.assetBodyBytes + 1);
  const createHandler = createStartupOfficeObjectHandlers(baseDeps({
    async readBody() {
      return { body: oversized, name: "Too large" };
    },
  }));
  await assert.rejects(
    () => createHandler.objectCollection({ method: "POST" }, {}, "assets"),
    (err) => err.status === 413 && err.message.includes("asset body exceeds"),
  );

  const patchDeps = baseDeps({
    async readBody() {
      return { body: oversized };
    },
  });
  const patchHandler = createStartupOfficeObjectHandlers(patchDeps);
  await assert.rejects(
    () => patchHandler.objectItem({ method: "PATCH" }, {}, "assets", "asset-1"),
    (err) => err.status === 413 && err.message.includes("asset body exceeds"),
  );
  assert.equal(patchDeps.calls.rest.length, 0);
});

test("artifact to asset action rejects oversized model artifacts before database writes", async () => {
  const deps = baseDeps({
    startupOfficeRepository() {
      return {
        async findArtifact() {
          return {
            content: "x".repeat(STARTUP_OFFICE_PAYLOAD_LIMITS.assetBodyBytes + 1),
            id: "artifact-1",
            kind: "memo",
            title: "Large model artifact",
          };
        },
      };
    },
  });
  const handlers = createStartupOfficeObjectHandlers(deps);

  await assert.rejects(
    () => handlers.artifactObjectAction({ method: "POST" }, {}, "artifact-1", "save-as-asset"),
    (err) => err.status === 413 && err.message.includes("artifact asset body exceeds"),
  );
  assert.equal(deps.calls.rest.length, 0);
});

test("object item handler patches by id within the caller workspace", async () => {
  const deps = baseDeps({
    async readBody() {
      return { discovery_loop_id: "loop-2", status: "archived" };
    },
    startupOfficeObjectPatch(kind, body) {
      return {
        discovery_loop_id: body.discovery_loop_id,
        patched_kind: kind,
        status: body.status,
      };
    },
  });
  const handlers = createStartupOfficeObjectHandlers(deps);

  await handlers.objectItem({ method: "PATCH" }, {}, "customers", "customer-1");
  assert.equal(deps.calls.rest[0].table, "startup_office_customers");
  assert.deepEqual(deps.calls.rest[0].options.query, {
    id: "eq.customer-1",
    team_id: "eq.team-1",
  });
  assert.deepEqual(deps.calls.rest[0].options.body, {
    discovery_loop_id: "loop-2",
    patched_kind: "customers",
    status: "archived",
  });
  assert.equal(deps.calls.audits[0][1], "startup_office.customers.updated");
});

test("object item handler deletes by id within the caller workspace", async () => {
  const deps = baseDeps();
  const handlers = createStartupOfficeObjectHandlers(deps);

  await handlers.objectItem({ method: "DELETE" }, {}, "assets", "asset-1");
  assert.equal(deps.calls.permissions[0].permission, "memory:write_draft");
  assert.equal(deps.calls.rest[0].table, "startup_office_assets");
  assert.equal(deps.calls.rest[0].options.method, "DELETE");
  assert.deepEqual(deps.calls.rest[0].options.query, {
    id: "eq.asset-1",
    team_id: "eq.team-1",
  });
  assert.equal(deps.calls.audits[0][1], "startup_office.assets.deleted");
  assert.equal(deps.calls.writes[0].body.ok, true);
  assert.equal(deps.calls.writes[0].body.asset.kind, "assets");
});

test("artifact object action can save an artifact as a first-party asset", async () => {
  const deps = baseDeps({
    async readBody() {
      return { kind: "research", name: "Research packet" };
    },
  });
  const handlers = createStartupOfficeObjectHandlers(deps);

  await handlers.artifactObjectAction({ method: "POST" }, {}, "artifact-1", "save-as-asset");
  assert.equal(deps.calls.rest[0].table, "startup_office_assets");
  assert.deepEqual(deps.calls.rest[0].options.body.metadata, {
    artifact_id: "artifact-1",
    source: "artifact",
  });
  assert.equal(deps.calls.rest[0].options.body.updated_at, "2026-05-25T00:00:00.000Z");
  assert.equal(deps.calls.audits[0][1], "startup_office.asset.created_from_artifact");
  assert.equal(deps.calls.writes[0].body.asset.public, "asset");
});

test("artifact object action can record an artifact-derived signal", async () => {
  const deps = baseDeps({
    async readBody() {
      return {
        loop_id: "loop-1",
        signal_type: "customer",
        source: "interview",
        title: "Founder signal",
      };
    },
  });
  const handlers = createStartupOfficeObjectHandlers(deps);

  await handlers.artifactObjectAction({ method: "POST" }, {}, "artifact-1", "record-signal");
  assert.equal(deps.calls.rest[0].table, "startup_office_signals");
  assert.equal(deps.calls.rest[0].options.body.loop_id, "loop-1");
  assert.equal(deps.calls.rest[0].options.body.source, "interview");
  assert.equal(deps.calls.rest[0].options.body.signal_type, "customer");
  assert.equal(deps.calls.rest[0].options.body.run_id, "run-1");
  assert.equal(deps.calls.rest[0].options.body.metadata.run_id, "run-1");
  assert.equal(deps.calls.audits[0][1], "startup_office.signal.created_from_artifact");
  assert.equal(deps.calls.writes[0].body.signal.public, "signal");
});

test("artifact signal action falls back to market for unknown signal types", async () => {
  const deps = baseDeps({
    async readBody() {
      return { signal_type: "random" };
    },
  });
  const handlers = createStartupOfficeObjectHandlers(deps);

  await handlers.artifactObjectAction({ method: "POST" }, {}, "artifact-1", "record-signal");
  assert.equal(deps.calls.rest[0].options.body.signal_type, "market");
});

test("object handlers preserve typed errors for unsupported methods and actions", async () => {
  const handlers = createStartupOfficeObjectHandlers(baseDeps());

  await assert.rejects(
    () => handlers.objectItem({ method: "POST" }, {}, "assets", "asset-1"),
    (err) => err.status === 405 && err.message === "method not allowed",
  );
  await assert.rejects(
    () => handlers.artifactObjectAction({ method: "POST" }, {}, "artifact-1", "unknown"),
    (err) => err.status === 400 && err.message === "unsupported artifact action",
  );
});
