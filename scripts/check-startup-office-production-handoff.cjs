#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const handoffPath = "docs/ops/STARTUP-OFFICE-PRODUCTION-HANDOFF.md";
const goalsPath = "docs/specs/CLOSED-BETA-100-GOALS.md";

function fail(message) {
  console.error(`startup-office production handoff check failed: ${message}`);
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

const pkg = JSON.parse(read("package.json"));
if (
  pkg.scripts?.["startup-office:production-handoff"] !==
  "node scripts/check-startup-office-production-handoff.cjs"
) {
  fail("package.json must expose startup-office:production-handoff");
}

for (const snippet of [
  "Repository-Controlled Readiness",
  "G099 Production Deployment Evidence",
  "G100 First Customer Evidence",
  "Deploy commit SHA",
  "Production app URL",
  "Supabase project ref and latest applied migration",
  "Loop worker workflow run ID",
  "Ops monitor workflow run ID",
  "Signed beta agreement URL or payment/invoice reference",
  "First customer run ID",
  "First receipt ID",
  "Final Cutover Order",
]) {
  assertContains(handoffPath, snippet, "production handoff contract");
}

const goals = read(goalsPath);
if (/Backend foundation is started|frontend still needs to consume the new endpoints|not yet launch-ready/.test(goals)) {
  fail("closed beta goals readiness text must not describe an obsolete partial implementation");
}
for (const snippet of [
  "| G099 | Blocked |",
  "| G100 | Blocked |",
  "docs/ops/STARTUP-OFFICE-PRODUCTION-HANDOFF.md",
  "Repository-controlled closed beta readiness is complete through G098",
]) {
  assertContains(goalsPath, snippet, "closed beta final readiness");
}

assertContains(
  "scripts/startup-office-beta-release-gate.cjs",
  '"startup-office:production-handoff"',
  "release gate",
);

console.log("startup-office production handoff check passed");
