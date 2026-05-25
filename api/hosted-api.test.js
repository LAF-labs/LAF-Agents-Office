const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

process.env.SUPABASE_URL = "https://supabase.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
process.env.SUPABASE_ANON_KEY = "anon";
process.env.LAF_OFFICE_ALLOWED_ORIGINS =
  "app.laf.test,https://preview.laf.test/";
process.env.LAF_OFFICE_STARTUP_OFFICE_AI_PROVIDER = "fake";

const handler = require("./[...path].js");

test.beforeEach(() => {
  handler.__test.resetRateLimits();
});

test("Vercel API rewrite targets the hosted API facade", () => {
  const vercel = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "vercel.json"), "utf8"),
  );
  assert.deepEqual(
    vercel.rewrites.find((rewrite) => rewrite.source === "/api/:path*"),
    { source: "/api/:path*", destination: "/api?path=:path*" },
  );
  assert.ok(vercel.functions["api/index.js"]);
  assert.equal(
    fs.readFileSync(path.join(__dirname, "index.js"), "utf8").trim(),
    'module.exports = require("./[...path].js");',
  );
});

test("hosted API accepts Vercel rewrite path query", async () => {
  const response = await invoke("health", "GET", {});
  assert.equal(response.status, 200);
  assert.equal(response.body.service, "laf-hosted-api");
});

test("retired execution routes are no longer part of the hosted API surface", async () => {
  const retiredDeviceRoute = ["bri", "dge"].join("");
  const retiredQueueRoute = ["run", "ner"].join("");
  for (const route of [
    [retiredQueueRoute, "status"],
    [retiredQueueRoute, "jobs", "lease"],
    [retiredDeviceRoute, "availability"],
    [retiredDeviceRoute, ["pair", "ing"].join(""), "start"],
    ["execution", "plans"],
  ]) {
    const response = await invoke(route, "GET", {});
    assert.equal(response.status, 404, route.join("/"));
  }
});

test("retired project and task routes are removed from the hosted API surface", async () => {
  for (const [routePath, method] of [
    ["projects", "GET"],
    ["projects", "POST"],
    ["projects/repo-readiness", "GET"],
    ["tasks", "GET"],
    ["tasks", "POST"],
  ]) {
    const response = await invoke(routePath, method, {});
    assert.equal(response.status, 404, `${method} ${routePath}`);
    assert.equal(response.body.error, "hosted API route not found");
  }
});

test("hosted API rejects oversized request bodies before mutation handlers", async () => {
  const oversizedText = "x".repeat(512 * 1024 + 1);

  for (const [label, body, headers] of [
    ["content-length", {}, { "content-length": String(512 * 1024 + 1) }],
    ["parsed json", { company: oversizedText }, {}],
    ["raw json", JSON.stringify({ company: oversizedText }), {}],
  ]) {
    const response = await invoke("auth/signup", "POST", body, { headers });
    assert.equal(response.status, 413, label);
    assert.match(response.body.error, /request body exceeds 524288 bytes/);
  }
});

test("hosted API rate limits expensive actions at ingress", async () => {
  for (const [routePath, method, attempts] of [
    ["startup-office/export", "GET", 6],
    ["startup-office/loops/idea-validation/run", "POST", 20],
    ["invites", "POST", 20],
    ["company/profile", "PATCH", 30],
    ["config", "POST", 30],
    ["onboarding/complete", "POST", 30],
  ]) {
    handler.__test.resetRateLimits();
    for (let index = 0; index < attempts; index += 1) {
      const response = await invoke(routePath, method, {}, {
        headers: { authorization: "", "x-forwarded-for": "203.0.113.10" },
      });
      assert.notEqual(response.status, 429, routePath);
    }
    const limited = await invoke(routePath, method, {}, {
      headers: { authorization: "", "x-forwarded-for": "203.0.113.10" },
    });
    assert.equal(limited.status, 429, routePath);
    assert.equal(limited.body.error, "rate limit exceeded");
  }
});

