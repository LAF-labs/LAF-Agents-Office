#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const auditPath = path.join(
  root,
  "docs",
  "specs",
  "SILICON-VALLEY-PRODUCTION-AUDIT.md",
);

function fail(message) {
  console.error(`production audit check failed: ${message}`);
  process.exit(1);
}

const doc = fs.readFileSync(auditPath, "utf8");
const packageJson = JSON.parse(
  fs.readFileSync(path.join(root, "package.json"), "utf8"),
);
const releaseGate = fs.readFileSync(
  path.join(root, "scripts", "startup-office-beta-release-gate.cjs"),
  "utf8",
);

function parseRows(prefix) {
  return doc
    .split(/\r?\n/)
    .filter((line) => new RegExp(`^\\| ${prefix}\\d{3} \\|`).test(line))
    .map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()));
}

function checkSequential(rows, prefix, expectedCount) {
  if (rows.length !== expectedCount) {
    fail(`expected ${expectedCount} ${prefix} rows, found ${rows.length}`);
  }
  const seen = new Set();
  for (let index = 0; index < rows.length; index += 1) {
    const [id, ...cells] = rows[index];
    const expectedID = `${prefix}${String(index + 1).padStart(3, "0")}`;
    if (id !== expectedID) fail(`expected ${expectedID}, found ${id || "<empty>"}`);
    if (seen.has(id)) fail(`duplicate id ${id}`);
    seen.add(id);
    for (const [cellIndex, cell] of cells.entries()) {
      if (!cell) fail(`${id} has empty cell ${cellIndex + 2}`);
      if (cell.toLowerCase() === "pending") {
        fail(`${id} uses non-evidence placeholder "pending"`);
      }
    }
  }
}

const issues = parseRows("SV-I");
const goals = parseRows("SV-G");
checkSequential(issues, "SV-I", 200);
checkSequential(goals, "SV-G", 100);

const roadmapRows = doc
  .split(/\r?\n/)
  .filter((line) => /^\| R\d+ \|/.test(line));
if (roadmapRows.length !== 8) {
  fail(`expected 8 roadmap phases, found ${roadmapRows.length}`);
}

for (const required of [
  "## Evidence Baseline",
  "## 200 Fundamental Problems",
  "## 100 Production Goals",
  "## Roadmap To Satisfy The Audit",
  "## Current Completion Verdict",
]) {
  if (!doc.includes(required)) fail(`missing section ${required}`);
}

for (const [scriptName, command] of [
  ["beta:release-gate", "node scripts/startup-office-beta-release-gate.cjs"],
  ["production:audit", "node scripts/check-sv-production-audit.cjs"],
  ["closed-beta:goals", "node scripts/check-closed-beta-goals.cjs"],
]) {
  if (packageJson.scripts?.[scriptName] !== command) {
    fail(`package.json must expose ${scriptName}`);
  }
}

for (const releaseGateScript of ["production:audit", "closed-beta:goals"]) {
  if (!releaseGate.includes(`"${releaseGateScript}"`)) {
    fail(`beta release gate must include ${releaseGateScript}`);
  }
}

