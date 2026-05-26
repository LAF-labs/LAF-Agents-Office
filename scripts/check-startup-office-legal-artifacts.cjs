#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const manifestPath = "shared/startup-office-legal-artifacts.json";

function fail(message) {
  console.error(`startup-office legal artifacts check failed: ${message}`);
  process.exit(1);
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function assertContains(relativePath, snippet, label) {
  if (!read(relativePath).includes(snippet)) {
    fail(`${label} is missing ${snippet} in ${relativePath}`);
  }
}

function assertArray(value, label, minLength) {
  if (!Array.isArray(value) || value.length < minLength) {
    fail(`${label} must contain at least ${minLength} entries`);
  }
}

const pkg = JSON.parse(read("package.json"));
const manifest = JSON.parse(read(manifestPath));
const schema = JSON.parse(read("supabase/schema/current.json"));

if (
  pkg.scripts?.["startup-office:legal-artifacts"] !==
  "node scripts/check-startup-office-legal-artifacts.cjs"
) {
  fail("package.json must expose startup-office:legal-artifacts");
}
if (manifest.version !== "startup-office-legal-artifacts.v1") {
  fail(`unexpected legal artifacts manifest version ${manifest.version || "<missing>"}`);
}
if (manifest.status !== "operator_ready_beta_template") {
  fail("legal artifacts must remain explicitly marked as an operator-ready beta template");
}
assertArray(manifest.artifacts, "legal artifact list", 6);
assertArray(manifest.launch_controls, "legal launch controls", 4);

const termsTable = schema.activeTables.find((table) => table.name === manifest.acceptance_table);
if (!termsTable) fail(`schema must include ${manifest.acceptance_table}`);

for (const artifact of manifest.artifacts) {
  for (const field of ["name", "version_key", "current_version", "required_section"]) {
    if (!artifact[field]) fail(`${artifact.name || "<unknown artifact>"} is missing ${field}`);
  }
  if (!termsTable.columns.includes(artifact.version_key)) {
    fail(`${manifest.acceptance_table} must include ${artifact.version_key}`);
  }
  assertContains(manifest.source_document, artifact.required_section, `${artifact.name} document section`);
  assertContains("api/lib/startup-office/betaTerms.js", artifact.current_version, `${artifact.name} runtime version`);
  assertContains("api/lib/startup-office/betaTerms.js", artifact.version_key, `${artifact.name} runtime version key`);
}

for (const snippet of [
  "startup_office.terms_accepted",
]) {
  assertContains("api/lib/startup-office/termsHandlers.js", snippet, "terms acceptance handler");
}

for (const snippet of [
  "startupOfficeTermsAcceptancePayload",
  "startupOfficeTermsSnapshot",
]) {
  assertContains("api/lib/startup-office/betaTerms.js", snippet, "terms version runtime");
}

assertContains(
  "api/lib/startup-office/operationsStore.js",
  "startupOfficeTermsSnapshot",
  "terms beta ops snapshot",
);

for (const [relativePath, snippet, label] of [
  ["api/lib/startup-office/commercialBilling.js", "Accept the current beta terms before starting paid beta.", "commercial legal gate"],
  ["web/src/components/startup-office/BetaOpsPanel.tsx", "startup-office-terms-action", "legal acceptance UI"],
  ["web/src/components/startup-office/StartupOfficeApp.test.tsx", "Accept beta terms", "legal acceptance UI test"],
  ["scripts/startup-office-beta-release-gate.cjs", "\"startup-office:legal-artifacts\"", "release gate"],
  ["docs/specs/SILICON-VALLEY-PRODUCTION-AUDIT.md", manifestPath, "production audit evidence"],
]) {
  assertContains(relativePath, snippet, label);
}

console.log(
  `startup-office legal artifacts check passed: ${manifest.artifacts.length} artifacts`,
);
