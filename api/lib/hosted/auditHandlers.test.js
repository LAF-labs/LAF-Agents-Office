const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createHostedAuditHandlers,
} = require("./auditHandlers");

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
  const deps = {
    calls,
    clamp(value, min, max) {
      return Math.min(max, Math.max(min, value));
    },
    createHTTPError(status, message) {
      const err = new Error(message);
      err.status = status;
      return err;
    },
    requirePermission(value, permission) {
      calls.permissions.push({ membership: value, permission });
    },
    async requireUser() {
      return { membership };
    },
    async rest(table, options) {
      calls.rest.push({ options, table });
      return [
        {
          action: "startup_office.run_created",
          actor_user_id: "user-1",
          created_at: "2026-05-25T00:00:00.000Z",
          id: "audit-1",
          metadata: { loop_slug: "idea-validation" },
          target_id: "run-1",
          target_type: "run",
        },
      ];
    },
    writeJSON(_res, status, body) {
      calls.writes.push({ body, status });
    },
    ...overrides,
  };
  return deps;
}

test("audit events handler lists team-scoped audit rows", async () => {
  const deps = baseDeps();
  const handlers = createHostedAuditHandlers(deps);

  await handlers.auditEvents(
    { method: "GET", query: { before: "2026-05-25T01:02:03Z", limit: "999" } },
    {},
  );

  assert.equal(deps.calls.permissions[0].permission, "audit:read");
  assert.equal(deps.calls.rest[0].table, "audit_events");
  assert.deepEqual(deps.calls.rest[0].options.query, {
    created_at: "lt.2026-05-25T01:02:03.000Z",
    limit: "500",
    order: "created_at.desc",
    select: "*",
    team_id: "eq.team-1",
  });
  assert.equal(deps.calls.writes[0].status, 200);
  assert.deepEqual(deps.calls.writes[0].body.events[0], {
    action: "startup_office.run_created",
    actor_user_id: "user-1",
    created_at: "2026-05-25T00:00:00.000Z",
    id: "audit-1",
    metadata: { loop_slug: "idea-validation" },
    target_id: "run-1",
    target_type: "run",
  });
});

test("audit events handler rejects invalid before cursors", async () => {
  const handlers = createHostedAuditHandlers(baseDeps());

  await assert.rejects(
    () => handlers.auditEvents({ method: "GET", query: { before: "yesterday" } }, {}),
    (err) => err.status === 400 && err.message === "before must be an ISO-8601 timestamp",
  );
});
