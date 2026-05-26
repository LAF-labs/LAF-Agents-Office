#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const goalPath = path.join(root, "docs", "specs", "CLOSED-BETA-100-GOALS.md");
const handoffManifestPath = path.join(root, "shared", "startup-office-production-handoff.json");
const doc = fs.readFileSync(goalPath, "utf8");
const handoffManifest = JSON.parse(fs.readFileSync(handoffManifestPath, "utf8"));
const allowedStatuses = new Set(["Complete", "In progress", "Not started", "Blocked"]);
const handoffEvidenceByGoal = new Map(
  (handoffManifest.externalEvidence || []).map((evidence) => [evidence.goalId, evidence]),
);

function fail(message) {
  console.error(`closed-beta goals check failed: ${message}`);
  process.exit(1);
}

const rows = doc
  .split(/\r?\n/)
  .filter((line) => /^\| G\d{3} \|/.test(line))
  .map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()));

if (rows.length !== 100) {
  fail(`expected 100 goals, found ${rows.length}`);
}

const seen = new Set();
const rowsById = new Map();
for (let index = 0; index < rows.length; index += 1) {
  const [id, status, goal, exitCriterion, evidence] = rows[index];
  const expectedID = `G${String(index + 1).padStart(3, "0")}`;
  if (id !== expectedID) fail(`expected ${expectedID}, found ${id || "<empty>"}`);
  if (seen.has(id)) fail(`duplicate goal id ${id}`);
  seen.add(id);
  rowsById.set(id, { status, goal, exitCriterion, evidence });
  if (!allowedStatuses.has(status)) fail(`${id} has invalid status ${status || "<empty>"}`);
  if (!goal) fail(`${id} has empty goal`);
  if (!exitCriterion) fail(`${id} has empty exit criterion`);
  if (!evidence) fail(`${id} has empty evidence`);
  if (status === "Complete" && evidence === "pending") {
    fail(`${id} is complete without concrete repository evidence`);
  }
}

const counts = rows.reduce((acc, [, status]) => {
  acc[status] = (acc[status] || 0) + 1;
  return acc;
}, {});

if ((counts.Complete || 0) !== 98) {
  fail(`expected 98 complete goals, found ${counts.Complete || 0}`);
}
if ((counts.Blocked || 0) !== 2) {
  fail(`expected exactly 2 externally blocked goals, found ${counts.Blocked || 0}`);
}
if ((counts["In progress"] || 0) !== 0 || (counts["Not started"] || 0) !== 0) {
  fail("closed beta goals must not leave repository-controlled work in progress or not started");
}

for (let goalNumber = 72; goalNumber <= 98; goalNumber += 1) {
  const id = `G${String(goalNumber).padStart(3, "0")}`;
  if (rowsById.get(id)?.status !== "Complete") {
    fail(`${id} must stay complete in the final closed-beta tranche`);
  }
}

for (const id of ["G099", "G100"]) {
  const row = rowsById.get(id);
  const handoffEvidence = handoffEvidenceByGoal.get(id);
  if (row?.status !== "Blocked") {
    fail(`${id} must remain blocked until external evidence is recorded`);
  }
  if (!handoffEvidence) {
    fail(`${id} must be defined in shared/startup-office-production-handoff.json`);
  }
  if (handoffEvidence.statusUntilRecorded !== "Blocked") {
    fail(`${id} handoff evidence must stay blocked until recorded`);
  }
  if (!/^external .+ proof$/.test(handoffEvidence.unlockCondition || "")) {
    fail(`${id} handoff evidence must require external proof`);
  }
  if (!Array.isArray(handoffEvidence.requiredFields) || handoffEvidence.requiredFields.length < 12) {
    fail(`${id} handoff evidence must define concrete required fields`);
  }
  if (!/External .* required/i.test(row.evidence)) {
    fail(`${id} must explain the external evidence required to unblock it`);
  }
  if (!row.evidence.includes("shared/startup-office-production-handoff.json")) {
    fail(`${id} evidence must point to the production handoff manifest`);
  }
}

console.log(
  `closed-beta goals check passed: ${rows.length} goals, ` +
    `${counts.Complete || 0} complete, ` +
    `${counts["In progress"] || 0} in progress, ` +
    `${counts["Not started"] || 0} not started, ` +
    `${counts.Blocked || 0} blocked`,
);
