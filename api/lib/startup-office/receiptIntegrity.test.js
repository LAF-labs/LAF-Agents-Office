const assert = require("node:assert/strict");
const test = require("node:test");

const {
  RECEIPT_CANONICAL_FIELDS,
  RECEIPT_DIGEST_INPUT_VERSION,
  canonicalReceiptPayload,
  startupOfficeReceiptIntegrity,
  stableJSONStringify,
} = require("./receiptIntegrity");

test("receipt integrity digest is stable for canonical receipt payloads", () => {
  const receipt = receiptFixture();
  const reordered = {
    trace: { b: 2, a: 1 },
    summary: receipt.summary,
    run_id: receipt.run_id,
    id: receipt.id,
    event_type: receipt.event_type,
    created_at: receipt.created_at,
    approval_id: receipt.approval_id,
    actor_slug: receipt.actor_slug,
  };

  assert.deepEqual(canonicalReceiptPayload(receipt), canonicalReceiptPayload(reordered));
  assert.equal(
    startupOfficeReceiptIntegrity(receipt).digest,
    startupOfficeReceiptIntegrity(reordered).digest,
  );
  assert.match(startupOfficeReceiptIntegrity(receipt).digest, /^[a-f0-9]{64}$/);
});

test("receipt integrity declares the digest input contract", () => {
  const integrity = startupOfficeReceiptIntegrity(receiptFixture());

  assert.equal(integrity.algorithm, "sha256");
  assert.deepEqual(integrity.canonical_fields, RECEIPT_CANONICAL_FIELDS);
  assert.equal(integrity.digest_input_version, RECEIPT_DIGEST_INPUT_VERSION);
  assert.equal(integrity.signed, false);
  assert.equal(integrity.version, "startup-office-receipt-integrity.v1");
});

test("receipt integrity digest changes when customer-visible receipt evidence changes", () => {
  const original = startupOfficeReceiptIntegrity(receiptFixture()).digest;
  const changed = startupOfficeReceiptIntegrity({
    ...receiptFixture(),
    summary: "A different summary.",
  }).digest;

  assert.notEqual(original, changed);
});

test("stable JSON stringifies nested objects deterministically", () => {
  assert.equal(
    stableJSONStringify({ z: 1, a: { c: 3, b: 2 } }),
    '{"a":{"b":2,"c":3},"z":1}',
  );
});

function receiptFixture() {
  return {
    actor_slug: "agent",
    approval_id: "approval-1",
    created_at: "2026-05-25T00:00:00.000Z",
    event_type: "run.ai_draft_ready",
    id: "receipt-1",
    run_id: "run-1",
    summary: "Idea Validation AI draft is ready.",
    trace: { a: 1, b: 2 },
  };
}
