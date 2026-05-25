const assert = require("node:assert/strict");
const test = require("node:test");

const {
  assertStartupOfficePaidBetaEvidence,
  publicStartupOfficeBillingDocument,
  startupOfficeBillingDocumentPayload,
  startupOfficeCommercialSnapshot,
  startupOfficeEntitlementBlock,
  startupOfficeEntitlementSnapshot,
} = require("./commercialBilling");

const membership = Object.freeze({
  team_id: "team-1",
  user_id: "user-1",
});

function createHTTPError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

test("commercial snapshot requires signed manual or payment evidence before paid beta", () => {
  const missing = startupOfficeCommercialSnapshot({
    billing: { billing_state: "active", payment_status: "paid" },
    documents: [],
  });
  assert.equal(missing.can_start_paid_beta, false);
  assert.equal(missing.paid_evidence_status, "missing");

  const ready = startupOfficeCommercialSnapshot({
    billing: { billing_state: "active", payment_status: "paid" },
    documents: [
      {
        document_type: "agreement",
        reference_url: "https://example.com/signed.pdf",
        status: "signed",
      },
    ],
  });
  assert.equal(ready.can_start_paid_beta, true);
  assert.equal(ready.status, "paid_beta_ready");
});

test("paid beta validation rejects paid status without evidence", () => {
  assert.throws(
    () =>
      assertStartupOfficePaidBetaEvidence({
        billing: { billing_provider: "manual", payment_status: "paid" },
        body: {},
        createHTTPError,
      }),
    (err) =>
      err.status === 400 &&
      err.message === "paid beta requires signed agreement, paid invoice, or payment reference",
  );
});

test("paid beta validation accepts current agreement and explicit payment references", () => {
  assert.doesNotThrow(() =>
    assertStartupOfficePaidBetaEvidence({
      billing: { billing_provider: "manual", payment_status: "paid" },
      body: {},
      createHTTPError,
      currentBilling: { beta_agreement_url: "https://example.com/agreement.pdf" },
    }),
  );
  assert.doesNotThrow(() =>
    assertStartupOfficePaidBetaEvidence({
      billing: { billing_provider: "stripe", payment_status: "paid" },
      body: { stripe_reference: "cs_live_123" },
      createHTTPError,
    }),
  );
});

test("billing document payload records agreement, receipt, and plan-change evidence", () => {
  const agreement = startupOfficeBillingDocumentPayload({
    billing: {
      beta_agreement_url: "https://example.com/agreement.pdf",
      billing_provider: "manual",
      payment_status: "paid",
      plan: "founder_beta",
    },
    body: { beta_agreement_url: "https://example.com/agreement.pdf" },
    currentBilling: { plan: "trial" },
    membership,
    nowISO: () => "2026-05-25T00:00:00.000Z",
    truncateText: (value, max) => String(value || "").slice(0, max),
  });
  assert.equal(agreement.document_type, "agreement");
  assert.equal(agreement.reference_url, "https://example.com/agreement.pdf");
  assert.equal(agreement.metadata.previous_plan, "trial");

  const receipt = startupOfficeBillingDocumentPayload({
    billing: {
      billing_provider: "stripe",
      payment_status: "paid",
      plan: "founder_beta",
    },
    body: {
      amount_cents: 50000,
      billing_document: { document_type: "receipt", status: "paid" },
      stripe_reference: "pi_123",
    },
    membership,
    nowISO: () => "2026-05-25T00:00:00.000Z",
    truncateText: (value, max) => String(value || "").slice(0, max),
  });
  assert.equal(receipt.document_type, "receipt");
  assert.equal(receipt.external_reference, "pi_123");
  assert.equal(receipt.amount_cents, 50000);

  const planChange = startupOfficeBillingDocumentPayload({
    billing: {
      billing_provider: "manual",
      payment_status: "trial",
      plan: "founder_beta",
    },
    body: { plan: "founder_beta" },
    currentBilling: { plan: "trial" },
    membership,
    nowISO: () => "2026-05-25T00:00:00.000Z",
    truncateText: (value, max) => String(value || "").slice(0, max),
  });
  assert.equal(planChange.document_type, "plan_change");
  assert.equal(planChange.status, "accepted");
});

test("billing documents and entitlements are public and deterministic", () => {
  assert.deepEqual(
    publicStartupOfficeBillingDocument({
      amount_cents: "1200",
      currency: "krw",
      document_type: "invoice",
      id: "doc-1",
      provider: "stripe",
      status: "paid",
    }),
    {
      amount_cents: 1200,
      created_at: null,
      currency: "KRW",
      document_type: "invoice",
      external_reference: "",
      id: "doc-1",
      metadata: {},
      notes: "",
      period_end: null,
      period_start: null,
      plan: "",
      provider: "stripe",
      reference_url: "",
      status: "paid",
      updated_at: null,
    },
  );

  const entitlements = startupOfficeEntitlementSnapshot({
    billing: {
      billing_state: "active",
      monthly_model_spend_cents: 100,
      monthly_run_limit: 2,
      seat_limit: 2,
      storage_mb_limit: 10,
    },
    commercial: { status: "paid_beta_ready" },
    usage: {
      model_spend_cents: 100,
      pending_invites: 0,
      runs: 1,
      seats: 1,
      storage_mb: 1,
    },
  });
  assert.equal(entitlements.ai_runs, false);
  assert.equal(entitlements.blocks[0].code, "monthly_model_spend_limit");
  assert.equal(startupOfficeEntitlementBlock({ entitlements }, "ai_runs").message, "monthly Startup Office model spend limit reached");
});
