#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const packagePath = path.join(root, "package.json");
const schemaPath = path.join(root, "supabase", "schema", "current.json");
const templatePath = path.join(root, "shared", "startup-office-external-evidence-template.json");
const { startupOfficeCurrentTermsPackage } = require("../api/lib/startup-office/betaTerms");
const { STARTUP_OFFICE_LOOP_DEFINITIONS } = require("../api/lib/startup-office/loopDefinitions");
const PLACEHOLDER_VALUES = new Set([
  "",
  "dummy",
  "example",
  "fake",
  "n/a",
  "na",
  "none",
  "null",
  "pending",
  "sample",
  "tbd",
  "todo",
  "unknown",
]);
const FORBIDDEN_VALUE_PATTERNS = [
  { label: "AWS access key", pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/ },
  { label: "GitHub token", pattern: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/ },
  { label: "JWT", pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/ },
  { label: "OpenAI-style API key", pattern: /\b(?:sk|rk)-[A-Za-z0-9_-]{20,}\b/ },
  { label: "Slack token", pattern: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/ },
  { label: "Stripe secret key", pattern: /\bsk_(?:live|test)_[A-Za-z0-9]{16,}\b/ },
  { label: "bearer token", pattern: /\bBearer\s+[A-Za-z0-9._~+/-]{20,}={0,2}\b/i },
];
const VALID_BILLING_PROVIDERS = new Set(["manual", "stripe"]);
const VALID_LOOP_SLUGS = new Set(STARTUP_OFFICE_LOOP_DEFINITIONS.map((loop) => loop.slug));

function loadJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function loadTemplate() {
  return loadJSON(templatePath);
}

function loadReleaseContext() {
  return {
    currentTermsVersion: startupOfficeCurrentTermsPackage().terms_version,
    deployCommitSha: currentGitSha(),
    latestMigration: String(loadJSON(schemaPath).latestMigration),
    packageVersion: String(loadJSON(packagePath).version),
  };
}

function currentGitSha() {
  return execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function normalizeRecords(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("evidence record must be an object");
  }
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.records)) return payload.records;
  return [payload];
}

function isBlankOrPlaceholder(value) {
  if (value === null || value === undefined) return true;
  const normalized = String(value).trim().toLowerCase();
  return PLACEHOLDER_VALUES.has(normalized) || /^<[^<>]+>$/.test(normalized);
}

function assertNoForbiddenValue(value, label) {
  if (value === null || value === undefined) return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoForbiddenValue(entry, `${label}[${index}]`));
    return;
  }
  if (typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      assertNoForbiddenValue(entry, `${label}.${key}`);
    }
    return;
  }
  const text = String(value);
  for (const rule of FORBIDDEN_VALUE_PATTERNS) {
    if (rule.pattern.test(text)) {
      throw new Error(`${label} contains a forbidden ${rule.label}`);
    }
  }
  if (isPaymentSensitiveField(label) && containsPaymentCardNumber(text)) {
    throw new Error(`${label} contains a forbidden payment card number`);
  }
}

function isPaymentSensitiveField(label) {
  return /agreement|billing|card|invoice|payment/i.test(label);
}

function containsPaymentCardNumber(text) {
  const candidates = text.match(/(?:\d[ -]?){13,19}/g) || [];
  return candidates.some((candidate) => {
    const digits = candidate.replace(/\D/g, "");
    return digits.length >= 13 && digits.length <= 19 && luhnValid(digits);
  });
}

function luhnValid(digits) {
  let sum = 0;
  let shouldDouble = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let value = Number(digits[index]);
    if (shouldDouble) {
      value *= 2;
      if (value > 9) value -= 9;
    }
    sum += value;
    shouldDouble = !shouldDouble;
  }
  return sum > 0 && sum % 10 === 0;
}

function validateRecord(record, template, releaseContext) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    throw new Error("evidence record must be an object");
  }
  const templateRecord = template.records.find((entry) => entry.goalId === record.goalId);
  if (!templateRecord) {
    throw new Error(`unknown goalId ${record.goalId || "<missing>"}`);
  }
  if (record.recordType !== templateRecord.recordType) {
    throw new Error(`${record.goalId} recordType must be ${templateRecord.recordType}`);
  }
  if (record.recordedIn !== template.recordCompletedCopiesIn) {
    throw new Error(`${record.goalId} recordedIn must be ${template.recordCompletedCopiesIn}`);
  }
  if (!record.fields || typeof record.fields !== "object" || Array.isArray(record.fields)) {
    throw new Error(`${record.goalId} fields must be an object`);
  }

  for (const field of templateRecord.requiredFields) {
    const value = record.fields[field.key];
    if (isBlankOrPlaceholder(value)) {
      throw new Error(`${record.goalId} missing required field ${field.key}`);
    }
    assertNoForbiddenValue(value, `${record.goalId}.${field.key}`);
  }
  validateFieldSemantics(record, releaseContext);
  return {
    fieldCount: templateRecord.requiredFields.length,
    goalId: record.goalId,
    recordType: record.recordType,
  };
}

