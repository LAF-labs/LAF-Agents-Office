#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function fail(message) {
  console.error(`startup-office provenance replay check failed: ${message}`);
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
  packageJSON.scripts?.["startup-office:provenance-replay"] !==
  "node scripts/check-startup-office-provenance-replay.cjs"
) {
  fail("package.json must expose startup-office:provenance-replay");
}

for (const [relativePath, snippets, label] of [
  [
    "api/lib/startup-office/provenanceReplay.js",
    [
      "startupOfficeReceiptReplay",
      "prompt version manifest is incomplete",
      "AI draft replay needs structured output",
      "approval-required replay needs memory diff",
      "skill_invocations",
    ],
    "provenance replay helper",
  ],
  [
    "api/lib/startup-office/provenanceReplay.test.js",
    [
      "reconstructs inputs, prompt, output, approval, cost, and memory diff",
      "fails closed when replay-critical records are missing",
    ],
    "provenance replay tests",
  ],
  [
    "scripts/startup-office-beta-release-gate.cjs",
    [
      "startup-office:provenance-replay",
      "api/lib/startup-office/provenanceReplay.test.js",
    ],
    "release gate provenance replay coverage",
  ],
  [
    "docs/specs/SILICON-VALLEY-PRODUCTION-AUDIT.md",
    ["startup-office:provenance-replay", "Receipts can replay"],
    "production audit provenance replay evidence",
  ],
]) {
  for (const snippet of snippets) assertContains(relativePath, snippet, label);
}

console.log("startup-office provenance replay check passed");
