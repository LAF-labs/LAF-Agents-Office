#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function fail(message) {
  console.error(`startup-office synthetic monitor check failed: ${message}`);
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
for (const [name, command] of [
  ["startup-office:synthetic-monitor", "node scripts/startup-office-synthetic-monitor.cjs"],
  ["startup-office:synthetic-monitor-check", "node scripts/check-startup-office-synthetic-monitor.cjs"],
  ["startup-office:synthetic-monitor:test", "node --test scripts/startup-office-synthetic-monitor.test.cjs"],
]) {
  if (pkg.scripts?.[name] !== command) fail(`package.json must expose ${name}`);
}

for (const [relativePath, snippet, label] of [
  [
    "scripts/startup-office-synthetic-monitor.cjs",
    "runStartupOfficeSyntheticMonitor",
    "synthetic monitor entrypoint",
  ],
  [
    "scripts/startup-office-synthetic-monitor.cjs",
    "/startup-office/growth-summary",
    "profile smoke step",
  ],
  [
    "scripts/startup-office-synthetic-monitor.cjs",
    "/startup-office/receipts?limit=50",
    "receipt smoke step",
  ],
  [
    ".github/workflows/startup-office-synthetic-monitor.yml",
    "name: Startup Office Synthetic Monitor",
    "synthetic monitor workflow",
  ],
  [
    ".github/workflows/startup-office-synthetic-monitor.yml",
    "LAF_SYNTHETIC_EMAIL",
    "synthetic monitor secret",
  ],
  [
    ".github/workflows/startup-office-synthetic-monitor.yml",
    "npm run startup-office:synthetic-monitor",
    "synthetic monitor workflow command",
  ],
  [
    "docs/ops/STARTUP-OFFICE-DEPLOYMENT-RUNBOOK.md",
    "## Synthetic Monitor",
    "deployment runbook synthetic monitor section",
  ],
  [
    "docs/specs/SILICON-VALLEY-PRODUCTION-AUDIT.md",
    "deployed synthetic monitor",
    "production audit synthetic monitor evidence",
  ],
  [
    "scripts/startup-office-beta-release-gate.cjs",
    "startup-office:synthetic-monitor-check",
    "release gate synthetic monitor check",
  ],
  [
    "scripts/startup-office-beta-release-gate.cjs",
    "startup-office:synthetic-monitor:test",
    "release gate synthetic monitor test",
  ],
]) {
  assertContains(relativePath, snippet, label);
}

console.log("startup-office synthetic monitor check passed");
