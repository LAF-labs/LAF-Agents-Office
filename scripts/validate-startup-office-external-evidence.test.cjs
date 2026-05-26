"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildEvidenceSkeleton,
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
    fields.current_beta_terms_acceptance = `terms-acceptance-1 ${releaseContext.currentTermsVersion}`;
    fields.deploy_commit_sha = releaseContext.deployCommitSha;
    fields.dns_provider_record = "Cloudflare CNAME app.laf-startup-office.com";
    fields.hosted_env_preflight_result = "passed with redacted output";
    fields.loop_worker_workflow_run_id = "gh-run-123456";
    fields.ops_monitor_workflow_run_id = "gh-run-123458";
    fields.package_version = releaseContext.packageVersion;
    fields.outbox_worker_workflow_run_id = "gh-run-123457";
    fields.production_app_url = "https://app.laf-startup-office.com";
    fields.production_api_base_url = "https://api.laf-startup-office.com";
    fields.production_browser_artifact = "https://app.laf-startup-office.com/artifacts/prod-smoke-1";
    fields.production_smoke_workspace_id = "ws-prod-smoke-1";
    fields.release_gate_result = `passed on deploy commit ${releaseContext.deployCommitSha.slice(0, 12)}`;
    fields.release_health_result = "green";
    fields.rollback_decision_owner = "no-rollback owner operator";
    fields.secret_rotation_result = "success";
    fields.supabase_project_ref_latest_migration = `project abc latest ${releaseContext.latestMigration}`;
    fields.synthetic_monitor_workflow_run_id = "gh-run-123459";
    fields.first_production_approval_id = "approval-prod-smoke-1";
    fields.first_production_receipt_id = "receipt-prod-smoke-1";
    fields.first_production_smoke_run_id = "run-prod-smoke-1";
    fields.post_release_monitor_window_result = "ok after 60 minutes";
  }
  if (goalId === "G100") {
    fields.billing_provider = "manual";
    fields.current_beta_terms_acceptance = `terms-acceptance-2 ${releaseContext.currentTermsVersion}`;
    fields.first_approval_id = "approval-customer-1";
    fields.first_customer_run_id = "run-customer-1";
    fields.first_loop_slug = "idea-validation";
    fields.first_receipt_id = "receipt-customer-1";
    fields.founder_decision = "approved";
    fields.payment_status = "paid";
    fields.signed_beta_agreement_or_payment_reference = "invoice ref INV-2026-0001";
    fields.success_note = "Founder received an approved validation brief.";
    fields.workspace_id = "ws-customer-1";
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

test("builds an operator skeleton pinned to current release facts", () => {
  const skeleton = buildEvidenceSkeleton(template, releaseContext);
  const g099 = skeleton.records.find((record) => record.goalId === "G099");
  const g100 = skeleton.records.find((record) => record.goalId === "G100");

  assert.equal(skeleton.records.length, 2);
  assert.equal(g099.recordedIn, "operator system of record");
  assert.equal(g099.fields.deploy_commit_sha, releaseContext.deployCommitSha);
  assert.equal(g099.fields.package_version, releaseContext.packageVersion);
  assert.match(g099.fields.release_gate_result, new RegExp(releaseContext.deployCommitSha.slice(0, 12)));
  assert.match(g099.fields.supabase_project_ref_latest_migration, new RegExp(releaseContext.latestMigration));
  assert.match(g099.fields.current_beta_terms_acceptance, new RegExp(releaseContext.currentTermsVersion));
  assert.equal(g100.fields.first_loop_slug, "idea-validation");
  assert.match(g100.fields.current_beta_terms_acceptance, new RegExp(releaseContext.currentTermsVersion));
  assert.throws(
    () => validateExternalEvidencePayload(skeleton, template, releaseContext),
    /production_app_url must be a valid HTTPS URL/,
  );
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

test("rejects stale terms evidence and weak customer agreement references", () => {
  assert.throws(
    () => validateExternalEvidencePayload(recordFor("G099", {
      fields: { current_beta_terms_acceptance: "terms-acceptance-1 startup-office-beta-terms-2020-01-01" },
    }), template, releaseContext),
    /current_beta_terms_acceptance must include current terms version/,
  );
  assert.throws(
    () => validateExternalEvidencePayload(recordFor("G100", {
      fields: { current_beta_terms_acceptance: "terms-acceptance-2 startup-office-beta-terms-2020-01-01" },
    }), template, releaseContext),
    /current_beta_terms_acceptance must include current terms version/,
  );
  assert.throws(
    () => validateExternalEvidencePayload(recordFor("G100", {
      fields: { signed_beta_agreement_or_payment_reference: "looks good to me" },
    }), template, releaseContext),
    /must be an external agreement, invoice, or payment reference/,
  );
  assert.throws(
    () => validateExternalEvidencePayload(recordFor("G100", {
      fields: { signed_beta_agreement_or_payment_reference: "invoice soon" },
    }), template, releaseContext),
    /must be an external agreement, invoice, or payment reference/,
  );
  assert.throws(
    () => validateExternalEvidencePayload(recordFor("G100", {
      fields: { signed_beta_agreement_or_payment_reference: "https://agreement.example/file" },
    }), template, releaseContext),
    /must point at a production public host/,
  );
});

test("rejects production deployment records without HTTPS URLs or commit SHAs", () => {
  assert.throws(
    () => validateExternalEvidencePayload(recordFor("G099", {
      fields: { production_app_url: "http://startup-office.example" },
    }), template),
    /production_app_url must be a public HTTPS URL/,
  );
  assert.throws(
    () => validateExternalEvidencePayload(recordFor("G099", {
      fields: { deploy_commit_sha: "not-a-sha" },
    }), template),
    /deploy_commit_sha/,
  );
  assert.throws(
    () => validateExternalEvidencePayload(recordFor("G099", {
      fields: { deploy_commit_sha: "abcdef1234567890abcdef1234567890abcdef12" },
    }), template, releaseContext),
    /must match current deploy commit/,
  );
  assert.throws(
    () => validateExternalEvidencePayload(recordFor("G099", {
      fields: { production_api_base_url: "https://api.startup-office.example" },
    }), template),
    /must point at a production public host/,
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

test("rejects weak production runtime evidence references", () => {
  assert.throws(
    () => validateExternalEvidencePayload(recordFor("G099", {
      fields: { dns_provider_record: "Cloudflare deployed" },
    }), template, releaseContext),
    /dns_provider_record must include a DNS record type/,
  );
  assert.throws(
    () => validateExternalEvidencePayload(recordFor("G099", {
      fields: { hosted_env_preflight_result: "passed" },
    }), template, releaseContext),
    /must state that output was redacted/,
  );
  assert.throws(
    () => validateExternalEvidencePayload(recordFor("G099", {
      fields: { release_gate_result: "passed without sha" },
    }), template, releaseContext),
    /must include deploy commit/,
  );
  assert.throws(
    () => validateExternalEvidencePayload(recordFor("G099", {
      fields: { loop_worker_workflow_run_id: "ran yesterday" },
    }), template, releaseContext),
    /external workflow URL or run reference/,
  );
  assert.throws(
    () => validateExternalEvidencePayload(recordFor("G099", {
      fields: { rollback_decision_owner: "looks good" },
    }), template, releaseContext),
    /rollback decision and owner/,
  );
  assert.throws(
    () => validateExternalEvidencePayload(recordFor("G099", {
      fields: { production_browser_artifact: "screenshot attached" },
    }), template, releaseContext),
    /external browser artifact/,
  );
});

test("rejects weak first customer runtime evidence", () => {
  assert.throws(
    () => validateExternalEvidencePayload(recordFor("G100", {
      fields: { first_loop_slug: "random-loop" },
    }), template, releaseContext),
    /first_loop_slug must be one of/,
  );
  assert.throws(
    () => validateExternalEvidencePayload(recordFor("G100", {
      fields: { workspace_id: "workspace id with spaces" },
    }), template, releaseContext),
    /workspace_id must be an opaque ID/,
  );
  assert.throws(
    () => validateExternalEvidencePayload(recordFor("G100", {
      fields: { billing_provider: "wire-transfer" },
    }), template, releaseContext),
    /billing_provider must be manual or stripe/,
  );
  assert.throws(
    () => validateExternalEvidencePayload(recordFor("G100", {
      fields: { success_note: "ok" },
    }), template, releaseContext),
    /success_note must describe/,
  );
});
