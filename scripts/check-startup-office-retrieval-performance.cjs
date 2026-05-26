#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const manifestPath = "shared/startup-office-retrieval-performance.json";

function fail(message) {
  console.error(`startup-office retrieval performance check failed: ${message}`);
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
const packageJSON = JSON.parse(read("package.json"));
const {
  STARTUP_OFFICE_CONTEXT_RETRIEVAL_BUDGET,
  STARTUP_OFFICE_CONTEXT_SELECTS,
} = require("../workers/startup-office/contextBuilder");

if (manifest.version !== "startup-office-retrieval-performance.v1") {
  fail(`unexpected manifest version ${manifest.version || "<missing>"}`);
}

if (
  packageJSON.scripts?.["startup-office:retrieval-performance"] !==
  "node scripts/check-startup-office-retrieval-performance.cjs"
) {
  fail("package.json must expose startup-office:retrieval-performance");
}

for (const [key, expected] of Object.entries(manifest.budgets || {})) {
  const actual = STARTUP_OFFICE_CONTEXT_RETRIEVAL_BUDGET[key];
  if (actual !== expected) {
    fail(`retrieval budget ${key} expected ${expected}, found ${actual}`);
  }
}

for (const collection of manifest.select_policy?.required_collections || []) {
  const select = STARTUP_OFFICE_CONTEXT_SELECTS[collection];
  if (!select) fail(`missing context select contract for ${collection}`);
  if (select === "*" || select.includes("*")) {
    fail(`${collection} context select must not use wildcard`);
  }
}

for (const [relativePath, snippet, label] of [
  [
    "workers/startup-office/contextBuilder.js",
    "STARTUP_OFFICE_CONTEXT_RETRIEVAL_BUDGET",
    "context retrieval budget",
  ],
  [
    "workers/startup-office/contextBuilder.js",
    "STARTUP_OFFICE_CONTEXT_SELECTS",
    "context select contract",
  ],
  [
    "workers/startup-office/contextBuilder.js",
    "pickContext",
    "bounded context output",
  ],
  [
    "workers/startup-office/contextBuilder.test.js",
    "keeps retrieved text and structured fields within budget",
    "context retrieval budget regression test",
  ],
  [
    "scripts/startup-office-beta-release-gate.cjs",
    "\"startup-office:retrieval-performance\"",
    "release gate retrieval performance coverage",
  ],
  [
    "docs/specs/SILICON-VALLEY-PRODUCTION-AUDIT.md",
    manifestPath,
    "production audit retrieval performance evidence",
  ],
]) {
  assertContains(relativePath, snippet, label);
}

const contextBuilderSource = read("workers/startup-office/contextBuilder.js");
const contextBuilderFunction = contextBuilderSource.match(
  /async function buildStartupOfficeContext[\s\S]+?function rankByRelevance/,
)?.[0] || "";
if (contextBuilderFunction.includes('select: "*"')) {
  fail("context builder retrieval must not issue wildcard selects");
}

console.log(
  "startup-office retrieval performance check passed: " +
    `${Object.keys(manifest.budgets || {}).length} budgets and ` +
    `${Object.keys(STARTUP_OFFICE_CONTEXT_SELECTS).length} explicit projections`,
);
