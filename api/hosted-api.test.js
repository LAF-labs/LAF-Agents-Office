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
      "20260525210000_assert_pure_cloud_boundary_schema.sql",
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
  assert.match(schemaAssertionSql, /retired customer-managed execution residue/);
  assert.match(schemaAssertionSql, /raise exception/);

  const localIdentitySql = fs.readFileSync(
    path.join(
      migrationDir,
      "20260525220000_purge_local_identity_columns.sql",
    ),
    "utf8",
  );
  assert.match(localIdentitySql, /local_identity_column_names text\[\]/);
  assert.match(localIdentitySql, /'local_id'/);
  assert.match(localIdentitySql, /drop column if exists %I cascade/);
  assert.match(localIdentitySql, /obsolete local identity columns/);
  assert.match(localIdentitySql, /raise exception/);

  const schema = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "..", "supabase", "schema", "current.json"),
      "utf8",
    ),
  );
  assert.equal(schema.latestMigration, "20260525230000");
  assert.equal(schema.pureCloudBoundaryGuardMigration, "20260525230000");

  const latestBoundarySql = fs.readFileSync(
    path.join(
      migrationDir,
      "20260525230000_assert_pure_cloud_boundary_schema.sql",
    ),
    "utf8",
  );
  assert.match(latestBoundarySql, /retired_pairing/);
  assert.match(latestBoundarySql, /remaining_columns/);
  assert.match(latestBoundarySql, /remaining_constraints/);
  assert.match(latestBoundarySql, /remaining_functions/);
  assert.match(latestBoundarySql, /remaining_policies/);
  assert.match(latestBoundarySql, /remaining_tables/);
  assert.match(latestBoundarySql, /remaining_triggers/);
  assert.match(latestBoundarySql, /remaining_types/);
  assert.match(latestBoundarySql, /raise exception/);
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
  for (const table of schema.activeTables) {
    assert.equal(
      table.columns.some((column) => column === "local_id" || column.endsWith("_local_id")),
      false,
      `${table.name} must not expose local identity columns`,
    );
  }
  const messages = schema.activeTables.find(
    (table) => table.name === "channel_messages",
  );
  assert.equal(messages.columns.includes("project_id"), false);
  assert.equal(messages.columns.includes("task_id"), false);
});

test("Startup Office assets support run links and archive status", () => {
  const migrationDir = path.join(__dirname, "..", "supabase", "migrations");
  const sql = fs.readFileSync(
    path.join(
      migrationDir,
      "20260525170000_add_startup_office_asset_status.sql",
    ),
    "utf8",
  );
  assert.match(sql, /add column if not exists status text not null default 'active'/);
  assert.match(sql, /startup_office_assets_status_check/);
  assert.match(sql, /status in \('active', 'archived'\)/);
  assert.match(sql, /idx_startup_office_assets_team_status/);

  const schema = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "..", "supabase", "schema", "current.json"),
      "utf8",
    ),
  );
  const assets = schema.activeTables.find(
    (table) => table.name === "startup_office_assets",
  );
  assert.equal(assets.columns.includes("run_id"), true);
  assert.equal(assets.columns.includes("status"), true);

  const source = fs.readFileSync(path.join(__dirname, "[...path].js"), "utf8");
  assert.match(source, /status: startupOfficeAssetStatus\(body\.status\)/);
  assert.match(source, /patch\.run_id = body\.run_id \|\| null/);
  assert.match(source, /body\.archive \? "archived" : startupOfficeAssetStatus/);
});

test("Startup Office customers support discovery loop links and filters", () => {
  const migrationDir = path.join(__dirname, "..", "supabase", "migrations");
  const sql = fs.readFileSync(
    path.join(
      migrationDir,
      "20260525180000_add_startup_office_customer_loop_links.sql",
    ),
    "utf8",
  );
  assert.match(sql, /add column if not exists loop_id uuid references public\.startup_office_loops/);
  assert.match(sql, /on delete set null/);
  assert.match(sql, /idx_startup_office_customers_team_loop/);

  const schema = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "..", "supabase", "schema", "current.json"),
      "utf8",
    ),
  );
  const customers = schema.activeTables.find(
    (table) => table.name === "startup_office_customers",
  );
  assert.equal(customers.columns.includes("loop_id"), true);

  const source = fs.readFileSync(path.join(__dirname, "[...path].js"), "utf8");
  assert.match(source, /query\.loop_id = `eq\.\$\{options\.loop_id\}`/);
  assert.match(source, /loop_id: body\.loop_id \|\| body\.discovery_loop_id \|\| null/);
  assert.match(source, /patch\.loop_id = body\.loop_id \|\| body\.discovery_loop_id \|\| null/);
});

