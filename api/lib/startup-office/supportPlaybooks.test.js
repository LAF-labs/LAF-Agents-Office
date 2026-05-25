const assert = require("node:assert/strict");
const test = require("node:test");

const { startupOfficeSupportPlaybooks } = require("./supportPlaybooks");

test("support playbooks cover failed runs, confused approvals, outbox, and billing blocks", () => {
  const playbooks = startupOfficeSupportPlaybooks({
    approvals: [{ id: "approval-1", status: "pending" }],
    betaOps: { billing: { billing_state: "active", payment_status: "blocked" } },
    outboxEvents: [{ id: "outbox-1", status: "dead_letter" }],
    runFailures: [{ id: "run-1", status: "failed" }],
    stuckJobs: [{ id: "job-1", status: "dead_letter" }],
  });

  assert.deepEqual(playbooks.map((item) => item.id), [
    "failed_run_recovery",
    "approval_confusion",
    "notification_delivery",
    "billing_block",
  ]);
  assert.equal(
    playbooks[0].steps[0],
    "Open the support timeline for the affected run and inspect receipts, worker jobs, notifications, and outbox events.",
  );
  assert.match(playbooks[1].steps.join(" "), /approve, reject, and revise/);
});

test("support playbooks return a customer-success review when no rescue is needed", () => {
  const [playbook] = startupOfficeSupportPlaybooks({
    betaOps: { billing: { billing_state: "active", payment_status: "paid" } },
  });

  assert.equal(playbook.id, "customer_success_review");
  assert.equal(playbook.severity, "low");
  assert.match(playbook.steps.join(" "), /activation progress/);
});
