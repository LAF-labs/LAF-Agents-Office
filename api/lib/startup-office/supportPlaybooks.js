function startupOfficeSupportPlaybooks({
  approvals = [],
  betaOps = {},
  outboxEvents = [],
  runFailures = [],
  stuckJobs = [],
}) {
  const playbooks = [];
  if (runFailures.length || stuckJobs.some((job) => ["failed", "dead_letter"].includes(job.status))) {
    playbooks.push(playbook("failed_run_recovery", "Failed run recovery", "high", [
      "Open the support timeline for the affected run and inspect receipts, worker jobs, notifications, and outbox events.",
      "If the failure is provider configuration or a transient model error, retry the worker job from the admin endpoint.",
      "If the output is low quality or unsafe, ask the founder to request a revision with a concrete note.",
      "Record the customer-facing explanation in support notes and confirm the next receipt is visible.",
    ]));
  }
  if (approvals.length) {
    playbooks.push(playbook("approval_confusion", "Confused approval rescue", "medium", [
      "Explain approve, reject, and revise using the pending approval title, risk level, and receipt outcome.",
      "Ask the founder for a concrete revision note when the artifact is directionally useful but not ready.",
      "Reject instead of revise when the artifact should not be reused as company memory.",
      "Confirm the approval decision writes a receipt and activation milestone before closing the support case.",
    ]));
  }
  if (outboxEvents.some((event) => ["failed", "dead_letter"].includes(event.status))) {
    playbooks.push(playbook("notification_delivery", "Notification delivery recovery", "medium", [
      "Inspect failed outbox rows and recent notification payloads before resending anything.",
      "Fix SMTP or webhook configuration, then let the outbox worker retry eligible queued events.",
      "If a notification is dead-lettered, manually notify the founder and keep the receipt trace intact.",
    ]));
  }
  if (billingBlocked(betaOps.billing)) {
    playbooks.push(playbook("billing_block", "Billing block rescue", "medium", [
      "Review billing state, payment status, beta agreement, and recent billing documents.",
      "Tell the founder which limit or billing state is blocking AI runs.",
      "Attach a signed agreement, paid invoice, or payment reference before restoring paid beta access.",
    ]));
  }
  if (!playbooks.length) {
    playbooks.push(playbook("customer_success_review", "Customer success review", "low", [
      "Check activation progress, recent receipts, and the next recommended loop.",
      "Confirm the founder understands approvals, memory changes, and export before the next paid-beta review.",
    ]));
  }
  return playbooks;
}

function playbook(id, title, severity, steps) {
  return {
    id,
    severity,
    steps,
    title,
  };
}

function billingBlocked(billing = {}) {
  return (
    ["past_due", "paused", "canceled"].includes(String(billing.billing_state || "")) ||
    ["paused", "blocked"].includes(String(billing.payment_status || ""))
  );
}

module.exports = {
  startupOfficeSupportPlaybooks,
};
