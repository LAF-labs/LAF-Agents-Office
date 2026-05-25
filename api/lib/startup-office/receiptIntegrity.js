const crypto = require("node:crypto");

const RECEIPT_INTEGRITY_VERSION = "startup-office-receipt-integrity.v1";
const RECEIPT_DIGEST_INPUT_VERSION = "startup-office-receipt.v1";
const RECEIPT_CANONICAL_FIELDS = [
  "actor_slug",
  "approval_id",
  "created_at",
  "event_type",
  "id",
  "run_id",
  "summary",
  "trace",
];

function startupOfficeReceiptIntegrity(receipt) {
  const canonical = canonicalReceiptPayload(receipt);
  const canonicalJSON = stableJSONStringify(canonical);
  return {
    algorithm: "sha256",
    canonical_fields: [...RECEIPT_CANONICAL_FIELDS],
    digest: crypto.createHash("sha256").update(canonicalJSON).digest("hex"),
    digest_input_version: RECEIPT_DIGEST_INPUT_VERSION,
    signed: false,
    signed_note: "Digest is deterministic; external signing can be layered on this canonical payload.",
    version: RECEIPT_INTEGRITY_VERSION,
  };
}

function canonicalReceiptPayload(receipt = {}) {
  return {
    actor_slug: receipt.actor_slug || "",
    approval_id: receipt.approval_id || null,
    created_at: receipt.created_at || null,
    event_type: receipt.event_type || "",
    id: receipt.id || "",
    run_id: receipt.run_id || null,
    summary: receipt.summary || "",
    trace: objectValue(receipt.trace),
  };
}

function stableJSONStringify(value) {
  return JSON.stringify(stableValue(value));
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value)
    .sort()
    .reduce((out, key) => {
      out[key] = stableValue(value[key]);
      return out;
    }, {});
}

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

module.exports = {
  RECEIPT_CANONICAL_FIELDS,
  RECEIPT_DIGEST_INPUT_VERSION,
  RECEIPT_INTEGRITY_VERSION,
  canonicalReceiptPayload,
  startupOfficeReceiptIntegrity,
  stableJSONStringify,
};
