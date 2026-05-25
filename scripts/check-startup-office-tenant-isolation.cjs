#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function fail(message) {
  console.error(`startup-office tenant isolation check failed: ${message}`);
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

const packageJson = JSON.parse(read("package.json"));
if (
  packageJson.scripts?.["startup-office:tenant-isolation"] !==
  "node scripts/check-startup-office-tenant-isolation.cjs"
) {
  fail("package.json must expose startup-office:tenant-isolation");
}

assertContains(
  "scripts/startup-office-beta-release-gate.cjs",
  '"startup-office:tenant-isolation"',
  "beta release gate",
);

for (const [relativePath, snippet, label] of [
  [
    "api/lib/startup-office/tenantIsolation.test.js",
    "hosted API reads only caller workspace records when IDs collide",
    "cross-workspace read behavior test",
  ],
  [
    "api/lib/startup-office/tenantIsolation.test.js",
    "hosted API writes caller workspace only when request carries another team id",
    "cross-workspace write behavior test",
  ],
  [
    "api/lib/startup-office/tenantIsolation.test.js",
    "workflow mutations cannot update another workspace record with the same ID",
    "cross-workspace workflow mutation behavior test",
  ],
  [
    "api/lib/startup-office/tenantIsolation.test.js",
    "team_id: TEAM_BETA",
    "same-id hostile fixture",
  ],
  [
    "api/lib/startup-office/tenantIsolation.test.js",
    "assertNoBetaData",
    "leakage assertion",
  ],
  [
    "api/lib/startup-office/repositories.js",
    "team_id: `eq.${teamID}`",
    "repository team filters",
  ],
  [
    "api/lib/startup-office/objectHandlers.js",
    "team_id: `eq.${membership.team_id}`",
    "object mutation team filters",
  ],
  [
    "api/lib/startup-office/workflowHandlers.js",
    "team_id: `eq.${membership.team_id}`",
    "workflow mutation team filters",
  ],
]) {
  assertContains(relativePath, snippet, label);
}

console.log("startup-office tenant isolation check passed");
