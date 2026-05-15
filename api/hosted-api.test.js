const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

process.env.SUPABASE_URL = "https://supabase.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
process.env.SUPABASE_ANON_KEY = "anon";

const handler = require("./[...path].js");

test("desktop bridge execution migration defines idempotent schema, indexes, and RLS", () => {
  const sql = fs.readFileSync(
    path.join(__dirname, "..", "supabase", "migrations", "20260515_desktop_bridge_execution.sql"),
    "utf8",
  );
  const tables = [
    "bridge_devices",
    "bridge_pairing_codes",
    "project_local_bindings",
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
    "idx_project_local_bindings_project_user",
    "idx_execution_plans_team_status",
    "idx_execution_plans_device_status",
    "idx_execution_plans_task",
    "idx_execution_events_plan_created",
    "idx_execution_receipts_task_created",
  ]) {
    assert.match(sql, new RegExp(`create index if not exists ${index}\\b`));
  }
  assert.match(sql, /check \(device_kind in \('desktop', 'team_bridge'\)\)/);
  assert.match(sql, /check \(status in \('online', 'offline', 'revoked'\)\)/);
  assert.match(sql, /check \(mode in \('laf_model', 'my_bridge', 'team_bridge', 'record_only'\)\)/);
  assert.match(sql, /check \(provider in \('codex', 'claude_code', 'laf_model'\)\)/);
  assert.match(sql, /unique\(signature_key_id, nonce\)/);
  assert.match(sql, /unique\(plan_id, sequence\)/);
  assert.match(sql, /unique\(plan_id\)/);
  assert.match(sql, /local_path_hash text not null/);
  assert.match(sql, /updated_at timestamptz not null default now\(\)/);
  assert.doesNotMatch(sql, /\blocal_path text\b/);
  assert.doesNotMatch(sql, /create table public\./);
  assert.doesNotMatch(sql, /create index (?!if not exists)/);
  assert.match(sql, /drop policy if exists "members can read bridge devices"/);
  assert.match(sql, /drop policy if exists "members can read execution receipts"/);
});

