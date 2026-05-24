const assert = require("node:assert/strict");
const crypto = require("node:crypto");
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

test("LAF Bridge execution migration defines idempotent schema, indexes, and RLS", () => {
  const sql = fs.readFileSync(
    path.join(__dirname, "..", "supabase", "migrations", "20260515010000_laf_bridge_execution.sql"),
    "utf8",
  );
  const tables = [
    "bridge_devices",
    "bridge_pairing_codes",
    "execution_plans",
    "execution_events",
    "execution_receipts",
  ];
  for (const table of tables) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${table}\\b`));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  for (const index of [
    "idx_bridge_devices_team_user",
    "idx_bridge_devices_team_seen",
    "idx_bridge_pairing_codes_team_user",
    "idx_execution_plans_team_status",
    "idx_execution_plans_device_status",
    "idx_execution_plans_task",
    "idx_execution_events_plan_created",
    "idx_execution_receipts_task_created",
  ]) {
    assert.match(sql, new RegExp(`create index if not exists ${index}\\b`));
  }
  assert.match(sql, /check \(device_kind in \('desktop'\)\)/);
  assert.match(sql, /check \(status in \('online', 'offline', 'revoked'\)\)/);
  assert.match(sql, /check \(mode in \('laf_model', 'my_bridge', 'record_only'\)\)/);
  assert.match(sql, /check \(provider in \('codex', 'claude_code', 'laf_model'\)\)/);
  assert.match(sql, /unique\(signature_key_id, nonce\)/);
  assert.match(sql, /unique\(plan_id, sequence\)/);
  assert.doesNotMatch(sql, /project_local_bindings/);
  assert.doesNotMatch(sql, /\bbinding_id\b/);
  assert.match(sql, /unique\(plan_id\)/);
  assert.doesNotMatch(sql, /\blocal_path_hash\b/);
  assert.match(sql, /updated_at timestamptz not null default now\(\)/);
  assert.doesNotMatch(sql, /\blocal_path text\b/);
  assert.doesNotMatch(sql, /create table public\./);
  assert.doesNotMatch(sql, /create index (?!if not exists)/);
  assert.match(sql, /drop policy if exists "members can read bridge devices"/);
  assert.match(sql, /drop policy if exists "members can read execution receipts"/);

});

test("bridge-only model constraints collapse legacy workspace Bridge values", () => {
  const governanceSQL = fs.readFileSync(
    path.join(__dirname, "..", "supabase", "migrations", "20260514000000_agentic_workspace_governance.sql"),
    "utf8",
  );
  assert.match(
    governanceSQL,
    /check \(model_mode in \('laf_model', 'my_bridge', 'record_only'\)\)/,
  );
  assert.doesNotMatch(governanceSQL, /check \(model_mode in \([^)]*local_cli/);

  const sql = fs.readFileSync(
    path.join(__dirname, "..", "supabase", "migrations", "20260520000000_bridge_only_model_constraints.sql"),
    "utf8",
  );
  assert.match(sql, /set device_kind = 'desktop'\s+where device_kind = 'team_bridge'/);
  assert.match(sql, /set mode = 'my_bridge'\s+where mode = 'team_bridge'/);
  assert.match(sql, /set model_mode = 'my_bridge'\s+where model_mode in \('local_cli', 'team_bridge'\)/);
  assert.match(sql, /bridge_devices_device_kind_check\s+check \(device_kind in \('desktop'\)\)/);
  assert.match(sql, /execution_plans_mode_check\s+check \(mode in \('laf_model', 'my_bridge', 'record_only'\)\)/);
  assert.match(sql, /tasks_model_mode_check\s+check \(model_mode in \('laf_model', 'my_bridge', 'record_only'\)\)/);
  assert.match(sql, /channel_messages_model_mode_check\s+check \(model_mode in \('laf_model', 'my_bridge', 'record_only'\)\)/);
  assert.doesNotMatch(sql, /check \([^)]*team_bridge/);
});

test("bridge-only execution migration retires legacy local execution schema", () => {
  const migrations = fs
    .readdirSync(path.join(__dirname, "..", "supabase", "migrations"))
    .filter((file) => file.endsWith(".sql"))
    .sort();
  const seenVersions = new Map();
  for (const migration of migrations) {
    const match = migration.match(/^(\d{14})_[a-z0-9_]+\.sql$/);
    assert.ok(match, `${migration} must use a 14-digit Supabase timestamp prefix`);
    const existing = seenVersions.get(match[1]);
    assert.equal(existing, undefined, `${migration} duplicates migration version ${match[1]} from ${existing}`);
    seenVersions.set(match[1], migration);
  }
  const cleanupMigration = "20260519000000_bridge_only_execution_surface.sql";
  const cleanupIndex = migrations.indexOf(cleanupMigration);
  assert.ok(
    cleanupIndex > migrations.indexOf("20260515010000_laf_bridge_execution.sql"),
    "Bridge-only cleanup must run after the Bridge execution schema",
  );
  const legacyCreation =
    /create\s+table\s+if\s+not\s+exists\s+public\.(?:runners|runner_[a-z_]+)|create\s+or\s+replace\s+function\s+public\.claim_runner_job|alter\s+table\s+public\.runner_[a-z_]+|create\s+(?:index|policy)[\s\S]*?\b(?:runners|runner_[a-z_]+)\b/i;
  for (const migration of migrations.filter((file) => file !== cleanupMigration)) {
    const migrationSQL = fs.readFileSync(
      path.join(__dirname, "..", "supabase", "migrations", migration),
      "utf8",
    );
    assert.doesNotMatch(
      migrationSQL,
      legacyCreation,
      `${migration} must not create or extend legacy local execution schema`,
    );
  }
  const legacyExecutionSchema =
    /\b(runners|runner_capabilities|runner_jobs|runner_job_events|runner_pairing_codes|claim_runner_job)\b/;
  for (const migration of migrations.slice(cleanupIndex + 1)) {
    const laterSQL = fs.readFileSync(
      path.join(__dirname, "..", "supabase", "migrations", migration),
      "utf8",
    );
    assert.doesNotMatch(
      laterSQL,
      legacyExecutionSchema,
      `${migration} must not reintroduce legacy local execution schema after Bridge-only cleanup`,
    );
  }

  const sql = fs.readFileSync(
    path.join(__dirname, "..", "supabase", "migrations", "20260519000000_bridge_only_execution_surface.sql"),
    "utf8",
  );
  assert.match(sql, /drop function if exists public\.claim_runner_job/);
  assert.match(sql, /alter table if exists public\.wiki_write_requests\s+drop column if exists runner_id/);
  assert.match(sql, /alter table if exists public\.tasks\s+drop column if exists worktree_path/);
  assert.match(sql, /to_regclass\('public\.runner_jobs'\) is not null/);
  for (const policy of [
    "members can read runner pairing codes",
    "members can read runner job events",
    "members can read runner jobs",
    "members can write runner jobs",
    "members can read runner capabilities",
    "managers can write runner capabilities",
    "managers can update runner capabilities",
    "members can read runners",
    "managers can write runners",
    "managers can update runners",
    "managers can delete runners",
  ]) {
    assert.match(sql, new RegExp(`drop policy if exists "${policy}"`));
  }
  for (const table of [
    "runner_pairing_codes",
    "runner_job_events",
    "runner_jobs",
    "runner_capabilities",
    "runners",
  ]) {
    assert.match(sql, new RegExp(`drop table if exists public\\.${table} cascade`));
  }

  const controlPlaneSQL = fs.readFileSync(
    path.join(__dirname, "..", "supabase", "migrations", "20260509000000_hosted_control_plane.sql"),
    "utf8",
  );
  assert.doesNotMatch(controlPlaneSQL, /\bworktree_path\s+text\b/);
});

test("workspace settings migration defines hosted onboarding/config state", () => {
  const sql = fs.readFileSync(
    path.join(__dirname, "..", "supabase", "migrations", "20260518000000_workspace_settings.sql"),
    "utf8",
  );
  assert.match(sql, /create table if not exists public\.workspace_settings\b/);
  assert.match(sql, /team_id uuid primary key references public\.teams\(id\) on delete cascade/);
  assert.match(sql, /onboarding_completed_at timestamptz/);
  assert.match(sql, /company_profile jsonb not null default '\{\}'::jsonb/);
  assert.match(sql, /preferences jsonb not null default '\{\}'::jsonb/);
  assert.match(sql, /alter table public\.workspace_settings enable row level security/);
  assert.match(sql, /members can read workspace settings/);
  assert.match(sql, /managers can insert workspace settings/);
  assert.match(sql, /managers can update workspace settings/);
});

test("startup office domain migration defines company cloud operations schema", () => {
  const sql = fs.readFileSync(
    path.join(__dirname, "..", "supabase", "migrations", "20260524000000_startup_office_domain.sql"),
    "utf8",
  );
  const tables = [
    "company_profiles",
    "startup_office_loops",
    "startup_office_runs",
    "startup_office_artifacts",
    "startup_office_approvals",
    "startup_office_receipts",
    "startup_office_assets",
    "startup_office_customers",
    "startup_office_metrics",
    "startup_office_signals",
  ];
  for (const table of tables) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${table}\\b`));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  for (const index of [
    "idx_startup_office_loops_team_status",
    "idx_startup_office_runs_team_status",
    "idx_startup_office_approvals_team_status",
    "idx_startup_office_receipts_team_created",
    "idx_startup_office_assets_team_kind",
    "idx_startup_office_customers_team_status",
    "idx_startup_office_metrics_team_key",
    "idx_startup_office_signals_team_status",
  ]) {
    assert.match(sql, new RegExp(`create index if not exists ${index}\\b`));
  }
  assert.match(sql, /unique\(team_id, slug\)/);
  assert.match(sql, /check \(status in \('queued', 'running', 'waiting_approval', 'completed', 'failed', 'canceled'\)\)/);
  assert.match(sql, /check \(status in \('pending', 'approved', 'rejected', 'revision_requested'\)\)/);
  assert.match(sql, /members can read startup office runs/);
  assert.match(sql, /managers can decide startup office approvals/);
  assert.match(sql, /members can read startup office receipts/);
  assert.doesNotMatch(sql, /\bprojects\b/);
  assert.doesNotMatch(sql, /\btasks\b/);
  assert.doesNotMatch(sql, /\bbridge\b/i);
});

test("startup office backend domain modules expose stable boundaries", () => {
  const {
    STARTUP_OFFICE_LOOP_DEFINITIONS,
  } = require("./lib/startup-office/loopDefinitions");
  const {
    createStartupOfficeRepository,
  } = require("./lib/startup-office/repositories");
  const {
    publicCompanyProfile,
    publicStartupOfficeArtifact,
    publicStartupOfficeRun,
  } = require("./lib/startup-office/serializers");
  const {
    createStartupOfficeServices,
  } = require("./lib/startup-office/services");
  const {
    createStartupOfficeModelClient,
  } = require("../workers/startup-office/modelClient");
  const {
    runStartupOfficeLoop,
  } = require("../workers/startup-office/loopRunner");
  const {
    STARTUP_OFFICE_LOOP_TEMPLATES,
  } = require("../workers/startup-office/loopTemplates");
  const {
    applyStartupOfficeMemoryPromotion,
  } = require("../workers/startup-office/wikiWriter");

  assert.equal(typeof createStartupOfficeRepository, "function");
  assert.equal(typeof createStartupOfficeServices, "function");
  assert.equal(typeof createStartupOfficeModelClient, "function");
  assert.equal(typeof applyStartupOfficeMemoryPromotion, "function");
  assert.equal(typeof runStartupOfficeLoop, "function");
  assert.equal(typeof publicCompanyProfile, "function");
  assert.equal(typeof publicStartupOfficeRun, "function");
  assert.equal(typeof publicStartupOfficeArtifact, "function");
  assert.equal(typeof STARTUP_OFFICE_LOOP_TEMPLATES["idea-validation"], "object");
  assert.ok(
    STARTUP_OFFICE_LOOP_DEFINITIONS.some(
      (loop) => loop.slug === "idea-validation",
    ),
  );
});

test("startup office worker jobs migration defines async AI run state", () => {
  const sql = fs.readFileSync(
    path.join(
      __dirname,
      "..",
      "supabase",
      "migrations",
      "20260524010000_startup_office_worker_jobs.sql",
    ),
    "utf8",
  );
  assert.match(sql, /create table if not exists public\.startup_office_worker_jobs\b/);
  assert.match(sql, /check \(status in \('queued', 'running', 'completed', 'failed', 'canceled'\)\)/);
  assert.match(sql, /attempts integer not null default 0/);
  assert.match(sql, /max_attempts integer not null default 2/);
  assert.match(sql, /create index if not exists idx_startup_office_worker_jobs_team_status\b/);
  assert.match(sql, /alter table public\.startup_office_worker_jobs enable row level security/);
  assert.match(sql, /members can read startup office worker jobs/);
});

test("startup office memory migration defines canonical company memory pages", () => {
  const sql = fs.readFileSync(
    path.join(
      __dirname,
      "..",
      "supabase",
      "migrations",
      "20260524020000_startup_office_memory.sql",
    ),
    "utf8",
  );
  assert.match(sql, /create table if not exists public\.startup_office_memory_pages\b/);
  assert.match(sql, /unique\(team_id, slug\)/);
  assert.match(sql, /check \(status in \('draft', 'approved', 'archived'\)\)/);
  assert.match(sql, /provenance jsonb not null default '\{\}'::jsonb/);
  assert.match(sql, /sources jsonb not null default '\[\]'::jsonb/);
  assert.match(sql, /assumptions jsonb not null default '\[\]'::jsonb/);
  assert.match(sql, /members can read startup office memory pages/);
});

test("channel messages migration defines hosted chat persistence", () => {
  const sql = fs.readFileSync(
    path.join(__dirname, "..", "supabase", "migrations", "20260519010000_channel_messages.sql"),
    "utf8",
  );
  assert.match(sql, /create table if not exists public\.channel_messages\b/);
  assert.match(sql, /team_id uuid not null references public\.teams\(id\) on delete cascade/);
  assert.match(sql, /home_session_thread_id text/);
  assert.match(sql, /thread_id text/);
  assert.match(sql, /run_id text/);
  assert.match(sql, /metadata jsonb not null default '\{\}'::jsonb/);
  for (const index of [
    "idx_channel_messages_team_channel_created",
    "idx_channel_messages_team_thread",
    "idx_channel_messages_home_session",
    "idx_channel_messages_task",
    "idx_channel_messages_run",
  ]) {
    assert.match(sql, new RegExp(`create index if not exists ${index}\\b`));
  }
  assert.match(sql, /alter table public\.channel_messages enable row level security/);
  assert.match(sql, /members can read channel messages/);
  assert.match(sql, /members can insert channel messages/);
  assert.match(sql, /members can update own channel messages/);
});

