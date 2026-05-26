#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const handoffPath = "docs/ops/STARTUP-OFFICE-PRODUCTION-HANDOFF.md";
const goalsPath = "docs/specs/CLOSED-BETA-100-GOALS.md";
const manifestPath = "shared/startup-office-production-handoff.json";

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

function assertArray(value, label, minLength = 1) {
  if (!Array.isArray(value) || value.length < minLength) {
    fail(`${label} must contain at least ${minLength} entries`);
  }
}

function assertCommandExists(command, pkg) {
  const match = command.match(/^npm run ([\w:-]+)(?:\s|$)/);
  if (match && !pkg.scripts?.[match[1]]) {
    fail(`package.json is missing script for ${command}`);
  }
}

const pkg = JSON.parse(read("package.json"));
const schema = JSON.parse(read("supabase/schema/current.json"));
const manifest = JSON.parse(read(manifestPath));
if (
  pkg.scripts?.["startup-office:production-handoff"] !==
  "node scripts/check-startup-office-production-handoff.cjs"
) {
  fail("package.json must expose startup-office:production-handoff");
}

if (manifest.version !== "startup-office-production-handoff.v1") {
  fail(`unexpected production handoff manifest version ${manifest.version || "<missing>"}`);
}
if (String(schema.latestMigration) < String(manifest.currentMinimumMigration)) {
  fail(`schema latest migration ${schema.latestMigration} is older than handoff minimum ${manifest.currentMinimumMigration}`);
}
assertArray(manifest.repositoryReadiness?.deployCommitChecks, "repository readiness deploy checks", 4);
assertArray(manifest.repositoryReadiness?.forbiddenInRepo, "repository forbidden-in-repo list", 4);
assertArray(manifest.externalEvidence, "external evidence goals", 2);
assertArray(manifest.cutoverOrder, "cutover order", 10);
if (manifest.externalEvidence.length !== 2) fail("production handoff must track exactly G099 and G100");
if (manifest.cutoverOrder.length !== 10) fail("production handoff cutover must stay at 10 ordered steps");
for (const command of manifest.repositoryReadiness.deployCommitChecks) {
  assertCommandExists(command, pkg);
}
for (const forbidden of manifest.repositoryReadiness.forbiddenInRepo) {
  assertContains(handoffPath, forbidden, "production handoff forbidden-in-repo policy");
}

for (const snippet of [
  "Repository-Controlled Readiness",
  manifestPath,
  manifest.currentMinimumMigration,
  "G099 Production Deployment Evidence",
  "G100 First Customer Evidence",
  "Final Cutover Order",
]) {
  assertContains(handoffPath, snippet, "production handoff contract");
}

const evidenceByGoal = new Map(manifest.externalEvidence.map((goal) => [goal.goalId, goal]));
for (const id of ["G099", "G100"]) {
  const evidence = evidenceByGoal.get(id);
  if (!evidence) fail(`${manifestPath} must define ${id}`);
  if (evidence.statusUntilRecorded !== "Blocked") {
    fail(`${id} must stay Blocked until external evidence is recorded`);
  }
  if (!/^external .+ proof$/.test(evidence.unlockCondition || "")) {
    fail(`${id} must have an external proof unlock condition`);
  }
  if (evidence.systemOfRecord !== "operator system of record") {
    fail(`${id} must name the operator system of record`);
  }
  assertArray(evidence.requiredFields, `${id} required fields`, id === "G099" ? 16 : 12);
  for (const field of evidence.requiredFields) {
    assertContains(handoffPath, field, `${id} handoff field`);
  }
}

const goals = read(goalsPath);
if (/Backend foundation is started|frontend still needs to consume the new endpoints|not yet launch-ready/.test(goals)) {
  fail("closed beta goals readiness text must not describe an obsolete partial implementation");
}
for (const snippet of [
  "| G099 | Blocked |",
  "| G100 | Blocked |",
  "docs/ops/STARTUP-OFFICE-PRODUCTION-HANDOFF.md",
  manifestPath,
  "Repository-controlled closed beta readiness is complete through G098",
]) {
  assertContains(goalsPath, snippet, "closed beta final readiness");
}

assertContains(
  "scripts/startup-office-beta-release-gate.cjs",
  '"startup-office:production-handoff"',
  "release gate",
);
assertContains(
  "docs/specs/SILICON-VALLEY-PRODUCTION-AUDIT.md",
  manifestPath,
  "production audit handoff evidence",
);

console.log(
  `startup-office production handoff check passed: ${manifest.externalEvidence.length} external evidence goals, ` +
    `${manifest.cutoverOrder.length} cutover steps`,
);