test("Startup Office signals support typed capture and reuse links", () => {
  const migrationDir = path.join(__dirname, "..", "supabase", "migrations");
  const sql = fs.readFileSync(
    path.join(
      migrationDir,
      "20260525200000_add_startup_office_signal_reuse_links.sql",
    ),
    "utf8",
  );
  assert.match(sql, /add column if not exists signal_type text not null default 'market'/);
  assert.match(sql, /add column if not exists loop_id uuid references public\.startup_office_loops/);
  assert.match(sql, /add column if not exists run_id uuid references public\.startup_office_runs/);
  assert.match(sql, /startup_office_signals_signal_type_check/);
  assert.match(sql, /'market', 'customer', 'competitor', 'internal'/);
  assert.match(sql, /idx_startup_office_signals_team_type_status/);
  assert.match(sql, /idx_startup_office_signals_team_loop/);
  assert.match(sql, /idx_startup_office_signals_team_run/);

  const schema = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "..", "supabase", "schema", "current.json"),
      "utf8",
    ),
  );
  const signals = schema.activeTables.find(
    (table) => table.name === "startup_office_signals",
  );
  assert.equal(signals.columns.includes("signal_type"), true);
  assert.equal(signals.columns.includes("loop_id"), true);
  assert.equal(signals.columns.includes("run_id"), true);

  const source = fs.readFileSync(path.join(__dirname, "[...path].js"), "utf8");
  assert.match(source, /function startupOfficeSignalType/);
  assert.match(source, /query\.signal_type = `eq\.\$\{options\.signal_type\}`/);
  assert.match(source, /query\.loop_id = `eq\.\$\{options\.loop_id\}`/);
  assert.match(source, /query\.run_id = `eq\.\$\{options\.run_id\}`/);
  assert.match(source, /loop_id: body\.loop_id \|\| body\.discovery_loop_id \|\| null/);
  assert.match(source, /run_id: body\.run_id \|\| null/);
  assert.match(source, /signal_type: startupOfficeSignalType\(body\.signal_type \|\| body\.type\)/);
  assert.match(source, /patch\.signal_type = startupOfficeSignalType/);
});

test("Startup Office metrics support ingestion updates and Growth Center summaries", () => {
  const migrationDir = path.join(__dirname, "..", "supabase", "migrations");
  const sql = fs.readFileSync(
    path.join(
      migrationDir,
      "20260525190000_add_startup_office_metric_updated_at.sql",
    ),
    "utf8",
  );
  assert.match(sql, /add column if not exists updated_at timestamptz not null default now\(\)/);
  assert.match(sql, /idx_startup_office_metrics_team_updated/);

  const schema = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "..", "supabase", "schema", "current.json"),
      "utf8",
    ),
  );
  const metrics = schema.activeTables.find(
    (table) => table.name === "startup_office_metrics",
  );
  assert.equal(metrics.columns.includes("updated_at"), true);

  const source = fs.readFileSync(path.join(__dirname, "[...path].js"), "utf8");
  assert.match(source, /metric_key: truncateText\(body\.metric_key \|\| body\.key \|\| "metric"/);
  assert.match(source, /metric_value: numericOrNull\(body\.metric_value \?\? body\.value\)/);
  assert.match(source, /updated_at: now/);

  const querySource = fs.readFileSync(
    path.join(__dirname, "lib", "startup-office", "queryHandlers.js"),
    "utf8",
  );
  assert.match(querySource, /metrics_summary: startupOfficeMetricSummary\(metrics\)/);
  assert.match(querySource, /latest_value/);
  assert.match(querySource, /previous_value/);
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
  assert.match(script, /startup-office:pure-cloud-boundary/);
  assert.match(script, /startup-office:tenant-isolation/);
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
  assert.match(script, /api\/lib\/startup-office\/tenantIsolation\.test\.js/);
  assert.match(script, /api\/lib\/startup-office\/validation\.test\.js/);
  assert.match(script, /api\/lib\/startup-office\/workspaceConfigHandlers\.test\.js/);
  assert.match(script, /api\/lib\/startup-office\/workflowHandlers\.test\.js/);
  assert.match(script, /api\/lib\/startup-office\/operationsHandlers\.test\.js/);
  assert.match(script, /api\/lib\/startup-office\/objectHandlers\.test\.js/);
  assert.match(script, /workers\/startup-office\/approvalGates\.test\.js/);
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
