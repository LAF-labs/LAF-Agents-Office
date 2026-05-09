const assert = require("node:assert/strict");
const test = require("node:test");

process.env.SUPABASE_URL = "https://supabase.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
process.env.SUPABASE_ANON_KEY = "anon";

const handler = require("./[...path].js");

test("hosted task creation queues a runner job with agent-memory/v1", async (t) => {
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
    owner: "builder",
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
    if (table === "projects") {
      if (url.searchParams.get("local_id") === "eq.project-a") {
        return jsonResponse([project]);
      }
      return jsonResponse([project]);
    }
    if (table === "tasks") {
      assert.equal(init.method, "POST");
      assert.equal(body.owner, "builder");
      return jsonResponse([task]);
    }
    if (table === "runner_jobs") {
      if ((init.method || "GET") === "GET") return jsonResponse([]);
      assert.equal(body.agent_memory_packet.version, "agent-memory/v1");
      return jsonResponse([{ ...job, agent_memory_packet: body.agent_memory_packet }]);
    }
    if (table === "runner_job_events") {
      return jsonResponse([{ id: "event-1", kind: body.kind }]);
    }
    return jsonResponse([]);
  };

  const response = await invoke(["tasks"], "POST", {
    action: "create",
    owner: "builder",
    project_id: "project-a",
    title: "Implement hosted job flow",
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.task.id, "task-a");
  assert.equal(response.body.runner_job.status, "queued");
  assert.equal(response.body.runner_job.project_id, "project-a");
  assert.equal(
    response.body.runner_job.agent_memory_packet.version,
    "agent-memory/v1",
  );
  assert.ok(calls.some((call) => call.path === "/rest/v1/runner_job_events"));
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
  assert.equal(lease.body.job.project_id, "project-a");
  assert.equal(lease.body.job.task_id, "task-a");
  assert.equal(lease.body.job.agent_memory_packet.version, "agent-memory/v1");

  const running = await invoke(
    ["runner", "jobs", lease.body.job.id, "events"],
    "POST",
    { kind: "running", message: "started", status: "running" },
    { headers: runnerHeaders },
  );
  assert.equal(running.status, 200);
  assert.equal(db.runner_jobs[0].status, "running");

  const complete = await invoke(
    ["runner", "jobs", lease.body.job.id, "complete"],
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
    if (url.pathname === "/auth/v1/user") {
      return jsonResponse({
        id: "user-1",
        email: "owner@example.com",
        user_metadata: { name: "Owner" },
      });
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
      const rows = filterRows(db[table], url.searchParams);
      for (const row of rows) Object.assign(row, body);
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
