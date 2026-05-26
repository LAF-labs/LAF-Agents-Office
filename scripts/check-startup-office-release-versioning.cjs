#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const manifestPath = "shared/startup-office-release-versioning.json";
const handoffManifestPath = "shared/startup-office-production-handoff.json";
const handoffPath = "docs/ops/STARTUP-OFFICE-PRODUCTION-HANDOFF.md";
const runbookPath = "docs/ops/STARTUP-OFFICE-DEPLOYMENT-RUNBOOK.md";

function fail(message) {
  console.error(`startup-office release versioning check failed: ${message}`);
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
const schema = JSON.parse(read("supabase/schema/current.json"));
const manifest = JSON.parse(read(manifestPath));
const handoff = JSON.parse(read(handoffManifestPath));

if (
  pkg.scripts?.["startup-office:release-versioning"] !==
  "node scripts/check-startup-office-release-versioning.cjs"
) {
  fail("package.json must expose startup-office:release-versioning");
}
if (manifest.version !== "startup-office-release-versioning.v1") {
  fail(`unexpected release versioning manifest version ${manifest.version || "<missing>"}`);
}
if (manifest.current_package_version !== pkg.version) {
  fail(`manifest package version ${manifest.current_package_version} does not match package.json ${pkg.version}`);
}
if (manifest.current_minimum_migration !== handoff.currentMinimumMigration) {
  fail("release versioning minimum migration must match production handoff");
}
if (String(schema.latestMigration) !== String(manifest.current_minimum_migration)) {
  fail(`release minimum migration ${manifest.current_minimum_migration} must match schema latest migration ${schema.latestMigration}`);
}
if (!manifest.release_id_format.includes("{package.version}") || !manifest.release_id_format.includes("{latestMigration}")) {
  fail("release ID format must include package and schema versions");
}

assertArray(manifest.required_release_evidence, "required release evidence", 8);
assertArray(manifest.rollback_compatibility, "rollback compatibility rules", 4);
assertArray(manifest.required_commands, "required commands", 5);

for (const command of manifest.required_commands) {
  assertCommandExists(command, pkg);
  assertContains(handoffPath, command, "handoff release command");
}

for (const evidence of manifest.required_release_evidence) {
  assertContains(handoffPath, evidence, "release evidence field");
}

for (const snippet of [
  manifestPath,
  "Release Versioning",
  manifest.release_id_format,
  "Package version",
  "Rollback decision and owner",
]) {
  assertContains(handoffPath, snippet, "release versioning handoff");
}

for (const rule of manifest.rollback_compatibility) {
  assertContainsNormalized(runbookPath, rule, "rollback compatibility rule");
}

assertContains(
  "scripts/startup-office-beta-release-gate.cjs",
  '"startup-office:release-versioning"',
  "release gate",
);

console.log(
  `startup-office release versioning check passed: package ${pkg.version}, ` +
    `migration ${manifest.current_minimum_migration}`,
);