test("hosted config and onboarding routes persist team workspace settings", async (t) => {
  const db = {
    audit_events: [],
    memberships: [
      {
        role: "owner",
        status: "active",
        team_id: "team-1",
        user_id: "user-1",
      },
    ],
    projects: [],
    startup_office_loops: [],
    startup_office_receipts: [],
    tasks: [],
    teams: [{ id: "team-1", name: "Team One", slug: "team-one" }],
    workspace_settings: [],
  };
  const oldFetch = global.fetch;
  t.after(() => {
    global.fetch = oldFetch;
  });
  global.fetch = hostedFetch(db);

  const health = await invoke(["health"], "GET", undefined, {
    headers: { authorization: "" },
  });
  assert.equal(health.status, 200);
  assert.equal(health.body.status, "ok");

  const prereqs = await invoke(["onboarding", "prereqs"], "GET", undefined, {
    headers: { authorization: "" },
  });
  assert.equal(prereqs.status, 200);
  assert.deepEqual(prereqs.body.prereqs, []);

  const initialConfig = await invoke(["config"], "GET");
  assert.equal(initialConfig.status, 200);
  assert.equal(initialConfig.body.workspace_slug, "team-one");
  assert.equal(initialConfig.body.llm_provider, "claude-code");
  assert.equal(initialConfig.body.action_provider, undefined);
  assert.equal(initialConfig.body.api_key_set, undefined);
  assert.equal(initialConfig.body.openai_key_set, undefined);
  assert.equal(initialConfig.body.composio_key_set, undefined);
  assert.equal(initialConfig.body.default_format, undefined);
  assert.equal(initialConfig.body.default_timeout, undefined);
  assert.equal(initialConfig.body.memory_backend, undefined);
  assert.equal(initialConfig.body.telegram_token_set, undefined);
  assert.equal(initialConfig.body.config_path, undefined);
  assert.equal(initialConfig.body.dev_url, undefined);
  assert.equal(initialConfig.body.openclaw_gateway_url, undefined);
  assert.equal(initialConfig.body.openclaw_token_set, undefined);

  const initialState = await invoke(["onboarding", "state"], "GET");
  assert.equal(initialState.status, 200);
  assert.equal(initialState.body.onboarded, false);

  const saved = await invoke(["config"], "POST", {
    company_name: "LAF Labs",
    action_provider: "composio",
    api_key: "secret",
    composio_api_key: "secret",
    default_format: "json",
    default_timeout: 90000,
    dev_url: "http://127.0.0.1:9999",
    llm_provider: "codex",
    memory_backend: "sqlite",
    openclaw_gateway_url: "ws://127.0.0.1:18789",
    openai_api_key: "secret",
    telegram_bot_token: "secret",
    team_lead_slug: "ceo",
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.config.company_name, "LAF Labs");
  assert.equal(saved.body.config.llm_provider, "codex");
  assert.equal(saved.body.config.action_provider, undefined);
  assert.equal(saved.body.config.api_key_set, undefined);
  assert.equal(saved.body.config.openai_key_set, undefined);
  assert.equal(saved.body.config.composio_key_set, undefined);
  assert.equal(saved.body.config.default_format, undefined);
  assert.equal(saved.body.config.default_timeout, undefined);
  assert.equal(saved.body.config.memory_backend, undefined);
  assert.equal(saved.body.config.telegram_token_set, undefined);
  assert.equal(saved.body.config.config_path, undefined);
  assert.equal(saved.body.config.dev_url, undefined);
  assert.equal(saved.body.config.openclaw_gateway_url, undefined);
  assert.equal(saved.body.config.openclaw_token_set, undefined);
  assert.equal(db.workspace_settings.length, 1);
  assert.equal(db.workspace_settings[0].company_profile.name, "LAF Labs");
  assert.equal(db.workspace_settings[0].preferences.action_provider, undefined);
  assert.equal(db.workspace_settings[0].preferences.default_format, undefined);
  assert.equal(db.workspace_settings[0].preferences.default_timeout, undefined);
  assert.equal(db.workspace_settings[0].preferences.dev_url, undefined);
  assert.equal(db.workspace_settings[0].preferences.memory_backend, undefined);
  assert.equal(db.workspace_settings[0].preferences.openclaw_gateway_url, undefined);

  const completed = await invoke(["onboarding", "complete"], "POST", {
    company: "LAF Labs",
    description: "AI agent workspace",
    priority: "Ship the hosted SaaS path",
    task: "Invite the first teammate",
  });
  assert.equal(completed.status, 200, JSON.stringify(completed.body));
  assert.equal(completed.body.onboarded, true);
  assert.ok(db.workspace_settings[0].onboarding_completed_at);
  assert.equal(db.projects.length, 0);
  assert.equal(db.tasks.length, 0);
  assert.equal(db.startup_office_loops.length, 5);
  assert.deepEqual(
    db.startup_office_loops.map((loop) => loop.slug).sort(),
    [
      "customer-discovery",
      "idea-validation",
      "launch-campaign",
      "offer-package",
      "weekly-operator-review",
    ],
  );
  assert.equal(db.startup_office_receipts.length, 1);
  assert.equal(db.startup_office_receipts[0].event_type, "workspace.onboarded");
  assert.equal(completed.body.project, undefined);
  assert.equal(completed.body.task, undefined);

  const finalState = await invoke(["onboarding", "state"], "GET");
  assert.equal(finalState.status, 200);
  assert.equal(finalState.body.onboarded, true);
});

test("startup office API persists profile, loops, approvals, runs, and receipts", async (t) => {
  const db = {
    audit_events: [],
    company_profiles: [],
    memberships: [
      {
        role: "owner",
        status: "active",
        team_id: "team-1",
        user_id: "user-1",
      },
    ],
    startup_office_approvals: [],
    startup_office_artifacts: [],
    startup_office_loops: [],
    startup_office_memory_pages: [],
    startup_office_receipts: [],
    startup_office_runs: [],
    startup_office_worker_jobs: [],
    teams: [{ id: "team-1", name: "Team One", slug: "team-one" }],
    wiki_article_index: [],
    workspace_settings: [],
  };
  const oldFetch = global.fetch;
  t.after(() => {
    global.fetch = oldFetch;
  });
  global.fetch = hostedFetch(db);

  const initialProfile = await invoke(["company", "profile"], "GET");
  assert.equal(initialProfile.status, 200, JSON.stringify(initialProfile.body));
  assert.equal(initialProfile.body.profile.name, "Team One");

  const savedProfile = await invoke(["company", "profile"], "PATCH", {
    company_profile: {
      icp: "Solo founders selling B2B software",
      offer: "AI Startup Office in a box",
      positioning: "Founder-controlled AI operators",
      stage: "closed_beta",
    },
    company_name: "LAF Labs",
    priority: "Validate paid beta demand",
  });
  assert.equal(savedProfile.status, 200, JSON.stringify(savedProfile.body));
  assert.equal(savedProfile.body.profile.name, "LAF Labs");
  assert.equal(savedProfile.body.profile.icp, "Solo founders selling B2B software");
  assert.equal(db.company_profiles.length, 1);
  assert.equal(db.company_profiles[0].offer, "AI Startup Office in a box");
  assert.equal(db.workspace_settings[0].company_profile.name, "LAF Labs");

  const loops = await invoke(["startup-office", "loops"], "GET");
  assert.equal(loops.status, 200, JSON.stringify(loops.body));
  assert.equal(loops.body.loops.length, 5);
  assert.ok(loops.body.loops.some((loop) => loop.slug === "idea-validation"));

  const run = await invoke(["startup-office", "loops", "idea-validation", "run"], "POST", {
    objective: "Find the first beta buyer segment",
    inputs: { market: "AI operations" },
  });
  assert.equal(run.status, 200, JSON.stringify(run.body));
  assert.equal(run.body.run.status, "waiting_approval");
  assert.equal(run.body.approval.status, "pending");
  assert.equal(run.body.receipt.event_type, "run.ai_draft_ready");
  assert.equal(run.body.run.metadata.provider, "fake");
  assert.equal(run.body.run.metadata.cost.total_tokens, 1900);
  assert.equal(db.startup_office_loops.length, 1);
  assert.equal(db.startup_office_runs.length, 1);
  assert.equal(db.startup_office_artifacts.length, 1);
  assert.equal(db.startup_office_approvals.length, 1);
  assert.equal(db.startup_office_worker_jobs.length, 1);
  assert.equal(db.startup_office_worker_jobs[0].status, "completed");
  assert.equal(db.startup_office_receipts.length, 3);
  assert.deepEqual(
    db.startup_office_receipts.map((receipt) => receipt.event_type),
    ["run.queued", "run.started", "run.ai_draft_ready"],
  );
  assert.equal(db.startup_office_artifacts[0].content.includes("Founder Control"), true);
  assert.equal(db.startup_office_artifacts[0].metadata.cost.total_tokens, 1900);
  assert.equal(db.startup_office_artifacts[0].metadata.context.memory_page_count, 0);
  assert.ok(run.body.approval.metadata.memory_diff.changed_pages.length >= 1);

  const approvals = await invoke(["startup-office", "approvals"], "GET");
  assert.equal(approvals.status, 200, JSON.stringify(approvals.body));
  assert.equal(approvals.body.approvals.length, 1);
  assert.equal(approvals.body.approvals[0].title, "Approve Idea Validation AI draft");

  const runDetail = await invoke(["startup-office", "runs", run.body.run.id], "GET");
  assert.equal(runDetail.status, 200, JSON.stringify(runDetail.body));
  assert.equal(runDetail.body.run.status, "waiting_approval");
  assert.equal(runDetail.body.artifacts.length, 1);
  assert.equal(runDetail.body.approvals.length, 1);
  assert.equal(runDetail.body.receipts.length, 3);

  const approvalID = run.body.approval.id;
  const approved = await invoke(["startup-office", "approvals", approvalID, "approve"], "POST", {
    note: "Ship this beta positioning.",
  });
  assert.equal(approved.status, 200, JSON.stringify(approved.body));
  assert.equal(approved.body.approval.status, "approved");
  assert.equal(approved.body.run.status, "completed");
  assert.equal(approved.body.memory_pages.length, 7);
  assert.ok(
    db.startup_office_memory_pages.some(
      (page) =>
        page.slug === "validation-log" &&
        page.provenance.artifact_id === run.body.artifact.id,
    ),
  );
  assert.equal(db.startup_office_receipts.length, 4);
  assert.equal(db.startup_office_receipts[3].event_type, "approval.approved");
  assert.deepEqual(
    db.startup_office_receipts[3].trace.memory_pages.sort(),
    [
      "company-profile",
      "customer-discovery-log",
      "decisions",
      "icp",
      "offer",
      "risks",
      "validation-log",
    ],
  );

  const secondRun = await invoke(["startup-office", "loops", "idea-validation", "run"], "POST", {
    objective: "Use approved memory on the next run",
  });
  assert.equal(secondRun.status, 200, JSON.stringify(secondRun.body));
  assert.equal(secondRun.body.artifact.metadata.context.memory_page_count, 7);

  const summary = await invoke(["startup-office", "growth-summary"], "GET");
  assert.equal(summary.status, 200, JSON.stringify(summary.body));
  assert.equal(summary.body.company_profile.name, "LAF Labs");
  assert.equal(summary.body.pulse.recent_runs, 2);
  assert.equal(summary.body.pulse.pending_approvals, 1);
  assert.equal(summary.body.pulse.recent_receipts, 7);
  assert.equal(summary.body.memory_pages.length, 7);
  assert.equal(summary.body.recent_artifacts.length, 2);
  assert.equal(summary.body.recent_artifacts[0].title, "Idea Validation AI draft");

  const revision = await invoke(
    ["startup-office", "approvals", secondRun.body.approval.id, "revise"],
    "POST",
    { revision_note: "Tighten sources before approval." },
  );
  assert.equal(revision.status, 200, JSON.stringify(revision.body));
  assert.equal(revision.body.approval.status, "revision_requested");
  assert.equal(revision.body.run.status, "queued");
  assert.equal(db.startup_office_receipts.at(-1).event_type, "approval.revision_requested");
});

test("startup office approval policy is visible and updateable by workspace managers", async (t) => {
  const db = {
    audit_events: [],
    memberships: [
      {
        role: "owner",
        status: "active",
        team_id: "team-1",
        user_id: "user-1",
      },
    ],
    teams: [{ id: "team-1", name: "Team One", slug: "team-one" }],
    workspace_settings: [],
  };
  const oldFetch = global.fetch;
  t.after(() => {
    global.fetch = oldFetch;
  });
  global.fetch = hostedFetch(db);

  const initial = await invoke(["startup-office", "policy"], "GET");
  assert.equal(initial.status, 200, JSON.stringify(initial.body));
  assert.equal(initial.body.policy.founder_approval_required.public_claims, true);
  assert.equal(initial.body.policy.require_citations_for_public_claims, true);

  const updated = await invoke(["startup-office", "policy"], "PATCH", {
    policy: {
      founder_approval_required: { spend: false },
      require_citations_for_public_claims: false,
      support_access: { time_bound_hours: 12 },
    },
  });
  assert.equal(updated.status, 200, JSON.stringify(updated.body));
  assert.equal(updated.body.policy.founder_approval_required.spend, false);
  assert.equal(updated.body.policy.founder_approval_required.public_claims, true);
  assert.equal(updated.body.policy.support_access.time_bound_hours, 12);
  assert.equal(db.workspace_settings[0].preferences.startup_office_approval_policy.require_citations_for_public_claims, false);
});

test("startup office run lifecycle supports deferred queue, cancel, and retry", async (t) => {
  const db = {
    audit_events: [],
    company_profiles: [],
    memberships: [
      {
        role: "owner",
        status: "active",
        team_id: "team-1",
        user_id: "user-1",
      },
    ],
    startup_office_approvals: [],
    startup_office_artifacts: [],
    startup_office_loops: [],
    startup_office_memory_pages: [],
    startup_office_receipts: [],
    startup_office_runs: [],
    startup_office_worker_jobs: [],
    teams: [{ id: "team-1", name: "Team One", slug: "team-one" }],
    wiki_article_index: [],
    workspace_settings: [],
  };
  const oldFetch = global.fetch;
  t.after(() => {
    global.fetch = oldFetch;
  });
  global.fetch = hostedFetch(db);

  const queued = await invoke(["startup-office", "loops", "idea-validation", "run"], "POST", {
    defer: true,
    objective: "Queue but do not process yet",
  });
  assert.equal(queued.status, 202, JSON.stringify(queued.body));
  assert.equal(queued.body.status, "queued");
  assert.equal(queued.body.run.status, "queued");
  assert.equal(db.startup_office_artifacts.length, 0);
  assert.equal(db.startup_office_worker_jobs[0].status, "queued");

  const canceled = await invoke(["startup-office", "runs", queued.body.run.id, "cancel"], "POST");
  assert.equal(canceled.status, 200, JSON.stringify(canceled.body));
  assert.equal(canceled.body.run.status, "canceled");
  assert.equal(db.startup_office_receipts.at(-1).event_type, "run.canceled");

  const retried = await invoke(["startup-office", "runs", queued.body.run.id, "retry"], "POST", {
    objective: "Retry with the fake AI worker",
  });
  assert.equal(retried.status, 200, JSON.stringify(retried.body));
  assert.equal(retried.body.run.status, "waiting_approval");
  assert.equal(retried.body.approval.status, "pending");
  assert.equal(db.startup_office_artifacts.length, 1);
  assert.equal(db.startup_office_worker_jobs.at(-1).status, "completed");
});

test("startup office operating objects support CRUD, artifact actions, and export", async (t) => {
  const db = {
    audit_events: [],
    memberships: [
      {
        role: "owner",
        status: "active",
        team_id: "team-1",
        user_id: "user-1",
      },
    ],
    startup_office_approvals: [],
    startup_office_artifacts: [
      {
        content: "Interview founders who are already paying for operations help.",
        id: "artifact-1",
        kind: "plan",
        metadata: {},
        run_id: "run-1",
        team_id: "team-1",
        title: "Discovery artifact",
      },
    ],
    startup_office_assets: [],
    startup_office_customers: [],
    startup_office_memory_pages: [],
    startup_office_metrics: [],
    startup_office_receipts: [],
    startup_office_runs: [],
    startup_office_signals: [],
    teams: [{ id: "team-1", name: "Team One", slug: "team-one" }],
  };
  const oldFetch = global.fetch;
  t.after(() => {
    global.fetch = oldFetch;
  });
  global.fetch = hostedFetch(db);

  const asset = await invoke(["startup-office", "assets"], "POST", {
    body: "Beta offer draft",
    kind: "document",
    name: "Offer draft",
  });
  assert.equal(asset.status, 200, JSON.stringify(asset.body));
  assert.equal(asset.body.asset.name, "Offer draft");

  const customer = await invoke(["startup-office", "customers"], "POST", {
    name: "Acme Founder",
    notes: "Asked for validation help",
    status: "interviewing",
  });
  assert.equal(customer.status, 200, JSON.stringify(customer.body));
  assert.equal(customer.body.customer.status, "interviewing");

  const metric = await invoke(["startup-office", "metrics"], "POST", {
    metric_key: "interviews_booked",
    metric_value: 3,
    unit: "count",
  });
  assert.equal(metric.status, 200, JSON.stringify(metric.body));
  assert.equal(metric.body.metric.metric_value, 3);

  const signal = await invoke(["startup-office", "signals"], "POST", {
    body: "Founder wants receipt-backed AI outputs.",
    source: "manual",
    title: "Receipt trust signal",
  });
  assert.equal(signal.status, 200, JSON.stringify(signal.body));
  assert.equal(signal.body.signal.status, "new");

  const archivedSignal = await invoke(
    ["startup-office", "signals", signal.body.signal.id],
    "PATCH",
    { archive: true },
  );
  assert.equal(archivedSignal.status, 200, JSON.stringify(archivedSignal.body));
  assert.equal(archivedSignal.body.signal.status, "archived");

  const artifactAsset = await invoke(
    ["startup-office", "artifacts", "artifact-1", "save-as-asset"],
    "POST",
    { name: "Saved discovery artifact" },
  );
  assert.equal(artifactAsset.status, 200, JSON.stringify(artifactAsset.body));
  assert.equal(artifactAsset.body.asset.metadata.artifact_id, "artifact-1");

  const artifactSignal = await invoke(
    ["startup-office", "artifacts", "artifact-1", "record-signal"],
    "POST",
    { title: "Artifact insight" },
  );
  assert.equal(artifactSignal.status, 200, JSON.stringify(artifactSignal.body));
  assert.equal(artifactSignal.body.signal.metadata.artifact_id, "artifact-1");

  const listed = await invoke(["startup-office", "assets"], "GET");
  assert.equal(listed.status, 200, JSON.stringify(listed.body));
  assert.equal(listed.body.assets.length, 2);

  const exported = await invoke(["startup-office", "export"], "GET");
  assert.equal(exported.status, 200, JSON.stringify(exported.body));
  assert.equal(exported.body.export.assets.length, 2);
  assert.equal(exported.body.export.customers.length, 1);
  assert.equal(exported.body.export.metrics.length, 1);
  assert.equal(exported.body.export.signals.length, 2);
});

test("startup office demo seed creates a paid beta validation workspace", async (t) => {
  const db = {
    audit_events: [],
    company_profiles: [],
    memberships: [
      {
        role: "owner",
        status: "active",
        team_id: "team-1",
        user_id: "user-1",
      },
    ],
    startup_office_approvals: [],
    startup_office_artifacts: [],
    startup_office_loops: [],
    startup_office_receipts: [],
    startup_office_runs: [],
    teams: [{ id: "team-1", name: "Team One", slug: "team-one" }],
    workspace_settings: [],
  };
  const oldFetch = global.fetch;
  t.after(() => {
    global.fetch = oldFetch;
  });
  global.fetch = hostedFetch(db);

  const seeded = await invoke(["startup-office", "demo-seed"], "POST", {
    company_name: "Demo Beta Co",
  });
  assert.equal(seeded.status, 200, JSON.stringify(seeded.body));
  assert.equal(seeded.body.profile.name, "Demo Beta Co");
  assert.equal(seeded.body.profile.stage, "paid_beta_validation");
  assert.equal(seeded.body.loops.length, 3);
  assert.deepEqual(
    seeded.body.loops.map((loop) => loop.slug).sort(),
    ["customer-discovery", "idea-validation", "offer-package"],
  );
  assert.equal(seeded.body.approval.title, "Approve Idea Validation draft");
  assert.equal(seeded.body.approval.status, "pending");
  assert.equal(db.startup_office_approvals.length, 1);
  assert.equal(db.startup_office_artifacts.length, 2);
  assert.equal(db.startup_office_receipts.length, 3);
  assert.ok(
    db.startup_office_artifacts.some(
      (artifact) =>
        artifact.title === "Offer Package artifact" &&
        artifact.content.includes("Validate and launch a paid beta"),
    ),
  );
  assert.ok(
    db.startup_office_receipts.some(
      (receipt) => receipt.event_type === "demo.customer_discovery_ready",
    ),
  );

  const secondSeed = await invoke(["startup-office", "demo-seed"], "POST", {
    company_name: "Demo Beta Co",
  });
  assert.equal(secondSeed.status, 200, JSON.stringify(secondSeed.body));
  assert.equal(db.startup_office_approvals.length, 1);
  assert.equal(db.startup_office_artifacts.length, 2);
  assert.equal(db.startup_office_receipts.length, 3);

  const summary = await invoke(["startup-office", "growth-summary"], "GET");
  assert.equal(summary.status, 200, JSON.stringify(summary.body));
  assert.equal(summary.body.company_profile.name, "Demo Beta Co");
  assert.equal(summary.body.pulse.pending_approvals, 1);
  assert.equal(summary.body.recent_artifacts.length, 2);
  assert.equal(summary.body.recent_receipts.length, 3);
});

test("startup office demo seed requires an admin role", async (t) => {
  const db = {
    audit_events: [],
    company_profiles: [],
    memberships: [
      {
        role: "member",
        status: "active",
        team_id: "team-1",
        user_id: "user-1",
      },
    ],
    startup_office_approvals: [],
    startup_office_artifacts: [],
    startup_office_loops: [],
    startup_office_receipts: [],
    startup_office_runs: [],
    teams: [{ id: "team-1", name: "Team One", slug: "team-one" }],
    workspace_settings: [],
  };
  const oldFetch = global.fetch;
  t.after(() => {
    global.fetch = oldFetch;
  });
  global.fetch = hostedFetch(db);

  const denied = await invoke(["startup-office", "demo-seed"], "POST", {
    company_name: "Demo Beta Co",
  });
  assert.equal(denied.status, 403);
  assert.equal(denied.body.error, "owner or admin role required for demo seed");
  assert.equal(db.company_profiles.length, 0);
});

test("hosted workspace compatibility routes avoid broker-only 404s", async (t) => {
  const db = {
    channel_messages: [],
    memberships: [
      {
        role: "owner",
        status: "active",
        team_id: "team-1",
        user_id: "user-1",
      },
    ],
    projects: [
      {
        id: "project-1",
        local_id: "project-a",
        name: "Project A",
        team_id: "team-1",
      },
    ],
    teams: [{ id: "team-1", name: "Team One", slug: "team-one" }],
  };
  const oldFetch = global.fetch;
  t.after(() => {
    global.fetch = oldFetch;
  });
  global.fetch = hostedFetch(db);

  for (const path of [
    ["office-members"],
    ["members"],
    ["channels"],
    ["messages"],
    ["home-sessions"],
    ["requests"],
    ["actions"],
    ["signals"],
    ["decisions"],
    ["watchdogs"],
    ["scheduler"],
    ["usage"],
    ["agent-logs"],
    ["memory"],
    ["commands"],
    ["projects", "repo-readiness"],
  ]) {
    const response = await invoke(path, "GET", undefined, {
      query: path.join("/") === "projects/repo-readiness" ? { id: "project-a" } : {},
    });
    assert.notEqual(response.status, 404, path.join("/"));
    assert.ok(response.status < 500, path.join("/"));
  }

  const posted = await invoke(["messages"], "POST", {
    channel: "general",
    content: "Hello hosted workspace",
    from: "you",
  });
  assert.equal(posted.status, 200);
  assert.equal(posted.body.content, "Hello hosted workspace");
  assert.equal(db.channel_messages.length, 1);

  const fetched = await invoke(["messages"], "GET", undefined, {
    query: { channel: "general", thread_id: posted.body.thread_id },
  });
  assert.equal(fetched.status, 200);
  assert.equal(fetched.body.messages.length, 1);
  assert.equal(fetched.body.messages[0].content, "Hello hosted workspace");
});

test("hosted commands expose hosted-safe slash command registry", async (t) => {
  const db = {
    memberships: [
      {
        role: "owner",
        status: "active",
        team_id: "team-1",
        user_id: "user-1",
      },
    ],
    teams: [{ id: "team-1", name: "Team One", slug: "team-one" }],
  };
  const oldFetch = global.fetch;
  t.after(() => {
    global.fetch = oldFetch;
  });
  global.fetch = hostedFetch(db);

  const response = await invoke(["commands"], "GET");
  assert.equal(response.status, 200);
  assert.ok(Array.isArray(response.body));
  assert.ok(response.body.length > 0);

  const names = response.body.map((command) => command.name).sort();
  assert.ok(names.includes("ask"));
  assert.ok(names.includes("growth"));
  assert.ok(names.includes("loops"));
  assert.ok(names.includes("approvals"));
  assert.ok(names.includes("receipts"));
  for (const hidden of [
    "deploy-simulation",
    "fix-bug",
    "focus",
    "collab",
    "cancel",
    "pause",
    "provider",
    "resume",
    "reset",
    "task",
    "tasks",
  ]) {
    assert.ok(!names.includes(hidden), `${hidden} must stay out of hosted autocomplete`);
  }
  const legacyCommandCopyPattern = new RegExp(
    "\\b(?:broker|localhost|local-first|" +
      ["laf", "runner"].join("-") +
      "|runner)\\b|local deployment\\/simulation",
    "i",
  );
  for (const command of response.body) {
    assert.equal(command.webSupported, true, command.name);
    assert.doesNotMatch(
      `${command.name} ${command.description}`,
      legacyCommandCopyPattern,
    );
  }
});

test("hosted slash command endpoint refuses unsupported workflows instead of faking success", async (t) => {
  const db = {
    memberships: [
      {
        role: "owner",
        status: "active",
        team_id: "team-1",
        user_id: "user-1",
      },
    ],
    teams: [{ id: "team-1", name: "Team One", slug: "team-one" }],
  };
  const oldFetch = global.fetch;
  t.after(() => {
    global.fetch = oldFetch;
  });
  global.fetch = hostedFetch(db);

  const unsupported = await invoke(["commands", "run"], "POST", {
    channel: "general",
    input: "/deploy-simulation --provider codex",
  });
  assert.equal(unsupported.status, 400);
  assert.equal(
    unsupported.body.error,
    "slash command is not available in the hosted workspace",
  );
  assert.equal(Object.hasOwn(unsupported.body, "message"), false);

  const browserHandled = await invoke(["commands", "run"], "POST", {
    channel: "general",
    input: "/growth",
  });
  assert.equal(browserHandled.status, 400);
  assert.equal(
    browserHandled.body.error,
    "slash command is handled directly in the web workspace",
  );
});

test("hosted onboarding falls back safely before workspace settings migration is applied", async (t) => {
  const db = {
    audit_events: [],
    memberships: [
      {
        role: "owner",
        status: "active",
        team_id: "team-1",
        user_id: "user-1",
      },
    ],
    projects: [],
    startup_office_loops: [],
    startup_office_receipts: [],
    tasks: [],
    teams: [{ id: "team-1", name: "Team One", slug: "team-one" }],
  };
  const oldFetch = global.fetch;
  const fallbackFetch = hostedFetch(db);
  t.after(() => {
    global.fetch = oldFetch;
  });
  global.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.pathname === "/rest/v1/workspace_settings") {
      return jsonResponse(
        { message: "Could not find the table public.workspace_settings" },
        404,
      );
    }
    return fallbackFetch(input, init);
  };

  const initialState = await invoke(["onboarding", "state"], "GET");
  assert.equal(initialState.status, 200);
  assert.equal(initialState.body.onboarded, false);

  const completed = await invoke(["onboarding", "complete"], "POST", {
    company: "Fallback Team",
    task: "Create first hosted task",
  });
  assert.equal(completed.status, 200, JSON.stringify(completed.body));
  assert.equal(db.projects.length, 0);
  assert.equal(db.tasks.length, 0);
  assert.equal(completed.body.onboarded, true);
  assert.equal(completed.body.project, undefined);
  assert.equal(completed.body.task, undefined);

  const finalState = await invoke(["onboarding", "state"], "GET");
  assert.equal(finalState.status, 200);
  assert.equal(finalState.body.onboarded, true);
});

