#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const manifestPath = "shared/startup-office-summary-query-budget.json";

function fail(message) {
  console.error(`startup-office summary query budget check failed: ${message}`);
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

const manifest = JSON.parse(read(manifestPath));
const pkg = JSON.parse(read("package.json"));
const {
  STARTUP_OFFICE_GROWTH_SUMMARY_QUERY_BUDGET,
  STARTUP_OFFICE_GROWTH_SUMMARY_SELECTS,
} = require("../api/lib/startup-office/queryHandlers");

if (manifest.version !== "startup-office-summary-query-budget.v1") {
  fail(`unexpected manifest version ${manifest.version || "<missing>"}`);
}

if (
  pkg.scripts?.["startup-office:summary-query-budget"] !==
  "node scripts/check-startup-office-summary-query-budget.cjs"
) {
  fail("package.json must expose startup-office:summary-query-budget");
}

const limits = manifest.summary_limits || {};
for (const [key, expected] of Object.entries(limits)) {
  const actual = STARTUP_OFFICE_GROWTH_SUMMARY_QUERY_BUDGET[key];
  if (actual !== expected) {
    fail(`summary budget ${key} expected ${expected}, found ${actual}`);
  }
}

for (const collection of manifest.select_policy?.required_collections || []) {
  const select = STARTUP_OFFICE_GROWTH_SUMMARY_SELECTS[collection];
  if (!select) fail(`missing select contract for ${collection}`);
  if (select === "*" || select.includes("*")) {
    fail(`${collection} summary select must not use wildcard`);
  }
}

for (const [relativePath, snippet, label] of [
  [
    "api/lib/startup-office/queryHandlers.js",
    "startupOfficeLoops(membership.team_id, {",
    "growth summary loop budget",
  ],
  [
    "api/lib/startup-office/queryHandlers.js",
    "startupOfficeBetaOpsSnapshot(membership.team_id, {",
    "growth summary beta ops budget",
  ],
  [
    "api/lib/startup-office/queryHandlers.js",
    "STARTUP_OFFICE_GROWTH_SUMMARY_SELECTS.notifications",
    "growth summary notification projection",
  ],
  [
    "api/lib/startup-office/repositoryDelegates.js",
    "startupOfficeLoops(teamID, options = {})",
    "repository delegate loop options",
  ],
  [
    "api/lib/startup-office/repositories.js",
    "select: options.select || \"*\"",
    "repository summary projection support",
  ],
  [
    "api/lib/startup-office/objectStore.js",
    "select: options.select || \"*\"",
    "object store summary projection support",
  ],
  [
    "api/lib/startup-office/operationsStore.js",
    "usage_event_limit",
    "beta ops usage budget",
  ],
  [
    "api/lib/startup-office/operationsStore.js",
    "storage_row_limit",
    "beta ops storage budget",
  ],
  [
    "api/lib/startup-office/activationAnalytics.js",
    "options.limit",
    "activation event budget",
  ],
  [
    "api/lib/startup-office/queryHandlers.test.js",
    "growth summary caps row counts and avoids wildcard selects",
    "growth summary regression test",
  ],
  [
    "api/lib/startup-office/operationsStore.test.js",
    "operations snapshot honors summary query budgets",
    "beta ops budget regression test",
  ],
  [
    "scripts/startup-office-beta-release-gate.cjs",
    "\"startup-office:summary-query-budget\"",
    "release gate",
  ],
  [
    "docs/specs/SILICON-VALLEY-PRODUCTION-AUDIT.md",
    manifestPath,
    "production audit evidence",
  ],
]) {
  assertContains(relativePath, snippet, label);
}

const growthSummarySource = read("api/lib/startup-office/queryHandlers.js").match(
  /async function handleStartupOfficeGrowthSummary[\s\S]+?async function handleStartupOfficeLoops/,
)?.[0] || "";
if (growthSummarySource.includes('select: "*"')) {
  fail("growth summary handler must not issue wildcard selects");
}

console.log(
  "startup-office summary query budget check passed: " +
    `${Object.keys(limits).length} bounded limits and ` +
    `${Object.keys(STARTUP_OFFICE_GROWTH_SUMMARY_SELECTS).length} explicit projections`,
);