function validateFieldSemantics(record, releaseContext) {
  const fields = record.fields;
  validateTermsEvidence(record.goalId, fields.current_beta_terms_acceptance, releaseContext);
  if (record.goalId === "G099") {
    validateDeployCommit(fields.deploy_commit_sha, releaseContext);
    if (String(fields.package_version).trim() !== releaseContext.packageVersion) {
      throw new Error(`G099 package_version must match package.json ${releaseContext.packageVersion}`);
    }
    if (!String(fields.supabase_project_ref_latest_migration).includes(releaseContext.latestMigration)) {
      throw new Error(`G099 Supabase evidence must include latest migration ${releaseContext.latestMigration}`);
    }
    validateDNSProviderRecord(fields.dns_provider_record);
    for (const key of ["production_app_url", "production_api_base_url"]) {
      validatePublicHttpsURL(`G099 ${key}`, fields[key]);
    }
    for (const key of [
      "hosted_env_preflight_result",
      "release_gate_result",
      "release_health_result",
      "secret_rotation_result",
      "post_release_monitor_window_result",
    ]) {
      if (!/\b(?:green|ok|pass(?:ed)?|success(?:ful)?)\b/i.test(String(fields[key]))) {
        throw new Error(`G099 ${key} must record a successful result`);
      }
    }
    validateRedactedPreflight(fields.hosted_env_preflight_result);
    validateResultIncludesCommit(fields.release_gate_result, releaseContext);
    for (const key of [
      "loop_worker_workflow_run_id",
      "outbox_worker_workflow_run_id",
      "ops_monitor_workflow_run_id",
      "synthetic_monitor_workflow_run_id",
    ]) {
      validateExternalReference(`G099 ${key}`, fields[key]);
    }
    for (const key of [
      "production_smoke_workspace_id",
      "first_production_smoke_run_id",
      "first_production_approval_id",
      "first_production_receipt_id",
    ]) {
      validateOpaqueID(`G099 ${key}`, fields[key]);
    }
    validateRollbackDecision(fields.rollback_decision_owner);
    validateMonitorWindow(fields.post_release_monitor_window_result);
    validateBrowserArtifact(fields.production_browser_artifact);
  }
  if (record.goalId === "G100") {
    validateCustomerAgreementReference(fields.signed_beta_agreement_or_payment_reference);
    validateOpaqueID("G100 workspace_id", fields.workspace_id);
    validateLoopSlug(fields.first_loop_slug);
    validateOpaqueID("G100 first_customer_run_id", fields.first_customer_run_id);
    validateOpaqueID("G100 first_approval_id", fields.first_approval_id);
    validateOpaqueID("G100 first_receipt_id", fields.first_receipt_id);
    validateBillingProvider(fields.billing_provider);
    if (!["trial", "paid", "paused", "blocked"].includes(String(fields.payment_status))) {
      throw new Error("G100 payment_status must be trial, paid, paused, or blocked");
    }
    if (!["approved", "revised", "rejected"].includes(String(fields.founder_decision))) {
      throw new Error("G100 founder_decision must be approved, revised, or rejected");
    }
    validateSuccessNote(fields.success_note);
  }
}

function validateDeployCommit(value, releaseContext) {
  const commit = String(value).trim();
  if (!/^[a-f0-9]{40}$/i.test(commit)) {
    throw new Error("G099 deploy_commit_sha must be a full 40-character git SHA");
  }
  if (commit !== releaseContext.deployCommitSha) {
    throw new Error(`G099 deploy_commit_sha must match current deploy commit ${releaseContext.deployCommitSha}`);
  }
}

function validateDNSProviderRecord(value) {
  const text = String(value).trim();
  if (!/\b(?:A|AAAA|ALIAS|ANAME|CNAME|TXT)\b/.test(text)) {
    throw new Error("G099 dns_provider_record must include a DNS record type");
  }
  if (text.length < 6) {
    throw new Error("G099 dns_provider_record must include provider and record type");
  }
}

function validatePublicHttpsURL(label, value) {
  let url;
  try {
    url = new URL(String(value).trim());
  } catch (error) {
    throw new Error(`${label} must be a valid HTTPS URL`);
  }
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error(`${label} must be a public HTTPS URL without embedded credentials`);
  }
  const hostname = url.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".example") ||
    hostname.endsWith(".invalid") ||
    hostname.endsWith(".test") ||
    /^(?:0|10|127|169\.254|192\.168)\./.test(hostname) ||
    /^172\.(?:1[6-9]|2\d|3[0-1])\./.test(hostname) ||
    hostname === "::1"
  ) {
    throw new Error(`${label} must point at a production public host`);
  }
}

