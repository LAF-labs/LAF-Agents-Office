const {
  startupOfficeBillingProviderValue,
} = require("./billingState");

const BILLING_DOCUMENT_TYPES = new Set(["agreement", "invoice", "receipt", "plan_change"]);
const BILLING_DOCUMENT_STATUSES = new Set([
  "draft",
  "sent",
  "signed",
  "accepted",
  "paid",
  "void",
]);

function publicStartupOfficeBillingDocument(row = {}) {
  return {
    amount_cents: numberValue(row.amount_cents),
    created_at: row.created_at || null,
    currency: startupOfficeBillingCurrencyValue(row.currency),
    document_type: startupOfficeBillingDocumentType(row.document_type),
    external_reference: row.external_reference || "",
    id: row.id || "",
    metadata: objectValue(row.metadata),
    notes: row.notes || "",
    period_end: row.period_end || null,
    period_start: row.period_start || null,
    plan: row.plan || "",
    provider: startupOfficeBillingProviderValue(row.provider),
    reference_url: row.reference_url || "",
    status: startupOfficeBillingDocumentStatus(row.status),
    updated_at: row.updated_at || null,
  };
}

function startupOfficeBillingDocumentPayload({
  billing,
  body,
  currentBilling = {},
  membership,
  nowISO,
  objectValue: toObject = objectValue,
  truncateText,
}) {
  const document = toObject(body.billing_document);
  const changedPlan = currentBilling.plan && currentBilling.plan !== billing.plan;
  const hasReference = Boolean(
    document.reference_url ||
      document.external_reference ||
      body.beta_agreement_url ||
      body.invoice_url ||
      body.payment_reference ||
      body.stripe_reference,
  );
  if (!document.document_type && !document.type && !hasReference && !changedPlan) return null;
  const documentType = startupOfficeBillingDocumentType(
    document.document_type ||
      document.type ||
      (body.beta_agreement_url
        ? "agreement"
        : changedPlan
          ? "plan_change"
          : billing.payment_status === "paid"
            ? "receipt"
            : "agreement"),
  );
  return {
    amount_cents: numberValue(document.amount_cents ?? body.amount_cents),
    created_by: membership.user_id || null,
    currency: startupOfficeBillingCurrencyValue(document.currency || body.currency),
    document_type: documentType,
    external_reference: truncateText(
      document.external_reference || body.payment_reference || body.stripe_reference || "",
      240,
    ),
    metadata: {
      ...toObject(document.metadata),
      previous_plan: currentBilling.plan || "",
      source: "startup_office_billing_patch",
    },
    notes: truncateText(document.notes || body.billing_note || "", 2000),
    period_end: document.period_end || body.period_end || null,
    period_start: document.period_start || body.period_start || null,
    plan: truncateText(document.plan || billing.plan || "", 80),
    provider: startupOfficeBillingProviderValue(document.provider || billing.billing_provider),
    reference_url: truncateText(
      document.reference_url || body.invoice_url || body.beta_agreement_url || "",
      1000,
    ),
    status: startupOfficeBillingDocumentStatus(
      document.status ||
        (documentType === "agreement" ? "signed" : documentType === "receipt" ? "paid" : "accepted"),
    ),
    team_id: membership.team_id,
    updated_at: nowISO(),
  };
}

function startupOfficeBillingDocumentType(value) {
  const raw = String(value || "").trim().toLowerCase();
  return BILLING_DOCUMENT_TYPES.has(raw) ? raw : "agreement";
}

function startupOfficeBillingDocumentStatus(value) {
  const raw = String(value || "").trim().toLowerCase();
  return BILLING_DOCUMENT_STATUSES.has(raw) ? raw : "draft";
}

function startupOfficeBillingCurrencyValue(value) {
  const raw = String(value || "USD").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(raw) ? raw : "USD";
}

function numberValue(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

module.exports = {
  publicStartupOfficeBillingDocument,
  startupOfficeBillingDocumentPayload,
};
