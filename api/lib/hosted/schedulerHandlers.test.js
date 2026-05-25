const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createHostedSchedulerHandlers,
} = require("./schedulerHandlers");

const membership = Object.freeze({
  team_id: "team-1",
  user_id: "user-1",
});

function baseDeps(overrides = {}) {
  const calls = {
    permissions: [],
    rest: [],
    writes: [],
  };
  return {
    calls,
    nowISO() {
      return "2026-05-25T12:00:00.000Z";
    },
    requirePermission(value, permission) {
      calls.permissions.push({ membership: value, permission });
    },
    async requireUser() {
      return { membership };
    },
    async safeStartupOfficeRest(table, options) {
      calls.rest.push({ options, table });
      return [
        {
          available_at: "2026-05-25T11:59:00.000Z",
          completed_at: null,
          created_at: "2026-05-25T11:58:00.000Z",
          id: "job-1",
          loop_slug: "idea-validation",
          metadata: { objective: "Validate pricing", provider: "openai" },
          run_id: "run-1",
          started_at: null,
          status: "queued",
        },
        {
          available_at: "2026-05-25T12:30:00.000Z",
          created_at: "2026-05-25T11:57:00.000Z",
          id: "job-2",
          loop_slug: "offer-package",
          metadata: {},
          run_id: "run-2",
          status: "queued",
        },
        {
          available_at: "2026-05-25T11:00:00.000Z",
          created_at: "2026-05-25T10:57:00.000Z",
          id: "job-3",
          loop_slug: "customer-discovery",
          metadata: {},
          run_id: "run-3",
          status: "dead_letter",
        },
      ];
    },
    writeJSON(_res, status, body) {
      calls.writes.push({ body, status });
    },
    ...overrides,
  };
}

test("scheduler handler maps Startup Office worker jobs to scheduler jobs", async () => {
  const deps = baseDeps();
  const handlers = createHostedSchedulerHandlers(deps);

  await handlers.scheduler({ method: "GET", query: { limit: "7" } }, {});

  assert.equal(deps.calls.permissions[0].permission, "workspace:read");
  assert.deepEqual(deps.calls.rest[0], {
    table: "startup_office_worker_jobs",
    options: {
      query: {
        limit: "7",
        order: "created_at.desc",
        select: "*",
        status: "in.(queued,running,failed,dead_letter)",
        team_id: "eq.team-1",
      },
    },
  });
  assert.equal(deps.calls.writes[0].status, 200);
  assert.equal(deps.calls.writes[0].body.jobs.length, 3);
  assert.deepEqual(deps.calls.writes[0].body.jobs[0], {
    channel: "startup-office",
    due_at: "2026-05-25T11:59:00.000Z",
    id: "job-1",
    kind: "startup_office_worker_job",
    label: "Validate pricing",
    last_run: "",
    next_run: "2026-05-25T11:59:00.000Z",
    provider: "openai",
    run_id: "run-1",
    skill_name: "idea-validation",
    slug: "idea-validation",
    status: "queued",
    workflow_key: "idea-validation",
  });
});

test("scheduler handler filters due jobs when due_only is true", async () => {
  const deps = baseDeps();
  const handlers = createHostedSchedulerHandlers(deps);

  await handlers.scheduler({ method: "GET", query: { due_only: "true" } }, {});

  assert.deepEqual(
    deps.calls.writes[0].body.jobs.map((job) => job.id),
    ["job-1"],
  );
});