test("hosted team bridge task creation queues a runner job with agent-memory/v1", async (t) => {
  const project = {
    id: "11111111-1111-4111-8111-111111111111",
    local_id: "project-a",
    name: "Project A",
    team_id: "team-1",
    github_repo_url: "https://github.com/acme/project-a",
  };
  const task = {
    id: "22222222-2222-4222-8222-222222222222",
    local_id: "task-a",
    project_id: project.id,
    team_id: "team-1",
    title: "Implement hosted job flow",
    status: "in_progress",
    owner: "be",
    execution_mode: "local_worktree",
  };
  const job = {
    id: "33333333-3333-4333-8333-333333333333",
    team_id: "team-1",
    project_id: project.id,
    task_id: task.id,
    status: "queued",
    execution_mode: "local_worktree",
    agent_memory_packet: {
      version: "agent-memory/v1",
      task: { id: "task-a" },
    },
  };
  const calls = [];
  const oldFetch = global.fetch;
  t.after(() => {
    global.fetch = oldFetch;
  });
  global.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ body, method: init.method || "GET", path: url.pathname, url });

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
        {
          role: "owner",
          status: "active",
          team_id: "team-1",
          user_id: "user-1",
        },
      ]);
    }
    if (table === "workspace_billing") {
      return jsonResponse([]);
    }
    if (table === "runners") {
      return jsonResponse([
        {
          id: "runner-1",
          capabilities: { provider_runtimes: ["codex"] },
          status: "connected",
          team_id: "team-1",
        },
      ]);
    }
    if (table === "runner_capabilities") {
      return jsonResponse([]);
    }
    if (table === "projects") {
      if (url.searchParams.get("local_id") === "eq.project-a") {
        return jsonResponse([project]);
      }
      return jsonResponse([project]);
    }
    if (table === "tasks") {
      if ((init.method || "GET") === "GET") return jsonResponse([]);
      assert.equal(init.method, "POST");
      assert.equal(body.owner, "be");
      assert.equal(body.model_mode, "team_bridge");
      return jsonResponse([{ ...task, model_mode: body.model_mode }]);
    }
    if (table === "wiki_article_index") {
      return jsonResponse([
        {
          article_path: "team/projects/project-a.md",
          decisions: ["Use runner jobs as the execution boundary."],
          excerpt: "Project memory excerpt",
          open_questions: ["How should retries be surfaced?"],
          risks: ["Runner may be offline."],
        },
      ]);
    }
    if (table === "delivery_receipts") {
      return jsonResponse([]);
    }
    if (table === "runner_jobs") {
      if ((init.method || "GET") === "GET") return jsonResponse([]);
      assert.equal(body.agent_memory_packet.version, "agent-memory/v1");
      assert.equal(body.agent_memory_packet.task.owner, "be");
      assert.equal(body.agent_memory_packet.decisions.length, 1);
      return jsonResponse([{ ...job, agent_memory_packet: body.agent_memory_packet }]);
    }
    if (table === "runner_job_events") {
      return jsonResponse([{ id: "event-1", kind: body.kind }]);
    }
    return jsonResponse([]);
  };

  const response = await invoke(["tasks"], "POST", {
    action: "create",
    model_mode: "team_bridge",
    owner: "be",
    project_id: "project-a",
    title: "Implement hosted job flow",
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.task.id, "task-a");
  assert.equal(response.body.runner_job.status, "queued");
  assert.equal(response.body.runner_job.project_id, "project-a");
  assert.equal(response.body.runner_job.job_id, "33333333-3333-4333-8333-333333333333");
  assert.equal(
    response.body.runner_job.agent_memory_packet.version,
    "agent-memory/v1",
  );
  assert.equal(response.body.runner_job.agent_memory_packet.decisions[0].text, "Use runner jobs as the execution boundary.");
  assert.ok(calls.some((call) => call.path === "/rest/v1/runner_job_events"));
});

