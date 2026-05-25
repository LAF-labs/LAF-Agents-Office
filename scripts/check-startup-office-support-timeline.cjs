#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function fail(message) {
  console.error(`startup-office support timeline check failed: ${message}`);
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
  pkg.scripts?.["startup-office:support-timeline"] !==
  "node scripts/check-startup-office-support-timeline.cjs"
) {
  fail("package.json must expose startup-office:support-timeline");
}

for (const [relativePath, snippet, label] of [
  [
    "api/lib/startup-office/routes.js",
    "startup-office/admin/support-timeline",
    "support timeline route contract",
  ],
  [
    "api/lib/startup-office/authorization.js",
    "supportTimeline",
    "support timeline authorization",
  ],
  [
    "api/lib/startup-office/supportTimeline.js",
    "startup_office_worker_jobs",
    "worker job support timeline source",
  ],
  [
    "api/lib/startup-office/supportTimeline.test.js",
    "client.error_reported",
    "client telemetry support timeline source",
  ],
  [
    "api/lib/startup-office/supportTimeline.test.js",
    "user, worker, approval, receipt, notification, and outbox events",
    "support timeline regression test",
  ],
  [
    "scripts/startup-office-beta-release-gate.cjs",
    "api/lib/startup-office/supportTimeline.test.js",
    "release gate support timeline test",
  ],
  [
    "docs/specs/SILICON-VALLEY-PRODUCTION-AUDIT.md",
    "support timeline",
    "production audit support timeline evidence",
  ],
]) {
  assertContains(relativePath, snippet, label);
}

console.log("startup-office support timeline check passed");
