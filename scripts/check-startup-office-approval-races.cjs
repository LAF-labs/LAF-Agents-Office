#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function fail(message) {
  console.error(`startup-office approval race check failed: ${message}`);
  process.exit(1);
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function assertContains(relativePath, snippets, label) {
  const source = read(relativePath);
  for (const snippet of snippets) {
    if (!source.includes(snippet)) fail(`${label} is missing ${snippet} in ${relativePath}`);
  }
}

const pkg = JSON.parse(read("package.json"));
if (
  pkg.scripts?.["startup-office:approval-races"] !==
  "node scripts/check-startup-office-approval-races.cjs"
) {
  fail("package.json must expose startup-office:approval-races");
}

assertContains(
  "api/lib/startup-office/workflowHandlers.js",
  [
    'approval.status !== "pending"',
    'status: "eq.pending"',
    "approval run is no longer waiting for approval",
    "approval is already decided",
  ],
  "approval decision race guard",
);
assertContains(
  "api/lib/startup-office/workflowHandlers.test.js",
  [
    "rejects stale linked runs before mutating approvals",
    "fails closed when the pending approval update loses a race",
    "deps.calls.receipts.length, 0",
    "deps.calls.promotions.length, 0",
  ],
  "approval race tests",
);
assertContains(
  "scripts/startup-office-beta-release-gate.cjs",
  ['"startup-office:approval-races"'],
  "beta release gate",
);
assertContains(
  "docs/specs/SILICON-VALLEY-PRODUCTION-AUDIT.md",
  ["startup-office:approval-races", "Approval decisions now fail closed"],
  "production audit evidence",
);

console.log("startup-office approval race check passed");
