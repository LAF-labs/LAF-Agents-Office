#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function fail(message) {
  console.error(`startup-office support playbooks check failed: ${message}`);
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
  pkg.scripts?.["startup-office:support-playbooks"] !==
  "node scripts/check-startup-office-support-playbooks.cjs"
) {
  fail("package.json must expose startup-office:support-playbooks");
}

for (const [relativePath, snippet, label] of [
  [
    "api/lib/startup-office/supportPlaybooks.js",
    "failed_run_recovery",
    "failed run support playbook",
  ],
  [
    "api/lib/startup-office/supportPlaybooks.js",
    "approval_confusion",
    "confused approval support playbook",
  ],
  [
    "api/lib/startup-office/operationsHandlers.js",
    "support_playbooks",
    "beta dashboard support playbooks",
  ],
  [
    "api/lib/startup-office/supportPlaybooks.test.js",
    "failed runs, confused approvals, outbox, and billing blocks",
    "support playbook regression test",
  ],
  [
    "api/lib/startup-office/operationsHandlers.test.js",
    "support_playbooks",
    "dashboard support playbook regression test",
  ],
  [
    "docs/ops/STARTUP-OFFICE-CLOSED-BETA-LAUNCH-KIT.md",
    "Confused approval rescue",
    "operator support playbook docs",
  ],
  [
    "docs/specs/SILICON-VALLEY-PRODUCTION-AUDIT.md",
    "support playbooks",
    "production audit support playbook evidence",
  ],
  [
    "scripts/startup-office-beta-release-gate.cjs",
    "api/lib/startup-office/supportPlaybooks.test.js",
    "release gate support playbook test",
  ],
]) {
  assertContains(relativePath, snippet, label);
}

console.log("startup-office support playbooks check passed");