test("hosted task creation normalizes legacy workspace Bridge mode onto LAF Bridge", async (t) => {
  const db = {
    audit_events: [],
    bridge_devices: [
      {
        capabilities: {
          cli_details: { codex: { detected: true } },
          provider_runtimes: ["codex"],
        },
        id: "bridge-1",
        status: "online",
        team_id: "team-1",
        user_id: "user-1",
      },
    ],
    delivery_receipts: [],
    memberships: [
      {
        role: "owner",
        status: "active",
        team_id: "team-1",
        user_id: "user-1",
      },
    ],
    projects: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        local_id: "project-a",
        name: "Project A",
        team_id: "team-1",
      },
    ],
    tasks: [],
    workspace_billing: [],
  };
  const oldFetch = global.fetch;
  t.after(() => {
    global.fetch = oldFetch;
  });
  global.fetch = hostedFetch(db);

  const response = await invoke(["tasks"], "POST", {
    action: "create",
    model_mode: "team_bridge",
    owner: "be",
    project_id: "project-a",
    title: "Implement hosted bridge flow",
  });

  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal(response.body.task.model_mode, "my_bridge");
  assert.deepEqual(Object.keys(response.body).sort(), ["task"]);
});

test("hosted task API owns managed checkout mode and never returns local paths", async (t) => {
  const db = {
    audit_events: [],
    delivery_receipts: [],
    memberships: [
      {
        role: "owner",
        status: "active",
        team_id: "team-1",
        user_id: "user-1",
      },
    ],
    projects: [
      {
        github_repo_url: "https://github.com/LAF-labs/demo",
        id: "project-1",
        local_id: "project-a",
        name: "Project A",
        team_id: "team-1",
      },
      {
        id: "project-2",
        local_id: "project-b",
        name: "Project B",
        team_id: "team-1",
      },
    ],
    tasks: [],
    workspace_billing: [],
  };
  const oldFetch = global.fetch;
  t.after(() => {
    global.fetch = oldFetch;
  });
  global.fetch = hostedFetch(db);

  const created = await invoke(["tasks"], "POST", {
    action: "create",
    execution_mode: "local_worktree",
    project_id: "project-a",
    title: "Implement hosted managed checkout",
  });

  assert.equal(created.status, 200, JSON.stringify(created.body));
  assert.equal(db.tasks[0].execution_mode, "managed_checkout");
  assert.equal(created.body.task.execution_mode, "managed_checkout");
  assert.equal(Object.hasOwn(created.body.task, "worktree_path"), false);

  db.tasks[0].worktree_path = "/Users/example/private/project-a";
  const listed = await invoke(["tasks"], "GET");
  assert.equal(listed.status, 200, JSON.stringify(listed.body));
  assert.equal(listed.body.tasks[0].execution_mode, "managed_checkout");
  assert.equal(Object.hasOwn(listed.body.tasks[0], "worktree_path"), false);

  const updated = await invoke(["tasks"], "POST", {
    action: "update",
    execution_mode: "office",
    id: created.body.task.id,
    title: "Updated title",
  });
  assert.equal(updated.status, 200, JSON.stringify(updated.body));
  assert.equal(db.tasks[0].execution_mode, "managed_checkout");
  assert.equal(updated.body.task.execution_mode, "managed_checkout");
  assert.equal(Object.hasOwn(updated.body.task, "worktree_path"), false);

  db.tasks[0].execution_mode = "unexpected_internal_mode";
  const sanitized = await invoke(["tasks"], "GET");
  assert.equal(sanitized.status, 200, JSON.stringify(sanitized.body));
  assert.equal(sanitized.body.tasks[0].execution_mode, "office");

  const browserRequestedManagedCheckout = await invoke(["tasks"], "POST", {
    action: "create",
    execution_mode: "managed_checkout",
    project_id: "project-b",
    title: "Browser tried to force managed checkout",
  });
  assert.equal(
    browserRequestedManagedCheckout.status,
    200,
    JSON.stringify(browserRequestedManagedCheckout.body),
  );
  assert.equal(db.tasks[1].execution_mode, "office");
  assert.equal(
    browserRequestedManagedCheckout.body.task.execution_mode,
    "office",
  );
});

test("hosted task mutations return task payloads without local execution job fields", async (t) => {
  const db = {
    audit_events: [],
    delivery_receipts: [],
    memberships: [
      {
        role: "owner",
        status: "active",
        team_id: "team-1",
        user_id: "user-1",
      },
    ],
    projects: [],
    tasks: [
      {
        id: "task-existing",
        local_id: "task-existing",
        model_mode: "my_bridge",
        owner: "",
        status: "open",
        team_id: "team-1",
        title: "Existing bridge task",
      },
    ],
    workspace_billing: [],
  };
  const oldFetch = global.fetch;
  t.after(() => {
    global.fetch = oldFetch;
  });
  global.fetch = hostedFetch(db);

  const created = await invoke(["tasks"], "POST", {
    action: "create",
    owner: "be",
    title: "Record only agent task",
  });

  assert.equal(created.status, 200, JSON.stringify(created.body));
  assert.equal(created.body.task.model_mode, "record_only");
  assert.deepEqual(Object.keys(created.body).sort(), ["task"]);

  const reassigned = await invoke(["tasks"], "POST", {
    action: "reassign",
    id: "task-existing",
    owner: "be",
  });

  assert.equal(reassigned.status, 200);
  assert.equal(reassigned.body.task.model_mode, "my_bridge");
  assert.deepEqual(Object.keys(reassigned.body).sort(), ["task"]);
});

test("hosted project rejects unsafe repo URLs", async (t) => {
  const oldFetch = global.fetch;
  t.after(() => {
    global.fetch = oldFetch;
  });
  global.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.pathname === "/auth/v1/user") {
      return jsonResponse({
        id: "user-1",
        email: "owner@example.com",
        user_metadata: { name: "Owner" },
      });
    }
    if (url.pathname === "/realtime/v1/api/broadcast") {
      if (Array.isArray(db.relay_broadcasts)) db.relay_broadcasts.push(body);
      if (db.failRelayBroadcast) {
        return jsonResponse({ error: "relay unavailable" }, 503);
      }
      return jsonResponse({ ok: true });
    }
    const table = url.pathname.replace("/rest/v1/", "");
    if (table === "memberships") {
      return jsonResponse([
        { role: "owner", status: "active", team_id: "team-1", user_id: "user-1" },
      ]);
    }
    if (table === "projects") {
      assert.notEqual(init.method, "POST", "unsafe repo URL should fail before insert");
      return jsonResponse([]);
    }
    return jsonResponse([]);
  };

  const response = await invoke(["projects"], "POST", {
    action: "create",
    github_repo_url: "file:///tmp/repo",
    name: "Unsafe Repo",
  });

  assert.equal(response.status, 400);
});

test("hosted auth login redacts upstream errors", async (t) => {
  const oldFetch = global.fetch;
  t.after(() => {
    global.fetch = oldFetch;
  });
  global.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname === "/auth/v1/token") {
      return jsonResponse(
        {
          code: 400,
          error_code: "invalid_credentials",
          msg: "Invalid login credentials",
        },
        400,
      );
    }
    return jsonResponse([]);
  };

  const response = await invoke(
    ["auth", "login"],
    "POST",
    { email: "nobody@example.com", password: "wrongpassword" },
    { headers: { authorization: "" } },
  );

  assert.equal(response.status, 400);
  assert.equal(response.body.error, "invalid request");
});

test("hosted auth signup redacts upstream errors", async (t) => {
  const oldFetch = global.fetch;
  t.after(() => {
    global.fetch = oldFetch;
  });
  global.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname === "/auth/v1/admin/users") {
      return jsonResponse(
        {
          code: 400,
          error_code: "validation_failed",
          msg: "Unable to validate email address: invalid format",
        },
        400,
      );
    }
    return jsonResponse([]);
  };

  const response = await invoke(
    ["auth", "signup"],
    "POST",
    {
      email: "not-an-email",
      name: "Test User",
      password: "fake-password-for-test",
      team_action: "create",
      team_name: "Test Team",
    },
    { headers: { authorization: "" } },
  );

  assert.equal(response.status, 400);
  assert.equal(response.body.error, "invalid request");
});

test("hosted auth signup creates confirmed user session and team membership", async (t) => {
  const oldFetch = global.fetch;
  const db = {
    teams: [],
    memberships: [],
  };
  t.after(() => {
    global.fetch = oldFetch;
  });
  let createdUser = null;
  global.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    const body = init.body ? JSON.parse(init.body) : null;
    if (url.pathname === "/auth/v1/admin/users") {
      createdUser = {
        id: "user-confirmed",
        email: body.email,
        email_confirmed_at: "2026-05-18T00:00:00Z",
        created_at: "2026-05-18T00:00:00Z",
        updated_at: "2026-05-18T00:00:00Z",
        identities: [{ provider: "email", user_id: "user-confirmed" }],
        user_metadata: body.user_metadata,
      };
      return jsonResponse(createdUser);
    }
    if (url.pathname === "/auth/v1/token") {
      return jsonResponse({
        access_token: "signup-access-token",
        expires_in: 3600,
        refresh_token: "signup-refresh-token",
        token_type: "bearer",
        user: createdUser,
      });
    }
    const table = url.pathname.replace("/rest/v1/", "");
    const method = init.method || "GET";
    if (method === "GET") {
      return jsonResponse(filterRows(db[table] || [], url.searchParams));
    }
    if (method === "POST") {
      const row = {
        id: `${table}-${db[table].length + 1}`,
        ...body,
      };
      db[table].push(row);
      return jsonResponse([row]);
    }
    return jsonResponse([]);
  };

  const response = await invoke(
    ["auth", "signup"],
    "POST",
    {
      email: "owner@example.com",
      name: "Owner",
      password: "fake-password-for-test",
      team_action: "create",
      team_name: "Owner Team",
    },
    { headers: { authorization: "" } },
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.authenticated, true);
  assert.equal(response.body.email_confirmation_required, false);
  assert.equal(response.body.user.id, "user-confirmed");
  assert.equal(db.teams.length, 1);
  assert.equal(db.teams[0].created_by, "user-confirmed");
  assert.equal(db.teams[0].slug, "owner-team");
  assert.equal(db.memberships.length, 1);
  assert.equal(db.memberships[0].user_id, "user-confirmed");
  assert.equal(db.memberships[0].team_id, db.teams[0].id);
  assert.equal(db.memberships[0].role, "owner");
  assert.equal(db.memberships[0].status, "active");
});

test("hosted auth signup rejects duplicate admin user before tenant writes", async (t) => {
  const oldFetch = global.fetch;
  const db = {
    teams: [],
    memberships: [],
  };
  t.after(() => {
    global.fetch = oldFetch;
  });
  global.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.pathname === "/auth/v1/admin/users") {
      return jsonResponse({ msg: "User already registered" }, 422);
    }
    const table = url.pathname.replace("/rest/v1/", "");
    return jsonResponse(filterRows(db[table] || [], url.searchParams));
  };

  const response = await invoke(
    ["auth", "signup"],
    "POST",
    {
      email: "owner@example.com",
      name: "Owner",
      password: "fake-password-for-test",
      team_action: "create",
      team_name: "Owner Team",
    },
    { headers: { authorization: "" } },
  );

  assert.equal(response.status, 409);
  assert.equal(response.body.error, "account already exists");
  assert.equal(db.teams.length, 0);
  assert.equal(db.memberships.length, 0);
});

test("hosted auth rejects malformed JSON as a bad request", async () => {
  const response = await invoke(
    ["auth", "login"],
    "POST",
    "{not-json",
    { headers: { authorization: "" } },
  );

  assert.equal(response.status, 400);
  assert.equal(response.body.error, "invalid json body");
});

test("hosted API allows trusted browser origins with credentialed preflight", async () => {
  const response = await invoke(["bridge", "pairing", "start"], "OPTIONS", undefined, {
    headers: {
      authorization: "",
      origin: "https://app.laf.test",
    },
  });

  assert.equal(response.status, 204);
  assert.equal(response.headers["access-control-allow-origin"], "https://app.laf.test");
  assert.equal(response.headers["access-control-allow-credentials"], "true");
  assert.match(response.headers["access-control-allow-methods"], /\bPOST\b/);
  assert.match(response.headers["access-control-allow-headers"], /\bContent-Type\b/);
  assert.equal(response.headers.vary, "Origin");

  const trailingSlashConfigured = await invoke(
    ["bridge", "pairing", "start"],
    "OPTIONS",
    undefined,
    {
      headers: {
        authorization: "",
        origin: "https://preview.laf.test",
      },
    },
  );
  assert.equal(trailingSlashConfigured.status, 204);
  assert.equal(
    trailingSlashConfigured.headers["access-control-allow-origin"],
    "https://preview.laf.test",
  );
});

