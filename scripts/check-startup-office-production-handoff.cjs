#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const handoffPath = "docs/ops/STARTUP-OFFICE-PRODUCTION-HANDOFF.md";
const goalsPath = "docs/specs/CLOSED-BETA-100-GOALS.md";
const manifestPath = "shared/startup-office-production-handoff.json";
const evidenceTemplatePath = "shared/startup-office-external-evidence-template.json";

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

function assertUnique(values, label) {
  const seen = new Set();
  for (const value of values) {
    if (seen.has(value)) fail(`${label} contains duplicate ${value}`);
    seen.add(value);
  }
}

function trackedJSONFiles() {
  const result = spawnSync("git", ["ls-files", "*.json"], {
    cwd: root,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    fail(`could not inspect tracked JSON files: ${result.stderr || result.stdout}`);
  }
  return result.stdout.split(/\r?\n/).filter(Boolean);
}

function containsCompletedExternalEvidence(value, completedRecordStore) {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) {
    return value.some((entry) => containsCompletedExternalEvidence(entry, completedRecordStore));
  }
  if (
    ["G099", "G100"].includes(value.goalId) &&
    value.recordedIn === completedRecordStore &&
    value.fields &&
    typeof value.fields === "object" &&
    !Array.isArray(value.fields)
  ) {
    return true;
  }
  return Object.values(value).some((entry) =>
    containsCompletedExternalEvidence(entry, completedRecordStore),
  );
}

function assertNoCompletedExternalEvidenceCommitted(template) {
  for (const file of trackedJSONFiles()) {
    const absolutePath = path.join(root, file);
    const raw = fs.readFileSync(absolutePath, "utf8");
    if (!raw.includes(template.recordCompletedCopiesIn)) continue;
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      fail(`tracked JSON file ${file} could not be parsed while checking external evidence: ${error.message}`);
    }
    if (containsCompletedExternalEvidence(parsed, template.recordCompletedCopiesIn)) {
      fail(`completed external G099/G100 evidence must not be committed: ${file}`);
    }
  }
}

const pkg = JSON.parse(read("package.json"));
const schema = JSON.parse(read("supabase/schema/current.json"));
const manifest = JSON.parse(read(manifestPath));
const evidenceTemplate = JSON.parse(read(evidenceTemplatePath));
if (
  pkg.scripts?.["startup-office:production-handoff"] !==
  "node scripts/check-startup-office-production-handoff.cjs"
) {
  fail("package.json must expose startup-office:production-handoff");
}
if (
  pkg.scripts?.["startup-office:external-evidence:validate"] !==
  "node scripts/validate-startup-office-external-evidence.cjs"
) {
  fail("package.json must expose startup-office:external-evidence:validate");
}
if (
  pkg.scripts?.["startup-office:external-evidence-validator"] !==
  "node --test scripts/validate-startup-office-external-evidence.test.cjs"
) {
  fail("package.json must expose startup-office:external-evidence-validator");
}

