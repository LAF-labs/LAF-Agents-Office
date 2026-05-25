#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function fail(message) {
  console.error(`startup-office memory freshness check failed: ${message}`);
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
  packageJSON.scripts?.["startup-office:memory-freshness"] !==
  "node scripts/check-startup-office-memory-freshness.cjs"
) {
  fail("package.json must expose startup-office:memory-freshness");
}

for (const [relativePath, snippets, label] of [
  [
    "api/lib/startup-office/memoryFreshness.js",
    [
      "startupOfficeMemoryFreshness",
      "needs_review",
      "review_soon",
      "stale",
      "review_interval_days",
    ],
    "memory freshness policy",
  ],
  [
    "api/lib/startup-office/serializers.js",
    ["freshness: startupOfficeMemoryFreshness(row)"],
    "memory freshness API serialization",
  ],
  [
    "web/src/components/startup-office/CompanyProfilePanel.tsx",
    ["memoryFreshnessLabels", "startup-memory-freshness"],
    "memory freshness UI surface",
  ],
  [
    "scripts/startup-office-beta-release-gate.cjs",
    [
      "startup-office:memory-freshness",
      "api/lib/startup-office/memoryFreshness.test.js",
      "api/lib/startup-office/serializers.test.js",
    ],
    "release gate memory freshness coverage",
  ],
  [
    "docs/specs/SILICON-VALLEY-PRODUCTION-AUDIT.md",
    ["startup-office:memory-freshness", "Stale claims surface"],
    "production audit memory freshness evidence",
  ],
]) {
  for (const snippet of snippets) assertContains(relativePath, snippet, label);
}

console.log("startup-office memory freshness check passed");
