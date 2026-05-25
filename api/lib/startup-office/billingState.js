const BILLING_STATES = new Set(["trial", "active", "past_due", "paused", "comped", "canceled"]);
const PAYMENT_STATUSES = new Set(["trial", "paid", "paused", "blocked"]);
const BILLING_PROVIDERS = new Set(["manual", "stripe"]);

function startupOfficeBillingStateValue(value) {
  const raw = String(value || "").trim().toLowerCase();
  return BILLING_STATES.has(raw) ? raw : "trial";
}

function startupOfficePaymentStatusValue(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "active") return "paid";
  return PAYMENT_STATUSES.has(raw) ? raw : "trial";
}

function startupOfficeBillingProviderValue(value) {
  const raw = String(value || "").trim().toLowerCase();
  return BILLING_PROVIDERS.has(raw) ? raw : "manual";
}

function startupOfficeBillingBlockReason(billing = {}) {
  const billingState = startupOfficeBillingStateValue(billing.billing_state);
  const paymentStatus = startupOfficePaymentStatusValue(billing.payment_status);
  if (["past_due", "paused", "canceled"].includes(billingState)) return billingState;
  if (["paused", "blocked"].includes(paymentStatus)) return paymentStatus;
  return "";
}

module.exports = {
  startupOfficeBillingBlockReason,
  startupOfficeBillingProviderValue,
  startupOfficeBillingStateValue,
  startupOfficePaymentStatusValue,
};
