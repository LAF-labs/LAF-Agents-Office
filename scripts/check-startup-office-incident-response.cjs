#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const manifestPath = "shared/startup-office-incident-response.json";
const launchKitPath = "docs/ops/STARTUP-OFFICE-CLOSED-BETA-LAUNCH-KIT.md";
const deployRunbookPath = "docs/ops/STARTUP-OFFICE-DEPLOYMENT-RUNBOOK.md";

function fail(message) {
  console.error(`startup-office incident response check failed: ${message}`);
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

function assertCommandExists(command, pkg) {
  const match = command.match(/^npm run ([\w:-]+)(?:\s|$)/);
  if (match && !pkg.scripts?.[match[1]]) {
    fail(`package.json is missing script for ${command}`);
  }
}

const pkg = JSON.parse(read("package.json"));
const manifest = JSON.parse(read(manifestPath));

if (
  pkg.scripts?.["startup-office:incident-response"] !==
  "node scripts/check-startup-office-incident-response.cjs"
) {
  fail("package.json must expose startup-office:incident-response");
}
if (manifest.version !== "startup-office-incident-response.v1") {
  fail(`unexpected incident response manifest version ${manifest.version || "<missing>"}`);
}
if (manifest.status !== "closed_beta_operational") {
  fail("incident response must be marked closed_beta_operational");
}
if (manifest.first_response_sla_minutes > 60) {
  fail("first response SLA must be 60 minutes or faster");
}
assertArray(manifest.incident_classes, "incident classes", 4);
assertArray(manifest.required_evidence, "incident evidence", 8);

for (const incident of manifest.incident_classes) {
  for (const field of ["id", "severity", "trigger"]) {
    if (!incident[field]) fail(`${incident.id || "<unknown incident>"} is missing ${field}`);
  }
  assertArray(incident.immediate_actions, `${incident.id} immediate actions`, 4);
  assertArray(incident.verification_commands, `${incident.id} verification commands`, 4);
  assertContains(launchKitPath, incident.id, `${incident.id} launch-kit incident class`);
  for (const command of incident.verification_commands) {
    assertCommandExists(command, pkg);
    assertContains(launchKitPath, command, `${incident.id} launch-kit command`);
  }
}

for (const evidence of manifest.required_evidence) {
  assertContainsNormalized(launchKitPath, evidence, "incident evidence field");
}

for (const snippet of [
  manifestPath,
  "Release-Gated Incident Response",
  "first response SLA",
]) {
  assertContainsNormalized(launchKitPath, snippet, "launch-kit incident response contract");
}

for (const snippet of [
  "incident until the stuck rows are drained",
  "its red state is the incident signal",
]) {
  assertContains(deployRunbookPath, snippet, "deployment incident signal");
}

assertContains(
  "scripts/startup-office-beta-release-gate.cjs",
  "\"startup-office:incident-response\"",
  "release gate",
);
assertContains(
  "docs/specs/SILICON-VALLEY-PRODUCTION-AUDIT.md",
  manifestPath,
  "production audit evidence",
);

console.log(
  `startup-office incident response check passed: ${manifest.incident_classes.length} incident classes`,
);