for (const staleClaim of [
  "The release gate does not include the new production audit.",
  "There is no single command proving all cloud SaaS invariants.",
  "stricter warning cleanup",
  "Accessibility tests are missing.",
  "Accessibility checks are not in the release gate.",
  "Browser E2E for signup-to-first-approved-loop is missing.",
  "Mobile review and approval flows are not proven.",
  "Visual regression is absent for the core founder flow.",
  "Visual regression tests are missing.",
  "Load and concurrency tests for loop runs are missing.",
  "Worker concurrency and queue backpressure are not modeled.",
  "There is no staged rollout or feature flag plan for risky cloud loops.",
  "Secrets and config rotation are not a release checklist item.",
  "Versioning is not yet SaaS release-oriented around deployments, migrations, and rollback evidence.",
  "Post-release monitoring and rollback criteria are undefined.",
  "Privacy policy, DPA, and terms are not implemented as launch artifacts.",
  "Subprocessor/model provider disclosure is not represented.",
  "Incident response is not operationalized.",
  "Security review artifacts are not attached to release gates.",
  "SAST/DAST and a launch security packet remain incomplete.",
  "API server cold-start and route dispatch performance are not measured.",
  "Disaster recovery tests are missing.",
  "Database migration failure recovery is not rehearsed.",
  "There is no escrow or backup story for paid customers.",
  "RLS policies are written but not exercised against a real Supabase test database.",
  "Real Supabase RLS tests are missing.",
  "it is still statically checked rather than proven by a local Supabase reset and live RLS exercise",
  "Pricing packaging is not represented in product code or site.",
  "does not yet prove a buyer-ready package.",
  "AI output disclaimers are not consistently surfaced at decision points.",
  "Regulated-domain guardrails are prompt text, not enforceable product policy.",
]) {
  if (doc.includes(staleClaim)) fail(`audit contains stale claim: ${staleClaim}`);
}

if (!doc.includes("zero web lint errors, warnings, or infos")) {
  fail("audit must record the zero-warning web lint gate");
}

if (!doc.includes("web/playwright/startup-office-accessibility-mobile.spec.ts")) {
  fail("audit must record the Startup Office accessibility smoke evidence");
}

if (!doc.includes("web/playwright/startup-office-first-beta-flow.spec.ts")) {
  fail("audit must record the first beta Playwright flow evidence");
}

if (!releaseGate.includes('"startup-office:first-beta-smoke"')) {
  fail("beta release gate must include the first beta smoke contract");
}

for (const required of [
  "startup-office:visual-regression",
  "web/playwright/startup-office-visual-regression.spec.ts",
  "shared/startup-office-visual-regression.json",
]) {
  if (!doc.includes(required)) fail(`audit must record visual regression evidence: ${required}`);
}

if (packageJson.scripts?.["startup-office:visual-regression"] !== "node scripts/check-startup-office-visual-regression.cjs") {
  fail("package.json must expose startup-office:visual-regression");
}

if (!releaseGate.includes('"startup-office:visual-regression"')) {
  fail("beta release gate must include the visual regression contract");
}

for (const required of [
  "startup-office:loop-concurrency",
  "workers/startup-office/loopWorker.test.js",
]) {
  if (!doc.includes(required)) fail(`audit must record loop concurrency evidence: ${required}`);
}

if (packageJson.scripts?.["startup-office:loop-concurrency"] !== "node scripts/check-startup-office-loop-concurrency.cjs") {
  fail("package.json must expose startup-office:loop-concurrency");
}

if (!releaseGate.includes('"startup-office:loop-concurrency"')) {
  fail("beta release gate must include the loop concurrency contract");
}

for (const required of [
  "startup-office:loop-rollout",
  "shared/startup-office-rollout-policy.json",
]) {
  if (!doc.includes(required)) fail(`audit must record loop rollout evidence: ${required}`);
}

if (
  packageJson.scripts?.["startup-office:loop-rollout"] !==
  "node scripts/check-startup-office-loop-rollout.cjs"
) {
  fail("package.json must expose startup-office:loop-rollout");
}

if (!releaseGate.includes('"startup-office:loop-rollout"')) {
  fail("beta release gate must include the loop rollout contract");
}

for (const required of [
  "startup-office:release-health",
  "shared/startup-office-release-health.json",
]) {
  if (!doc.includes(required)) fail(`audit must record release health evidence: ${required}`);
}

if (
  packageJson.scripts?.["startup-office:release-health"] !==
  "node scripts/check-startup-office-release-health.cjs"
) {
  fail("package.json must expose startup-office:release-health");
}

if (!releaseGate.includes('"startup-office:release-health"')) {
  fail("beta release gate must include the release health contract");
}

