const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createHostedAuditWriter,
} = require("./auditWriter");

const membership = Object.freeze({
  team_id: "team-1",
  user_id: "user-1",
});

function createHTTPError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function writer(overrides = {}) {
  const calls = { rest: [] };
  return {
    calls,
    auditWriter: createHostedAuditWriter({
      createHTTPError,
      redactSensitiveValue(value) {
        return { ...value, redacted: true };
      },
      async rest(table, options) {
        calls.rest.push({ options, table });
        return [{ id: "audit-1", ...options.body }];
      },
      ...overrides,
    }),
  };
}

test("writeAuditEvent stores redacted team-scoped audit rows", async () => {
  const { auditWriter, calls } = writer();

  const event = await auditWriter.writeAuditEvent(
    membership,
    "startup_office.run_created",
    "run",
    "run-1",
    { secret: "value" },
  );

  assert.equal(event.id, "audit-1");
  assert.deepEqual(calls.rest, [
    {
      options: {
        body: {
          action: "startup_office.run_created",
          actor_user_id: "user-1",
          metadata: { redacted: true, secret: "value" },
          target_id: "run-1",
          target_type: "run",
          team_id: "team-1",
        },
        method: "POST",
      },
      table: "audit_events",
    },
  ]);
});

test("writeTeamAuditEvent skips missing team IDs", async () => {
  const { auditWriter, calls } = writer();

  assert.equal(await auditWriter.writeTeamAuditEvent("", "user-1", "action", "team", ""), null);
  assert.deepEqual(calls.rest, []);
});

test("audit write failures are optional unless required", async () => {
  const { auditWriter } = writer({
    async rest() {
      throw new Error("database unavailable");
    },
  });

  assert.equal(
    await auditWriter.writeAuditEvent(membership, "action", "team", "team-1"),
    null,
  );
  await assert.rejects(
    () => auditWriter.writeAuditEvent(membership, "action", "team", "team-1", {}, { required: true }),
    (err) => err.status === 500 && err.message === "audit write failed",
  );
});