test("hosted API omits CORS credentials for untrusted browser origins", async () => {
  const response = await invoke(["bridge", "pairing", "start"], "OPTIONS", undefined, {
    headers: {
      authorization: "",
      origin: "https://evil.test",
    },
  });

  assert.equal(response.status, 204);
  assert.equal(response.headers["access-control-allow-origin"], undefined);
  assert.equal(response.headers["access-control-allow-credentials"], undefined);
});

test("hosted auth login sets secure cookies after membership check and restores session", async (t) => {
  const oldFetch = global.fetch;
  const oldNodeEnv = process.env.NODE_ENV;
  const db = {
    memberships: [
      {
        role: "owner",
        status: "active",
        team_id: "team-1",
        user_id: "user-1",
      },
    ],
    teams: [{ id: "team-1", name: "Team One", slug: "team-one" }],
  };
  const fallbackFetch = hostedFetch(db);
  t.after(() => {
    global.fetch = oldFetch;
    if (oldNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = oldNodeEnv;
  });
  process.env.NODE_ENV = "production";
  global.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    const body = init.body ? JSON.parse(init.body) : null;
    if (url.pathname === "/auth/v1/token") {
      assert.equal(body.email, "owner@example.com");
      return jsonResponse({
        access_token: "login-access-token",
        expires_in: 3600,
        refresh_token: "login-refresh-token",
        token_type: "bearer",
        user: {
          id: "user-1",
          email: "owner@example.com",
          user_metadata: { name: "Owner" },
        },
      });
    }
    if (url.pathname === "/auth/v1/user") {
      assert.equal(init.headers.Authorization, "Bearer login-access-token");
    }
    return fallbackFetch(input, init);
  };

  const login = await invoke(
    ["auth", "login"],
    "POST",
    { email: "owner@example.com", password: "correct-password" },
    { headers: { authorization: "" } },
  );

  assert.equal(login.status, 200, JSON.stringify(login.body));
  assert.equal(login.body.user.id, "user-1");
  assert.equal(Array.isArray(login.headers["set-cookie"]), true);
  assert.match(login.headers["set-cookie"][0], /^laf_access=login-access-token;/);
  assert.match(login.headers["set-cookie"][0], /HttpOnly/);
  assert.match(login.headers["set-cookie"][0], /SameSite=Lax/);
  assert.match(login.headers["set-cookie"][0], /Secure/);
  assert.match(login.headers["set-cookie"][1], /^laf_refresh=login-refresh-token;/);

  const session = await invoke(["auth", "session"], "GET", undefined, {
    headers: {
      authorization: "",
      cookie: "laf_access=login-access-token",
    },
  });
  assert.equal(session.status, 200);
  assert.equal(session.body.authenticated, true);
  assert.equal(session.body.user.email, "owner@example.com");
});

test("hosted auth cookies use SameSite=None for trusted split-origin browsers", async (t) => {
  const oldFetch = global.fetch;
  const oldNodeEnv = process.env.NODE_ENV;
  const db = {
    memberships: [
      {
        role: "owner",
        status: "active",
        team_id: "team-1",
        user_id: "user-1",
      },
    ],
    teams: [{ id: "team-1", name: "Team One", slug: "team-one" }],
  };
  const fallbackFetch = hostedFetch(db);
  t.after(() => {
    global.fetch = oldFetch;
    if (oldNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = oldNodeEnv;
  });
  process.env.NODE_ENV = "production";
  global.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.pathname === "/auth/v1/token") {
      return jsonResponse({
        access_token: "cross-origin-access-token",
        expires_in: 3600,
        refresh_token: "cross-origin-refresh-token",
        token_type: "bearer",
        user: {
          id: "user-1",
          email: "owner@example.com",
          user_metadata: { name: "Owner" },
        },
      });
    }
    return fallbackFetch(input, init);
  };

  const login = await invoke(
    ["auth", "login"],
    "POST",
    { email: "owner@example.com", password: "correct-password" },
    {
      headers: {
        authorization: "",
        origin: "https://app.laf.test",
      },
    },
  );

  assert.equal(login.status, 200, JSON.stringify(login.body));
  assert.equal(login.headers["access-control-allow-origin"], "https://app.laf.test");
  assert.match(login.headers["set-cookie"][0], /^laf_access=cross-origin-access-token;/);
  assert.match(login.headers["set-cookie"][0], /SameSite=None/);
  assert.match(login.headers["set-cookie"][0], /Secure/);
  assert.doesNotMatch(login.headers["set-cookie"][0], /SameSite=Lax/);
  assert.match(login.headers["set-cookie"][1], /^laf_refresh=cross-origin-refresh-token;/);
  assert.match(login.headers["set-cookie"][1], /SameSite=None/);

  const logout = await invoke(["auth", "logout"], "POST", undefined, {
    headers: {
      authorization: "",
      origin: "https://app.laf.test",
    },
  });
  assert.equal(logout.status, 200);
  assert.match(logout.headers["set-cookie"][0], /SameSite=None/);
  assert.match(logout.headers["set-cookie"][0], /Max-Age=0/);
});

test("hosted auth login does not set cookies when membership is missing", async (t) => {
  const oldFetch = global.fetch;
  t.after(() => {
    global.fetch = oldFetch;
  });
  global.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.pathname === "/auth/v1/token") {
      return jsonResponse({
        access_token: "orphan-access-token",
        expires_in: 3600,
        refresh_token: "orphan-refresh-token",
        token_type: "bearer",
        user: {
          id: "orphan-user",
          email: "orphan@example.com",
          user_metadata: { name: "Orphan" },
        },
      });
    }
    return jsonResponse([]);
  };

  const response = await invoke(
    ["auth", "login"],
    "POST",
    { email: "orphan@example.com", password: "correct-password" },
    { headers: { authorization: "" } },
  );

  assert.equal(response.status, 403);
  assert.equal(response.body.error, "active team membership required");
  assert.equal(response.headers["set-cookie"], undefined);
});

test("legacy local execution API routes are no longer product surface", async (t) => {
  const db = {
    memberships: [
      {
        role: "owner",
        status: "active",
        team_id: "team-1",
        user_id: "user-1",
      },
    ],
    teams: [{ id: "team-1", name: "Team One", slug: "team-one" }],
  };
  const oldFetch = global.fetch;
  t.after(() => {
    global.fetch = oldFetch;
  });
  global.fetch = hostedFetch(db);

  for (const path of [
    ["runner", "status"],
    ["runner", "pairing", "start"],
    ["runner", "register"],
    ["runner", "jobs", "lease"],
  ]) {
    const response = await invoke(path, path.at(-1) === "status" ? "GET" : "POST", {});
    assert.equal(response.status, 404);
  }
});

test("production Bridge pairing command uses canonical hosted API URL", async (t) => {
  const oldFetch = global.fetch;
  const oldNodeEnv = process.env.NODE_ENV;
  const oldPublicAPIBase = process.env.LAF_OFFICE_PUBLIC_API_BASE_URL;
  const oldPublicHost = process.env.LAF_OFFICE_PUBLIC_HOST;
  const oldVercelURL = process.env.VERCEL_URL;
  const oldViteAPIBase = process.env.VITE_LAF_API_BASE_URL;
  const db = {
    bridge_pairing_codes: [],
    memberships: [
      {
        role: "owner",
        status: "active",
        team_id: "team-1",
        user_id: "user-1",
      },
    ],
    teams: [{ id: "team-1", name: "Team One", slug: "team-one" }],
  };
  t.after(() => {
    global.fetch = oldFetch;
    restoreEnv("NODE_ENV", oldNodeEnv);
    restoreEnv("LAF_OFFICE_PUBLIC_API_BASE_URL", oldPublicAPIBase);
    restoreEnv("LAF_OFFICE_PUBLIC_HOST", oldPublicHost);
    restoreEnv("VERCEL_URL", oldVercelURL);
    restoreEnv("VITE_LAF_API_BASE_URL", oldViteAPIBase);
  });
  global.fetch = hostedFetch(db);
  process.env.NODE_ENV = "production";
  delete process.env.LAF_OFFICE_PUBLIC_API_BASE_URL;
  delete process.env.VITE_LAF_API_BASE_URL;
  process.env.LAF_OFFICE_PUBLIC_HOST = "https://office.example.com";
  process.env.VERCEL_URL = "preview-host-ignored.vercel.app";

  const canonical = await invoke(["bridge", "pairing", "start"], "POST", {
    api_url: "https://attacker.example/api",
  });
  assert.equal(canonical.status, 200, JSON.stringify(canonical.body));
  assert.equal(canonical.body.api_url, "https://office.example.com/api");
  assert.deepEqual(Object.keys(canonical.body.commands).sort(), ["pair"]);
  assert.equal(canonical.body.commands.pair, "npx laf-bridge pair");
  assert.doesNotMatch(canonical.body.commands.pair, /--api-url|--code/);
  assert.doesNotMatch(canonical.body.commands.pair, /attacker\.example/);
  assert.equal(canonical.body.commands.setup, undefined);
  assert.equal(Object.hasOwn(canonical.body.pairing, "code"), false);
  const canonicalSetup = decodeBridgeSetupCode(canonical.body.pairing.setup_code);
  assert.equal(canonicalSetup.api_url, "https://office.example.com/api");
  assert.equal(canonicalSetup.code, pairingClaimCode(canonical));

  delete process.env.LAF_OFFICE_PUBLIC_HOST;
  process.env.VERCEL_URL = "preview-only.vercel.app";
  const vercelFallback = await invoke(["bridge", "pairing", "start"], "POST", {
    api_url: "https://attacker.example/api",
  });
  assert.equal(vercelFallback.status, 200, JSON.stringify(vercelFallback.body));
  assert.equal(vercelFallback.body.api_url, "https://preview-only.vercel.app/api");
  const vercelSetup = decodeBridgeSetupCode(vercelFallback.body.pairing.setup_code);
  assert.equal(vercelSetup.api_url, "https://preview-only.vercel.app/api");

  process.env.LAF_OFFICE_PUBLIC_HOST = "https://office.example.com";
  process.env.VERCEL_URL = "preview-host-ignored.vercel.app";
  process.env.LAF_OFFICE_PUBLIC_API_BASE_URL = "https://api.example.com/api/";
  const splitOrigin = await invoke(["bridge", "pairing", "start"], "POST", {
    api_url: "https://attacker.example/api",
  });
  assert.equal(splitOrigin.status, 200, JSON.stringify(splitOrigin.body));
  assert.equal(splitOrigin.body.api_url, "https://api.example.com/api");
  assert.equal(splitOrigin.body.commands.pair, "npx laf-bridge pair");
  assert.doesNotMatch(splitOrigin.body.commands.pair, /attacker\.example/);
  const splitSetup = decodeBridgeSetupCode(splitOrigin.body.pairing.setup_code);
  assert.equal(splitSetup.api_url, "https://api.example.com/api");

  process.env.LAF_OFFICE_PUBLIC_API_BASE_URL = "api-bare.example.com";
  const bareAPIHost = await invoke(["bridge", "pairing", "start"], "POST", {
    api_url: "https://attacker.example/api",
  });
  assert.equal(bareAPIHost.status, 200, JSON.stringify(bareAPIHost.body));
  assert.equal(bareAPIHost.body.api_url, "https://api-bare.example.com/api");

  delete process.env.LAF_OFFICE_PUBLIC_API_BASE_URL;
  process.env.VITE_LAF_API_BASE_URL = "https://api-vite.example.com/api/";
  const viteFallback = await invoke(["bridge", "pairing", "start"], "POST", {
    api_url: "https://attacker.example/api",
  });
  assert.equal(viteFallback.status, 200, JSON.stringify(viteFallback.body));
  assert.equal(viteFallback.body.api_url, "https://api-vite.example.com/api");

  delete process.env.VITE_LAF_API_BASE_URL;
  process.env.LAF_OFFICE_PUBLIC_API_BASE_URL = "https://127.0.0.1:3000/api";
  const beforePrivateAPIBase = db.bridge_pairing_codes.length;
  const privateAPIBase = await invoke(["bridge", "pairing", "start"], "POST", {
    api_url: "https://attacker.example/api",
  });
  assert.equal(privateAPIBase.status, 503);
  assert.equal(
    privateAPIBase.body.error,
    "LAF_OFFICE_PUBLIC_API_BASE_URL must not point at localhost or a private network address",
  );
  assert.equal(db.bridge_pairing_codes.length, beforePrivateAPIBase);

  delete process.env.LAF_OFFICE_PUBLIC_API_BASE_URL;
  process.env.LAF_OFFICE_PUBLIC_API_BASE_URL = "http://api.example.com/api";
  const beforeInsecureAPIBase = db.bridge_pairing_codes.length;
  const insecureAPIBase = await invoke(["bridge", "pairing", "start"], "POST", {
    api_url: "https://attacker.example/api",
  });
  assert.equal(insecureAPIBase.status, 503);
  assert.equal(
    insecureAPIBase.body.error,
    "LAF_OFFICE_PUBLIC_API_BASE_URL must use https",
  );
  assert.equal(db.bridge_pairing_codes.length, beforeInsecureAPIBase);

  delete process.env.LAF_OFFICE_PUBLIC_API_BASE_URL;
  process.env.LAF_OFFICE_PUBLIC_HOST = "http://office.example.com";
  process.env.VERCEL_URL = "preview-host-ignored.vercel.app";
  const beforeInsecureHost = db.bridge_pairing_codes.length;
  const insecureHost = await invoke(["bridge", "pairing", "start"], "POST", {
    api_url: "https://attacker.example/api",
  });
  assert.equal(insecureHost.status, 503);
  assert.equal(insecureHost.body.error, "LAF_OFFICE_PUBLIC_HOST must use https");
  assert.equal(db.bridge_pairing_codes.length, beforeInsecureHost);

  process.env.LAF_OFFICE_PUBLIC_HOST = "https://office.example.com/api";
  process.env.VERCEL_URL = "preview-host-ignored.vercel.app";
  const beforeBadHost = db.bridge_pairing_codes.length;
  const badHost = await invoke(["bridge", "pairing", "start"], "POST", {
    api_url: "https://attacker.example/api",
  });
  assert.equal(badHost.status, 503);
  assert.equal(badHost.body.error, "LAF_OFFICE_PUBLIC_HOST must be an origin without a path");
  assert.equal(db.bridge_pairing_codes.length, beforeBadHost);

  process.env.LAF_OFFICE_PUBLIC_HOST = "https://127.0.0.1:3000";
  process.env.VERCEL_URL = "preview-host-ignored.vercel.app";
  const beforePrivateHost = db.bridge_pairing_codes.length;
  const privateHost = await invoke(["bridge", "pairing", "start"], "POST", {
    api_url: "https://attacker.example/api",
  });
  assert.equal(privateHost.status, 503);
  assert.equal(
    privateHost.body.error,
    "LAF_OFFICE_PUBLIC_HOST must not point at localhost or a private network address",
  );
  assert.equal(db.bridge_pairing_codes.length, beforePrivateHost);

  delete process.env.LAF_OFFICE_PUBLIC_HOST;
  delete process.env.VERCEL_URL;
  const beforeMissingHost = db.bridge_pairing_codes.length;
  const missingHost = await invoke(["bridge", "pairing", "start"], "POST", {
    api_url: "https://attacker.example/api",
  });
  assert.equal(missingHost.status, 503);
  assert.equal(missingHost.body.error, "canonical hosted API URL is not configured");
  assert.equal(db.bridge_pairing_codes.length, beforeMissingHost);
});

test("development Bridge pairing allows localhost API rehearsal URLs", async (t) => {
  const oldFetch = global.fetch;
  const oldNodeEnv = process.env.NODE_ENV;
  const oldPublicAPIBase = process.env.LAF_OFFICE_PUBLIC_API_BASE_URL;
  const oldPublicHost = process.env.LAF_OFFICE_PUBLIC_HOST;
  const oldVercelURL = process.env.VERCEL_URL;
  const oldViteAPIBase = process.env.VITE_LAF_API_BASE_URL;
  const db = {
    bridge_pairing_codes: [],
    memberships: [
      {
        role: "owner",
        status: "active",
        team_id: "team-1",
        user_id: "user-1",
      },
    ],
    teams: [{ id: "team-1", name: "Team One", slug: "team-one" }],
  };
  t.after(() => {
    global.fetch = oldFetch;
    restoreEnv("NODE_ENV", oldNodeEnv);
    restoreEnv("LAF_OFFICE_PUBLIC_API_BASE_URL", oldPublicAPIBase);
    restoreEnv("LAF_OFFICE_PUBLIC_HOST", oldPublicHost);
    restoreEnv("VERCEL_URL", oldVercelURL);
    restoreEnv("VITE_LAF_API_BASE_URL", oldViteAPIBase);
  });
  global.fetch = hostedFetch(db);
  process.env.NODE_ENV = "development";
  process.env.LAF_OFFICE_PUBLIC_HOST = "http://localhost:5173";
  process.env.LAF_OFFICE_PUBLIC_API_BASE_URL = "http://127.0.0.1:3000/api/";
  delete process.env.VERCEL_URL;
  delete process.env.VITE_LAF_API_BASE_URL;

  const publicAPIBase = await invoke(["bridge", "pairing", "start"], "POST", {});
  assert.equal(publicAPIBase.status, 200, JSON.stringify(publicAPIBase.body));
  assert.equal(publicAPIBase.body.api_url, "http://127.0.0.1:3000/api");
  assert.equal(
    decodeBridgeSetupCode(publicAPIBase.body.pairing.setup_code).api_url,
    "http://127.0.0.1:3000/api",
  );
  assert.equal(publicAPIBase.body.commands.pair, "npx laf-bridge pair");

  delete process.env.LAF_OFFICE_PUBLIC_API_BASE_URL;
  process.env.VITE_LAF_API_BASE_URL = "http://localhost:8787/api/";
  const viteAPIBase = await invoke(["bridge", "pairing", "start"], "POST", {});
  assert.equal(viteAPIBase.status, 200, JSON.stringify(viteAPIBase.body));
  assert.equal(viteAPIBase.body.api_url, "http://localhost:8787/api");

  delete process.env.VITE_LAF_API_BASE_URL;
  process.env.LAF_OFFICE_PUBLIC_HOST = "http://127.0.0.1:3000";
  const publicHost = await invoke(["bridge", "pairing", "start"], "POST", {});
  assert.equal(publicHost.status, 200, JSON.stringify(publicHost.body));
  assert.equal(publicHost.body.api_url, "http://127.0.0.1:3000/api");

  process.env.LAF_OFFICE_PUBLIC_API_BASE_URL = "http://127.0.0.1:3000/api";
  const requestedDevURL = await invoke(["bridge", "pairing", "start"], "POST", {
    api_url: "http://localhost:9999/api",
  });
  assert.equal(requestedDevURL.status, 200, JSON.stringify(requestedDevURL.body));
  assert.equal(requestedDevURL.body.api_url, "http://localhost:9999/api");
});

