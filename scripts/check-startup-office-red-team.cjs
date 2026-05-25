#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function fail(message) {
  console.error(`startup-office red-team check failed: ${message}`);
  process.exit(1);
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

const pkg = JSON.parse(read("package.json"));
if (
  pkg.scripts?.["startup-office:red-team"] !==
  "node --test workers/startup-office/redTeamHarness.test.js"
) {
  fail("package.json must expose startup-office:red-team");
}

if (!read("scripts/startup-office-beta-release-gate.cjs").includes('"startup-office:red-team"')) {
  fail("beta release gate must include startup-office:red-team");
}

const harness = read("workers/startup-office/redTeamHarness.js");
for (const snippet of [
  "unsupported-external-claim",
  "hallucinated-source",
  "external-action-claim",
  "guaranteed-outcome",
  "regulated-advice",
  "runStartupOfficeRedTeamCases",
]) {
  if (!harness.includes(snippet)) fail(`red-team harness is missing ${snippet}`);
}

const qualityChecks = read("workers/startup-office/qualityChecks.js");
for (const snippet of [
  "external factual claims need attached source citations",
  "outputs must not imply an external action was executed",
  "outputs must not guarantee business, legal, financial, or medical outcomes",
  "regulated legal, financial, tax, or medical advice requires expert review language",
]) {
  if (!qualityChecks.includes(snippet)) fail(`quality checks are missing ${snippet}`);
}

for (const [relativePath, snippets, label] of [
  [
    "docs/specs/SILICON-VALLEY-PRODUCTION-AUDIT.md",
    ["SV-I059", "startup-office:red-team"],
    "production audit",
  ],
  [
    "docs/specs/CLOSED-BETA-100-GOALS.md",
    ["G097", "startup-office:red-team"],
    "closed beta goals",
  ],
]) {
  const body = read(relativePath);
  for (const snippet of snippets) {
    if (!body.includes(snippet)) fail(`${label} is missing ${snippet}`);
  }
}

console.log("startup-office red-team check passed");
