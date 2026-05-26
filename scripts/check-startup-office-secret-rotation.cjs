#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const manifestPath = "shared/startup-office-secret-rotation.json";
const runbookPath = "docs/ops/STARTUP-OFFICE-DEPLOYMENT-RUNBOOK.md";
const handoffPath = "docs/ops/STARTUP-OFFICE-PRODUCTION-HANDOFF.md";

function fail(message) {
  console.error(`startup-office secret rotation check failed: ${message}`);
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

function assertCommandExists(command, pkg) {
  const match = command.match(/^npm run ([\w:-]+)(?:\s|$)/);
  if (match && !pkg.scripts?.[match[1]]) {
    fail(`package.json is missing script for ${command}`);
  }
}

const pkg = JSON.parse(read("package.json"));
const manifest = JSON.parse(read(manifestPath));

if (
  pkg.scripts?.["startup-office:secret-rotation"] !==
  "node scripts/check-startup-office-secret-rotation.cjs"
) {
  fail("package.json must expose startup-office:secret-rotation");
}
if (manifest.version !== "startup-office-secret-rotation.v1") {
  fail(`unexpected secret rotation manifest version ${manifest.version || "<missing>"}`);
}
if (manifest.review_cadence_days > 30) {
  fail("secret rotation review cadence must be monthly or faster");
}
assertArray(manifest.emergency_rotation_triggers, "emergency rotation triggers", 4);
assertArray(manifest.secret_inventory, "secret inventory", 6);
assertArray(manifest.config_inventory, "config inventory", 7);
assertArray(manifest.post_rotation_verification, "post-rotation verification", 4);
assertArray(manifest.forbidden_records, "forbidden records", 4);

const secretNames = new Set(manifest.secret_inventory.map((item) => item.name));
for (const name of [
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_ANON_KEY",
  "LAF_OFFICE_OPENAI_API_KEY",
  "OPENAI_API_KEY",
  "RESEND_API_KEY",
  "LAF_SYNTHETIC_PASSWORD",
]) {
  if (!secretNames.has(name)) fail(`secret inventory must include ${name}`);
  assertContains(runbookPath, name, `${name} runbook inventory`);
}

for (const item of manifest.secret_inventory) {
  for (const field of ["name", "owner", "rotation_cadence_days", "blast_radius"]) {
    if (!item[field]) fail(`${item.name || "<unknown secret>"} is missing ${field}`);
  }
  if (item.rotation_cadence_days > 180) {
    fail(`${item.name} rotation cadence must not exceed 180 days`);
  }
}

for (const command of manifest.post_rotation_verification) {
  assertCommandExists(command, pkg);
  assertContains(runbookPath, command, "post-rotation verification command");
}

for (const snippet of [
  manifestPath,
  "Secret And Config Rotation",
  "emergency rotation",
  "post-rotation verification",
]) {
  assertContains(runbookPath, snippet, "secret rotation runbook");
}

assertContains(
  handoffPath,
  "npm run startup-office:secret-rotation",
  "production handoff readiness command",
);
assertContains(
  "shared/startup-office-production-handoff.json",
  "npm run startup-office:secret-rotation",
  "production handoff manifest",
);
assertContains(
  "scripts/startup-office-beta-release-gate.cjs",
  '"startup-office:secret-rotation"',
  "release gate",
);

console.log(
  `startup-office secret rotation check passed: ${manifest.secret_inventory.length} secrets, ` +
    `${manifest.config_inventory.length} config keys`,
);
