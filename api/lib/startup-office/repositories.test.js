const assert = require("node:assert/strict");
const test = require("node:test");

const { createStartupOfficeRepository } = require("./repositories");

test("startup office repository can write team-scoped audit events", async () => {
  const calls = [];
  const repository = createStartupOfficeRepository({
    HTTPError: class HTTPError extends Error {},
    clamp(value, min, max) {
      return Math.max(min, Math.min(max, value));
    },
    nowISO() {
      return "2026-05-25T00:00:00.000Z";
    },
    async rest(table, options) {
      calls.push({ options, table });
      return [{ id: "audit-1", ...options.body }];
    },
    shortID() {
      return "short";
    },
    slugify(value) {
      return String(value || "").toLowerCase();
    },
    truncateText(value, max) {
      return String(value || "").slice(0, max);
    },
  });

  const event = await repository.createAuditEvent(
    { team_id: "team-1", user_id: "user-1" },
    {
      action: "startup_office.artifact.created",
      metadata: { run_id: "run-1" },
      target_id: "artifact-1",
      target_type: "artifact",
    },
  );

  assert.equal(event.id, "audit-1");
  assert.equal(calls[0].table, "audit_events");
  assert.equal(calls[0].options.method, "POST");
  assert.deepEqual(calls[0].options.body, {
    action: "startup_office.artifact.created",
    actor_user_id: "user-1",
    metadata: { run_id: "run-1" },
    target_id: "artifact-1",
    target_type: "artifact",
    team_id: "team-1",
  });
});
