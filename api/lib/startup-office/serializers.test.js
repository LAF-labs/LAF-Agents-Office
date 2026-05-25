const assert = require("node:assert/strict");
const test = require("node:test");

const {
  publicStartupOfficeMemoryPage,
  publicStartupOfficeReceipt,
} = require("./serializers");

test("memory page serializer exposes freshness review metadata", () => {
  const page = publicStartupOfficeMemoryPage({
    id: "memory-1",
    last_verified_at: null,
    slug: "company-profile",
    status: "approved",
    summary: "Company profile",
    title: "Company Profile",
  });

  assert.equal(page.freshness.status, "needs_review");
  assert.equal(page.freshness.risk_level, "high");
  assert.equal(page.freshness.reason, "never_verified");
});

test("receipt serializer exposes deterministic integrity digest", () => {
  const receipt = publicStartupOfficeReceipt({
    actor_slug: "agent",
    approval_id: "approval-1",
    created_at: "2026-05-25T00:00:00.000Z",
    event_type: "run.ai_draft_ready",
    id: "receipt-1",
    run_id: "run-1",
    summary: "Draft ready.",
    trace: { prompt_version: { version: "idea-validation.prompt.v1" } },
  });

  assert.equal(receipt.integrity.algorithm, "sha256");
  assert.deepEqual(receipt.integrity.canonical_fields, [
    "actor_slug",
    "approval_id",
    "created_at",
    "event_type",
    "id",
    "run_id",
    "summary",
    "trace",
  ]);
  assert.equal(receipt.integrity.digest_input_version, "startup-office-receipt.v1");
  assert.equal(receipt.integrity.signed, false);
  assert.match(receipt.integrity.digest, /^[a-f0-9]{64}$/);
  assert.equal(receipt.integrity.version, "startup-office-receipt-integrity.v1");
});