test("production Bridge pairing requires configured execution plan signing keys", async (t) => {
  const oldFetch = global.fetch;
  const oldNodeEnv = process.env.NODE_ENV;
  const oldPrivateKey = process.env.LAF_EXECUTION_PLAN_SIGNING_PRIVATE_KEY;
  const oldPublicKey = process.env.LAF_EXECUTION_PLAN_SIGNING_PUBLIC_KEY;
  const oldKeyID = process.env.LAF_EXECUTION_PLAN_SIGNING_KEY_ID;
  const oldPublicHost = process.env.LAF_OFFICE_PUBLIC_HOST;
  const db = {
    audit_events: [],
    bridge_devices: [],
    bridge_pairing_codes: [],
    memberships: [
      {
        role: "owner",
        status: "active",
        team_id: "team-1",
        user_id: "user-1",
      },
    ],
    teams: [{ id: "team-1", name: "Team One", slug: "team-one" }],
    workspace_billing: [],
  };
  t.after(() => {
    global.fetch = oldFetch;
    restoreEnv("NODE_ENV", oldNodeEnv);
    restoreEnv("LAF_EXECUTION_PLAN_SIGNING_PRIVATE_KEY", oldPrivateKey);
    restoreEnv("LAF_EXECUTION_PLAN_SIGNING_PUBLIC_KEY", oldPublicKey);
    restoreEnv("LAF_EXECUTION_PLAN_SIGNING_KEY_ID", oldKeyID);
    restoreEnv("LAF_OFFICE_PUBLIC_HOST", oldPublicHost);
  });
  global.fetch = hostedFetch(db);
  process.env.NODE_ENV = "production";
  process.env.LAF_OFFICE_PUBLIC_HOST = "https://office.test";
  delete process.env.LAF_EXECUTION_PLAN_SIGNING_PRIVATE_KEY;
  delete process.env.LAF_EXECUTION_PLAN_SIGNING_PUBLIC_KEY;
  delete process.env.LAF_EXECUTION_PLAN_SIGNING_KEY_ID;

  const start = await invoke(["bridge", "pairing", "start"], "POST", {
    api_url: "https://office.test/api",
  });
  assert.equal(start.status, 200, JSON.stringify(start.body));
  const missingKeys = await invoke(
    ["bridge", "pairing", "claim"],
    "POST",
    {
      capabilities: { cli_details: { codex: { detected: true } }, provider_runtimes: ["codex"] },
      code: pairingClaimCode(start),
      device_label: "Production Bridge",
      platform: "darwin",
      public_key: testBridgePublicKey(),
    },
    { headers: { authorization: "" } },
  );
  assert.equal(missingKeys.status, 503);
  assert.equal(missingKeys.body.error, "execution plan signing keys are not configured");
  assert.equal(db.bridge_devices.length, 0);
  assert.equal(db.bridge_pairing_codes[0].status, "pending");

  const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
  process.env.LAF_EXECUTION_PLAN_SIGNING_PRIVATE_KEY = privateKey.export({
    format: "pem",
    type: "pkcs8",
  });
  process.env.LAF_EXECUTION_PLAN_SIGNING_PUBLIC_KEY = publicKey.export({
    format: "pem",
    type: "spki",
  });
  delete process.env.LAF_EXECUTION_PLAN_SIGNING_KEY_ID;

  const missingKeyID = await invoke(
    ["bridge", "pairing", "claim"],
    "POST",
    {
      capabilities: { cli_details: { codex: { detected: true } }, provider_runtimes: ["codex"] },
      code: pairingClaimCode(start),
      device_label: "Production Bridge",
      platform: "darwin",
      public_key: testBridgePublicKey(),
    },
    { headers: { authorization: "" } },
  );
  assert.equal(missingKeyID.status, 503);
  assert.equal(missingKeyID.body.error, "execution plan signing key id is not configured");
  assert.equal(db.bridge_devices.length, 0);
  assert.equal(db.bridge_pairing_codes[0].status, "pending");

  process.env.LAF_EXECUTION_PLAN_SIGNING_KEY_ID = "execution-plan-prod-test";

  const claim = await invoke(
    ["bridge", "pairing", "claim"],
    "POST",
    {
      capabilities: { cli_details: { codex: { detected: true } }, provider_runtimes: ["codex"] },
      code: pairingClaimCode(start),
      device_label: "Production Bridge",
      platform: "darwin",
      public_key: testBridgePublicKey(),
    },
    { headers: { authorization: "" } },
  );
  assert.equal(claim.status, 200, JSON.stringify(claim.body));
  assert.equal(claim.body.plan_signing_key_id, "execution-plan-prod-test");
  assert.equal(claim.body.plan_signing_public_key, process.env.LAF_EXECUTION_PLAN_SIGNING_PUBLIC_KEY);
});

test("hosted bridge pairing rejects invalid Bridge public keys before claiming code", async (t) => {
  const db = {
    bridge_devices: [],
    bridge_pairing_codes: [],
    memberships: [
      {
        role: "owner",
        status: "active",
        team_id: "team-1",
        user_id: "user-1",
      },
    ],
    teams: [{ id: "team-1", name: "Team One", slug: "team-one" }],
  };
  const oldFetch = global.fetch;
  t.after(() => {
    global.fetch = oldFetch;
  });
  global.fetch = hostedFetch(db);

  const start = await invoke(["bridge", "pairing", "start"], "POST", {
    api_url: "https://office.test/api",
  });
  assert.equal(start.status, 200, JSON.stringify(start.body));
  const invalid = await invoke(
    ["bridge", "pairing", "claim"],
    "POST",
    {
      capabilities: { cli_details: { codex: { detected: true } }, provider_runtimes: ["codex"] },
      code: pairingClaimCode(start),
      device_label: "Invalid Key Bridge",
      platform: "darwin",
      public_key: "not-an-ed25519-public-key",
    },
    { headers: { authorization: "" } },
  );
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.error, "public_key must be an Ed25519 public key");
  assert.equal(db.bridge_devices.length, 0);
  assert.equal(db.bridge_pairing_codes[0].status, "pending");
});

test("hosted bridge pairs, heartbeats, lists, and revokes own devices", async (t) => {
  const db = {
    audit_events: [],
    bridge_devices: [],
    bridge_pairing_codes: [],
    memberships: [
      {
        role: "owner",
        status: "active",
        team_id: "team-1",
        user_id: "user-1",
      },
    ],
    teams: [{ id: "team-1", name: "Team One", slug: "team-one" }],
    workspace_billing: [],
  };
  const oldFetch = global.fetch;
  t.after(() => {
    global.fetch = oldFetch;
  });
  global.fetch = hostedFetch(db);

  const start = await invoke(["bridge", "pairing", "start"], "POST", {
    api_url: "https://office.test/api",
  });
  assert.equal(start.status, 200);
  assert.match(pairingClaimCode(start), /^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);
  assert.deepEqual(Object.keys(start.body.commands).sort(), ["pair"]);
  assert.equal(start.body.commands.pair, "npx laf-bridge pair");
  assert.doesNotMatch(start.body.commands.pair, new RegExp(["laf", "runner"].join("-"), "i"));
  assert.doesNotMatch(start.body.commands.pair, /--api-url|--code/);
  assert.equal(start.body.commands.setup, undefined);
  assert.equal(start.body.commands.start, undefined);
  assert.equal(Object.hasOwn(start.body.pairing, "code"), false);
  const setup = decodeBridgeSetupCode(start.body.pairing.setup_code);
  assert.equal(setup.api_url, "https://office.test/api");
  assert.equal(setup.code, pairingClaimCode(start));
  assert.equal(db.bridge_pairing_codes[0].status, "pending");
  assert.equal(db.bridge_pairing_codes[0].code_hash.length, 64);

  const claim = await invoke(
    ["bridge", "pairing", "claim"],
    "POST",
    {
      capabilities: {
        cli_details: {
          claude: { detected: true, version: "claude 1.0.0" },
          opencode: { detected: true, version: "opencode 1.0.0" },
        },
        provider_runtimes: ["codex", "opencode", "claude"],
        workspace_root: "/Users/owner/secret-project",
      },
      code: pairingClaimCode(start),
      device_label: "Kim's MacBook",
      platform: "darwin",
      public_key: testBridgePublicKey(),
    },
    { headers: { authorization: "" } },
  );
  assert.equal(claim.status, 200);
  assert.match(claim.body.bridge_token, /^laf_bridge_/);
  assert.match(claim.body.plan_signing_public_key, /BEGIN PUBLIC KEY/);
  assert.equal(typeof claim.body.plan_signing_key_id, "string");
  assert.equal(claim.body.plan_signing_private_key, undefined);
  assert.equal(claim.body.device.device_label, "Kim's MacBook");
  assert.equal(claim.body.device.token_hash, undefined);
  assert.equal(db.bridge_devices[0].token_hash.length, 64);
  assert.equal(db.bridge_devices[0].capabilities.workspace_root, undefined);
  assert.deepEqual(db.bridge_devices[0].capabilities.provider_runtimes, [
    "codex",
    "claude-code",
  ]);
  assert.equal(db.bridge_devices[0].capabilities.cli_details.opencode, undefined);
  assert.equal(db.bridge_devices[0].capabilities.cli_details["claude-code"].detected, true);
  assert.equal(db.bridge_pairing_codes[0].claimed_device_id, db.bridge_devices[0].id);

  const bridgeTokenOnUserRoute = await invoke(
    ["bridge", "devices"],
    "GET",
    undefined,
    { headers: { authorization: `Bearer ${claim.body.bridge_token}` } },
  );
  assert.equal(bridgeTokenOnUserRoute.status, 401);
  assert.equal(bridgeTokenOnUserRoute.body.error, "user authentication required");

  const availability = await invoke(["model", "availability"], "GET");
  assert.equal(availability.status, 200);
  assert.equal(availability.body.my_bridge.available, true);
  assert.equal(availability.body.allowed_modes.includes("my_bridge"), true);

  const heartbeat = await invoke(
    ["bridge", "devices", db.bridge_devices[0].id, "heartbeat"],
    "POST",
    {
      capabilities: {
        cli_details: {
          codex: { detected: true },
          openclaw: { detected: true },
        },
        provider_runtimes: ["openclaw", "codex"],
        local_path: "/tmp/nope",
      },
      status: "online",
    },
    { headers: { authorization: `Bearer ${claim.body.bridge_token}` } },
  );
  assert.equal(heartbeat.status, 200);
  assert.equal(heartbeat.body.device.status, "online");
  assert.equal(db.bridge_devices[0].capabilities.local_path, undefined);
  assert.deepEqual(db.bridge_devices[0].capabilities.provider_runtimes, ["codex"]);
  assert.equal(db.bridge_devices[0].capabilities.cli_details.openclaw, undefined);

  const devices = await invoke(["bridge", "devices"], "GET");
  assert.equal(devices.status, 200);
  assert.equal(devices.body.devices.length, 1);
  assert.equal(devices.body.devices[0].token_hash, undefined);
  assert.deepEqual(devices.body.devices[0].capabilities.provider_runtimes, ["codex"]);
  assert.equal(devices.body.devices[0].capabilities.cli_details.openclaw, undefined);

  const revoke = await invoke(["bridge", "devices", db.bridge_devices[0].id, "revoke"], "POST", {});
  assert.equal(revoke.status, 200);
  assert.equal(revoke.body.device.status, "revoked");
  assert.equal(db.bridge_devices[0].revoked_by, "user-1");

  const rejectedHeartbeat = await invoke(
    ["bridge", "devices", db.bridge_devices[0].id, "heartbeat"],
    "POST",
    {},
    { headers: { authorization: `Bearer ${claim.body.bridge_token}` } },
  );
  assert.equal(rejectedHeartbeat.status, 401);

  const rejectedEventUpload = await invoke(
    ["execution", "plans", "plan-after-revoke", "events"],
    "POST",
    { event_type: "stdout", payload: { line: "late output" }, sequence: 1 },
    { headers: { authorization: `Bearer ${claim.body.bridge_token}` } },
  );
  assert.equal(rejectedEventUpload.status, 401);
});

test("hosted bridge pairing requires pair permission", async (t) => {
  const db = {
    bridge_pairing_codes: [],
    memberships: [
      {
        role: "viewer",
        status: "active",
        team_id: "team-1",
        user_id: "user-1",
      },
    ],
    teams: [{ id: "team-1", name: "Team One", slug: "team-one" }],
  };
  const oldFetch = global.fetch;
  t.after(() => {
    global.fetch = oldFetch;
  });
  global.fetch = hostedFetch(db);

  const response = await invoke(["bridge", "pairing", "start"], "POST", {});
  assert.equal(response.status, 403);
  assert.equal(response.body.error, "permission required: bridge:pair_own");
  assert.equal(db.bridge_pairing_codes.length, 0);
});

test("hosted home bridge chat persists messages and appends execution replies", async (t) => {
  const db = {
    audit_events: [],
    bridge_devices: [],
    bridge_pairing_codes: [],
    channel_messages: [],
    execution_events: [],
    execution_plans: [],
    execution_receipts: [],
    memberships: [
      {
        role: "owner",
        status: "active",
        team_id: "team-1",
        user_id: "user-1",
      },
    ],
    relay_broadcasts: [],
    teams: [{ id: "team-1", name: "Team One", slug: "team-one" }],
    workspace_billing: [],
  };
  const oldFetch = global.fetch;
  t.after(() => {
    global.fetch = oldFetch;
  });
  global.fetch = hostedFetch(db);

  const start = await invoke(["bridge", "pairing", "start"], "POST", {
    api_url: "https://office.test/api",
  });
  const claim = await invoke(
    ["bridge", "pairing", "claim"],
    "POST",
    {
      capabilities: {
        cli_details: { "claude-code": { detected: true } },
        provider_runtimes: ["claude-code"],
      },
      code: pairingClaimCode(start),
      device_label: "Owner Mac",
      public_key: testBridgePublicKey(),
    },
    { headers: { authorization: "" } },
  );
  assert.equal(claim.status, 200);

  const sent = await invoke(["messages"], "POST", {
    channel: "general",
    content: "지금 연결됐어?",
    from: "you",
    home_session_thread_id: "home:team-1:user-1:s-1",
    model_mode: "my_bridge",
    reply_to: "home:team-1:user-1:s-1",
    scope: "home_orchestration",
    tagged: ["ceo"],
  });
  assert.equal(sent.status, 200, JSON.stringify(sent.body));
  assert.equal(db.channel_messages.length, 1);
  assert.equal(db.channel_messages[0].content, "지금 연결됐어?");
  assert.equal(db.execution_plans.length, 1);
  assert.equal(Object.hasOwn(db.execution_plans[0], "binding_id"), false);
  assert.equal(db.execution_plans[0].project_id, null);
  assert.equal(db.execution_plans[0].provider, "claude_code");
  assert.equal(db.execution_plans[0].task_id, null);
  assert.equal(db.execution_plans[0].policy.source, "home_message");
  assert.equal(db.execution_plans[0].policy.home_session_thread_id, "home:team-1:user-1:s-1");

  const beforeComplete = await invoke(["messages"], "GET", undefined, {
    query: { channel: "general", thread_id: "home:team-1:user-1:s-1" },
  });
  assert.equal(beforeComplete.status, 200);
  assert.equal(beforeComplete.body.messages.length, 1);
  assert.equal(beforeComplete.body.messages[0].content, "지금 연결됐어?");

  const completed = await invoke(
    ["execution", "plans", db.execution_plans[0].id, "complete"],
    "POST",
    {
      provider_version: "codex-cli 1.2.3",
      status: "completed",
      summary: "네, LAF Bridge로 연결됐습니다.",
    },
    { headers: { authorization: `Bearer ${claim.body.bridge_token}` } },
  );
  assert.equal(completed.status, 200);
  assert.equal(db.execution_receipts.length, 1);
  assert.equal(db.channel_messages.length, 2);
  assert.equal(db.channel_messages[1].sender_slug, "ceo");
  assert.equal(db.channel_messages[1].run_id, db.execution_plans[0].id);
  assert.equal(db.channel_messages[1].content, "네, LAF Bridge로 연결됐습니다.");

  const afterComplete = await invoke(["messages"], "GET", undefined, {
    query: { channel: "general", thread_id: "home:team-1:user-1:s-1" },
  });
  assert.equal(afterComplete.status, 200);
  assert.equal(afterComplete.body.messages.length, 2);
  assert.equal(afterComplete.body.messages[1].from, "ceo");

  const sessions = await invoke(["home-sessions"], "GET", undefined, {
    query: { base_thread_id: "home:team-1:user-1" },
  });
  assert.equal(sessions.status, 200);
  assert.equal(sessions.body.sessions.length, 1);
  assert.equal(sessions.body.sessions[0].message_count, 2);

  const deleted = await invoke(["home-sessions"], "DELETE", undefined, {
    query: { thread_id: "home:team-1:user-1:s-1" },
  });
  assert.equal(deleted.status, 200);
  assert.equal(deleted.body.deleted, true);
  assert.ok(db.channel_messages.every((row) => row.deleted_at));
});

test("hosted home bridge chat requires a supported local CLI before creating a plan", async (t) => {
  const db = {
    bridge_devices: [
      {
        capabilities: {
          cli_details: { opencode: { detected: true } },
          provider_runtimes: ["opencode"],
        },
        id: "bridge-device-1",
        status: "online",
        team_id: "team-1",
        user_id: "user-1",
      },
    ],
    channel_messages: [],
    execution_plans: [],
    memberships: [
      {
        role: "owner",
        status: "active",
        team_id: "team-1",
        user_id: "user-1",
      },
    ],
    teams: [{ id: "team-1", name: "Team One", slug: "team-one" }],
  };
  const oldFetch = global.fetch;
  t.after(() => {
    global.fetch = oldFetch;
  });
  global.fetch = hostedFetch(db);

  const sent = await invoke(["messages"], "POST", {
    channel: "general",
    content: "Bridge로 확인해줘",
    from: "you",
    home_session_thread_id: "home:team-1:user-1:s-cli",
    model_mode: "my_bridge",
    reply_to: "home:team-1:user-1:s-cli",
    scope: "home_orchestration",
    tagged: ["ceo"],
  });
  assert.equal(sent.status, 200, JSON.stringify(sent.body));
  assert.equal(sent.body.execution_plan_id, "");
  assert.equal(db.execution_plans.length, 0);
  assert.equal(db.channel_messages.length, 2);
  assert.equal(db.channel_messages[1].sender_slug, "system");
  assert.match(
    db.channel_messages[1].content,
    /Codex\/Claude Code CLI를 감지하지 못했습니다/,
  );
  assert.doesNotMatch(db.channel_messages[1].content, /supported local CLI/);
});

