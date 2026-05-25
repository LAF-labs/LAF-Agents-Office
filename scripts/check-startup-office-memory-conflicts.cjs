#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function fail(message) {
  console.error(`startup-office memory conflicts check failed: ${message}`);
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
  packageJSON.scripts?.["startup-office:memory-conflicts"] !==
  "node scripts/check-startup-office-memory-conflicts.cjs"
) {
  fail("package.json must expose startup-office:memory-conflicts");
}

for (const [relativePath, snippets, label] of [
  [
    "workers/startup-office/wikiWriter.js",
    [
      "CONFLICT_CHECKED_MEMORY_SLUGS",
      "has_unresolved_conflicts",
      "founder_approval_required",
      "founder_approved",
      "assertStartupOfficeMemoryConflictsResolved",
    ],
    "memory conflict resolver",
  ],
  [
    "workers/startup-office/wikiWriter.test.js",
    [
      "flags canonical summary conflicts",
      "blocks unresolved canonical conflicts",
      "founder-approved memory promotion resolves canonical conflicts",
    ],
    "memory conflict tests",
  ],
  [
    "api/lib/startup-office/workflowHandlers.js",
    ["approval: updatedApproval || approval"],
    "approval decision promotion handoff",
  ],
  [
    "scripts/startup-office-beta-release-gate.cjs",
    ["startup-office:memory-conflicts", "workers/startup-office/wikiWriter.test.js"],
    "release gate memory conflict coverage",
  ],
  [
    "docs/specs/SILICON-VALLEY-PRODUCTION-AUDIT.md",
    ["startup-office:memory-conflicts", "founder-approved"],
    "production audit memory conflict evidence",
  ],
]) {
  for (const snippet of snippets) assertContains(relativePath, snippet, label);
}

console.log("startup-office memory conflicts check passed");
