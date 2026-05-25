const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createHostedActivityHandlers,
} = require("./activityHandlers");

const membership = Object.freeze({
  team_id: "team-1",
  user_id: "user-1",
});

function baseDeps(overrides = {}) {
  const calls = {
    audits: [],
    permissions: [],
    rest: [],
    writes: [],
  };
  return {
    calls,
    createHTTPError(status, message) {
      const err = new Error(message);
      err.status = status;
      return err;
    },
    nowISO() {
      return "2026-05-25T12:00:00.000Z";
    },
    async readBody() {
      return { kind: "pause", summary: "Human paused all agents" };
    },
    requirePermission(value, permission) {
      calls.permissions.push({ membership: value, permission });
    },
    async requireUser() {
      return { membership };
    },
    async safeStartupOfficeRest(table, options) {
      calls.rest.push({ options, table });
      if (options?.method === "POST") {
        return [{ id: "signal-2", created_at: "2026-05-25T12:00:00.000Z", ...options.body }];
      }
      if (table === "startup_office_receipts") {
        return [{
          actor_slug: "ceo",
          created_at: "2026-05-25T11:00:00.000Z",
          event_type: "loop.completed",
          id: "receipt-1",
          run_id: "run-1",
          summary: "Loop completed",
        }];
      }
      if (table === "startup_office_signals") {
        return [{
          body: "Churn risk",
          created_at: "2026-05-25T10:00:00.000Z",
          id: "signal-1",
          metadata: { channel: "growth", kind: "risk" },
          source: "customer",
          status: "new",
          title: "Customer risk",
          updated_at: "2026-05-25T10:30:00.000Z",
        }];
      }
      if (table === "startup_office_approvals") {
        return [{
          action: "publish_offer",
          decided_at: "2026-05-25T09:00:00.000Z",
          decided_by: "founder",
          decision_note: "Ship it",
          id: "approval-1",
          requested_at: "2026-05-25T08:00:00.000Z",
          risk_level: "medium",
          run_id: "run-2",
          status: "approved",
          title: "Publish offer",
        }];
      }
      if (table === "startup_office_worker_jobs") {
        return [{
          available_at: "2026-05-25T07:00:00.000Z",
          created_at: "2026-05-25T06:00:00.000Z",
          id: "job-1",
          loop_slug: "growth",
          run_id: "run-3",
          status: "dead_letter",
        }];
      }
      if (table === "startup_office_runs") {
        return [{
          created_at: "2026-05-25T05:00:00.000Z",
          id: "run-4",
          loop_id: "loop-1",
          status: "failed",
          summary: "Model call failed",
          title: "Growth loop",
          updated_at: "2026-05-25T05:30:00.000Z",
        }];
      }
      return [];
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
}

test("activity handlers expose Startup Office receipts, decisions, and watchdogs", async () => {
  const deps = baseDeps();
  const handlers = createHostedActivityHandlers(deps);

  await handlers.actions({ method: "GET", query: { limit: "7" } }, {});
  await handlers.decisions({ method: "GET", query: {} }, {});
  await handlers.watchdogs({ method: "GET", query: {} }, {});

  assert.deepEqual(
    deps.calls.rest.map((call) => [call.table, call.options.query.status || ""]),
    [
      ["startup_office_receipts", ""],
      ["startup_office_approvals", "in.(approved,rejected,revision_requested)"],
      ["startup_office_worker_jobs", "in.(failed,dead_letter)"],
      ["startup_office_runs", "eq.failed"],
    ],
  );
  assert.equal(deps.calls.writes[0].body.actions[0].summary, "Loop completed");
  assert.equal(deps.calls.writes[1].body.decisions[0].summary, "Publish offer");
  assert.deepEqual(
    deps.calls.writes[2].body.watchdogs.map((watchdog) => watchdog.target_type).sort(),
    ["run", "worker_job"],
  );
});

test("signals handler reads and stores first-party Startup Office signals", async () => {
  const deps = baseDeps();
  const handlers = createHostedActivityHandlers(deps);

  await handlers.signals({ method: "GET", query: { limit: "3" } }, {});
  await handlers.signals({ method: "POST", query: {} }, {});

  assert.equal(deps.calls.writes[0].body.signals[0].title, "Customer risk");
  assert.deepEqual(deps.calls.rest[0].options.query, {
    limit: "3",
    order: "created_at.desc",
    select: "*",
    status: "neq.archived",
    team_id: "eq.team-1",
  });
  assert.equal(deps.calls.rest[1].table, "startup_office_signals");
  assert.equal(deps.calls.rest[1].options.body.title, "Human paused all agents");
  assert.equal(deps.calls.writes[1].body.signal.id, "signal-2");
  assert.equal(deps.calls.writes[1].body.stored, true);
  assert.equal(deps.calls.audits[0][1], "startup_office.signal.created");
});
