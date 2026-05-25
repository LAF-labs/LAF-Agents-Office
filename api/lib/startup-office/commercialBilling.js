const {
  startupOfficeBillingBlockReason,
  startupOfficeBillingProviderValue,
  startupOfficeBillingStateValue,
  startupOfficePaymentStatusValue,
} = require("./billingState");
const {
  publicStartupOfficeBillingDocument,
  startupOfficeBillingDocumentPayload,
} = require("./commercialBillingDocuments");

function startupOfficeCommercialSnapshot({ billing = {}, documents = [], termsAccepted = true }) {
  const docs = documents.map(publicStartupOfficeBillingDocument);
  const agreement = docs.find((doc) => doc.document_type === "agreement" && doc.status === "signed");
  const paidDocument = docs.find((doc) => ["invoice", "receipt"].includes(doc.document_type) && doc.status === "paid");
  const hasPaymentEvidence = Boolean(
    billing.beta_agreement_url ||
      agreement?.reference_url ||
      paidDocument?.external_reference ||
      paidDocument?.reference_url,
  );
  const blockReason = startupOfficeBillingBlockReason(billing);
  const termsReady = termsAccepted !== false;
  const paid = billing.payment_status === "paid" && hasPaymentEvidence && termsReady && !blockReason;
  return {
    agreement_status: agreement ? "signed" : billing.beta_agreement_url ? "linked" : "missing",
    can_start_paid_beta: paid,
    next_step: paid
      ? "Paid beta is commercially cleared."
      : !termsReady
        ? "Accept the current beta terms before starting paid beta."
        : blockReason
        ? `Resolve billing block: ${blockReason}.`
        : "Attach a signed agreement, paid invoice, or payment reference.",
    paid_evidence_status: hasPaymentEvidence ? "present" : "missing",
    status: paid
      ? "paid_beta_ready"
      : blockReason
        ? "blocked"
        : !termsReady
          ? "terms_missing"
          : billing.payment_status || "trial",
    terms_status: termsReady ? "accepted" : "missing",
  };
}

function startupOfficeEntitlementSnapshot({ billing = {}, commercial = {}, usage = {} }) {
  const blocks = [];
  const billingBlock = startupOfficeBillingBlockReason(billing);
  if (billingBlock) {
    blocks.push({
      code: `billing_${billingBlock}`,
      message: `billing state blocks AI runs: ${billingBlock}`,
      scope: "ai_runs",
    });
  }
  if (numberValue(usage.runs) >= numberValue(billing.monthly_run_limit)) {
    blocks.push({
      code: "monthly_run_limit",
      message: "monthly Startup Office run limit reached",
      scope: "ai_runs",
    });
  }
  if (numberValue(usage.model_spend_cents) >= numberValue(billing.monthly_model_spend_cents)) {
    blocks.push({
      code: "monthly_model_spend_limit",
      message: "monthly Startup Office model spend limit reached",
      scope: "ai_runs",
    });
  }
  return {
    ai_runs: !blocks.some((block) => block.scope === "ai_runs"),
    asset_uploads: numberValue(usage.storage_mb) < numberValue(billing.storage_mb_limit),
    blocks,
    commercial_status: commercial.status || billing.payment_status || "trial",
    managed_model: billing.laf_model_enabled !== false,
    seats_available:
      numberValue(usage.seats) + numberValue(usage.pending_invites) <
      numberValue(billing.seat_limit),
    support_timeline: true,
  };
}

function startupOfficeEntitlementBlock(snapshot, scope) {
  return (snapshot?.entitlements?.blocks || []).find((block) => block.scope === scope) || null;
}

function assertStartupOfficePaidBetaEvidence({
  billing,
  body,
  createHTTPError,
  currentBilling = {},
  currentDocuments = [],
  objectValue: toObject = objectValue,
}) {
  if (billing.payment_status !== "paid") return;
  if (paidBetaEvidencePresent({ billing, body, currentBilling, currentDocuments, objectValue: toObject })) {
    return;
  }
  throw createHTTPError(400, "paid beta requires signed agreement, paid invoice, or payment reference");
}

function paidBetaEvidencePresent({
  billing = {},
  body = {},
  currentBilling = {},
  currentDocuments = [],
  objectValue: toObject = objectValue,
}) {
  const document = toObject(body.billing_document);
  if (
    billing.beta_agreement_url ||
    currentBilling.beta_agreement_url ||
    body.payment_reference ||
    body.stripe_reference ||
    document.reference_url ||
    document.external_reference
  ) {
    return true;
  }
  return currentDocuments.some((doc) => {
    const publicDoc = publicStartupOfficeBillingDocument(doc);
    return (
      (publicDoc.document_type === "agreement" && publicDoc.status === "signed") ||
      (["invoice", "receipt"].includes(publicDoc.document_type) && publicDoc.status === "paid")
    );
  });
}

function startupOfficeBillingPatch({ body = {}, clamp, currentBilling = {}, truncateText }) {
  return {
    beta_agreement_url: truncateText(
      body.beta_agreement_url ?? currentBilling.beta_agreement_url ?? "",
      1000,
    ),
    billing_provider: startupOfficeBillingProviderValue(
      body.billing_provider ?? body.provider ?? currentBilling.billing_provider,
    ),
    billing_state: startupOfficeBillingStateValue(
      body.billing_state ?? body.state ?? currentBilling.billing_state,
    ),
    blocked_reason: truncateText(body.blocked_reason ?? currentBilling.blocked_reason ?? "", 1000),
    laf_model_enabled:
      body.laf_model_enabled === undefined
        ? currentBilling.laf_model_enabled !== false
        : Boolean(body.laf_model_enabled),
    last_paid_at: body.last_paid_at ?? currentBilling.last_paid_at ?? null,
    monthly_model_spend_cents: clamp(
      Number(body.monthly_model_spend_cents ?? currentBilling.monthly_model_spend_cents ?? 20000),
      0,
      10000000,
    ),
    monthly_run_limit: clamp(
      Number(body.monthly_run_limit ?? currentBilling.monthly_run_limit ?? 50),
      0,
      100000,
    ),
    payment_status: startupOfficePaymentStatusValue(
      body.payment_status ?? body.status ?? currentBilling.payment_status,
    ),
    plan: truncateText(body.plan ?? currentBilling.plan ?? "founder_beta", 80),
    seat_limit: clamp(Number(body.seat_limit ?? currentBilling.seat_limit ?? 5), 1, 100000),
    storage_mb_limit: clamp(
      Number(body.storage_mb_limit ?? currentBilling.storage_mb_limit ?? 1024),
      0,
      1000000,
    ),
    support_notes: truncateText(body.support_notes ?? currentBilling.support_notes ?? "", 4000),
  };
}

function numberValue(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

module.exports = {
  assertStartupOfficePaidBetaEvidence,
  publicStartupOfficeBillingDocument,
  startupOfficeBillingPatch,
  startupOfficeBillingDocumentPayload,
  startupOfficeCommercialSnapshot,
  startupOfficeEntitlementBlock,
  startupOfficeEntitlementSnapshot,
};
