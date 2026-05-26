const assert = require("node:assert/strict");
const test = require("node:test");

const {
  STARTUP_OFFICE_MEMORY_IMPORT_LIMIT,
  createStartupOfficeImportHandlers,
} = require("./importHandlers");
const {
  STARTUP_OFFICE_WORKSPACE_IMPORT_LIMIT,
} = require("./workspaceImportAdapters");

const membership = Object.freeze({
  team_id: "team-1",
  user_id: "user-1",
});

function baseDeps(overrides = {}) {
  const calls = {
    audits: [],
    permissions: [],
    rest: [],
    upserts: [],
    writes: [],
  };
  const repository = {
    async upsertMemoryPage(value, page) {
      calls.upserts.push({ membership: value, page });
      return { id: `imported-${calls.upserts.length}`, ...page };
    },
  };
  return {
    calls,
    createHTTPError(status, message) {
      const err = new Error(message);
      err.status = status;
      return err;
    },
    nowISO() {
      return "2026-05-25T00:00:00.000Z";
    },
    objectValue(value) {
      return value && typeof value === "object" && !Array.isArray(value) ? value : {};
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
      return [{ id: `${table}-${calls.rest.length}`, ...options.body }];
    },
    async startupOfficeBetaOpsSnapshot() {
      return { limits: {}, usage: {} };
    },
    startupOfficeObjectDefinition(kind) {
      return {
        public: (row) => row,
        table: `startup_office_${kind}`,
      };
    },
    startupOfficeObjectPayload(_kind, value, body) {
      return {
        ...body,
        created_by: value.user_id,
        team_id: value.team_id,
        updated_at: "2026-05-25T00:00:00.000Z",
      };
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
}

test("memory import restores approved company memory from an export bundle", async () => {
  const deps = baseDeps({
    async readBody() {
      return {
        export: {
          memory_pages: [
            {
              assumptions: ["Founder sells to solo operators"],
              body: "Positioning body",
              id: "memory-old-1",
              provenance: { source_run_id: "run-1" },
              slug: "positioning",
              sources: [{ title: "Interview notes" }],
              status: "draft",
              summary: "Positioning summary",
              title: "Positioning",
            },
          ],
          schema_version: "startup-office-export.v2",
        },
      };
    },
  });
  const handlers = createStartupOfficeImportHandlers(deps);

  await handlers.memoryImport({ method: "POST" }, {});

  assert.equal(deps.calls.permissions[0].permission, "memory:promote");
  assert.equal(deps.calls.upserts.length, 1);
  assert.equal(deps.calls.upserts[0].membership.team_id, "team-1");
  assert.deepEqual(deps.calls.upserts[0].page, {
    assumptions: ["Founder sells to solo operators"],
    body: "Positioning body",
    last_verified_at: null,
    provenance: {
      imported_at: "2026-05-25T00:00:00.000Z",
      imported_from_id: "memory-old-1",
      imported_from_schema_version: "startup-office-export.v2",
      source: "startup-office-memory-import",
      source_run_id: "run-1",
    },
    slug: "positioning",
    sources: [{ title: "Interview notes" }],
    status: "approved",
    summary: "Positioning summary",
    title: "Positioning",
    updated_at: "2026-05-25T00:00:00.000Z",
  });
  assert.equal(deps.calls.audits[0][1], "startup_office.memory_imported");
  assert.deepEqual(deps.calls.audits[0][4], {
    imported_count: 1,
    schema_version: "startup-office-export.v2",
  });
  assert.equal(deps.calls.writes[0].status, 200);
  assert.equal(deps.calls.writes[0].body.imported_count, 1);
  assert.equal(deps.calls.writes[0].body.status, "imported");
});

test("memory import accepts direct memory_pages arrays", async () => {
  const deps = baseDeps({
    async readBody() {
      return {
        memory_pages: [{ body: "Weekly operating cadence", slug: "operating-week" }],
        schema_version: "manual",
      };
    },
  });
  const handlers = createStartupOfficeImportHandlers(deps);

  await handlers.memoryImport({ method: "POST" }, {});

  assert.equal(deps.calls.upserts[0].page.slug, "operating-week");
  assert.equal(
    deps.calls.upserts[0].page.provenance.imported_from_schema_version,
    "manual",
  );
});

test("memory import rejects empty, oversized, and malformed imports", async () => {
  const empty = createStartupOfficeImportHandlers(baseDeps());
  await assert.rejects(
    () => empty.memoryImport({ method: "POST" }, {}),
    (err) => err.status === 400 && err.message === "memory_pages is required",
  );

  const oversized = createStartupOfficeImportHandlers(baseDeps({
    async readBody() {
      return {
        memory_pages: Array.from(
          { length: STARTUP_OFFICE_MEMORY_IMPORT_LIMIT + 1 },
          (_, index) => ({ slug: `page-${index}` }),
        ),
      };
    },
  }));
  await assert.rejects(
    () => oversized.memoryImport({ method: "POST" }, {}),
    (err) => err.status === 413 && err.message === "memory import exceeds 200 pages",
  );

  const missingSlug = createStartupOfficeImportHandlers(baseDeps({
    async readBody() {
      return { memory_pages: [{ title: "No slug" }] };
    },
  }));
  await assert.rejects(
    () => missingSlug.memoryImport({ method: "POST" }, {}),
    (err) => err.status === 400 && err.message === "memory page slug is required",
  );
});

test("memory import rejects non-POST methods", async () => {
  const handlers = createStartupOfficeImportHandlers(baseDeps());

  await assert.rejects(
    () => handlers.memoryImport({ method: "GET" }, {}),
    (err) => err.status === 405 && err.message === "method not allowed",
  );
});

test("workspace import restores operating objects from an export bundle", async () => {
  const deps = baseDeps({
    async readBody() {
      return {
        export: {
          assets: [{ id: "asset-old", metadata: { source_run_id: "run-1" }, name: "Deck", run_id: "run-1" }],
          customers: [{ id: "customer-old", loop_id: "loop-1", name: "Solo founder", profile: { segment: "b2b" } }],
          metrics: [{ id: "metric-old", key: "activation", metadata: { cohort: "beta" }, value: 12 }],
          schema_version: "startup-office-export.v2",
          signals: [{ id: "signal-old", loop_id: "loop-2", run_id: "run-2", title: "Buyer signal" }],
        },
      };
    },
  });
  const handlers = createStartupOfficeImportHandlers(deps);

  await handlers.workspaceImport({ method: "POST" }, {});

  assert.equal(deps.calls.permissions.at(-1).permission, "memory:promote");
  assert.deepEqual(deps.calls.rest.map((call) => call.table), [
    "startup_office_assets",
    "startup_office_customers",
    "startup_office_metrics",
    "startup_office_signals",
  ]);
  assert.equal(deps.calls.rest[0].options.body.team_id, "team-1");
  assert.equal(deps.calls.rest[0].options.body.run_id, null);
  assert.equal(
    deps.calls.rest[0].options.body.metadata.source,
    "startup-office-workspace-import",
  );
  assert.equal(deps.calls.rest[0].options.body.metadata.imported_from_run_id, "run-1");
  assert.equal(deps.calls.rest[1].options.body.loop_id, null);
  assert.equal(deps.calls.rest[3].options.body.loop_id, null);
  assert.equal(deps.calls.rest[3].options.body.run_id, null);
  assert.equal(deps.calls.audits.at(-1)[1], "startup_office.workspace_imported");
  assert.deepEqual(deps.calls.audits.at(-1)[4], {
    imported_count: 4,
    schema_version: "startup-office-export.v2",
  });
  assert.equal(deps.calls.writes.at(-1).body.imported_count, 4);
  assert.equal(deps.calls.writes.at(-1).body.status, "imported");
});

test("workspace import rejects empty and oversized imports", async () => {
  const empty = createStartupOfficeImportHandlers(baseDeps());
  await assert.rejects(
    () => empty.workspaceImport({ method: "POST" }, {}),
    (err) => err.status === 400 && err.message === "workspace operating objects are required",
  );

  const oversized = createStartupOfficeImportHandlers(baseDeps({
    async readBody() {
      return {
        assets: Array.from(
          { length: STARTUP_OFFICE_WORKSPACE_IMPORT_LIMIT + 1 },
          (_, index) => ({ name: `asset-${index}` }),
        ),
      };
    },
  }));
  await assert.rejects(
    () => oversized.workspaceImport({ method: "POST" }, {}),
    (err) => err.status === 413 && err.message === "workspace import exceeds 500 objects",
  );
});