for (const required of [
  "startup-office:secret-rotation",
  "shared/startup-office-secret-rotation.json",
]) {
  if (!doc.includes(required)) fail(`audit must record secret rotation evidence: ${required}`);
}

if (
  packageJson.scripts?.["startup-office:secret-rotation"] !==
  "node scripts/check-startup-office-secret-rotation.cjs"
) {
  fail("package.json must expose startup-office:secret-rotation");
}

if (!releaseGate.includes('"startup-office:secret-rotation"')) {
  fail("beta release gate must include the secret rotation contract");
}

for (const required of [
  "startup-office:release-versioning",
  "shared/startup-office-release-versioning.json",
]) {
  if (!doc.includes(required)) fail(`audit must record release versioning evidence: ${required}`);
}

if (
  packageJson.scripts?.["startup-office:release-versioning"] !==
  "node scripts/check-startup-office-release-versioning.cjs"
) {
  fail("package.json must expose startup-office:release-versioning");
}

if (!releaseGate.includes('"startup-office:release-versioning"')) {
  fail("beta release gate must include the release versioning contract");
}

for (const required of [
  "startup-office:legal-artifacts",
  "shared/startup-office-legal-artifacts.json",
]) {
  if (!doc.includes(required)) fail(`audit must record legal artifact evidence: ${required}`);
}

if (
  packageJson.scripts?.["startup-office:legal-artifacts"] !==
  "node scripts/check-startup-office-legal-artifacts.cjs"
) {
  fail("package.json must expose startup-office:legal-artifacts");
}

if (!releaseGate.includes('"startup-office:legal-artifacts"')) {
  fail("beta release gate must include the legal artifact contract");
}

for (const required of [
  "startup-office:subprocessors",
  "shared/startup-office-subprocessors.json",
]) {
  if (!doc.includes(required)) fail(`audit must record subprocessor evidence: ${required}`);
}

if (
  packageJson.scripts?.["startup-office:subprocessors"] !==
  "node scripts/check-startup-office-subprocessors.cjs"
) {
  fail("package.json must expose startup-office:subprocessors");
}

if (!releaseGate.includes('"startup-office:subprocessors"')) {
  fail("beta release gate must include the subprocessor disclosure contract");
}

for (const required of [
  "startup-office:incident-response",
  "shared/startup-office-incident-response.json",
]) {
  if (!doc.includes(required)) fail(`audit must record incident response evidence: ${required}`);
}

if (
  packageJson.scripts?.["startup-office:incident-response"] !==
  "node scripts/check-startup-office-incident-response.cjs"
) {
  fail("package.json must expose startup-office:incident-response");
}

if (!releaseGate.includes('"startup-office:incident-response"')) {
  fail("beta release gate must include the incident response contract");
}

for (const required of [
  "startup-office:security-review",
  "shared/startup-office-security-review.json",
]) {
  if (!doc.includes(required)) fail(`audit must record security review evidence: ${required}`);
}

if (
  packageJson.scripts?.["startup-office:security-review"] !==
  "node scripts/check-startup-office-security-review.cjs"
) {
  fail("package.json must expose startup-office:security-review");
}

if (!releaseGate.includes('"startup-office:security-review"')) {
  fail("beta release gate must include the security review contract");
}

for (const required of [
  "startup-office:api-performance",
  "shared/startup-office-api-performance.json",
]) {
  if (!doc.includes(required)) fail(`audit must record API performance evidence: ${required}`);
}

if (
  packageJson.scripts?.["startup-office:api-performance"] !==
  "node scripts/check-startup-office-api-performance.cjs"
) {
  fail("package.json must expose startup-office:api-performance");
}

if (!releaseGate.includes('"startup-office:api-performance"')) {
  fail("beta release gate must include the API performance contract");
}

for (const required of [
  "startup-office:summary-query-budget",
  "shared/startup-office-summary-query-budget.json",
]) {
  if (!doc.includes(required)) fail(`audit must record summary query budget evidence: ${required}`);
}

