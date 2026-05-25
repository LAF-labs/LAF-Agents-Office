const assert = require("node:assert/strict");
const test = require("node:test");

const { createHostedHealthHandlers } = require("./healthHandlers");

function baseDeps(overrides = {}) {
  const calls = { auth: [], rest: [], writes: [] };
  return {
    calls,
    async authFetch(path) {
      calls.auth.push(path);
      return { external: {} };
    },
    env: {
      LAF_OFFICE_OPENAI_API_KEY: "openai-key",
      LAF_OUTBOX_EMAIL_PROVIDER: "in_app",
      NODE_ENV: "production",
    },
    nowISO() {
      return "2026-05-26T00:00:00.000Z";
    },
    async rest(table, options) {
      calls.rest.push({ options, table });
      return [];
    },
    writeJSON(_res, status, body) {
      calls.writes.push({ body, status });
    },
    ...overrides,
  };
}

test("basic health remains a cheap liveness response", async () => {
  const deps = baseDeps();
  const handlers = createHostedHealthHandlers(deps);

  await handlers.health({ method: "GET" }, {});

  assert.deepEqual(deps.calls.writes[0], {
    body: {
      service: "laf-hosted-api",
      status: "ok",
    },
    status: 200,
  });
  assert.deepEqual(deps.calls.rest, []);
  assert.deepEqual(deps.calls.auth, []);
});

test("dependency health checks core Supabase, worker, outbox, and config dependencies", async () => {
  const deps = baseDeps();
  const handlers = createHostedHealthHandlers(deps);

  await handlers.dependencies({ method: "GET" }, {});

  assert.equal(deps.calls.writes[0].status, 200);
  assert.equal(deps.calls.writes[0].body.status, "ok");
  assert.deepEqual(
    deps.calls.rest.map((call) => [call.table, call.options.query.select]),
    [
      ["teams", "id"],
      ["startup_office_runs", "id,status,updated_at"],
      ["startup_office_worker_jobs", "id,status,updated_at"],
      ["startup_office_outbox_events", "id,status,updated_at"],
    ],
  );
  assert.deepEqual(deps.calls.auth, ["settings"]);
  assert.deepEqual(
    deps.calls.writes[0].body.dependencies.map((check) => check.name),
    [
      "supabase_rest",
      "supabase_auth",
      "startup_office_runs_table",
      "startup_office_worker_jobs_table",
      "startup_office_outbox_events_table",
      "startup_office_model_config",
      "outbox_email_config",
    ],
  );
});

test("dependency health returns 503 without leaking upstream details", async () => {
  const deps = baseDeps({
    async rest(table) {
      if (table === "startup_office_worker_jobs") {
        const err = new Error("sensitive RLS or connection details");
        err.status = 500;
        throw err;
      }
      return [];
    },
  });
  const handlers = createHostedHealthHandlers(deps);

  await handlers.dependencies({ method: "GET" }, {});

  const body = deps.calls.writes[0].body;
  assert.equal(deps.calls.writes[0].status, 503);
  assert.equal(body.status, "degraded");
  assert.deepEqual(
    body.dependencies.find((check) => check.name === "startup_office_worker_jobs_table"),
    {
      checked_at: body.dependencies.find((check) => check.name === "startup_office_worker_jobs_table").checked_at,
      latency_ms: body.dependencies.find((check) => check.name === "startup_office_worker_jobs_table").latency_ms,
      message: "dependency returned 500",
      name: "startup_office_worker_jobs_table",
      status: "degraded",
    },
  );
});

test("dependency health marks unsafe production model config degraded", async () => {
  const deps = baseDeps({
    env: {
      LAF_OFFICE_STARTUP_OFFICE_AI_PROVIDER: "fake",
      NODE_ENV: "production",
    },
  });
  const handlers = createHostedHealthHandlers(deps);

  await handlers.dependencies({ method: "GET" }, {});

  const model = deps.calls.writes[0].body.dependencies.find(
    (check) => check.name === "startup_office_model_config",
  );
  assert.equal(deps.calls.writes[0].status, 503);
  assert.equal(model.status, "degraded");
  assert.equal(model.provider, "fake");
});