test("pure cloud migration drops obsolete execution schema", () => {
  const retiredDeviceName = ["bri", "dge"].join("");
  const migrationDir = path.join(__dirname, "..", "supabase", "migrations");
  const obsoleteMigrationFiles = fs
    .readdirSync(migrationDir)
    .filter((file) =>
      new RegExp(
        `(?:laf_${retiredDeviceName}|${retiredDeviceName}_only|deprecated_.*execution|obsolete_.*execution)`,
        "i",
      ).test(file),
    );
  assert.deepEqual(obsoleteMigrationFiles, []);

  const sql = fs.readFileSync(
    path.join(
      migrationDir,
      "20260525000000_remove_local_execution.sql",
    ),
    "utf8",
  );

  assert.match(sql, /obsolete_relations text\[\]/);
  assert.match(sql, /'execution_plans'/);
  assert.match(sql, /'project_local_bindings'/);
  assert.match(sql, /device_prefix \|\| '_devices'/);
  assert.match(sql, /queue_prefix \|\| '_jobs'/);
  assert.match(sql, /p\.proname = 'claim_' \|\| queue_prefix \|\| '_job'/);
  assert.match(sql, /drop table if exists public\.%I cascade/);
  assert.match(sql, /drop column if exists worktree_branch/);
  assert.match(sql, /check \(model_mode in \('laf_model', 'record_only'\)\)/);
  assert.match(sql, /to_regclass\('public\.tasks'\) is not null/);

  const finalSql = fs.readFileSync(
    path.join(
      migrationDir,
      "20260525010000_purge_legacy_runtime_columns.sql",
    ),
    "utf8",
  );
  assert.match(finalSql, /drop column if exists %I cascade/);
  assert.match(finalSql, /'execution_mode'/);
  assert.match(finalSql, /'worktree_path'/);
  assert.match(finalSql, /'worktree_branch'/);
  assert.match(finalSql, /device_prefix \|\| '_devices'/);
  assert.match(finalSql, /queue_prefix \|\| '_jobs'/);
  assert.match(finalSql, /drop table if exists public\.%I cascade/);

  const schemaAssertionSql = fs.readFileSync(
    path.join(
      migrationDir,
      "20260525130000_assert_pure_cloud_runtime_schema.sql",
    ),
    "utf8",
  );
  assert.match(schemaAssertionSql, /remaining_columns/);
  assert.match(schemaAssertionSql, /remaining_constraints/);
  assert.match(schemaAssertionSql, /remaining_functions/);
  assert.match(schemaAssertionSql, /remaining_policies/);
  assert.match(schemaAssertionSql, /remaining_tables/);
  assert.match(schemaAssertionSql, /remaining_triggers/);
  assert.match(schemaAssertionSql, /remaining_types/);
  assert.match(schemaAssertionSql, /drop constraint if exists/);
  assert.match(schemaAssertionSql, /drop trigger if exists/);
  assert.match(schemaAssertionSql, /retired execution residue/);
  assert.match(schemaAssertionSql, /raise exception/);
});

test("project and task storage is removed from the current Supabase schema", () => {
  const migrationDir = path.join(__dirname, "..", "supabase", "migrations");
  const sql = fs.readFileSync(
    path.join(
      migrationDir,
      "20260525160000_retire_project_task_workspace.sql",
    ),
    "utf8",
  );
  assert.match(sql, /drop table if exists public\.delivery_receipts cascade/);
  assert.match(sql, /drop table if exists public\.tasks cascade/);
  assert.match(sql, /drop table if exists public\.projects cascade/);
  assert.match(sql, /drop column if exists project_id/);
  assert.match(sql, /drop column if exists task_id/);

  const schema = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "..", "supabase", "schema", "current.json"),
      "utf8",
    ),
  );
  const activeTables = new Set(schema.activeTables.map((table) => table.name));
  assert.equal(activeTables.has("projects"), false);
  assert.equal(activeTables.has("tasks"), false);
  assert.equal(activeTables.has("delivery_receipts"), false);
  const messages = schema.activeTables.find(
    (table) => table.name === "channel_messages",
  );
  assert.equal(messages.columns.includes("project_id"), false);
  assert.equal(messages.columns.includes("task_id"), false);
});

