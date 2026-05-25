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

test("local execution routes are no longer part of the hosted API surface", async () => {
  for (const route of [
    ["runner", "status"],
    ["runner", "jobs", "lease"],
    ["bridge", "availability"],
    ["bridge", "pairing", "start"],
    ["execution", "plans"],
  ]) {
    const response = await invoke(route, "GET", {});
    assert.equal(response.status, 404, route.join("/"));
  }
});

test("pure cloud migration drops obsolete local execution schema", () => {
  const migrationDir = path.join(__dirname, "..", "supabase", "migrations");
  const obsoleteMigrationFiles = fs
    .readdirSync(migrationDir)
    .filter((file) =>
      /(?:laf_bridge|bridge_only|deprecated_.*execution|obsolete_.*execution)/i.test(
        file,
      ),
    );
  assert.deepEqual(obsoleteMigrationFiles, []);

  const sql = fs.readFileSync(
    path.join(
      migrationDir,
      "20260525000000_remove_local_execution.sql",
    ),
    "utf8",
  );

  assert.match(sql, /drop table if exists public\.execution_plans cascade/);
  assert.match(sql, /drop table if exists public\.project_local_bindings cascade/);
  assert.match(sql, /drop table if exists public\.bridge_devices cascade/);
  assert.match(sql, /drop table if exists public\.runner_jobs cascade/);
  assert.match(sql, /p\.proname = 'claim_runner_job'/);
  assert.match(sql, /drop column if exists worktree_branch/);
  assert.match(sql, /check \(model_mode in \('laf_model', 'record_only'\)\)/);
  assert.match(sql, /set execution_mode = 'office'/);
  assert.match(sql, /to_regclass\('public\.tasks'\) is not null/);
});

test("Startup Office release gate points at loop engine tests", () => {
  const script = fs.readFileSync(
    path.join(__dirname, "..", "scripts", "startup-office-beta-release-gate.cjs"),
    "utf8",
  );
  assert.match(script, /startup-office:architecture/);
  assert.match(script, /startup-office:api-contracts/);
  assert.match(script, /api\/lib\/startup-office\/queryHandlers\.test\.js/);
  assert.match(script, /api\/lib\/startup-office\/workflowHandlers\.test\.js/);
  assert.match(script, /api\/lib\/startup-office\/operationsHandlers\.test\.js/);
  assert.match(script, /api\/lib\/startup-office\/objectHandlers\.test\.js/);
  assert.match(script, /workers\/startup-office\/loopEngine\.test\.js/);
  assert.doesNotMatch(script, new RegExp("loop" + "Runner"));
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
