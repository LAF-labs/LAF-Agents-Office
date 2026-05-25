const assert = require("node:assert/strict");
const test = require("node:test");

const {
  startupOfficeBillingBlockReason,
  startupOfficeBillingProviderValue,
  startupOfficeBillingStateValue,
  startupOfficePaymentStatusValue,
} = require("./billingState");

test("billing helpers normalize manual beta billing states", () => {
  assert.equal(startupOfficeBillingStateValue("ACTIVE"), "active");
  assert.equal(startupOfficeBillingStateValue("unknown"), "trial");
  assert.equal(startupOfficePaymentStatusValue("active"), "paid");
  assert.equal(startupOfficePaymentStatusValue("blocked"), "blocked");
  assert.equal(startupOfficePaymentStatusValue("bad"), "trial");
  assert.equal(startupOfficeBillingProviderValue("stripe"), "stripe");
  assert.equal(startupOfficeBillingProviderValue("manual-contract"), "manual");
});

test("billing block reason covers paused, blocked, past due, and canceled workspaces", () => {
  assert.equal(startupOfficeBillingBlockReason({ billing_state: "active", payment_status: "paid" }), "");
  assert.equal(startupOfficeBillingBlockReason({ billing_state: "past_due", payment_status: "paid" }), "past_due");
  assert.equal(startupOfficeBillingBlockReason({ billing_state: "active", payment_status: "blocked" }), "blocked");
  assert.equal(startupOfficeBillingBlockReason({ billing_state: "paused", payment_status: "paid" }), "paused");
  assert.equal(startupOfficeBillingBlockReason({ billing_state: "canceled", payment_status: "trial" }), "canceled");
});
