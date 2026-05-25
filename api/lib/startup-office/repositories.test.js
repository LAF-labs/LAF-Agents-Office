const assert = require("node:assert/strict");
const test = require("node:test");

const { createStartupOfficeRepository } = require("./repositories");

function repositoryDeps(rest, HTTPError = class HTTPError extends Error {}) {
  return {
    HTTPError,
    clamp(value, min, max) {
      return Math.max(min, Math.min(max, value));
    },
    nowISO() {
      return "2026-05-25T00:00:00.000Z";
    },
    rest,
    shortID() {
      return "short";
    },
    slugify(value) {
      return String(value || "").toLowerCase();
    },
    truncateText(value, max) {
      return String(value || "").slice(0, max);
    },
  };
}

test("startup office repository can write team-scoped audit events", async () => {
  const calls = [];
  const repository = createStartupOfficeRepository(repositoryDeps(
    async function rest(table, options) {
      calls.push({ options, table });
      return [{ id: "audit-1", ...options.body }];
    },
  ));

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

test("repository returns an existing run when idempotent create conflicts", async () => {
  class HTTPError extends Error {
    constructor(status, message) {
      super(message);
      this.status = status;
    }
  }
  const calls = [];
  const repository = createStartupOfficeRepository(repositoryDeps(
    async function rest(table, options) {
      calls.push({ options, table });
      if (table === "startup_office_runs" && options.method === "POST") {
        throw new HTTPError(409, "duplicate idempotency key");
      }
      return [{
        id: "run-existing",
        idempotency_key: "loop-run-key",
        status: "queued",
        team_id: "team-1",
      }];
    },
    HTTPError,
  ));

  const run = await repository.createRun(
    { team_id: "team-1", user_id: "user-1" },
    {
      idempotency_key: "loop-run-key",
      inputs: {},
      objective: "Validate idea",
      title: "Idea Validation",
    },
  );

  assert.equal(run.id, "run-existing");
  assert.equal(calls[0].table, "startup_office_runs");
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[1].table, "startup_office_runs");
  assert.equal(calls[1].options.query.idempotency_key, "eq.loop-run-key");
});