test("hosted home bridge chat explains missing Bridge execution permission", async (t) => {
  const db = {
    bridge_devices: [
      {
        capabilities: {
          cli_details: { codex: { detected: true } },
          provider_runtimes: ["codex"],
        },
        id: "bridge-device-1",
        status: "online",
        team_id: "team-1",
        user_id: "user-1",
      },
    ],
    channel_messages: [],
    execution_plans: [],
    memberships: [
      {
        permissions: { deny: ["bridge:execute_own"] },
        role: "member",
        status: "active",
        team_id: "team-1",
        user_id: "user-1",
      },
    ],
    teams: [{ id: "team-1", name: "Team One", slug: "team-one" }],
  };
  const oldFetch = global.fetch;
  t.after(() => {
    global.fetch = oldFetch;
  });
  global.fetch = hostedFetch(db);

  const sent = await invoke(["messages"], "POST", {
    channel: "general",
    content: "Bridge로 실행해줘",
    from: "you",
    home_session_thread_id: "home:team-1:user-1:s-perm",
    model_mode: "my_bridge",
    reply_to: "home:team-1:user-1:s-perm",
    scope: "home_orchestration",
    tagged: ["ceo"],
  });
  assert.equal(sent.status, 200, JSON.stringify(sent.body));
  assert.equal(sent.body.execution_plan_id, "");
  assert.equal(db.execution_plans.length, 0);
  assert.equal(db.channel_messages.length, 2);
  assert.equal(db.channel_messages[1].sender_slug, "system");
  assert.match(db.channel_messages[1].content, /실행 권한이 없습니다/);
  assert.doesNotMatch(db.channel_messages[1].content, /bridge:execute_own/);
});

test("hosted API does not expose project local binding routes", async () => {
  for (const [method, path] of [
    ["GET", ["projects", "project-a", "local-bindings"]],
    ["POST", ["projects", "project-a", "local-bindings"]],
    ["DELETE", ["projects", "project-a", "local-bindings", "binding-1"]],
  ]) {
    const response = await invoke(path, method, {});
    assert.equal(response.status, 404);
    assert.equal(response.body.error, "hosted API route not found");
  }
});

test("hosted my_bridge execution plan reports unavailable Bridge states clearly", async (t) => {
  const db = {
    bridge_devices: [],
    execution_plans: [],
    memberships: [
      {
        role: "owner",
        status: "active",
        team_id: "team-1",
        user_id: "user-1",
      },
    ],
    projects: [
      {
        github_repo_url: "https://github.com/LAF-labs/demo",
        id: "11111111-1111-4111-8111-111111111111",
        local_id: "project-a",
        name: "Project A",
        team_id: "team-1",
      },
    ],
    tasks: [
      {
        id: "task-1",
        local_id: "task-a",
        model_mode: "my_bridge",
        project_id: "11111111-1111-4111-8111-111111111111",
        status: "open",
        team_id: "team-1",
        title: "Bridge execution task",
      },
    ],
  };
  const oldFetch = global.fetch;
  t.after(() => {
    global.fetch = oldFetch;
  });
  global.fetch = hostedFetch(db);
  const request = {
    message: "Implement and run tests",
    mode: "my_bridge",
    provider: "codex",
    task_id: "task-a",
  };

  const missing = await invoke(["execution", "plans"], "POST", request);
  assert.equal(missing.status, 400);
  assert.equal(missing.body.error, "no paired LAF Bridge detected");

  db.bridge_devices.push({
    capabilities: { cli_details: { codex: { detected: true } }, provider_runtimes: ["codex"] },
    id: "bridge-device-1",
    status: "offline",
    team_id: "team-1",
    user_id: "user-1",
  });
  const offline = await invoke(["execution", "plans"], "POST", request);
  assert.equal(offline.status, 400);
  assert.equal(offline.body.error, "no online LAF Bridge detected");

  db.bridge_devices[0].status = "online";
  db.bridge_devices[0].capabilities = {
    cli_details: { opencode: { detected: true } },
    provider_runtimes: ["opencode"],
  };
  const unsupportedCLI = await invoke(["execution", "plans"], "POST", request);
  assert.equal(unsupportedCLI.status, 409);
  assert.equal(unsupportedCLI.body.error, "LAF Bridge has no supported local CLI detected");

  db.bridge_devices[0].user_id = "user-2";
  db.bridge_devices[0].capabilities = {
    cli_details: { codex: { detected: true } },
    provider_runtimes: ["codex"],
  };
  const otherUserBridge = await invoke(["execution", "plans"], "POST", request);
  assert.equal(otherUserBridge.status, 400);
  assert.equal(otherUserBridge.body.error, "no paired LAF Bridge detected");
  assert.equal(db.execution_plans.length, 0);
});

test("hosted my_bridge execution plan create/get/cancel signs and redacts prompt", async (t) => {
  const db = {
    bridge_devices: [
      {
        capabilities: {
          cli_details: { codex: { detected: true } },
          provider_runtimes: ["codex"],
        },
        id: "bridge-device-1",
        status: "online",
        team_id: "team-1",
        user_id: "user-1",
      },
    ],
    execution_plans: [],
    memberships: [
      {
        role: "member",
        status: "active",
        team_id: "team-1",
        user_id: "user-1",
      },
    ],
    projects: [
      {
        github_repo_url: "https://github.com/LAF-labs/demo",
        id: "11111111-1111-4111-8111-111111111111",
        local_id: "project-a",
        name: "Project A",
        team_id: "team-1",
      },
    ],
    tasks: [
      {
        id: "task-1",
        local_id: "task-a",
        model_mode: "my_bridge",
        project_id: "11111111-1111-4111-8111-111111111111",
        status: "open",
        team_id: "team-1",
        title: "Bridge execution task",
      },
    ],
    teams: [{ id: "team-1", name: "Team One", slug: "team-one" }],
  };
  const oldFetch = global.fetch;
  t.after(() => {
    global.fetch = oldFetch;
  });
  global.fetch = hostedFetch(db);

  const created = await invoke(["execution", "plans"], "POST", {
    device_id: "bridge-device-1",
    message: "Implement and run tests",
    mode: "my_bridge",
    provider: "codex",
    task_id: "task-a",
  });
  assert.equal(created.status, 200);
  assert.equal(created.body.plan.mode, "my_bridge");
  assert.equal(created.body.plan.provider, "codex");
  assert.equal(created.body.plan.prompt, "[REDACTED]");
  assert.equal(typeof created.body.plan.signature, "string");
  assert.equal(typeof created.body.plan.signature_key_id, "string");
  assert.equal(typeof created.body.plan.payload_hash, "string");
  assert.equal(typeof created.body.plan.nonce, "string");
  assert.equal(db.execution_plans.length, 1);
  assert.equal(db.execution_plans[0].prompt, "Implement and run tests");
  assert.equal(db.execution_plans[0].effective_permissions.includes("wiki:read"), true);

  const fetched = await invoke(["execution", "plans", created.body.plan.id], "GET");
  assert.equal(fetched.status, 200);
  assert.equal(fetched.body.plan.prompt, "[REDACTED]");

  const cancelled = await invoke(
    ["execution", "plans", created.body.plan.id, "cancel"],
    "POST",
    {},
  );
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.body.cancelled, true);
  assert.equal(cancelled.body.plan.status, "cancelled");
});

test("hosted my_bridge execution plan can use managed checkout without local binding", async (t) => {
  const db = {
    bridge_devices: [
      {
        capabilities: {
          cli_details: { "claude-code": { detected: true } },
          provider_runtimes: ["claude-code"],
        },
        id: "bridge-device-1",
        status: "online",
        team_id: "team-1",
        user_id: "user-1",
      },
    ],
    execution_plans: [],
    memberships: [
      {
        role: "member",
        status: "active",
        team_id: "team-1",
        user_id: "user-1",
      },
    ],
    projects: [
      {
        github_repo_url: "https://github.com/LAF-labs/demo",
        id: "11111111-1111-4111-8111-111111111111",
        local_id: "project-a",
        name: "Project A",
        team_id: "team-1",
      },
    ],
    tasks: [
      {
        id: "task-1",
        local_id: "task-a",
        model_mode: "my_bridge",
        project_id: "11111111-1111-4111-8111-111111111111",
        status: "open",
        team_id: "team-1",
        title: "Bridge execution task",
      },
    ],
    teams: [{ id: "team-1", name: "Team One", slug: "team-one" }],
  };
  const oldFetch = global.fetch;
  t.after(() => {
    global.fetch = oldFetch;
  });
  global.fetch = hostedFetch(db);

  const created = await invoke(["execution", "plans"], "POST", {
    device_id: "bridge-device-1",
    message: "Implement and run tests",
    mode: "my_bridge",
    task_id: "task-a",
  });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  assert.equal(Object.hasOwn(created.body.plan, "binding_id"), false);
  assert.equal(created.body.plan.device_id, "bridge-device-1");
  assert.equal(created.body.plan.mode, "my_bridge");
  assert.equal(created.body.plan.provider, "claude_code");
  assert.equal(
    db.execution_plans[0].policy.github_repo_url,
    "https://github.com/LAF-labs/demo",
  );
});

test("hosted my_bridge execution plan defaults to a Codex-capable Bridge when providers are mixed", async (t) => {
  const db = {
    bridge_devices: [
      {
        capabilities: {
          cli_details: { "claude-code": { detected: true } },
          provider_runtimes: ["claude-code"],
        },
        id: "bridge-claude",
        status: "online",
        team_id: "team-1",
        user_id: "user-1",
      },
      {
        capabilities: {
          cli_details: { codex: { detected: true } },
          provider_runtimes: ["codex"],
        },
        id: "bridge-codex",
        status: "online",
        team_id: "team-1",
        user_id: "user-1",
      },
    ],
    execution_plans: [],
    memberships: [
      {
        role: "member",
        status: "active",
        team_id: "team-1",
        user_id: "user-1",
      },
    ],
    projects: [
      {
        github_repo_url: "https://github.com/LAF-labs/demo",
        id: "11111111-1111-4111-8111-111111111111",
        local_id: "project-a",
        name: "Project A",
        team_id: "team-1",
      },
    ],
    tasks: [
      {
        id: "task-1",
        local_id: "task-a",
        model_mode: "my_bridge",
        project_id: "11111111-1111-4111-8111-111111111111",
        status: "open",
        team_id: "team-1",
        title: "Bridge execution task",
      },
    ],
    teams: [{ id: "team-1", name: "Team One", slug: "team-one" }],
  };
  const oldFetch = global.fetch;
  t.after(() => {
    global.fetch = oldFetch;
  });
  global.fetch = hostedFetch(db);

  const created = await invoke(["execution", "plans"], "POST", {
    message: "Implement and run tests",
    mode: "my_bridge",
    task_id: "task-a",
  });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  assert.equal(created.body.plan.device_id, "bridge-codex");
  assert.equal(created.body.plan.provider, "codex");
});

test("hosted my_bridge execution plan does not fall back from another user's requested Bridge", async (t) => {
  const db = {
    bridge_devices: [
      {
        capabilities: {
          cli_details: { codex: { detected: true } },
          provider_runtimes: ["codex"],
        },
        id: "bridge-own",
        status: "online",
        team_id: "team-1",
        user_id: "user-1",
      },
      {
        capabilities: {
          cli_details: { "claude-code": { detected: true } },
          provider_runtimes: ["claude-code"],
        },
        id: "bridge-other-user",
        status: "online",
        team_id: "team-1",
        user_id: "user-2",
      },
    ],
    execution_plans: [],
    memberships: [
      {
        role: "owner",
        status: "active",
        team_id: "team-1",
        user_id: "user-1",
      },
    ],
    projects: [
      {
        github_repo_url: "https://github.com/LAF-labs/demo",
        id: "11111111-1111-4111-8111-111111111111",
        local_id: "project-a",
        name: "Project A",
        team_id: "team-1",
      },
    ],
    tasks: [
      {
        id: "task-1",
        local_id: "task-a",
        model_mode: "my_bridge",
        project_id: "11111111-1111-4111-8111-111111111111",
        status: "open",
        team_id: "team-1",
        title: "Bridge execution task",
      },
    ],
    teams: [{ id: "team-1", name: "Team One", slug: "team-one" }],
  };
  const oldFetch = global.fetch;
  t.after(() => {
    global.fetch = oldFetch;
  });
  global.fetch = hostedFetch(db);

  const requestedOtherUserBridge = await invoke(["execution", "plans"], "POST", {
    device_id: "bridge-other-user",
    message: "Run through a selected Bridge",
    mode: "my_bridge",
    provider: "claude_code",
    task_id: "task-a",
  });
  assert.equal(requestedOtherUserBridge.status, 400);
  assert.equal(
    requestedOtherUserBridge.body.error,
    "no paired LAF Bridge detected",
  );
  assert.equal(db.execution_plans.length, 0);

  const ownDefaultBridge = await invoke(["execution", "plans"], "POST", {
    message: "Run through my own Bridge",
    mode: "my_bridge",
    task_id: "task-a",
  });
  assert.equal(ownDefaultBridge.status, 200, JSON.stringify(ownDefaultBridge.body));
  assert.equal(ownDefaultBridge.body.plan.device_id, "bridge-own");
  assert.equal(ownDefaultBridge.body.plan.provider, "codex");
  assert.equal(db.execution_plans.length, 1);
});

test("hosted Bridge execution plan rejects unsupported providers instead of falling back", async (t) => {
  const db = {
    bridge_devices: [
      {
        capabilities: {
          cli_details: { codex: { detected: true } },
          provider_runtimes: ["codex"],
        },
        id: "bridge-device-1",
        status: "online",
        team_id: "team-1",
        user_id: "user-1",
      },
    ],
    execution_plans: [],
    memberships: [
      {
        role: "member",
        status: "active",
        team_id: "team-1",
        user_id: "user-1",
      },
    ],
    projects: [
      {
        github_repo_url: "https://github.com/LAF-labs/demo",
        id: "11111111-1111-4111-8111-111111111111",
        local_id: "project-a",
        name: "Project A",
        team_id: "team-1",
      },
    ],
    tasks: [
      {
        id: "task-1",
        local_id: "task-a",
        model_mode: "my_bridge",
        project_id: "11111111-1111-4111-8111-111111111111",
        status: "open",
        team_id: "team-1",
        title: "Bridge execution task",
      },
    ],
  };
  const oldFetch = global.fetch;
  t.after(() => {
    global.fetch = oldFetch;
  });
  global.fetch = hostedFetch(db);

  const unsupported = await invoke(["execution", "plans"], "POST", {
    device_id: "bridge-device-1",
    message: "Run with an unsupported provider",
    mode: "my_bridge",
    provider: "opencode",
    task_id: "task-a",
  });
  assert.equal(unsupported.status, 400);
  assert.equal(
    unsupported.body.error,
    "provider must be codex or claude_code for LAF Bridge execution",
  );

  const wrongModeProvider = await invoke(["execution", "plans"], "POST", {
    device_id: "bridge-device-1",
    message: "Run through Bridge, not hosted model",
    mode: "my_bridge",
    provider: "laf_model",
    task_id: "task-a",
  });
  assert.equal(wrongModeProvider.status, 400);
  assert.equal(
    wrongModeProvider.body.error,
    "provider must be codex or claude_code for LAF Bridge execution",
  );

  const missingRequestedCLI = await invoke(["execution", "plans"], "POST", {
    device_id: "bridge-device-1",
    message: "Run with Claude Code on a Codex-only Bridge",
    mode: "my_bridge",
    provider: "claude_code",
    task_id: "task-a",
  });
  assert.equal(missingRequestedCLI.status, 409);
  assert.equal(
    missingRequestedCLI.body.error,
    "LAF Bridge has not detected Claude Code CLI",
  );
  assert.equal(db.execution_plans.length, 0);
});

