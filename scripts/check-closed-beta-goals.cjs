#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const goalPath = path.join(root, "docs", "specs", "CLOSED-BETA-100-GOALS.md");
const doc = fs.readFileSync(goalPath, "utf8");
const allowedStatuses = new Set(["Complete", "In progress", "Not started", "Blocked"]);

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
for (let index = 0; index < rows.length; index += 1) {
  const [id, status, goal, exitCriterion, evidence] = rows[index];
  const expectedID = `G${String(index + 1).padStart(3, "0")}`;
  if (id !== expectedID) fail(`expected ${expectedID}, found ${id || "<empty>"}`);
  if (seen.has(id)) fail(`duplicate goal id ${id}`);
  seen.add(id);
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

console.log(
  `closed-beta goals check passed: ${rows.length} goals, ` +
    `${counts.Complete || 0} complete, ` +
    `${counts["In progress"] || 0} in progress, ` +
    `${counts["Not started"] || 0} not started, ` +
    `${counts.Blocked || 0} blocked`,
);