if (
  packageJson.scripts?.["startup-office:summary-query-budget"] !==
  "node scripts/check-startup-office-summary-query-budget.cjs"
) {
  fail("package.json must expose startup-office:summary-query-budget");
}

if (!releaseGate.includes('"startup-office:summary-query-budget"')) {
  fail("beta release gate must include the summary query budget contract");
}

for (const required of [
  "startup-office:web-bundle-budget",
  "shared/startup-office-web-bundle-budget.json",
]) {
  if (!doc.includes(required)) fail(`audit must record web bundle budget evidence: ${required}`);
}

if (
  packageJson.scripts?.["startup-office:web-bundle-budget"] !==
  "node scripts/check-startup-office-web-bundle-budget.cjs"
) {
  fail("package.json must expose startup-office:web-bundle-budget");
}

if (!releaseGate.includes('"startup-office:web-bundle-budget"')) {
  fail("beta release gate must include the web bundle budget contract");
}

for (const required of [
  "startup-office:backup-restore-drill",
  "docs/ops/STARTUP-OFFICE-BACKUP-RESTORE-DRILL.md",
  "startup-office:migration-recovery",
]) {
  if (!doc.includes(required)) fail(`audit must record recovery evidence: ${required}`);
}

for (const [scriptName, command] of [
  ["startup-office:backup-restore-drill", "node scripts/check-startup-office-backup-restore-drill.cjs"],
  ["startup-office:migration-recovery", "node scripts/check-startup-office-migration-recovery.cjs"],
]) {
  if (packageJson.scripts?.[scriptName] !== command) {
    fail(`package.json must expose ${scriptName}`);
  }
  if (!releaseGate.includes(`"${scriptName}"`)) {
    fail(`beta release gate must include ${scriptName}`);
  }
}

for (const required of [
  "startup-office:rls-live",
  "startup-office:rls-verification",
]) {
  if (!doc.includes(required)) fail(`audit must record RLS verification evidence: ${required}`);
}

for (const [scriptName, command] of [
  ["startup-office:rls-live", "node scripts/verify-startup-office-rls-postgrest.cjs"],
  ["startup-office:rls-verification", "node scripts/check-startup-office-rls-verification.cjs"],
]) {
  if (packageJson.scripts?.[scriptName] !== command) {
    fail(`package.json must expose ${scriptName}`);
  }
}

if (!releaseGate.includes('"startup-office:rls-verification"')) {
  fail("beta release gate must include startup-office:rls-verification");
}

for (const required of [
  "startup-office:paid-beta-package",
  "shared/startup-office-paid-beta-package.json",
  "Founder Beta Package",
]) {
  if (!doc.includes(required)) fail(`audit must record paid beta package evidence: ${required}`);
}

if (
  packageJson.scripts?.["startup-office:paid-beta-package"] !==
  "node scripts/check-startup-office-paid-beta-package.cjs"
) {
  fail("package.json must expose startup-office:paid-beta-package");
}

if (!releaseGate.includes('"startup-office:paid-beta-package"')) {
  fail("beta release gate must include startup-office:paid-beta-package");
}

for (const required of [
  "startup-office:compliance-disclosures",
  "shared/startup-office-compliance-disclosures.json",
  "AI decision boundary",
]) {
  if (!doc.includes(required)) {
    fail(`audit must record compliance disclosure evidence: ${required}`);
  }
}

if (
  packageJson.scripts?.["startup-office:compliance-disclosures"] !==
  "node scripts/check-startup-office-compliance-disclosures.cjs"
) {
  fail("package.json must expose startup-office:compliance-disclosures");
}

if (!releaseGate.includes('"startup-office:compliance-disclosures"')) {
  fail("beta release gate must include startup-office:compliance-disclosures");
}

console.log(
  `production audit check passed: ${issues.length} issues, ${goals.length} goals, ${roadmapRows.length} roadmap phases`,
);