test("hosted bridge execution plan lifecycle records redacted events and idempotent receipt", async (t) => {
  const db = {
    audit_events: [],
    bridge_devices: [],
    bridge_pairing_codes: [],
    delivery_receipts: [],
    execution_events: [],
    execution_plans: [],
    execution_receipts: [],
    memberships: [
      {
        role: "owner",
        status: "active",
        team_id: "team-1",
        user_id: "user-1",
      },
    ],
    tasks: [
      {
        id: "task-1",
        local_id: "task-1",
        team_id: "team-1",
        thread_id: "thread-1",
        title: "Bridge lifecycle task",
      },
    ],
    teams: [{ id: "team-1", name: "Team One", slug: "team-one" }],
  };
  const oldFetch = global.fetch;
  t.after(() => {
    global.fetch = oldFetch;
  });
  global.fetch = hostedFetch(db);

  const start = await invoke(["bridge", "pairing", "start"], "POST", {
    api_url: "https://office.test/api",
  });
  const claim = await invoke(
    ["bridge", "pairing", "claim"],
    "POST",
    {
      capabilities: { provider_runtimes: ["codex"] },
      code: pairingClaimCode(start),
      device_label: "Kim's MacBook",
      platform: "darwin",
      public_key: testBridgePublicKey(),
    },
    { headers: { authorization: "" } },
  );
  assert.equal(claim.status, 200);
  const token = claim.body.bridge_token;
  const device = db.bridge_devices[0];
  const planID = "11111111-2222-4333-8444-555555555555";
  db.execution_plans.push({
    actor_user_id: "user-1",
    context_refs: [],
    created_at: new Date().toISOString(),
    device_id: device.id,
    effective_permissions: ["task:execute_agent"],
    executor_user_id: "user-1",
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    id: planID,
    local_approval_status: "pending",
    mode: "my_bridge",
    nonce: "nonce-1",
    payload_hash: "hash-1",
    policy: {},
    project_id: "project-1",
    prompt: "Secret implementation prompt",
    provider: "codex",
    required_permissions: [],
    signature: "signature-1",
    signature_alg: "ed25519",
    signature_key_id: "key-1",
    status: "pending",
    task_id: "task-1",
    team_id: "team-1",
  });

  const pending = await invoke(
    ["bridge", "devices", device.id, "pending-plans"],
    "GET",
    undefined,
    { headers: { authorization: `Bearer ${token}` } },
  );
  assert.equal(pending.status, 200);
  assert.equal(pending.body.plans.length, 1);
  assert.equal(pending.body.plans[0].prompt, "Secret implementation prompt");

  const ack = await invoke(
    ["execution", "plans", planID, "ack"],
    "POST",
    { lease_seconds: 120 },
    { headers: { authorization: `Bearer ${token}` } },
  );
  assert.equal(ack.status, 200);
  assert.equal(ack.body.plan.status, "acknowledged");
  assert.ok(db.execution_plans[0].acknowledged_at);
  assert.ok(db.execution_plans[0].lease_until);

  const started = await invoke(
    ["execution", "plans", planID, "start"],
    "POST",
    { lease_seconds: 120, local_approval_status: "approved" },
    { headers: { authorization: `Bearer ${token}` } },
  );
  assert.equal(started.status, 200);
  assert.equal(started.body.plan.status, "running");
  assert.equal(started.body.plan.local_approval_status, "approved");
  assert.ok(db.execution_plans[0].started_at);

  const event = await invoke(
    ["execution", "plans", planID, "events"],
    "POST",
    {
      event_type: "stdout",
      payload: {
        line: `using Bearer ${token}`,
        openai_key: `sk-proj-${"a".repeat(24)}`,
        nested: { bridge_token: token },
      },
      sequence: 1,
    },
    { headers: { authorization: `Bearer ${token}` } },
  );
  assert.equal(event.status, 200);
  assert.equal(event.body.event.payload.line, "using Bearer [REDACTED]");
  assert.equal(event.body.event.payload.openai_key, "sk-[REDACTED]");
  assert.equal(event.body.event.payload.nested.bridge_token, "[REDACTED]");

  const oversized = await invoke(
    ["execution", "plans", planID, "events"],
    "POST",
    {
      event_type: "stdout",
      payload: { line: "x".repeat(70 * 1024) },
      sequence: 2,
    },
    { headers: { authorization: `Bearer ${token}` } },
  );
  assert.equal(oversized.status, 413);
  assert.match(oversized.body.error, /event payload exceeds/);
  assert.equal(db.execution_events.length, 1);

  const events = await invoke(["execution", "plans", planID, "events"], "GET");
  assert.equal(events.status, 200);
  assert.equal(events.body.events.length, 1);
  assert.equal(events.body.events[0].payload.nested.bridge_token, "[REDACTED]");

  const completed = await invoke(
    ["execution", "plans", planID, "complete"],
    "POST",
    {
      artifacts: [
        {
          title: "Implementation PR",
          type: "pull_request",
          url: "https://github.com/LAF-labs/demo/pull/42",
        },
      ],
      changed_files: [{ path: "api/[...path].js" }],
      provider_version: "codex-cli 1.2.3",
      status: "completed",
      summary: `Done with ${token}`,
      test_results: [{ command: "node --test api/hosted-api.test.js", status: "passed" }],
      usage: { output_tokens: 123 },
    },
    { headers: { authorization: `Bearer ${token}` } },
  );
  assert.equal(completed.status, 200);
  assert.equal(completed.body.plan.status, "completed");
  assert.equal(completed.body.receipt.status, "completed");
  assert.equal(completed.body.receipt.summary, "Done with laf_bridge_[REDACTED]");
  assert.equal(db.execution_receipts.length, 1);
  assert.equal(db.delivery_receipts.length, 1);
  assert.equal(db.delivery_receipts[0].delivery_status, "completed");
  assert.equal(db.delivery_receipts[0].delivery_summary, "Done with laf_bridge_[REDACTED]");
  assert.equal(db.delivery_receipts[0].delivery_url, "https://github.com/LAF-labs/demo/pull/42");
  assert.equal(db.delivery_receipts[0].task_id, "task-1");
  assert.equal(db.execution_events.length, 2);
  assert.equal(db.execution_events[1].event_type, "receipt.appended");
  assert.equal(db.execution_events[1].payload.summary, "Done with laf_bridge_[REDACTED]");
  assert.equal(db.execution_events[1].payload.thread_id, "thread-1");

  const fetched = await invoke(["execution", "plans", planID], "GET");
  assert.equal(fetched.status, 200);
  assert.equal(fetched.body.plan.prompt, "[REDACTED]");
  assert.equal(fetched.body.receipt.summary, "Done with laf_bridge_[REDACTED]");

  const retried = await invoke(
    ["execution", "plans", planID, "complete"],
    "POST",
    { status: "completed", summary: "retry should not duplicate" },
    { headers: { authorization: `Bearer ${token}` } },
  );
  assert.equal(retried.status, 200);
  assert.equal(retried.body.receipt.id, completed.body.receipt.id);
  assert.equal(db.execution_receipts.length, 1);
  assert.equal(db.delivery_receipts.length, 1);
  assert.equal(db.execution_events.length, 2);
});

test("hosted Bridge operating E2E pairs, detects CLI, runs plan, and records receipt", async (t) => {
  const db = {
    audit_events: [],
    bridge_devices: [],
    bridge_pairing_codes: [],
    delivery_receipts: [],
    execution_events: [],
    execution_plans: [],
    execution_receipts: [],
    memberships: [
      {
        role: "owner",
        status: "active",
        team_id: "team-1",
        user_id: "user-1",
      },
    ],
    projects: [],
    tasks: [],
    teams: [{ id: "team-1", name: "Team One", slug: "team-one" }],
    workspace_billing: [],
  };
  const oldFetch = global.fetch;
  t.after(() => {
    global.fetch = oldFetch;
  });
  global.fetch = hostedFetch(db);

  const start = await invoke(
    ["bridge", "pairing", "start"],
    "POST",
    { api_url: "https://office.test/api" },
  );
  assert.equal(start.status, 200, JSON.stringify(start.body));
  assert.equal(start.body.commands.pair, "npx laf-bridge pair");
  assert.doesNotMatch(start.body.commands.pair, /--api-url|--code/);

  const claim = await invoke(
    ["bridge", "pairing", "claim"],
    "POST",
    {
      capabilities: {
        cli_details: { codex: { detected: true } },
        provider_runtimes: ["codex"],
      },
      code: pairingClaimCode(start),
      device_label: "Bridge E2E Mac",
      platform: "darwin",
      public_key: testBridgePublicKey(),
    },
    { headers: { authorization: "" } },
  );
  assert.equal(claim.status, 200, JSON.stringify(claim.body));
  const token = claim.body.bridge_token;
  const device = claim.body.device;
  assert.match(claim.body.plan_signing_public_key, /BEGIN PUBLIC KEY/);

  const heartbeat = await invoke(
    ["bridge", "devices", device.id, "heartbeat"],
    "POST",
    {
      capabilities: {
        cli_details: {
          codex: { detected: true, version: "codex 1.0.0" },
          "claude-code": { detected: true, version: "claude 1.0.0" },
        },
        gh_authenticated: true,
        git_available: true,
        provider_runtimes: ["codex", "claude-code"],
      },
      status: "online",
    },
    { headers: { authorization: `Bearer ${token}` } },
  );
  assert.equal(heartbeat.status, 200, JSON.stringify(heartbeat.body));

  const availability = await invoke(["bridge", "availability"], "GET");
  assert.equal(availability.status, 200);
  assert.equal(availability.body.my_bridge.available, true);
  assert.deepEqual(availability.body.my_bridge.runtimes.sort(), ["claude-code", "codex"]);
  assert.equal(availability.body.team_bridge, undefined);

  const project = await invoke(["projects"], "POST", {
    action: "create",
    github_repo_url: "https://github.com/LAF-labs/demo",
    name: "Hosted Bridge E2E",
  });
  assert.equal(project.status, 200, JSON.stringify(project.body));

  const task = await invoke(["tasks"], "POST", {
    action: "create",
    model_mode: "my_bridge",
    owner: "be",
    project_id: project.body.project.id,
    title: "Implement the hosted Bridge E2E flow",
  });
  assert.equal(task.status, 200, JSON.stringify(task.body));
  assert.equal(task.body.task.model_mode, "my_bridge");
  assert.deepEqual(Object.keys(task.body).sort(), ["task"]);

  const created = await invoke(["execution", "plans"], "POST", {
    message: "Run Codex locally and return a concise receipt.",
    mode: "my_bridge",
    provider: "codex",
    task_id: task.body.task.id,
  });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  assert.equal(Object.hasOwn(created.body.plan, "binding_id"), false);
  assert.equal(created.body.plan.device_id, device.id);
  assert.equal(created.body.plan.mode, "my_bridge");
  assert.equal(created.body.plan.provider, "codex");
  assert.equal(
    db.execution_plans[0].policy.github_repo_url,
    "https://github.com/LAF-labs/demo",
  );
  assert.equal(db.execution_plans[0].policy.project_slug, db.projects[0].local_id);
  assert.equal(Object.hasOwn(db.execution_plans[0].policy, "project_local_id"), false);
  assert.equal(
    verifyExecutionPlanSignature(db.execution_plans[0], claim.body.plan_signing_public_key),
    true,
  );
  const jsonbReorderedPlan = {
    ...db.execution_plans[0],
    policy: {
      project_name: db.execution_plans[0].policy.project_name,
      project_id: db.execution_plans[0].policy.project_id,
      project_slug: db.execution_plans[0].policy.project_slug,
      github_repo_url: db.execution_plans[0].policy.github_repo_url,
    },
  };
  assert.equal(
    verifyExecutionPlanSignature(jsonbReorderedPlan, claim.body.plan_signing_public_key),
    true,
  );

  const pending = await invoke(
    ["bridge", "devices", device.id, "pending-plans"],
    "GET",
    undefined,
    { headers: { authorization: `Bearer ${token}` } },
  );
  assert.equal(pending.status, 200);
  assert.equal(pending.body.plans.length, 1);
  assert.equal(pending.body.plans[0].id, created.body.plan.id);
  assert.equal(pending.body.plans[0].prompt, "Run Codex locally and return a concise receipt.");

  const ack = await invoke(
    ["execution", "plans", created.body.plan.id, "ack"],
    "POST",
    { lease_seconds: 120 },
    { headers: { authorization: `Bearer ${token}` } },
  );
  assert.equal(ack.status, 200);
  assert.equal(ack.body.plan.status, "acknowledged");

  const started = await invoke(
    ["execution", "plans", created.body.plan.id, "start"],
    "POST",
    { lease_seconds: 120, local_approval_status: "approved" },
    { headers: { authorization: `Bearer ${token}` } },
  );
  assert.equal(started.status, 200);
  assert.equal(started.body.plan.status, "running");

  const event = await invoke(
    ["execution", "plans", created.body.plan.id, "events"],
    "POST",
    { event_type: "stdout", payload: { line: "Codex started" }, sequence: 1 },
    { headers: { authorization: `Bearer ${token}` } },
  );
  assert.equal(event.status, 200);

  const completed = await invoke(
    ["execution", "plans", created.body.plan.id, "complete"],
    "POST",
    {
      changed_files: [{ path: "README.md" }],
      provider_version: "codex 1.0.0",
      status: "completed",
      summary: "Bridge E2E completed",
      test_results: [{ command: "npm test", status: "passed" }],
    },
    { headers: { authorization: `Bearer ${token}` } },
  );
  assert.equal(completed.status, 200, JSON.stringify(completed.body));
  assert.equal(completed.body.plan.status, "completed");
  assert.equal(completed.body.receipt.summary, "Bridge E2E completed");
  assert.equal(db.execution_receipts.length, 1);
  assert.equal(db.delivery_receipts.length, 1);
  assert.equal(db.delivery_receipts[0].task_id, db.tasks[0].id);
  assert.equal(db.execution_events.at(-1).event_type, "receipt.appended");
});

test("hosted bridge revoke requires audit durability before mutation", async (t) => {
  const db = {
    audit_events: [],
    bridge_devices: [
      {
        device_kind: "desktop",
        id: "bridge-device-1",
        status: "online",
        team_id: "team-1",
        token_hash: "old-token-hash",
        user_id: "user-1",
      },
    ],
    failAuditWrite: true,
    memberships: [
      {
        role: "owner",
        status: "active",
        team_id: "team-1",
        user_id: "user-1",
      },
    ],
    teams: [{ id: "team-1", name: "Team One", slug: "team-one" }],
  };
  const oldFetch = global.fetch;
  t.after(() => {
    global.fetch = oldFetch;
  });
  global.fetch = hostedFetch(db);

  const revoke = await invoke(["bridge", "devices", "bridge-device-1", "revoke"], "POST", {});

  assert.equal(revoke.status, 500);
  assert.equal(revoke.body.error, "audit write failed");
  assert.equal(db.bridge_devices[0].status, "online");
  assert.equal(db.bridge_devices[0].revoked_at, undefined);
  assert.equal(db.bridge_devices[0].token_hash, "old-token-hash");
});

test("hosted bridge refuses stale completion for cancelled plan", async (t) => {
  const db = {
    audit_events: [],
    bridge_devices: [],
    bridge_pairing_codes: [],
    delivery_receipts: [],
    execution_events: [],
    execution_plans: [],
    execution_receipts: [],
    memberships: [
      {
        role: "owner",
        status: "active",
        team_id: "team-1",
        user_id: "user-1",
      },
    ],
    tasks: [
      {
        id: "task-1",
        local_id: "task-a",
        team_id: "team-1",
        title: "Cancelled bridge task",
      },
    ],
    teams: [{ id: "team-1", name: "Team One", slug: "team-one" }],
  };
  const oldFetch = global.fetch;
  t.after(() => {
    global.fetch = oldFetch;
  });
  global.fetch = hostedFetch(db);

  const start = await invoke(["bridge", "pairing", "start"], "POST", {
    api_url: "https://office.test/api",
  });
  const claim = await invoke(
    ["bridge", "pairing", "claim"],
    "POST",
    {
      capabilities: { provider_runtimes: ["codex"] },
      code: pairingClaimCode(start),
      device_label: "Kim's MacBook",
      platform: "darwin",
      public_key: testBridgePublicKey(),
    },
    { headers: { authorization: "" } },
  );
  assert.equal(claim.status, 200);
  const device = db.bridge_devices[0];
  const planID = "11111111-2222-4333-8444-555555555556";
  db.execution_plans.push({
    actor_user_id: "user-1",
    context_refs: [],
    created_at: new Date().toISOString(),
    device_id: device.id,
    effective_permissions: ["task:execute_agent"],
    executor_user_id: "user-1",
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    id: planID,
    local_approval_status: "approved",
    mode: "my_bridge",
    nonce: "nonce-1",
    payload_hash: "hash-1",
    policy: {},
    project_id: null,
    prompt: "Cancelled implementation prompt",
    provider: "codex",
    required_permissions: [],
    signature: "signature-1",
    signature_alg: "ed25519",
    signature_key_id: "key-1",
    status: "cancelled",
    task_id: "task-1",
    team_id: "team-1",
  });

  const staleComplete = await invoke(
    ["execution", "plans", planID, "complete"],
    "POST",
    { status: "completed", summary: "late success" },
    { headers: { authorization: `Bearer ${claim.body.bridge_token}` } },
  );

  assert.equal(staleComplete.status, 409);
  assert.match(staleComplete.body.error, /already terminal \(cancelled\)/);
  assert.equal(db.execution_receipts.length, 0);
  assert.equal(db.execution_plans[0].status, "cancelled");
});

test("hosted bridge persists local approval denial with audit", async (t) => {
  const oldNodeEnv = process.env.NODE_ENV;
  const oldPublicHost = process.env.LAF_OFFICE_PUBLIC_HOST;
  const oldVercelURL = process.env.VERCEL_URL;
  const db = {
    audit_events: [],
    bridge_devices: [],
    bridge_pairing_codes: [],
    execution_plans: [],
    memberships: [
      {
        role: "owner",
        status: "active",
        team_id: "team-1",
        user_id: "user-1",
      },
    ],
    teams: [{ id: "team-1", name: "Team One", slug: "team-one" }],
  };
  const oldFetch = global.fetch;
  t.after(() => {
    global.fetch = oldFetch;
    restoreEnv("NODE_ENV", oldNodeEnv);
    restoreEnv("LAF_OFFICE_PUBLIC_HOST", oldPublicHost);
    restoreEnv("VERCEL_URL", oldVercelURL);
  });
  global.fetch = hostedFetch(db);
  process.env.NODE_ENV = "test";
  delete process.env.LAF_OFFICE_PUBLIC_HOST;
  delete process.env.VERCEL_URL;

  const start = await invoke(
    ["bridge", "pairing", "start"],
    "POST",
    { api_url: "https://office.test/api" },
  );
  assert.equal(start.status, 200, JSON.stringify(start.body));
  const claim = await invoke(
    ["bridge", "pairing", "claim"],
    "POST",
    {
      capabilities: { provider_runtimes: ["codex"] },
      code: pairingClaimCode(start),
      device_label: "Kim's MacBook",
      platform: "darwin",
      public_key: testBridgePublicKey(),
    },
    { headers: { authorization: "" } },
  );
  assert.equal(claim.status, 200);
  const device = db.bridge_devices[0];
  const planID = "11111111-2222-4333-8444-555555555557";
  db.execution_plans.push({
    actor_user_id: "user-1",
    context_refs: [],
    created_at: new Date().toISOString(),
    device_id: device.id,
    effective_permissions: ["task:execute_agent"],
    executor_user_id: "user-1",
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    id: planID,
    local_approval_status: "pending",
    mode: "my_bridge",
    nonce: "nonce-1",
    payload_hash: "hash-1",
    policy: {},
    project_id: null,
    prompt: "Requires local approval",
    provider: "codex",
    required_permissions: [],
    signature: "signature-1",
    signature_alg: "ed25519",
    signature_key_id: "key-1",
    status: "acknowledged",
    task_id: null,
    team_id: "team-1",
  });

  const denied = await invoke(
    ["execution", "plans", planID, "start"],
    "POST",
    {
      local_approval_status: "denied",
      reason: "Nope, token lafb_abcdefghijklmnopqrstuvwxyz should not leak",
    },
    { headers: { authorization: `Bearer ${claim.body.bridge_token}` } },
  );

  assert.equal(denied.status, 200, JSON.stringify(denied.body));
  assert.equal(denied.body.plan.status, "cancelled");
  assert.equal(denied.body.plan.local_approval_status, "denied");
  assert.equal(db.execution_plans[0].status, "cancelled");
  assert.equal(db.execution_plans[0].local_approval_status, "denied");
  assert.match(db.execution_plans[0].last_error, /lafb_\[REDACTED\]/);
  assert.equal(db.audit_events[0].action, "execution.local_approval_denied");
  assert.match(db.audit_events[0].metadata.reason, /lafb_\[REDACTED\]/);
});

