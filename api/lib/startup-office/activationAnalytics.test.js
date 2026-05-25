const assert = require("node:assert/strict");
const test = require("node:test");

const {
  recordStartupOfficeApprovalActivation,
  recordStartupOfficeExportActivation,
  recordStartupOfficeRunActivation,
  startupOfficeActivationSnapshot,
} = require("./activationAnalytics");

const membership = Object.freeze({
  team_id: "team-1",
  user_id: "user-1",
});

test("activation snapshot reports first loop, approval, repeat loop, and export progress", () => {
  const snapshot = startupOfficeActivationSnapshot([
    { id: "event-1", milestone: "first_loop_run", source_id: "run-1" },
    { id: "event-2", milestone: "first_approval_decision", source_id: "approval-1" },
  ]);

  assert.equal(snapshot.activated, false);
  assert.equal(snapshot.completed_count, 2);
  assert.equal(snapshot.required_count, 4);
  assert.equal(snapshot.next_milestone, "second_loop_run");
  assert.deepEqual(
    snapshot.milestones.map((item) => [item.milestone, item.completed]),
    [
      ["first_loop_run", true],
      ["first_approval_decision", true],
      ["second_loop_run", false],
      ["first_export", false],
    ],
  );
});

test("run activation records first and second loop milestones idempotently", async () => {
  const calls = [];
  await recordStartupOfficeRunActivation({
    membership,
    runID: "run-2",
    async safeStartupOfficeRest(table, options) {
      calls.push({ options, table });
      if (table === "startup_office_activation_events" && !options.method) return [];
      if (table === "startup_office_runs") {
        return [{ id: "run-1" }, { id: "run-2" }];
      }
      return [{ id: `event-${calls.length}`, ...options.body }];
    },
  });

  const writes = calls.filter((call) => call.options.method === "POST");
  assert.deepEqual(writes.map((call) => call.options.body.milestone), [
    "first_loop_run",
    "second_loop_run",
  ]);
  assert.equal(writes[0].options.query.on_conflict, "team_id,milestone");
  assert.equal(writes[1].options.body.source_id, "run-2");
});

test("approval and export activation write durable milestones", async () => {
  const calls = [];
  const safeStartupOfficeRest = async (table, options) => {
    calls.push({ options, table });
    return [{ id: `event-${calls.length}`, ...options.body }];
  };

  await recordStartupOfficeApprovalActivation({
    approval: { id: "approval-1", status: "approved" },
    membership,
    safeStartupOfficeRest,
  });
  await recordStartupOfficeExportActivation({
    membership,
    nowISO: () => "2026-05-25T00:00:00.000Z",
    safeStartupOfficeRest,
  });

  assert.equal(calls[0].options.body.milestone, "first_approval_decision");
  assert.equal(calls[0].options.body.source_table, "startup_office_approvals");
  assert.equal(calls[0].options.body.metadata.status, "approved");
  assert.equal(calls[1].options.body.milestone, "first_export");
  assert.equal(calls[1].options.body.source_table, "startup_office_export");
});
