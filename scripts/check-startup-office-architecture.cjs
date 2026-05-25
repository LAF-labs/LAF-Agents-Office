#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function fail(message) {
  console.error(`startup-office architecture check failed: ${message}`);
  process.exit(1);
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function lineCount(relativePath) {
  return read(relativePath).split(/\r?\n/).length;
}

function assertMaxLines(relativePath, maxLines) {
  const actual = lineCount(relativePath);
  if (actual > maxLines) {
    fail(`${relativePath} has ${actual} lines; max is ${maxLines}`);
  }
}

function assertNotContains(relativePath, pattern, label) {
  const body = read(relativePath);
  if (pattern.test(body)) {
    fail(`${relativePath} still contains ${label}`);
  }
}

assertMaxLines("api/[...path].js", 4140);
assertMaxLines("api/lib/startup-office/operationsHandlers.js", 220);
assertMaxLines("api/lib/startup-office/objectHandlers.js", 220);
assertMaxLines("api/lib/startup-office/queryHandlers.js", 260);
assertMaxLines("api/lib/startup-office/workflowHandlers.js", 520);
assertMaxLines("api/lib/startup-office/routes.js", 180);
assertMaxLines("api/lib/startup-office/dispatcher.js", 80);

for (const [pattern, label] of [
  [/async function handleStartupOfficePolicy\b/, "operations policy handler"],
  [/async function handleStartupOfficeBilling\b/, "operations billing handler"],
  [/async function handleStartupOfficeBetaDashboard\b/, "operations beta dashboard handler"],
  [/async function handleStartupOfficeObjectCollection\b/, "object collection handler"],
  [/async function handleStartupOfficeObjectItem\b/, "object item handler"],
  [/async function handleStartupOfficeArtifactObjectAction\b/, "artifact object action handler"],
  [/async function handleStartupOfficeGrowthSummary\b/, "growth summary handler"],
  [/async function handleStartupOfficeLoops\b/, "loops handler"],
  [/async function handleStartupOfficeApprovals\b/, "approvals handler"],
  [/async function handleStartupOfficeReceipts\b/, "receipts handler"],
  [/async function handleStartupOfficeExport\b/, "export handler"],
  [/async function startupOfficeObjectSummary\b/, "object summary helper"],
  [/async function handleStartupOfficeLoopRun\b/, "loop run handler"],
  [/async function handleStartupOfficeRun\b/, "run handler"],
  [/async function handleStartupOfficeApprovalAction\b/, "approval action handler"],
  [/async function enforceStartupOfficeRunLimit\b/, "run limit helper"],
  [/async function recordStartupOfficeRunOutcome\b/, "run outcome helper"],
]) {
  assertNotContains("api/[...path].js", pattern, label);
}

console.log("startup-office architecture check passed");
