const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createStartupOfficeObjectStore,
  numericOrNull,
} = require("./objectStore");

test("object rows apply list and cursor query helpers before serializing rows", async () => {
  const calls = [];
  const store = createStore({
    applyStartupOfficeCursor(query, cursor) {
      calls.push(["cursor", cursor]);
      query.id = `gt.${cursor}`;
    },
    applyStartupOfficeObjectListQuery(query, kind, options) {
      calls.push(["list", kind, options.status]);
      query.status = `eq.${options.status}`;
    },
    safeStartupOfficeRest: async (table, options) => {
      calls.push(["rest", table, options]);
      return [{ id: "asset-1" }, null];
    },
  });

  assert.deepEqual(await store.startupOfficeObjectRows("team-1", "assets", {
    cursor: "asset-0",
    limit: 5000,
    status: "active",
  }), [{ id: "asset-1", public: "asset" }]);
  assert.deepEqual(calls, [
    ["list", "assets", "active"],
    ["cursor", "asset-0"],
    ["rest", "startup_office_assets", {
      query: {
        id: "gt.asset-0",
        limit: "1000",
        select: "*",
        status: "eq.active",
        team_id: "eq.team-1",
      },
    }],
  ]);
});

test("object definitions expose stable table and response contracts", () => {
  const store = createStore();

  assert.deepEqual(pickDefinition(store.startupOfficeObjectDefinition("assets")), {
    responseKey: "assets",
    singularKey: "asset",
    table: "startup_office_assets",
  });
  assert.deepEqual(pickDefinition(store.startupOfficeObjectDefinition("customers")), {
    responseKey: "customers",
    singularKey: "customer",
    table: "startup_office_customers",
  });
  assert.throws(() => store.startupOfficeObjectDefinition("unknown"), /startup office object not found/);
});

test("object payloads normalize create bodies for assets, customers, metrics, and signals", () => {
  const store = createStore();
  const membership = { team_id: "team-1", user_id: "user-1" };

  assert.deepEqual(store.startupOfficeObjectPayload("assets", membership, {
    body: "asset body",
    kind: "brief",
    metadata: { a: 1 },
    name: "Asset",
    run_id: "",
    status: "archived",
  }), {
    body: "asset body",
    created_by: "user-1",
    kind: "brief",
    metadata: { a: 1 },
    name: "Asset",
    run_id: null,
    status: "asset:archived",
    team_id: "team-1",
    updated_at: "2026-05-26T00:00:00.000Z",
  });
  assert.equal(
    store.startupOfficeObjectPayload("customers", membership, { discovery_loop_id: "loop-1", profile: [] }).loop_id,
    "loop-1",
  );
  assert.deepEqual(store.startupOfficeObjectPayload("metrics", membership, {
    key: "activation",
    value: "12.5",
  }), {
    created_by: "user-1",
    metadata: {},
    metric_key: "activation",
    metric_value: 12.5,
    period_end: null,
    period_start: null,
    team_id: "team-1",
    unit: "",
    updated_at: "2026-05-26T00:00:00.000Z",
  });
  assert.equal(
    store.startupOfficeObjectPayload("signals", membership, { type: "customer" }).signal_type,
    "signal-type:customer",
  );
});

test("object patches preserve explicit nullable fields and archive shortcuts", () => {
  const store = createStore();

  assert.deepEqual(store.startupOfficeObjectPatch("assets", {
    archive: true,
    metadata: "not-object",
    run_id: "",
  }), {
    metadata: {},
    run_id: null,
    status: "archived",
    updated_at: "2026-05-26T00:00:00.000Z",
  });
  assert.deepEqual(store.startupOfficeObjectPatch("metrics", {
    metadata: { source: "manual" },
    metric_value: "",
    period_end: "2026-05-31",
    unit: "users",
  }), {
    metadata: { source: "manual" },
    metric_value: null,
    period_end: "2026-05-31",
    unit: "users",
    updated_at: "2026-05-26T00:00:00.000Z",
  });
  assert.equal(store.startupOfficeObjectPatch("signals", { archive: true }).status, "archived");
  assert.throws(() => store.startupOfficeObjectPatch("unknown", {}), /unsupported startup office object/);
});

test("numericOrNull only returns finite numbers", () => {
  assert.equal(numericOrNull("12.5"), 12.5);
  assert.equal(numericOrNull(""), null);
  assert.equal(numericOrNull("not-a-number"), null);
});

function createStore(overrides = {}) {
  return createStartupOfficeObjectStore({
    applyStartupOfficeCursor: () => {},
    applyStartupOfficeObjectListQuery: () => {},
    clamp: (value, min, max) => Math.min(Math.max(value, min), max),
    createHTTPError: (status, message) => Object.assign(new Error(message), { status }),
    nowISO: () => "2026-05-26T00:00:00.000Z",
    objectValue: (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {},
    publicStartupOfficeAsset: (row) => row && { ...row, public: "asset" },
    publicStartupOfficeCustomer: (row) => row && { ...row, public: "customer" },
    publicStartupOfficeMetric: (row) => row && { ...row, public: "metric" },
    publicStartupOfficeSignal: (row) => row && { ...row, public: "signal" },
    safeStartupOfficeRest: async () => [],
    startupOfficeAssetStatus: (value) => `asset:${value || "active"}`,
    startupOfficeCustomerStatus: (value) => `customer:${value || "lead"}`,
    startupOfficeSignalStatus: (value) => `signal:${value || "new"}`,
    startupOfficeSignalType: (value) => `signal-type:${value || "market"}`,
    truncateText: (value) => String(value || ""),
    ...overrides,
  });
}

function pickDefinition(definition) {
  return {
    responseKey: definition.responseKey,
    singularKey: definition.singularKey,
    table: definition.table,
  };
}
