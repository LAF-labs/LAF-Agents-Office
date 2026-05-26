#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const manifestPath = "shared/startup-office-release-health.json";
const runbookPath = "docs/ops/STARTUP-OFFICE-DEPLOYMENT-RUNBOOK.md";

function fail(message) {
  console.error(`startup-office release health check failed: ${message}`);
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
  pkg.scripts?.["startup-office:release-health"] !==
  "node scripts/check-startup-office-release-health.cjs"
) {
  fail("package.json must expose startup-office:release-health");
}
if (manifest.version !== "startup-office-release-health.v1") {
  fail(`unexpected release health manifest version ${manifest.version || "<missing>"}`);
}
if (manifest.post_release_window_minutes < 30) {
  fail("post-release window must cover at least 30 minutes");
}
assertArray(manifest.required_monitors, "required monitors", 2);
assertArray(manifest.rollback_triggers, "rollback triggers", 4);
assertArray(manifest.required_recovery_commands, "required recovery commands", 4);

for (const monitor of manifest.required_monitors) {
  for (const field of ["name", "workflow", "command", "cadence", "signal"]) {
    if (!monitor[field]) fail(`monitor ${monitor.name || "<unknown>"} is missing ${field}`);
  }
  assertCommandExists(monitor.command, pkg);
  assertContains(runbookPath, monitor.workflow, `${monitor.name} workflow`);
  assertContains(runbookPath, monitor.command, `${monitor.name} command`);
}

for (const trigger of manifest.rollback_triggers) {
  for (const field of ["id", "signal", "decision", "operator_action"]) {
    if (!trigger[field]) fail(`rollback trigger ${trigger.id || "<unknown>"} is missing ${field}`);
  }
}

for (const command of manifest.required_recovery_commands) {
  assertCommandExists(command, pkg);
  assertContains(runbookPath, command, "release recovery command");
}

for (const snippet of [
  manifestPath,
  "Release Health Contract",
  "post-release window",
  "rollback triggers",
]) {
  assertContains(runbookPath, snippet, "release health runbook");
}

assertContains(
  "scripts/startup-office-beta-release-gate.cjs",
  '"startup-office:release-health"',
  "release gate",
);

console.log(
  `startup-office release health check passed: ${manifest.required_monitors.length} monitors, ` +
    `${manifest.rollback_triggers.length} rollback triggers`,
);
