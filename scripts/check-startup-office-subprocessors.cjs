#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const manifestPath = "shared/startup-office-subprocessors.json";
const legalPath = "docs/legal/STARTUP-OFFICE-BETA-TERMS.md";

function fail(message) {
  console.error(`startup-office subprocessor check failed: ${message}`);
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

function assertContainsNormalized(relativePath, snippet, label) {
  const body = read(relativePath).replace(/\s+/g, " ");
  const normalizedSnippet = String(snippet).replace(/\s+/g, " ");
  if (!body.includes(normalizedSnippet)) {
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

if (
  pkg.scripts?.["startup-office:subprocessors"] !==
  "node scripts/check-startup-office-subprocessors.cjs"
) {
  fail("package.json must expose startup-office:subprocessors");
}
if (manifest.version !== "startup-office-subprocessors.v1") {
  fail(`unexpected subprocessor manifest version ${manifest.version || "<missing>"}`);
}
if (manifest.change_notice_days < 30) {
  fail("subprocessor change notice must be at least 30 days");
}
assertArray(manifest.subprocessors, "subprocessor list", 6);
assertArray(manifest.model_provider_controls, "model provider controls", 4);

for (const item of manifest.subprocessors) {
  for (const field of ["name", "category", "customer_data", "enabled_when"]) {
    if (!item[field]) fail(`${item.name || "<unknown subprocessor>"} is missing ${field}`);
  }
  assertContains(legalPath, item.name, `${item.name} legal disclosure`);
}

for (const control of manifest.model_provider_controls) {
  assertContainsNormalized(legalPath, control, "model provider control");
}

for (const [relativePath, snippet, label] of [
  ["scripts/hosted-env-preflight.cjs", "fake and disabled are local/test only", "production model preflight"],
  ["workers/startup-office/modelClient.js", "provider", "model provider runtime"],
  ["api/lib/startup-office/commercialBilling.js", "beta_agreement_url", "billing agreement evidence"],
  ["scripts/startup-office-beta-release-gate.cjs", "\"startup-office:subprocessors\"", "release gate"],
  ["docs/specs/SILICON-VALLEY-PRODUCTION-AUDIT.md", manifestPath, "production audit evidence"],
]) {
  assertContains(relativePath, snippet, label);
}

console.log(
  `startup-office subprocessor check passed: ${manifest.subprocessors.length} subprocessors`,
);
