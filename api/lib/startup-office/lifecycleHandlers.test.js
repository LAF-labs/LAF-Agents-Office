const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createStartupOfficeLifecycleHandlers,
} = require("./lifecycleHandlers");

function baseDeps(overrides = {}) {
  const calls = {
    audits: [],
    admin: [],
    rest: [],
    writes: [],
  };
  const deps = {
    calls,
    createHTTPError(status, message) {
      const err = new Error(message);
      err.status = status;
      return err;
    },
    nowISO() {
      return "2026-05-26T00:00:00.000Z";
    },
    async readBody() {
      return {};
    },
    requireAdminRole(membership, message) {
      calls.admin.push({ membership, message });
    },
    async requireUser() {
      return {
        membership: { team_id: "team-1", user_id: "user-1" },
      };
    },
    async safeStartupOfficeRest(table, options) {
      calls.rest.push({ options, table });
      return [{ id: `${table}-1`, ...options.body }];
    },
    truncateText(value, max) {
      return String(value || "").slice(0, max);
    },
    async writeAuditEvent(...args) {
      calls.audits.push(args);
    },
    writeJSON(_res, status, body) {
      calls.writes.push({ body, status });
    },
    ...overrides,
  };
  return deps;
}

test("support access policy is explicit, logged, visible, and revocable", async () => {
  const deps = baseDeps({
    async readBody() {
      return { expires_at: "2026-05-27T00:00:00.000Z", reason: "debug failed run" };
    },
  });
  const handlers = createStartupOfficeLifecycleHandlers(deps);

  await handlers.supportAccess({ method: "GET" }, {});
  assert.equal(deps.calls.writes[0].body.policy.visible_to_owner, true);
  assert.equal(deps.calls.rest[0].table, "startup_office_support_access_events");

  await handlers.supportAccess({ method: "POST" }, {});
  assert.equal(deps.calls.rest[1].options.body.event_type, "granted");
  assert.equal(deps.calls.rest[1].options.body.metadata.visible_to_owner, true);
  assert.equal(deps.calls.audits[0][1], "startup_office.support_access.granted");

  await handlers.supportAccess({ method: "POST" }, {}, "support-1", "revoke");
  assert.equal(deps.calls.rest[2].options.body.event_type, "revoked");
  assert.equal(deps.calls.rest[2].options.body.metadata.parent_event_id, "support-1");
});

test("deletion request requires owner/admin and explicit confirmation", async () => {
  const invalid = createStartupOfficeLifecycleHandlers(baseDeps());
  await assert.rejects(
    () => invalid.deletionRequest({ method: "POST" }, {}),
    (err) => err.status === 400 && err.message === "confirmation must be DELETE STARTUP OFFICE",
  );

  const deps = baseDeps({
    async readBody() {
      return {
        confirmation: "DELETE STARTUP OFFICE",
        reason: "founder requested cancellation",
      };
    },
  });
  const handlers = createStartupOfficeLifecycleHandlers(deps);
  await handlers.deletionRequest({ method: "POST" }, {});

  assert.equal(deps.calls.admin[0].message, "owner or admin role required for deletion");
  assert.equal(deps.calls.rest[0].table, "startup_office_deletion_requests");
  assert.equal(deps.calls.rest[0].options.body.status, "queued");
  assert.equal(deps.calls.writes[0].status, 202);
  assert.equal(deps.calls.audits[0][1], "startup_office.deletion_requested");
});
