"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  loadReleaseContext,
  loadTemplate,
  validateExternalEvidencePayload,
} = require("./validate-startup-office-external-evidence.cjs");

const releaseContext = loadReleaseContext();
const template = loadTemplate();

function recordFor(goalId, overrides = {}) {
  const templateRecord = template.records.find((record) => record.goalId === goalId);
  const fields = Object.fromEntries(
    templateRecord.requiredFields.map((field) => [field.key, `${goalId}-${field.key}-evidence`]),
  );
  if (goalId === "G099") {
    fields.deploy_commit_sha = "abcdef1234567890abcdef1234567890abcdef12";
    fields.hosted_env_preflight_result = "passed with redacted output";
    fields.package_version = releaseContext.packageVersion;
    fields.production_app_url = "https://startup-office.example";
    fields.production_api_base_url = "https://startup-office.example/api";
    fields.release_gate_result = "passed on deploy commit";
    fields.release_health_result = "green";
    fields.secret_rotation_result = "success";
    fields.supabase_project_ref_latest_migration = `project abc latest ${releaseContext.latestMigration}`;
    fields.post_release_monitor_window_result = "ok after 60 minutes";
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

test("rejects secrets and payment instruments in external evidence fields", () => {
  assert.throws(
    () => validateExternalEvidencePayload(recordFor("G099", {
      fields: { secret_rotation_result: "passed with sk-test-abcdefghijklmnopqrstuvwxyz123456" },
    }), template),
    /forbidden OpenAI-style API key/,
  );
  assert.throws(
    () => validateExternalEvidencePayload(recordFor("G099", {
      fields: { release_health_result: "Authorization: Bearer abcdefghijklmnopqrstuvwxyz1234567890" },
    }), template),
    /forbidden bearer token/,
  );
  assert.throws(
    () => validateExternalEvidencePayload(recordFor("G100", {
      fields: { signed_beta_agreement_or_payment_reference: "card 4242 4242 4242 4242" },
    }), template),
    /forbidden payment card number/,
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

test("rejects stale or unsuccessful production deployment evidence", () => {
  assert.throws(
    () => validateExternalEvidencePayload(recordFor("G099", {
      fields: { package_version: "0.0.0-stale" },
    }), template, releaseContext),
    /package_version must match package\.json/,
  );
  assert.throws(
    () => validateExternalEvidencePayload(recordFor("G099", {
      fields: { supabase_project_ref_latest_migration: "project abc latest 20200101000000" },
    }), template, releaseContext),
    /latest migration/,
  );
  assert.throws(
    () => validateExternalEvidencePayload(recordFor("G099", {
      fields: { release_gate_result: "failed on deploy commit" },
    }), template, releaseContext),
    /release_gate_result must record a successful result/,
  );
});