test("hosted execution plan create survives relay publish failure", async (t) => {
  const db = {
    bridge_devices: [
      {
        capabilities: {
          cli_details: { codex: { detected: true } },
          provider_runtimes: ["codex"],
        },
        id: "bridge-device-1",
        status: "online",
        team_id: "team-1",
        user_id: "user-1",
      },
    ],
    execution_plans: [],
    failRelayBroadcast: true,
    memberships: [
      {
        role: "member",
        status: "active",
        team_id: "team-1",
        user_id: "user-1",
      },
    ],
    projects: [
      {
        github_repo_url: "https://github.com/laf/office",
        id: "11111111-1111-4111-8111-111111111111",
        local_id: "project-a",
        name: "Project A",
        team_id: "team-1",
      },
    ],
    relay_broadcasts: [],
    tasks: [
      {
        id: "task-1",
        local_id: "task-a",
        model_mode: "my_bridge",
        project_id: "11111111-1111-4111-8111-111111111111",
        status: "open",
        team_id: "team-1",
        title: "Bridge execution task",
      },
    ],
    teams: [{ id: "team-1", name: "Team One", slug: "team-one" }],
  };
  const oldFetch = global.fetch;
  const oldBroadcastURL = process.env.SUPABASE_REALTIME_BROADCAST_URL;
  const oldRelay = process.env.LAF_BRIDGE_RELAY_ENABLED;
  t.after(() => {
    global.fetch = oldFetch;
    if (oldBroadcastURL === undefined) {
      delete process.env.SUPABASE_REALTIME_BROADCAST_URL;
    } else {
      process.env.SUPABASE_REALTIME_BROADCAST_URL = oldBroadcastURL;
    }
    if (oldRelay === undefined) {
      delete process.env.LAF_BRIDGE_RELAY_ENABLED;
    } else {
      process.env.LAF_BRIDGE_RELAY_ENABLED = oldRelay;
    }
  });
  process.env.LAF_BRIDGE_RELAY_ENABLED = "true";
  process.env.SUPABASE_REALTIME_BROADCAST_URL =
    "https://supabase.test/realtime/v1/api/broadcast";
  global.fetch = hostedFetch(db);

  const created = await invoke(["execution", "plans"], "POST", {
    device_id: "bridge-device-1",
    message: "Implement and run tests",
    mode: "my_bridge",
    provider: "codex",
    task_id: "task-a",
  });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  assert.equal(created.body.relay.published, false);
  assert.match(created.body.relay.error, /relay unavailable/);
  assert.equal(db.execution_plans.length, 1);
  assert.equal(db.relay_broadcasts.length, 1);
  assert.equal(db.relay_broadcasts[0].messages[0].event, "execution.plan.created");
});

test("hosted my_bridge rejects local binding execution and requires own bridge execute permission", async (t) => {
  const db = {
    bridge_devices: [
      {
        capabilities: {
          cli_details: { codex: { detected: true } },
          provider_runtimes: ["codex"],
        },
        id: "bridge-device-1",
        status: "online",
        team_id: "team-1",
        user_id: "user-1",
      },
    ],
    execution_plans: [],
    memberships: [
      {
        role: "viewer",
        status: "active",
        team_id: "team-1",
        user_id: "user-1",
      },
    ],
    projects: [
      {
        github_repo_url: "https://github.com/laf/office",
        id: "11111111-1111-4111-8111-111111111111",
        local_id: "project-a",
        name: "Project A",
        team_id: "team-1",
      },
    ],
    tasks: [
      {
        id: "task-1",
        local_id: "task-a",
        model_mode: "my_bridge",
        project_id: "11111111-1111-4111-8111-111111111111",
        status: "open",
        team_id: "team-1",
        title: "Bridge execution task",
      },
    ],
    teams: [{ id: "team-1", name: "Team One", slug: "team-one" }],
  };
  const oldFetch = global.fetch;
  t.after(() => {
    global.fetch = oldFetch;
  });
  global.fetch = hostedFetch(db);

  const noPerm = await invoke(["execution", "plans"], "POST", {
    binding_id: "binding-1",
    device_id: "bridge-device-1",
    message: "Implement and run tests",
    mode: "my_bridge",
    provider: "codex",
    task_id: "task-a",
  });
  assert.equal(noPerm.status, 403);
  assert.equal(noPerm.body.error, "permission required: execution:plan_create");

  db.memberships[0].role = "owner";
  const legacyBinding = await invoke(["execution", "plans"], "POST", {
    binding_id: "binding-1",
    device_id: "bridge-device-1",
    message: "Implement and run tests",
    mode: "my_bridge",
    provider: "codex",
    task_id: "task-a",
  });
  assert.equal(legacyBinding.status, 400, JSON.stringify(legacyBinding.body));
  assert.equal(
    legacyBinding.body.error,
    "my_bridge uses managed checkout; local binding execution is not supported",
  );
});

test("hosted model availability uses DB billing before env fallback", async (t) => {
  const db = {
    memberships: [
      {
        role: "owner",
        status: "active",
        team_id: "team-1",
        user_id: "user-1",
      },
    ],
    workspace_billing: [{ laf_model_enabled: false, team_id: "team-1" }],
  };
  const oldFetch = global.fetch;
  const oldPaid = process.env.LAF_OFFICE_WORKSPACE_PAID;
  t.after(() => {
    global.fetch = oldFetch;
    if (oldPaid === undefined) {
      delete process.env.LAF_OFFICE_WORKSPACE_PAID;
    } else {
      process.env.LAF_OFFICE_WORKSPACE_PAID = oldPaid;
    }
  });
  process.env.LAF_OFFICE_WORKSPACE_PAID = "true";
  global.fetch = hostedFetch(db);

  const availability = await invoke(["model", "availability"], "GET");

  assert.equal(availability.status, 200);
  assert.equal(availability.body.laf_model.available, false);
  assert.equal(availability.body.allowed_modes.includes("laf_model"), false);
  assert.equal(availability.body.reason, "workspace billing loaded from DB");
});

test("hosted model availability only exposes the current user's Bridge as executable CLI", async (t) => {
  const db = {
    bridge_devices: [
      {
        capabilities: {},
        id: "bridge-1",
        status: "online",
        team_id: "team-1",
        user_id: "user-2",
      },
    ],
    memberships: [
      {
        role: "owner",
        status: "active",
        team_id: "team-1",
        user_id: "user-1",
      },
    ],
    workspace_billing: [],
  };
  const oldFetch = global.fetch;
  t.after(() => {
    global.fetch = oldFetch;
  });
  global.fetch = hostedFetch(db);

  const withoutCLI = await invoke(["model", "availability"], "GET");
  assert.equal(withoutCLI.status, 200);
  assert.equal(withoutCLI.body.my_bridge.available, false);
  assert.equal(withoutCLI.body.my_bridge.reason, "no paired LAF Bridge detected");
  assert.equal(withoutCLI.body.team_bridge, undefined);

  db.bridge_devices[0].capabilities = {
    cli_details: { opencode: { detected: true } },
    provider_runtimes: ["opencode"],
  };
  const unsupportedCLI = await invoke(["model", "availability"], "GET");
  assert.equal(unsupportedCLI.status, 200);
  assert.equal(unsupportedCLI.body.team_bridge, undefined);
  assert.equal(unsupportedCLI.body.local_cli, undefined);
  assert.deepEqual(unsupportedCLI.body.my_bridge.runtimes, []);

  db.bridge_devices[0].user_id = "user-1";
  const ownUnsupportedCLI = await invoke(["model", "availability"], "GET");
  assert.equal(ownUnsupportedCLI.status, 200);
  assert.equal(ownUnsupportedCLI.body.my_bridge.available, false);
  assert.equal(ownUnsupportedCLI.body.my_bridge.reason, "no supported local CLI detected");
  assert.equal(ownUnsupportedCLI.body.allowed_modes.includes("my_bridge"), false);

  db.bridge_devices[0].user_id = "user-2";
  db.bridge_devices[0].capabilities = {
    cli_details: { codex: { detected: true } },
    provider_runtimes: ["codex"],
  };
  const withCLI = await invoke(["model", "availability"], "GET");
  assert.equal(withCLI.status, 200);
  assert.equal(withCLI.body.allowed_modes.includes("team_bridge"), false);
  assert.equal(withCLI.body.allowed_modes.includes("my_bridge"), false);
  assert.equal(withCLI.body.local_cli, undefined);

  db.bridge_devices[0].user_id = "user-1";
  const ownBridgeWithCLI = await invoke(["model", "availability"], "GET");
  assert.equal(ownBridgeWithCLI.status, 200);
  assert.equal(ownBridgeWithCLI.body.my_bridge.available, true);
  assert.equal(ownBridgeWithCLI.body.team_bridge, undefined);
  assert.equal(ownBridgeWithCLI.body.allowed_modes.includes("my_bridge"), true);
  assert.equal(ownBridgeWithCLI.body.allowed_modes.includes("team_bridge"), false);
  assert.deepEqual(ownBridgeWithCLI.body.my_bridge.runtimes, ["codex"]);
  assert.equal(ownBridgeWithCLI.body.default_mode, "my_bridge");

  db.memberships[0].role = "member";
  db.memberships[0].permissions = { deny: ["bridge:execute_own"] };
  const executeDenied = await invoke(["model", "availability"], "GET");
  assert.equal(executeDenied.status, 200);
  assert.equal(executeDenied.body.my_bridge.available, false);
  assert.equal(
    executeDenied.body.my_bridge.reason,
    "permission required: bridge:execute_own",
  );
  assert.equal(executeDenied.body.allowed_modes.includes("my_bridge"), false);

  db.memberships[0].role = "owner";
  delete db.memberships[0].permissions;
  db.bridge_devices[0].capabilities = {
    cli_details: { "claude-code": { detected: true } },
    provider_runtimes: ["claude-code"],
  };
  db.bridge_devices.push({
    capabilities: {
      cli_details: { codex: { detected: true } },
      provider_runtimes: ["codex"],
    },
    id: "bridge-codex",
    status: "online",
    team_id: "team-1",
    user_id: "user-1",
  });
  const mixedBridgeCLIs = await invoke(["bridge", "availability"], "GET");
  assert.equal(mixedBridgeCLIs.status, 200);
  assert.equal(mixedBridgeCLIs.body.my_bridge.available, true);
  assert.equal(mixedBridgeCLIs.body.my_bridge.default_device_id, "bridge-codex");
  assert.deepEqual(
    mixedBridgeCLIs.body.my_bridge.runtimes.sort(),
    ["claude-code", "codex"],
  );
});

test("hosted task mutation rejects unavailable model modes", async (t) => {
  const db = {
    audit_events: [],
    delivery_receipts: [],
    memberships: [
      {
        role: "owner",
        status: "active",
        team_id: "team-1",
        user_id: "user-1",
      },
    ],
    projects: [],
    tasks: [],
    workspace_billing: [],
  };
  const oldFetch = global.fetch;
  t.after(() => {
    global.fetch = oldFetch;
  });
  global.fetch = hostedFetch(db);

  const response = await invoke(["tasks"], "POST", {
    action: "create",
    model_mode: "local_cli",
    title: "Run with unavailable Bridge",
  });

  assert.equal(response.status, 403);
  assert.equal(response.body.error, "no paired LAF Bridge detected");
  assert.equal(db.tasks.length, 0);
});

test("hosted orchestration confirm uses stored intent instead of client actions", async (t) => {
  const db = {
    audit_events: [],
    memberships: [
      {
        role: "owner",
        status: "active",
        team_id: "team-1",
        user_id: "user-1",
      },
    ],
    orchestration_intents: [],
    projects: [],
  };
  const oldFetch = global.fetch;
  t.after(() => {
    global.fetch = oldFetch;
  });
  global.fetch = hostedFetch(db);

  const routed = await invoke(["orchestration", "intent"], "POST", {
    message: "create project Alpha",
  });
  assert.equal(routed.status, 200);
  assert.equal(db.orchestration_intents.length, 1);

  const forged = await invoke(["orchestration", "confirm"], "POST", {
    intent: {
      id: routed.body.intent.id,
      proposed_actions: [
        {
          method: "POST",
          path: "/projects",
          body: { action: "create", name: "Forged Project" },
        },
      ],
      required_permissions: [],
    },
  });
  assert.equal(forged.status, 400);
  assert.equal(forged.body.error, "intent_id is required");
  assert.equal(db.projects.length, 0);

  const confirmed = await invoke(["orchestration", "confirm"], "POST", {
    intent_id: routed.body.intent.id,
  });
  assert.equal(confirmed.status, 200);
  assert.equal(confirmed.body.status, "applied");
  assert.equal(db.projects.length, 1);
  assert.equal(db.projects[0].name, "Alpha");
  assert.equal(db.orchestration_intents[0].status, "applied");
});

test("hosted skill invocation requires invoke permission and manifest permissions", async (t) => {
  const db = {
    audit_events: [],
    memberships: [
      {
        role: "viewer",
        status: "active",
        team_id: "team-1",
        user_id: "user-1",
      },
    ],
    skills: [
      {
        id: "skill-1",
        name: "deploy",
        status: "active",
        team_id: "team-1",
        usage_count: 0,
      },
    ],
  };
  const oldFetch = global.fetch;
  t.after(() => {
    global.fetch = oldFetch;
  });
  global.fetch = hostedFetch(db);

  const missingInvoke = await invoke(["skills", "deploy", "invoke"], "POST", {});
  assert.equal(missingInvoke.status, 403);
  assert.equal(missingInvoke.body.error, "permission required: skill:invoke");
  assert.equal(db.skills[0].usage_count, 0);

  db.memberships[0].role = "member";
  db.skills[0].required_permissions = ["audit:read"];
  const missingManifestPermission = await invoke(["skills", "deploy", "invoke"], "POST", {});
  assert.equal(missingManifestPermission.status, 403);
  assert.equal(missingManifestPermission.body.error, "permission required: audit:read");
  assert.equal(db.skills[0].usage_count, 0);
});

function canonicalExecutionPlanPayload(plan) {
  const fields = [
    "id",
    "team_id",
    "project_id",
    "task_id",
    "actor_user_id",
    "executor_user_id",
    "device_id",
    "mode",
    "provider",
    "required_permissions",
    "effective_permissions",
    "context_refs",
    "prompt",
    "policy",
    "expires_at",
  ];
  const payload = {};
  for (const field of fields) payload[field] = canonicalPlanValue(plan[field] ?? null);
  payload.nonce = plan.nonce;
  return JSON.stringify(payload);
}

function canonicalPlanValue(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (Array.isArray(value)) return value.map((entry) => canonicalPlanValue(entry) ?? null);
  if (typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      const entry = canonicalPlanValue(value[key]);
      if (entry !== undefined) out[key] = entry;
    }
    return out;
  }
  return value;
}

function verifyExecutionPlanSignature(plan, publicKeyPEM) {
  return crypto.verify(
    null,
    Buffer.from(canonicalExecutionPlanPayload(plan)),
    crypto.createPublicKey(publicKeyPEM),
    Buffer.from(plan.signature, "base64"),
  );
}

function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function testBridgePublicKey() {
  return Buffer.alloc(32, 9).toString("base64");
}

function decodeBridgeSetupCode(value) {
  const base64 = String(value || "").replaceAll("-", "+").replaceAll("_", "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
}

function pairingClaimCode(response) {
  return decodeBridgeSetupCode(response.body?.pairing?.setup_code).code;
}

async function invoke(path, method, body, options = {}) {
  const headers = {};
  const req = {
    body,
    headers: {
      authorization: "Bearer user-token",
      host: "office.test",
      ...(options.headers || {}),
    },
    method,
    query: { path, ...(options.query || {}) },
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

function hostedFetch(db) {
  return async (input, init = {}) => {
    const url = new URL(String(input));
    const body = init.body ? JSON.parse(init.body) : null;
    if (url.pathname === "/auth/v1/user") {
      return jsonResponse({
        id: "user-1",
        email: "owner@example.com",
        user_metadata: { name: "Owner" },
      });
    }
    if (url.pathname === "/realtime/v1/api/broadcast") {
      if (Array.isArray(db.relay_broadcasts)) db.relay_broadcasts.push(body);
      if (db.failRelayBroadcast) {
        return jsonResponse({ error: "relay unavailable" }, 503);
      }
      return jsonResponse({ ok: true });
    }
    const table = url.pathname.replace("/rest/v1/", "");
    if (!Object.hasOwn(db, table)) return jsonResponse([]);
    const method = init.method || "GET";
    if (method === "GET") {
      return jsonResponse(filterRows(db[table], url.searchParams));
    }
    if (method === "POST") {
      if (table === "audit_events" && db.failAuditWrite) {
        return jsonResponse({ error: "audit unavailable" }, 503);
      }
      const row = {
        id: body.id || `${table}-${db[table].length + 1}`,
        ...body,
      };
      const conflict = url.searchParams.get("on_conflict");
      if (conflict) {
        const keys = conflict.split(",").map((key) => key.trim());
        const existing = db[table].find((candidate) =>
          keys.every((key) => candidate[key] === row[key]),
        );
        if (existing) {
          Object.assign(existing, row);
          return jsonResponse([existing]);
        }
      }
      db[table].push(row);
      return jsonResponse([row]);
    }
    if (method === "PATCH") {
      const rows = filterRows(db[table], url.searchParams);
      for (const row of rows) Object.assign(row, body);
      return jsonResponse(rows);
    }
    if (method === "DELETE") {
      const rows = filterRows(db[table], url.searchParams);
      const selected = new Set(rows);
      db[table] = db[table].filter((row) => !selected.has(row));
      return jsonResponse(rows);
    }
    return jsonResponse([]);
  };
}

function filterRows(rows, params) {
  return rows.filter((row) => {
    for (const [key, raw] of params.entries()) {
      if (["limit", "on_conflict", "order", "select"].includes(key)) continue;
      if (raw.startsWith("eq.") && String(row[key]) !== raw.slice(3)) {
        return false;
      }
      if (raw.startsWith("in.(")) {
        const allowed = raw
          .slice(4, -1)
          .split(",")
          .map((value) => value.trim());
        if (!allowed.includes(String(row[key]))) return false;
      }
      if (raw.startsWith("not.in.(")) {
        const denied = raw
          .slice(8, -1)
          .split(",")
          .map((value) => value.trim());
        if (denied.includes(String(row[key]))) return false;
      }
      if (raw.startsWith("lt.") && !(String(row[key] || "") < raw.slice(3))) {
        return false;
      }
      if (raw.startsWith("gt.") && !(String(row[key] || "") > raw.slice(3))) {
        return false;
      }
    }
    return true;
  });
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}
