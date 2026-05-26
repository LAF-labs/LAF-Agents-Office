#!/usr/bin/env node

const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const webRoot = path.join(root, "web");
const warningBudget = 0;
const infoBudget = 0;

function fail(message, output = "") {
  console.error(`startup-office web lint budget check failed: ${message}`);
  if (output) console.error(output.trim().slice(-4000));
  process.exit(1);
}

function parseCount(output, label) {
  const match = output.match(new RegExp(`Found (\\d+) ${label}s?\\.`));
  return match ? Number(match[1]) : 0;
}

const result = spawnSync("npm", ["run", "lint"], {
  cwd: webRoot,
  encoding: "utf8",
  maxBuffer: 1024 * 1024 * 8,
});
const output = `${result.stdout || ""}\n${result.stderr || ""}`;

if (result.status !== 0) {
  fail("web lint emitted errors", output);
}

const errors = parseCount(output, "error");
const warnings = parseCount(output, "warning");
const infos = parseCount(output, "info");

if (errors > 0) fail(`expected 0 errors, found ${errors}`, output);
if (warnings > warningBudget) {
  fail(`warning budget exceeded: ${warnings}/${warningBudget}`, output);
}
if (infos > infoBudget) fail(`info budget exceeded: ${infos}/${infoBudget}`, output);

console.log(
  `startup-office web lint budget check passed: ${warnings}/${warningBudget} warnings, ${infos}/${infoBudget} infos`,
);
