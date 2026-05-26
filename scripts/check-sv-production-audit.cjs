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
]) {
  if (doc.includes(staleClaim)) fail(`audit contains stale claim: ${staleClaim}`);
}

if (!doc.includes("zero web lint errors, warnings, or infos")) {
  fail("audit must record the zero-warning web lint gate");
}

console.log(
  `production audit check passed: ${issues.length} issues, ${goals.length} goals, ${roadmapRows.length} roadmap phases`,
);