test("hosted non-team bridge tasks do not queue runner jobs", async (t) => {
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
    runner_capabilities: [],
    runner_job_events: [],
    runner_jobs: [],
    runners: [],
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
  assert.equal(created.body.runner_job, null);

  const reassigned = await invoke(["tasks"], "POST", {
    action: "reassign",
    id: "task-existing",
    owner: "be",
  });

  assert.equal(reassigned.status, 200);
  assert.equal(reassigned.body.task.model_mode, "my_bridge");
  assert.equal(reassigned.body.runner_job, null);
  assert.equal(db.runner_jobs.length, 0);
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

test("hosted auth login returns readable upstream errors", async (t) => {
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
  assert.equal(response.body.error, "Invalid login credentials");
});

test("hosted auth signup returns readable upstream errors", async (t) => {
  const oldFetch = global.fetch;
  t.after(() => {
    global.fetch = oldFetch;
  });
  global.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname === "/auth/v1/signup") {
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
  assert.equal(
    response.body.error,
    "Unable to validate email address: invalid format",
  );
});

test("hosted auth rejects malformed JSON as a bad request", async () => {
  const response = await invoke(
    ["auth", "login"],
    "POST",
    "{not-json",
    { headers: { authorization: "" } },
  );

  assert.equal(response.status, 400);
  assert.equal(response.body.error, "invalid JSON body");
});

test("hosted runner can register, heartbeat, lease, report, and complete", async (t) => {
  const db = {
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
    runner_capabilities: [],
    runner_job_events: [],
    runner_jobs: [
      {
        agent_memory_packet: {
          task: { id: "task-a" },
          version: "agent-memory/v1",
        },
        execution_mode: "local_worktree",
        id: "33333333-3333-4333-8333-333333333333",
        project_id: "11111111-1111-4111-8111-111111111111",
        provider_kind: "codex",
        status: "queued",
        task_id: "22222222-2222-4222-8222-222222222222",
        team_id: "team-1",
      },
    ],
    runners: [],
    tasks: [
      {
        id: "22222222-2222-4222-8222-222222222222",
        local_id: "task-a",
        project_id: "11111111-1111-4111-8111-111111111111",
        status: "in_progress",
        team_id: "team-1",
        title: "Implement hosted job flow",
      },
    ],
    teams: [{ id: "team-1", name: "Team One", slug: "team-one" }],
  };
  const oldFetch = global.fetch;
  t.after(() => {
    global.fetch = oldFetch;
  });
  global.fetch = hostedFetch(db);

  const registration = await invoke(["runner", "register"], "POST", {
    capabilities: {
      execution_modes: ["local_worktree"],
      git_available: true,
      provider_runtimes: ["codex"],
    },
    name: "Local Mac",
    team_id: "team-1",
  });
  assert.equal(registration.status, 200);
  assert.equal(registration.body.runner.token_hash, undefined);
  assert.match(registration.body.runner_token, /^laf_runner_/);
  assert.equal(db.runners[0].token_hash.length, 64);

  const runnerHeaders = {
    authorization: `Bearer ${registration.body.runner_token}`,
  };
  const heartbeat = await invoke(
    ["runner", "heartbeat"],
    "POST",
    { status: "connected" },
    { headers: runnerHeaders },
  );
  assert.equal(heartbeat.status, 200);
  assert.equal(heartbeat.body.runner.status, "connected");

  const queryTokenHeartbeat = await invoke(
    ["runner", "heartbeat"],
    "POST",
    { status: "connected" },
    {
      headers: { authorization: "" },
      query: { runner_token: registration.body.runner_token },
    },
  );
  assert.equal(queryTokenHeartbeat.status, 401);

  const capabilities = await invoke(
    ["runner", "capabilities"],
    "POST",
    {
      capabilities: {
        execution_modes: ["local_worktree"],
        gh_authenticated: true,
        gh_available: true,
        git_available: true,
        provider_runtimes: ["codex"],
      },
    },
    { headers: runnerHeaders },
  );
  assert.equal(capabilities.status, 200);
  assert.equal(db.runner_capabilities[0].gh_authenticated, true);

  const lease = await invoke(
    ["runner", "jobs", "lease"],
    "POST",
    { lease_seconds: 120 },
    { headers: runnerHeaders },
  );
  assert.equal(lease.status, 200);
  assert.equal(lease.body.job.status, "leased");
  assert.equal(lease.body.job.job_id, lease.body.job.id);
  assert.equal(lease.body.job.project_id, "project-a");
  assert.equal(lease.body.job.required_provider, "codex");
  assert.equal(lease.body.job.task_id, "task-a");
  assert.equal(lease.body.job.agent_memory_packet.version, "agent-memory/v1");

  const running = await invoke(
    ["runner", "jobs", lease.body.job.job_id, "events"],
    "POST",
    { kind: "running", message: "started", status: "running" },
    { headers: runnerHeaders },
  );
  assert.equal(running.status, 200);
  assert.equal(db.runner_jobs[0].status, "running");

  const renewed = await invoke(
    ["runner", "jobs", lease.body.job.job_id, "renew"],
    "POST",
    { lease_seconds: 120 },
    { headers: runnerHeaders },
  );
  assert.equal(renewed.status, 200);
  assert.equal(renewed.body.event.kind, "renewed");

  db.beforeRunnerJobPatch = (_url, body) => {
    if (body.status === "succeeded") {
      db.runner_jobs[0].runner_id = "runner-other";
      db.beforeRunnerJobPatch = null;
    }
  };
  const staleComplete = await invoke(
    ["runner", "jobs", lease.body.job.job_id, "complete"],
    "POST",
    { status: "succeeded" },
    { headers: runnerHeaders },
  );
  assert.equal(staleComplete.status, 409);
  assert.equal(db.runner_jobs[0].status, "running");
  db.runner_jobs[0].runner_id = db.runners[0].id;

  const complete = await invoke(
    ["runner", "jobs", lease.body.job.job_id, "complete"],
    "POST",
    {
      delivery_status: "open",
      delivery_summary: "PR opened and checks passed.",
      delivery_url: "https://github.com/acme/project-a/pull/7",
      status: "succeeded",
      worktree_branch: "laf/task-a",
      worktree_path: "/tmp/laf/task-a",
    },
    { headers: runnerHeaders },
  );
  assert.equal(complete.status, 200);
  assert.equal(complete.body.job.status, "succeeded");
  assert.equal(complete.body.task.delivery_url, "https://github.com/acme/project-a/pull/7");
  assert.equal(db.delivery_receipts.length, 1);
  assert.equal(db.delivery_receipts[0].delivery_summary, "PR opened and checks passed.");
  assert.ok(db.runner_job_events.some((event) => event.kind === "leased"));
  assert.ok(db.runner_job_events.some((event) => event.kind === "succeeded"));
});

test("hosted runner revoke blocks runner token and expires active jobs", async (t) => {
  const db = {
    memberships: [
      {
        role: "owner",
        status: "active",
        team_id: "team-1",
        user_id: "user-1",
      },
    ],
    runner_jobs: [
      {
        id: "runner-job-1",
        runner_id: "",
        status: "leased",
        team_id: "team-1",
      },
    ],
    runners: [],
  };
  const oldFetch = global.fetch;
  t.after(() => {
    global.fetch = oldFetch;
  });
  global.fetch = hostedFetch(db);

  const registration = await invoke(["runner", "register"], "POST", {
    name: "Windows PC",
    team_id: "team-1",
  });
  assert.equal(registration.status, 200);
  db.runner_jobs[0].runner_id = registration.body.runner.id;

  const revoke = await invoke(["runner", "revoke"], "POST", {
    runner_id: registration.body.runner.id,
  });
  assert.equal(revoke.status, 200);
  assert.equal(revoke.body.runner.status, "revoked");
  assert.equal(db.runners[0].status, "revoked");
  assert.equal(db.runner_jobs[0].status, "expired");
  assert.equal(db.runner_jobs[0].runner_id, null);

  const heartbeat = await invoke(
    ["runner", "heartbeat"],
    "POST",
    { status: "connected" },
    { headers: { authorization: `Bearer ${registration.body.runner_token}` } },
  );
  assert.equal(heartbeat.status, 401);
});

test("hosted runner pairs with short setup code", async (t) => {
  const db = {
    memberships: [
      {
        role: "owner",
        status: "active",
        team_id: "team-1",
        user_id: "user-1",
      },
    ],
    runner_pairing_codes: [],
    runners: [],
    teams: [{ id: "team-1", name: "Team One", slug: "team-one" }],
  };
  const oldFetch = global.fetch;
  t.after(() => {
    global.fetch = oldFetch;
  });
  global.fetch = hostedFetch(db);

  const start = await invoke(["runner", "pairing", "start"], "POST", {
    api_url: "https://office.test/api",
  });
  assert.equal(start.status, 200);
  assert.match(start.body.pairing.code, /^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);
  assert.equal(start.body.api_url, "https://office.test/api");
  assert.match(start.body.commands.connect, /laf-runner pair/);
  assert.equal(db.runner_pairing_codes[0].status, "pending");
  assert.equal(db.runner_pairing_codes[0].code_hash.length, 64);

  const claim = await invoke(
    ["runner", "pairing", "claim"],
    "POST",
    {
      capabilities: {
        execution_modes: ["local_worktree"],
        git_available: true,
        provider_runtimes: ["codex"],
      },
      code: start.body.pairing.code,
      name: "Windows PC",
    },
    { headers: { authorization: "" } },
  );
  assert.equal(claim.status, 200);
  assert.equal(claim.body.runner.name, "Windows PC");
  assert.equal(claim.body.runner.token_hash, undefined);
  assert.match(claim.body.runner_token, /^laf_runner_/);
  assert.equal(db.runners[0].team_id, "team-1");
  assert.equal(db.runner_pairing_codes[0].status, "claimed");
  assert.equal(db.runner_pairing_codes[0].claimed_runner_id, db.runners[0].id);

  const duplicate = await invoke(
    ["runner", "pairing", "claim"],
    "POST",
    { code: start.body.pairing.code },
    { headers: { authorization: "" } },
  );
  assert.equal(duplicate.status, 410);
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
  assert.match(start.body.pairing.code, /^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);
  assert.match(start.body.commands.pair, /laf-bridge pair/);
  assert.equal(db.bridge_pairing_codes[0].status, "pending");
  assert.equal(db.bridge_pairing_codes[0].code_hash.length, 64);

  const claim = await invoke(
    ["bridge", "pairing", "claim"],
    "POST",
    {
      capabilities: {
        provider_runtimes: ["codex"],
        workspace_root: "/Users/owner/secret-project",
      },
      code: start.body.pairing.code,
      device_label: "Kim's MacBook",
      platform: "darwin",
      public_key: "pub-ed25519",
    },
    { headers: { authorization: "" } },
  );
  assert.equal(claim.status, 200);
  assert.match(claim.body.bridge_token, /^laf_bridge_/);
  assert.equal(claim.body.device.device_label, "Kim's MacBook");
  assert.equal(claim.body.device.token_hash, undefined);
  assert.equal(db.bridge_devices[0].token_hash.length, 64);
  assert.equal(db.bridge_devices[0].capabilities.workspace_root, undefined);
  assert.equal(db.bridge_pairing_codes[0].claimed_device_id, db.bridge_devices[0].id);

  const availability = await invoke(["model", "availability"], "GET");
  assert.equal(availability.status, 200);
  assert.equal(availability.body.my_bridge.available, true);
  assert.equal(availability.body.allowed_modes.includes("my_bridge"), true);

  const heartbeat = await invoke(
    ["bridge", "devices", db.bridge_devices[0].id, "heartbeat"],
    "POST",
    {
      capabilities: {
        provider_runtimes: ["codex"],
        local_path: "/tmp/nope",
      },
      status: "online",
    },
    { headers: { authorization: `Bearer ${claim.body.bridge_token}` } },
  );
  assert.equal(heartbeat.status, 200);
  assert.equal(heartbeat.body.device.status, "online");
  assert.equal(db.bridge_devices[0].capabilities.local_path, undefined);

  const devices = await invoke(["bridge", "devices"], "GET");
  assert.equal(devices.status, 200);
  assert.equal(devices.body.devices.length, 1);
  assert.equal(devices.body.devices[0].token_hash, undefined);

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

test("hosted project local bindings CRUD hashes local metadata", async (t) => {
  const db = {
    bridge_devices: [
      {
        id: "bridge-device-1",
        status: "online",
        team_id: "team-1",
        user_id: "user-1",
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
    project_local_bindings: [],
    projects: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        local_id: "project-a",
        name: "Project A",
        team_id: "team-1",
      },
    ],
  };
  const oldFetch = global.fetch;
  t.after(() => {
    global.fetch = oldFetch;
  });
  global.fetch = hostedFetch(db);

  const created = await invoke(["projects", "project-a", "local-bindings"], "POST", {
    device_id: "bridge-device-1",
    git_remote_url: "https://github.com/laf-labs/project-a",
    local_path: "/Users/kim/src/project-a",
    trusted: true,
  });
  assert.equal(created.status, 200);
  assert.equal(created.body.binding.display_name, "project-a");
  assert.equal(created.body.binding.trusted, true);
  assert.equal(db.project_local_bindings[0].local_path_hash.length, 64);
  assert.equal(db.project_local_bindings[0].local_path, undefined);
  assert.equal(db.project_local_bindings[0].git_remote_hash.length, 64);

  const listed = await invoke(["projects", "project-a", "local-bindings"], "GET");
  assert.equal(listed.status, 200);
  assert.equal(listed.body.bindings.length, 1);
  assert.equal(listed.body.bindings[0].project_id, "11111111-1111-4111-8111-111111111111");

  const removed = await invoke(
    ["projects", "project-a", "local-bindings", db.project_local_bindings[0].id],
    "DELETE",
    {},
  );
  assert.equal(removed.status, 200);
  assert.equal(removed.body.deleted, true);
  assert.equal(db.project_local_bindings.length, 0);
});

test("hosted project local bindings require own bridge permission", async (t) => {
  const db = {
    bridge_devices: [],
    memberships: [
      {
        role: "viewer",
        status: "active",
        team_id: "team-1",
        user_id: "user-1",
      },
    ],
    project_local_bindings: [],
    projects: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        local_id: "project-a",
        name: "Project A",
        team_id: "team-1",
      },
    ],
  };
  const oldFetch = global.fetch;
  t.after(() => {
    global.fetch = oldFetch;
  });
  global.fetch = hostedFetch(db);

  const response = await invoke(["projects", "project-a", "local-bindings"], "GET");
  assert.equal(response.status, 403);
  assert.equal(response.body.error, "permission required: bridge:read_own");
});

test("hosted my_bridge execution plan create/get/cancel signs and redacts prompt", async (t) => {
  const db = {
    bridge_devices: [
      {
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
    project_local_bindings: [
      {
        id: "binding-1",
        device_id: "bridge-device-1",
        project_id: "11111111-1111-4111-8111-111111111111",
        team_id: "team-1",
        trusted: true,
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
    binding_id: "binding-1",
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
      code: start.body.pairing.code,
      device_label: "Kim's MacBook",
      platform: "darwin",
      public_key: "pub-ed25519",
    },
    { headers: { authorization: "" } },
  );
  assert.equal(claim.status, 200);
  const token = claim.body.bridge_token;
  const device = db.bridge_devices[0];
  const planID = "11111111-2222-4333-8444-555555555555";
  db.execution_plans.push({
    actor_user_id: "user-1",
    binding_id: "binding-1",
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
        nested: { bridge_token: token },
      },
      sequence: 1,
    },
    { headers: { authorization: `Bearer ${token}` } },
  );
  assert.equal(event.status, 200);
  assert.equal(event.body.event.payload.line, "using Bearer [REDACTED]");
  assert.equal(event.body.event.payload.nested.bridge_token, "[REDACTED]");

  const events = await invoke(["execution", "plans", planID, "events"], "GET");
  assert.equal(events.status, 200);
  assert.equal(events.body.events.length, 1);
  assert.equal(events.body.events[0].payload.nested.bridge_token, "[REDACTED]");

  const completed = await invoke(
    ["execution", "plans", planID, "complete"],
    "POST",
    {
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

test("hosted execution plan create survives relay publish failure", async (t) => {
  const db = {
    bridge_devices: [
      {
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
    project_local_bindings: [
      {
        id: "binding-1",
        device_id: "bridge-device-1",
        project_id: "11111111-1111-4111-8111-111111111111",
        team_id: "team-1",
        trusted: true,
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
    binding_id: "binding-1",
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

test("hosted my_bridge execution plan requires trusted binding and own bridge execute permission", async (t) => {
  const db = {
    bridge_devices: [
      {
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
    project_local_bindings: [
      {
        id: "binding-1",
        device_id: "bridge-device-1",
        project_id: "11111111-1111-4111-8111-111111111111",
        team_id: "team-1",
        trusted: false,
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
  const untrusted = await invoke(["execution", "plans"], "POST", {
    binding_id: "binding-1",
    device_id: "bridge-device-1",
    message: "Implement and run tests",
    mode: "my_bridge",
    provider: "codex",
    task_id: "task-a",
  });
  assert.equal(untrusted.status, 400, JSON.stringify(untrusted.body));
  assert.equal(
    untrusted.body.error,
    "my_bridge requires a trusted binding for project/device",
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
    runner_capabilities: [],
    runners: [],
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

test("hosted team bridge mode requires a connected runner with supported CLI", async (t) => {
  const db = {
    memberships: [
      {
        role: "owner",
        status: "active",
        team_id: "team-1",
        user_id: "user-1",
      },
    ],
    runner_capabilities: [],
    runners: [
      {
        id: "runner-1",
        capabilities: {},
        status: "connected",
        team_id: "team-1",
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
  assert.equal(withoutCLI.body.my_bridge.reason, "no paired desktop bridge detected");
  assert.equal(withoutCLI.body.team_bridge.available, false);
  assert.equal(withoutCLI.body.team_bridge.reason, "no supported local CLI detected");

  db.runner_capabilities.push({
    cli_details: { codex: { detected: "true" } },
    provider_runtimes: ["codex"],
    runner_id: "runner-1",
  });
  const withCLI = await invoke(["model", "availability"], "GET");
  assert.equal(withCLI.status, 200);
  assert.equal(withCLI.body.team_bridge.available, true);
  assert.equal(withCLI.body.allowed_modes.includes("team_bridge"), true);
  assert.equal(withCLI.body.allowed_modes.includes("my_bridge"), false);
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
    runner_capabilities: [],
    runner_job_events: [],
    runner_jobs: [],
    runners: [],
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
    title: "Run with unavailable runner",
  });

  assert.equal(response.status, 403);
  assert.equal(response.body.error, "no paired desktop bridge detected");
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
  db.skills[0].required_permissions = ["runner:manage"];
  const missingManifestPermission = await invoke(["skills", "deploy", "invoke"], "POST", {});
  assert.equal(missingManifestPermission.status, 403);
  assert.equal(missingManifestPermission.body.error, "permission required: runner:manage");
  assert.equal(db.skills[0].usage_count, 0);
});

async function invoke(path, method, body, options = {}) {
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
    setHeader() {},
    end(chunk) {
      if (chunk) chunks.push(Buffer.from(chunk));
    },
  };
  await handler(req, res);
  const text = Buffer.concat(chunks).toString("utf8");
  return {
    body: text ? JSON.parse(text) : null,
    status: res.statusCode,
  };
}

function hostedFetch(db) {
  return async (input, init = {}) => {
    const url = new URL(String(input));
    const body = init.body ? JSON.parse(init.body) : null;
    if (url.pathname === "/rest/v1/rpc/claim_runner_job") {
      const runner = db.runners.find(
        (row) =>
          row.id === body.p_runner_id &&
          row.team_id === body.p_team_id &&
          row.status !== "revoked" &&
          !row.revoked_at,
      );
      if (!runner) return jsonResponse([]);
      const modes = body.p_execution_modes || [];
      const providers = body.p_provider_runtimes || [];
      const job = db.runner_jobs.find((candidate) => {
        if (candidate.team_id !== body.p_team_id) return false;
        if (!["queued", "expired"].includes(candidate.status)) return false;
        if (
          candidate.execution_mode &&
          modes.length > 0 &&
          !modes.includes(candidate.execution_mode)
        ) {
          return false;
        }
        if (candidate.provider_kind && !providers.includes(candidate.provider_kind)) {
          return false;
        }
        return true;
      });
      if (!job) return jsonResponse([]);
      Object.assign(job, {
        attempts: (job.attempts || 0) + 1,
        lease_expires_at: new Date(
          Date.now() + Number(body.p_lease_seconds || 300) * 1000,
        ).toISOString(),
        runner_id: runner.id,
        status: "leased",
        updated_at: new Date().toISOString(),
      });
      return jsonResponse([job]);
    }
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
      if (table === "runner_jobs" && typeof db.beforeRunnerJobPatch === "function") {
        db.beforeRunnerJobPatch(url, body);
      }
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
