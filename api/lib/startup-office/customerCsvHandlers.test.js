const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createStartupOfficeCustomerCsvHandlers,
} = require("./customerCsvHandlers");

const membership = Object.freeze({ team_id: "team-1", user_id: "user-1" });

function baseDeps(overrides = {}) {
  const calls = { audits: [], permissions: [], rest: [], rows: [], writes: [] };
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
    publicStartupOfficeCustomer(row) {
      return { ...row, public: "customer" };
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
      return Array.isArray(options.body)
        ? options.body.map((row, index) => ({ id: `customer-${index + 1}`, ...row }))
        : [];
    },
    async startupOfficeBetaOpsSnapshot() {
      return { limits: { storage_mb_limit: 1 }, usage: { storage_bytes: 0 } };
    },
    startupOfficeObjectPayload(_kind, value, body) {
      return { ...body, created_by: value.user_id, team_id: value.team_id };
    },
    async startupOfficeObjectRows(teamID, kind, options) {
      calls.rows.push({ kind, options, teamID });
      return [
        {
          loop_id: "loop-1",
          name: "Acme",
          notes: "Notes",
          profile: { buyer: "founder" },
          status: "qualified",
        },
      ];
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

test("customer CSV handler exports founder CRM rows", async () => {
  const deps = baseDeps();
  const handlers = createStartupOfficeCustomerCsvHandlers(deps);

  await handlers.customerCsv({ method: "GET" }, {});

  assert.equal(deps.calls.permissions[0].permission, "workspace:read");
  assert.deepEqual(deps.calls.rows[0], {
    kind: "customers",
    options: { limit: 1000 },
    teamID: "team-1",
  });
  assert.equal(deps.calls.writes[0].body.filename, "startup-office-customers-2026-05-25.csv");
  assert.match(deps.calls.writes[0].body.csv, /name,status,loop_id,notes,profile_json/);
  assert.match(deps.calls.writes[0].body.csv, /Acme,qualified,loop-1/);
});

test("customer CSV handler imports CSV rows as customers", async () => {
  const deps = baseDeps({
    async readBody() {
      return {
        csv: 'name,status,loop_id,notes,profile_json\n"Beta Buyer",qualified,loop-1,"Ready","{""source"":""csv""}"\n',
      };
    },
  });
  const handlers = createStartupOfficeCustomerCsvHandlers(deps);

  await handlers.customerCsv({ method: "POST" }, {});

  assert.equal(deps.calls.permissions[0].permission, "memory:write_draft");
  assert.equal(deps.calls.rest[0].table, "startup_office_customers");
  assert.deepEqual(deps.calls.rest[0].options.body[0], {
    created_by: "user-1",
    loop_id: "loop-1",
    name: "Beta Buyer",
    notes: "Ready",
    profile: { source: "csv" },
    status: "qualified",
    team_id: "team-1",
  });
  assert.equal(deps.calls.audits[0][1], "startup_office.customers_csv_imported");
  assert.equal(deps.calls.writes[0].body.imported_count, 1);
  assert.equal(deps.calls.writes[0].body.customers[0].public, "customer");
});

test("customer CSV handler rejects empty and malformed CSV imports", async () => {
  const empty = createStartupOfficeCustomerCsvHandlers(baseDeps());
  await assert.rejects(
    () => empty.customerCsv({ method: "POST" }, {}),
    (err) => err.status === 400 && err.message === "customers csv is required",
  );

  const malformed = createStartupOfficeCustomerCsvHandlers(baseDeps({
    async readBody() {
      return { csv: "name,profile_json\nAcme,{bad}\n" };
    },
  }));
  await assert.rejects(
    () => malformed.customerCsv({ method: "POST" }, {}),
    (err) => err.status === 400 && err.message.includes("profile_json is invalid"),
  );
});

test("customer CSV handler enforces storage limits before import", async () => {
  const deps = baseDeps({
    async readBody() {
      return { csv: "name,notes\nAcme,Large note\n" };
    },
    async startupOfficeBetaOpsSnapshot() {
      return { limits: { storage_mb_limit: 0.00001 }, usage: { storage_bytes: 8 } };
    },
  });
  const handlers = createStartupOfficeCustomerCsvHandlers(deps);

  await assert.rejects(
    () => handlers.customerCsv({ method: "POST" }, {}),
    (err) => err.status === 402 && err.message === "closed beta storage limit reached",
  );
  assert.equal(deps.calls.rest.length, 0);
});
