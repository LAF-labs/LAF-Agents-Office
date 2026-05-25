#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function fail(message) {
  console.error(`startup-office retrieval quality check failed: ${message}`);
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

const packageJSON = JSON.parse(read("package.json"));
if (
  packageJSON.scripts?.["startup-office:retrieval-quality"] !==
  "node scripts/check-startup-office-retrieval-quality.cjs"
) {
  fail("package.json must expose startup-office:retrieval-quality");
}

for (const [relativePath, snippets, label] of [
  [
    "workers/startup-office/retrievalQuality.js",
    [
      "business_loop_outcome",
      "macro_precision_at_k",
      "macro_recall_at_k",
      "assertStartupOfficeRetrievalQuality",
      "startupOfficeRetrievalQualityScenarios",
    ],
    "business-loop retrieval quality evaluator",
  ],
  [
    "workers/startup-office/retrievalQuality.test.js",
    [
      "tracks recall and precision",
      "fails when expected evidence is not recovered",
      "selected and hit ids",
    ],
    "retrieval quality tests",
  ],
  [
    "scripts/startup-office-beta-release-gate.cjs",
    ["startup-office:retrieval-quality", "workers/startup-office/retrievalQuality.test.js"],
    "release gate retrieval quality coverage",
  ],
  [
    "docs/specs/SILICON-VALLEY-PRODUCTION-AUDIT.md",
    ["startup-office:retrieval-quality", "business-loop retrieval eval"],
    "production audit retrieval quality evidence",
  ],
]) {
  for (const snippet of snippets) assertContains(relativePath, snippet, label);
}

const { assertStartupOfficeRetrievalQuality } = require("../workers/startup-office/retrievalQuality");
const report = assertStartupOfficeRetrievalQuality();
if (report.macro_recall_at_k < 0.8 || report.macro_precision_at_k < 0.5) {
  fail(
    `retrieval quality below threshold precision=${report.macro_precision_at_k} recall=${report.macro_recall_at_k}`,
  );
}

console.log(
  `startup-office retrieval quality check passed: precision=${report.macro_precision_at_k}, recall=${report.macro_recall_at_k}`,
);