if (manifest.version !== "startup-office-production-handoff.v1") {
  fail(`unexpected production handoff manifest version ${manifest.version || "<missing>"}`);
}
if (String(schema.latestMigration) !== String(manifest.currentMinimumMigration)) {
  fail(`handoff minimum migration ${manifest.currentMinimumMigration} must match schema latest migration ${schema.latestMigration}`);
}
if (manifest.evidenceTemplate !== evidenceTemplatePath) {
  fail(`production handoff manifest must point at ${evidenceTemplatePath}`);
}
if (evidenceTemplate.version !== "startup-office-external-evidence-template.v1") {
  fail(`unexpected external evidence template version ${evidenceTemplate.version || "<missing>"}`);
}
if (evidenceTemplate.recordCompletedCopiesIn !== "operator system of record") {
  fail("external evidence template must point completed records at the operator system of record");
}
if (evidenceTemplate.doNotCommitCompletedRecords !== true) {
  fail("external evidence template must forbid committing completed records");
}
assertNoCompletedExternalEvidenceCommitted(evidenceTemplate);
assertArray(manifest.repositoryReadiness?.deployCommitChecks, "repository readiness deploy checks", 4);
assertArray(manifest.repositoryReadiness?.forbiddenInRepo, "repository forbidden-in-repo list", 4);
assertArray(manifest.externalEvidence, "external evidence goals", 2);
assertArray(evidenceTemplate.records, "external evidence template records", 2);
assertArray(manifest.cutoverOrder, "cutover order", 10);
if (manifest.externalEvidence.length !== 2) fail("production handoff must track exactly G099 and G100");
if (evidenceTemplate.records.length !== 2) fail("external evidence template must track exactly G099 and G100");
if (manifest.cutoverOrder.length !== 10) fail("production handoff cutover must stay at 10 ordered steps");
for (const command of manifest.repositoryReadiness.deployCommitChecks) {
  assertCommandExists(command, pkg);
}
for (const forbidden of manifest.repositoryReadiness.forbiddenInRepo) {
  assertContains(handoffPath, forbidden, "production handoff forbidden-in-repo policy");
  if (!evidenceTemplate.forbiddenInRepo?.includes(forbidden)) {
    fail(`external evidence template must forbid ${forbidden}`);
  }
}

for (const snippet of [
  "Repository-Controlled Readiness",
  manifestPath,
  evidenceTemplatePath,
  "npm run startup-office:external-evidence:validate -- --print-template",
  "npm run startup-office:external-evidence:validate -- --file",
  manifest.currentMinimumMigration,
  "G099 Production Deployment Evidence",
  "G100 First Customer Evidence",
  "Final Cutover Order",
]) {
  assertContains(handoffPath, snippet, "production handoff contract");
}

const evidenceByGoal = new Map(manifest.externalEvidence.map((goal) => [goal.goalId, goal]));
const templateByGoal = new Map(evidenceTemplate.records.map((record) => [record.goalId, record]));
for (const id of ["G099", "G100"]) {
  const evidence = evidenceByGoal.get(id);
  const template = templateByGoal.get(id);
  if (!evidence) fail(`${manifestPath} must define ${id}`);
  if (!template) fail(`${evidenceTemplatePath} must define ${id}`);
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
  assertArray(template.requiredFields, `${id} template fields`, evidence.requiredFields.length);
  assertUnique(template.requiredFields.map((field) => field.key), `${id} template field keys`);
  assertUnique(template.requiredFields.map((field) => field.label), `${id} template field labels`);
  const templateLabels = template.requiredFields.map((field) => field.label);
  if (JSON.stringify(templateLabels) !== JSON.stringify(evidence.requiredFields)) {
    fail(`${id} external evidence template fields must match the handoff manifest`);
  }
  if (template.recordType !== (id === "G099" ? "production_deployment" : "first_customer")) {
    fail(`${id} template has unexpected record type ${template.recordType || "<missing>"}`);
  }
  for (const field of evidence.requiredFields) {
    assertContains(handoffPath, field, `${id} handoff field`);
  }
  for (const field of template.requiredFields) {
    if (!field.key || !field.label || !field.valuePolicy) {
      fail(`${id} template fields must include key, label, and valuePolicy`);
    }
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
  "scripts/startup-office-beta-release-gate.cjs",
  '"startup-office:external-evidence-validator"',
  "release gate",
);
assertContains(
  "scripts/validate-startup-office-external-evidence.cjs",
  '"--print-template"',
  "external evidence skeleton command",
);
assertContains(
  "docs/specs/SILICON-VALLEY-PRODUCTION-AUDIT.md",
  manifestPath,
  "production audit handoff evidence",
);
assertContains(
  "docs/specs/SILICON-VALLEY-PRODUCTION-AUDIT.md",
  evidenceTemplatePath,
  "production audit external evidence template",
);

console.log(
  `startup-office production handoff check passed: ${manifest.externalEvidence.length} external evidence goals, ` +
    `${manifest.cutoverOrder.length} cutover steps`,
);
