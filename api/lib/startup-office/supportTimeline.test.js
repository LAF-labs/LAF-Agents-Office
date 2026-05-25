const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createStartupOfficeSupportTimelineHandlers,
  timelineAuditEvents,
  timelineRows,
} = require("./supportTimeline");

const membership = Object.freeze({
  team_id: "team-1",
  user_id: "user-1",
});

function baseDeps(overrides = {}) {
  const calls = {
    adminChecks: [],
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
    requireAdminRole(value, message) {
      calls.adminChecks.push({ membership: value, message });
    },
    async requireUser() {
      return {
        membership,
        team: { id: "team-1", name: "Acme", slug: "acme" },
      };
    },
    async safeStartupOfficeRest(table, options) {
      calls.rest.push({ options, table });
      if (table === "audit_events") {
        return [
          {
            action: "startup_office.run_created",
            created_at: "2026-05-25T12:00:00.000Z",
            id: "audit-1",
            metadata: { run_id: "run-1" },
            target_id: "run-1",
            target_type: "run",
          },
        ];
      }
      if (table === "startup_office_runs") {
        return [{ created_at: "2026-05-25T12:01:00.000Z", id: "run-1", status: "running", title: "Idea Validation" }];
      }
      if (table === "startup_office_worker_jobs") {
        return [{ created_at: "2026-05-25T12:02:00.000Z", id: "job-1", run_id: "run-1", status: "running" }];
      }
      if (table === "startup_office_approvals") {
        return [{ id: "approval-1", requested_at: "2026-05-25T12:03:00.000Z", run_id: "run-1", status: "pending", title: "Approve draft" }];
      }
      if (table === "startup_office_receipts") {
        return [{ created_at: "2026-05-25T12:04:00.000Z", event_type: "run.queued", id: "receipt-1", run_id: "run-1", summary: "Queued" }];
      }
      if (table === "startup_office_notifications") {
        return [{ created_at: "2026-05-25T12:05:00.000Z", event_type: "approval.waiting", id: "notification-1", status: "pending" }];
      }
      if (table === "startup_office_outbox_events") {
        return [{ created_at: "2026-05-25T12:06:00.000Z", event_type: "receipt.created", id: "outbox-1", source_id: "receipt-1", source_table: "startup_office_receipts", status: "queued" }];
      }
      return [];
    },
    truncateText(value, max) {
      return String(value || "").slice(0, max);
    },
    writeJSON(_res, status, body) {
      calls.writes.push({ body, status });
    },
    ...overrides,
  };
  return deps;
}

test("support timeline composes user, worker, approval, receipt, notification, and outbox events", async () => {
  const deps = baseDeps();
  const handlers = createStartupOfficeSupportTimelineHandlers(deps);

  await handlers.supportTimeline({ method: "GET", query: { limit: "20" } }, {});

  assert.equal(deps.calls.adminChecks[0].message, "owner or admin role required for support timeline");
  assert.deepEqual(deps.calls.rest.map((call) => call.table), [
    "audit_events",
    "startup_office_runs",
    "startup_office_worker_jobs",
    "startup_office_approvals",
    "startup_office_receipts",
    "startup_office_notifications",
    "startup_office_outbox_events",
  ]);
  assert.equal(deps.calls.rest[0].options.query.team_id, "eq.team-1");
  assert.equal(deps.calls.writes[0].status, 200);
  const timeline = deps.calls.writes[0].body.timeline;
  assert.equal(timeline.team.slug, "acme");
  assert.deepEqual(timeline.entries.map((entry) => entry.source), [
    "outbox",
    "notification",
    "receipt",
    "approval",
    "worker_job",
    "run",
    "audit",
  ]);
  assert.deepEqual(timeline.entries[0], {
    at: "2026-05-25T12:06:00.000Z",
    event_type: "receipt.created",
    id: "outbox:outbox-1",
    reference_id: "outbox-1",
    run_id: "",
    source: "outbox",
    status: "queued",
    summary: "receipt.created",
    target: "startup_office_receipts:receipt-1",
  });
});

test("support timeline filters run-scoped rows and omits global notification noise", async () => {
  const deps = baseDeps();
  const handlers = createStartupOfficeSupportTimelineHandlers(deps);

  await handlers.supportTimeline({ method: "GET", query: { limit: "10", run_id: "run-1" } }, {});

  const timeline = deps.calls.writes[0].body.timeline;
  assert.equal(timeline.filters.run_id, "run-1");
  assert.deepEqual(timeline.entries.map((entry) => entry.source), [
    "receipt",
    "approval",
    "worker_job",
    "run",
    "audit",
  ]);
  assert.equal(deps.calls.rest[2].options.query.run_id, "eq.run-1");
  assert.equal(deps.calls.rest[3].options.query.run_id, "eq.run-1");
  assert.equal(deps.calls.rest[4].options.query.run_id, "eq.run-1");
});

test("support timeline rejects unsupported methods", async () => {
  const handlers = createStartupOfficeSupportTimelineHandlers(baseDeps());

  await assert.rejects(
    () => handlers.supportTimeline({ method: "POST" }, {}),
    (err) => err.status === 405 && err.message === "method not allowed",
  );
});

test("timeline helpers avoid raw payloads and keep stable event shapes", () => {
  const rows = timelineRows(
    [{ id: "job-1", last_error: "provider secret failed", run_id: "run-1", status: "failed", updated_at: "2026-05-25T12:00:00.000Z" }],
    "worker_job",
    "run-1",
    (value, max) => String(value || "").slice(0, max),
  );
  assert.equal(rows[0].summary, "failed");
  assert.equal(rows[0].id, "worker_job:job-1");

  const audits = timelineAuditEvents(
    [{ action: "client.error_reported", created_at: "2026-05-25T12:00:00.000Z", id: "audit-1", metadata: { run_id: "run-1" }, target_id: "fingerprint", target_type: "client_error" }],
    "run-1",
    (value, max) => String(value || "").slice(0, max),
  );
  assert.equal(audits[0].event_type, "client.error_reported");
  assert.equal(audits[0].target, "client_error:fingerprint");
});
