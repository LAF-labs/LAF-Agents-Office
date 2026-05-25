const assert = require("node:assert/strict");
const test = require("node:test");
const {
  createStartupOfficeDemoSeedHandlers,
} = require("./demoSeedHandlers");

function createHTTPError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function baseDeps(overrides = {}) {
  const restCalls = [];
  const receipts = [];
  return {
    deps: {
      createHTTPError,
      async createStartupOfficeReceipt(_membership, body) {
        receipts.push(body);
        return { id: "receipt-1", ...body };
      },
      nowISO: () => "2026-05-25T00:00:00.000Z",
      publicCompanyProfile: ({ row }) => row,
      publicStartupOfficeApproval: (row) => row,
      publicStartupOfficeArtifact: (row) => row,
      publicStartupOfficeLoop: (row) => row,
      publicStartupOfficeReceipt: (row) => row,
      publicStartupOfficeRun: (row) => row,
      readBody: async () => ({}),
      requireAdminRole() {},
      requireUser: async () => ({
        membership: { team_id: "team-1", user_id: "user-1" },
        team: { name: "Acme" },
        user: { email: "founder@example.com" },
      }),
      async safeStartupOfficeRest(table, options) {
        restCalls.push({ options, table });
        if (table === "startup_office_loops") {
          return [{ id: `${options.body.slug}-id`, ...options.body }];
        }
        return [{ id: `${table}-1`, ...options.body }];
      },
      truncateText: (value, max) => String(value || "").slice(0, max),
      truthy: (value) => value === true || value === "true" || value === "1",
      workspaceSettings: async () => ({ company_profile: { name: "Acme" } }),
      writeAuditEvent: async () => {},
      writeJSON(res, status, payload) {
        res.status = status;
        res.body = payload;
      },
      ...overrides,
    },
    receipts,
    restCalls,
  };
}

test("demo seed handler is unavailable in production unless explicitly enabled", async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousDemoSeed = process.env.LAF_OFFICE_ENABLE_DEMO_SEED;
  process.env.NODE_ENV = "production";
  delete process.env.LAF_OFFICE_ENABLE_DEMO_SEED;
  try {
    const { deps } = baseDeps();
    const handlers = createStartupOfficeDemoSeedHandlers(deps);
    await assert.rejects(
      handlers.demoSeed({ method: "POST" }, {}),
      (error) => error.status === 404 && error.message === "not found",
    );
  } finally {
    process.env.NODE_ENV = previousNodeEnv;
    if (previousDemoSeed === undefined) {
      delete process.env.LAF_OFFICE_ENABLE_DEMO_SEED;
    } else {
      process.env.LAF_OFFICE_ENABLE_DEMO_SEED = previousDemoSeed;
    }
  }
});

test("onboarding seed creates operating loops and a receipt", async () => {
  const { deps, receipts, restCalls } = baseDeps();
  const handlers = createStartupOfficeDemoSeedHandlers(deps);

  const seeded = await handlers.seedStartupOfficeWorkspace(
    { team_id: "team-1", user_id: "user-1" },
    { name: "Acme" },
    { company_name: "Acme AI" },
  );

  assert.ok(seeded.loops.length >= 5);
  assert.equal(receipts.length, 1);
  assert.equal(receipts[0].event_type, "workspace.onboarded");
  assert.deepEqual(
    restCalls.filter((call) => call.table === "startup_office_loops").map((call) => call.options.body.slug),
    seeded.loops.map((loop) => loop.slug),
  );
});

test("demo seed writes profile, loops, artifacts, approval, and receipts", async () => {
  const auditEvents = [];
  const { deps, restCalls } = baseDeps({
    readBody: async () => ({ company_name: "Acme AI" }),
    writeAuditEvent: async (...args) => auditEvents.push(args),
  });
  const handlers = createStartupOfficeDemoSeedHandlers(deps);
  const res = {};

  await handlers.demoSeed({ method: "POST" }, res);

  assert.equal(res.status, 200);
  assert.equal(res.body.status, "ok");
  assert.equal(res.body.profile.name, "Acme AI");
  assert.equal(res.body.artifacts.length, 2);
  assert.equal(res.body.receipts.length, 3);
  assert.equal(res.body.runs.length, 2);
  assert.equal(auditEvents[0][1], "startup_office.demo_seeded");
  assert.deepEqual(
    [...new Set(restCalls.map((call) => call.table))],
    [
      "company_profiles",
      "startup_office_loops",
      "startup_office_runs",
      "startup_office_artifacts",
      "startup_office_approvals",
      "startup_office_receipts",
    ],
  );
});
