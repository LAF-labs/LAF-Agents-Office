"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  loadTemplate,
  validateExternalEvidencePayload,
} = require("./validate-startup-office-external-evidence.cjs");

const template = loadTemplate();

function recordFor(goalId, overrides = {}) {
  const templateRecord = template.records.find((record) => record.goalId === goalId);
  const fields = Object.fromEntries(
    templateRecord.requiredFields.map((field) => [field.key, `${goalId}-${field.key}-evidence`]),
  );
  if (goalId === "G099") {
    fields.deploy_commit_sha = "abcdef1234567890abcdef1234567890abcdef12";
    fields.production_app_url = "https://startup-office.example";
    fields.production_api_base_url = "https://startup-office.example/api";
  }
  if (goalId === "G100") {
    fields.payment_status = "paid";
    fields.founder_decision = "approved";
  }
  return {
    fields: { ...fields, ...(overrides.fields || {}) },
    goalId,
    recordedIn: "operator system of record",
    recordType: templateRecord.recordType,
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== "fields")),
  };
}

test("validates complete G099 and G100 evidence records", () => {
  const result = validateExternalEvidencePayload({
    records: [recordFor("G099"), recordFor("G100")],
  }, template);

  assert.deepEqual(result.map((record) => record.goalId), ["G099", "G100"]);
});

test("rejects missing required evidence fields", () => {
  const record = recordFor("G099", { fields: { release_gate_result: "" } });
  assert.throws(
    () => validateExternalEvidencePayload(record, template),
    /G099 missing required field release_gate_result/,
  );
  assert.throws(
    () => validateExternalEvidencePayload(null, template),
    /evidence record must be an object/,
  );
});

test("rejects duplicate goal records", () => {
  assert.throws(
    () => validateExternalEvidencePayload({ records: [recordFor("G100"), recordFor("G100")] }, template),
    /duplicate goalId/,
  );
});

test("rejects invalid customer decision and payment states", () => {
  assert.throws(
    () => validateExternalEvidencePayload(recordFor("G100", {
      fields: { founder_decision: "auto-approved", payment_status: "paid" },
    }), template),
    /founder_decision/,
  );
  assert.throws(
    () => validateExternalEvidencePayload(recordFor("G100", {
      fields: { founder_decision: "approved", payment_status: "free" },
    }), template),
    /payment_status/,
  );
});

test("rejects production deployment records without HTTPS URLs or commit SHAs", () => {
  assert.throws(
    () => validateExternalEvidencePayload(recordFor("G099", {
      fields: { production_app_url: "http://startup-office.example" },
    }), template),
    /production_app_url must be an HTTPS URL/,
  );
  assert.throws(
    () => validateExternalEvidencePayload(recordFor("G099", {
      fields: { deploy_commit_sha: "not-a-sha" },
    }), template),
    /deploy_commit_sha/,
  );
});