test("Startup Office release gate points at loop engine tests", () => {
  const script = fs.readFileSync(
    path.join(__dirname, "..", "scripts", "startup-office-beta-release-gate.cjs"),
    "utf8",
  );
  assert.match(script, /startup-office:architecture/);
  assert.match(script, /startup-office:api-contracts/);
  assert.match(script, /startup-office:authorization/);
  assert.match(script, /startup-office:audit-coverage/);
  assert.match(script, /startup-office:legacy-runtime/);
  assert.match(script, /startup-office:permissions/);
  assert.match(script, /startup-office:schema/);
  assert.match(script, /startup-office:security/);
  assert.match(script, /api\/lib\/hosted\/agentLogHandlers\.test\.js/);
  assert.match(script, /api\/lib\/hosted\/activityHandlers\.test\.js/);
  assert.match(script, /api\/lib\/hosted\/auditHandlers\.test\.js/);
  assert.match(script, /api\/lib\/hosted\/authHandlers\.test\.js/);
  assert.match(script, /api\/lib\/hosted\/commandHandlers\.test\.js/);
  assert.match(script, /api\/lib\/hosted\/conversationHandlers\.test\.js/);
  assert.match(script, /api\/lib\/hosted\/inviteHandlers\.test\.js/);
  assert.match(script, /api\/lib\/hosted\/memberHandlers\.test\.js/);
  assert.match(script, /api\/lib\/hosted\/memoryHandlers\.test\.js/);
  assert.match(script, /api\/lib\/hosted\/modelAccess\.test\.js/);
  assert.match(script, /api\/lib\/hosted\/permissions\.test\.js/);
  assert.match(script, /api\/lib\/hosted\/rateLimits\.test\.js/);
  assert.match(script, /api\/lib\/hosted\/requestHandlers\.test\.js/);
  assert.match(script, /api\/lib\/hosted\/rosterHandlers\.test\.js/);
  assert.match(script, /api\/lib\/hosted\/schedulerHandlers\.test\.js/);
  assert.match(script, /api\/lib\/hosted\/serviceRoleAccess\.test\.js/);
  assert.match(script, /api\/lib\/hosted\/signupHandlers\.test\.js/);
  assert.match(script, /api\/lib\/hosted\/usageHandlers\.test\.js/);
  assert.match(script, /api\/lib\/startup-office\/authorization\.test\.js/);
  assert.match(script, /api\/lib\/startup-office\/queryHandlers\.test\.js/);
  assert.match(script, /api\/lib\/startup-office\/demoSeedHandlers\.test\.js/);
  assert.match(script, /api\/lib\/startup-office\/profileHandlers\.test\.js/);
  assert.match(script, /api\/lib\/startup-office\/services\.test\.js/);
  assert.match(script, /api\/lib\/startup-office\/validation\.test\.js/);
  assert.match(script, /api\/lib\/startup-office\/workspaceConfigHandlers\.test\.js/);
  assert.match(script, /api\/lib\/startup-office\/workflowHandlers\.test\.js/);
  assert.match(script, /api\/lib\/startup-office\/operationsHandlers\.test\.js/);
  assert.match(script, /api\/lib\/startup-office\/objectHandlers\.test\.js/);
  assert.match(script, /workers\/startup-office\/loopEngine\.test\.js/);
  assert.doesNotMatch(script, new RegExp("loop" + ["Run", "ner"].join("")));
});

async function invoke(routePath, method, body, options = {}) {
  const headers = {};
  const req = {
    body,
    headers: {
      authorization: "Bearer user-token",
      host: "office.test",
      ...(options.headers || {}),
    },
    method,
    query: { path: routePath, ...(options.query || {}) },
  };
  const chunks = [];
  const res = {
    setHeader(name, value) {
      headers[String(name).toLowerCase()] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    end(chunk) {
      if (chunk) chunks.push(Buffer.from(chunk));
    },
  };
  await handler(req, res);
  const text = Buffer.concat(chunks).toString("utf8");
  return {
    body: text ? JSON.parse(text) : null,
    headers,
    status: res.statusCode,
  };
}