function validateRedactedPreflight(value) {
  if (!/\b(?:redacted|hidden|masked|no secret values)\b/i.test(String(value))) {
    throw new Error("G099 hosted_env_preflight_result must state that output was redacted");
  }
}

function validateResultIncludesCommit(value, releaseContext) {
  const shortSha = releaseContext.deployCommitSha.slice(0, 12);
  if (!String(value).includes(shortSha) && !String(value).includes(releaseContext.deployCommitSha)) {
    throw new Error(`G099 release_gate_result must include deploy commit ${shortSha}`);
  }
}

function validateExternalReference(label, value) {
  const text = String(value).trim();
  if (text.startsWith("https://")) {
    validatePublicHttpsURL(label, text);
    return;
  }
  if (/^[A-Za-z0-9][A-Za-z0-9_.:/#-]{2,160}$/.test(text)) {
    return;
  }
  throw new Error(`${label} must be an external workflow URL or run reference`);
}

function validateOpaqueID(label, value) {
  if (/^[A-Za-z0-9][A-Za-z0-9_-]{2,120}$/.test(String(value).trim())) {
    return;
  }
  throw new Error(`${label} must be an opaque ID without spaces`);
}

function validateRollbackDecision(value) {
  const text = String(value);
  if (
    /\b(?:rollback|forward[- ]?fix|no[- ]?rollback)\b/i.test(text) &&
    /\b(?:approver|by|founder|operator|owner)\b/i.test(text)
  ) {
    return;
  }
  throw new Error("G099 rollback_decision_owner must include a rollback decision and owner");
}

function validateMonitorWindow(value) {
  if (/\b\d+\s*(?:m|min|minute|minutes|h|hr|hour|hours)\b/i.test(String(value))) {
    return;
  }
  throw new Error("G099 post_release_monitor_window_result must include a monitor window duration");
}

function validateBrowserArtifact(value) {
  const text = String(value).trim();
  if (text.startsWith("https://")) {
    validatePublicHttpsURL("G099 production_browser_artifact", text);
    return;
  }
  if (/^(?:artifact|browser|playwright|screenshot|trace)[:/._#-][A-Za-z0-9:/._#-]{3,160}$/i.test(text)) {
    return;
  }
  throw new Error("G099 production_browser_artifact must be an external browser artifact URL or ID");
}

function validateTermsEvidence(goalId, value, releaseContext) {
  if (!String(value).includes(releaseContext.currentTermsVersion)) {
    throw new Error(`${goalId} current_beta_terms_acceptance must include current terms version ${releaseContext.currentTermsVersion}`);
  }
}

function validateCustomerAgreementReference(value) {
  const text = String(value).trim();
  if (text.startsWith("https://")) {
    validatePublicHttpsURL("G100 signed_beta_agreement_or_payment_reference", text);
    return;
  }
  if (/\b(?:agr|contract|cs|in|inv|pay|pi)_[A-Za-z0-9_-]{4,}\b/i.test(text)) {
    return;
  }
  if (
    /\b(?:agreement|contract|invoice|manual|payment|signed|stripe)\b/i.test(text) &&
    /\b(?:agreement|contract|id|invoice|payment|ref(?:erence)?|signed)?\s*[#:]?\s*[A-Z]{2,}[-_][A-Za-z0-9-]{3,}\b/i.test(text)
  ) {
    return;
  }
  throw new Error("G100 signed_beta_agreement_or_payment_reference must be an external agreement, invoice, or payment reference");
}

function validateLoopSlug(value) {
  const slug = String(value).trim();
  if (!VALID_LOOP_SLUGS.has(slug)) {
    throw new Error(`G100 first_loop_slug must be one of ${Array.from(VALID_LOOP_SLUGS).sort().join(", ")}`);
  }
}

function validateBillingProvider(value) {
  const provider = String(value).trim().toLowerCase();
  if (!VALID_BILLING_PROVIDERS.has(provider)) {
    throw new Error("G100 billing_provider must be manual or stripe");
  }
}

function validateSuccessNote(value) {
  if (String(value).trim().length < 12) {
    throw new Error("G100 success_note must describe the founder outcome");
  }
}

function validateExternalEvidencePayload(payload, template = loadTemplate(), releaseContext = loadReleaseContext()) {
  const records = normalizeRecords(payload);
  if (records.length === 0) throw new Error("evidence payload must contain at least one record");
  const results = records.map((record) => validateRecord(record, template, releaseContext));
  const ids = new Set(results.map((result) => result.goalId));
  if (ids.size !== results.length) throw new Error("evidence payload contains duplicate goalId records");
  return results;
}

function buildEvidenceSkeleton(template = loadTemplate(), releaseContext = loadReleaseContext()) {
  return {
    records: template.records.map((record) => ({
      fields: Object.fromEntries(
        record.requiredFields.map((field) => [
          field.key,
          skeletonFieldValue(record.goalId, field.key, releaseContext),
        ]),
      ),
      goalId: record.goalId,
      recordedIn: template.recordCompletedCopiesIn,
      recordType: record.recordType,
    })),
  };
}

function skeletonFieldValue(goalId, key, releaseContext) {
  if (key === "current_beta_terms_acceptance") {
    return `<terms-acceptance-id> ${releaseContext.currentTermsVersion}`;
  }
  if (goalId === "G099") {
    return skeletonDeploymentFieldValue(key, releaseContext);
  }
  if (goalId === "G100") {
    return skeletonCustomerFieldValue(key);
  }
  return `<${key}>`;
}

function skeletonDeploymentFieldValue(key, releaseContext) {
  const shortSha = releaseContext.deployCommitSha.slice(0, 12);
  const values = {
    deploy_commit_sha: releaseContext.deployCommitSha,
    dns_provider_record: "<dns-provider> CNAME <production-host>",
    first_production_approval_id: "fill <production-approval-id>",
    first_production_receipt_id: "fill <production-receipt-id>",
    first_production_smoke_run_id: "fill <production-smoke-run-id>",
    hosted_env_preflight_result: "passed with redacted output: <preflight-run-id-or-artifact>",
    loop_worker_workflow_run_id: "fill <loop-worker-workflow-run-id-or-url>",
    ops_monitor_workflow_run_id: "fill <ops-monitor-workflow-run-id-or-url>",
    outbox_worker_workflow_run_id: "fill <outbox-worker-workflow-run-id-or-url>",
    package_version: releaseContext.packageVersion,
    post_release_monitor_window_result: "ok after <duration> minutes: <monitor-artifact-id-or-url>",
    production_api_base_url: "https://<production-api-host>",
    production_app_url: "https://<production-app-host>",
    production_browser_artifact: "fill <browser-artifact-id-or-url>",
    production_smoke_workspace_id: "fill <production-smoke-workspace-id>",
    release_gate_result: `passed on deploy commit ${shortSha}: <release-gate-run-id-or-artifact>`,
    release_health_result: "green: <release-health-artifact-id-or-url>",
    rollback_decision_owner: "no-rollback owner <operator-or-founder>",
    secret_rotation_result: "success with redacted output: <rotation-artifact-id-or-url>",
    supabase_project_ref_latest_migration: `<supabase-project-ref> latest ${releaseContext.latestMigration}`,
    synthetic_monitor_workflow_run_id: "fill <synthetic-monitor-workflow-run-id-or-url>",
  };
  return values[key] || `<${key}>`;
}

function skeletonCustomerFieldValue(key) {
  const values = {
    billing_provider: "manual",
    customer_company_name: "fill <customer-company-name>",
    first_approval_id: "fill <first-customer-approval-id>",
    first_customer_run_id: "fill <first-customer-run-id>",
    first_loop_slug: "idea-validation",
    first_receipt_id: "fill <first-customer-receipt-id>",
    founder_contact_owner: "fill <internal-founder-contact-owner>",
    founder_decision: "approved",
    payment_status: "paid",
    signed_beta_agreement_or_payment_reference: "invoice ref INV-<external-id>",
    success_note: "fill <short business outcome the founder received>",
    workspace_id: "fill <customer-workspace-id>",
  };
  return values[key] || `<${key}>`;
}

function parseArgs(argv) {
  if (argv.includes("--print-template")) {
    return { printTemplate: true };
  }
  const fileIndex = argv.indexOf("--file");
  if (fileIndex === -1 || !argv[fileIndex + 1]) {
    throw new Error(
      "usage: npm run startup-office:external-evidence:validate -- --file /path/to/evidence.json " +
        "or -- --print-template",
    );
  }
  return { file: path.resolve(argv[fileIndex + 1]) };
}

function main(argv = process.argv.slice(2)) {
  const { file, printTemplate } = parseArgs(argv);
  if (printTemplate) {
    console.log(JSON.stringify(buildEvidenceSkeleton(), null, 2));
    return;
  }
  const results = validateExternalEvidencePayload(loadJSON(file));
  console.log(
    `startup-office external evidence validation passed: ` +
      results.map((result) => `${result.goalId} ${result.fieldCount} fields`).join(", "),
  );
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`startup-office external evidence validation failed: ${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  buildEvidenceSkeleton,
  loadReleaseContext,
  loadTemplate,
  validateExternalEvidencePayload,
};
