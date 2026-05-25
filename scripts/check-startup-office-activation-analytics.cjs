#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function fail(message) {
  console.error(`startup-office activation analytics check failed: ${message}`);
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
  pkg.scripts?.["startup-office:activation-analytics"] !==
  "node scripts/check-startup-office-activation-analytics.cjs"
) {
  fail("package.json must expose startup-office:activation-analytics");
}

const schema = JSON.parse(read("supabase/schema/current.json"));
const activation = schema.activeTables.find(
  (table) => table.name === "startup_office_activation_events",
);
if (!activation) fail("schema must register startup_office_activation_events");
for (const column of ["milestone", "source_table", "source_id", "first_seen_at"]) {
  if (!activation.columns.includes(column)) {
    fail(`startup_office_activation_events must include ${column}`);
  }
}

for (const [relativePath, snippet, label] of [
  [
    "supabase/migrations/20260526050000_add_startup_office_activation_events.sql",
    "first_loop_run",
    "activation migration",
  ],
  [
    "api/lib/startup-office/activationAnalytics.js",
    "second_loop_run",
    "repeat-loop milestone",
  ],
  [
    "api/lib/startup-office/workflowHandlers.js",
    "recordStartupOfficeRunActivation",
    "run activation hook",
  ],
  [
    "api/lib/startup-office/workflowHandlers.js",
    "recordStartupOfficeApprovalActivation",
    "approval activation hook",
  ],
  [
    "api/lib/startup-office/queryHandlers.js",
    "recordStartupOfficeExportActivation",
    "export activation hook",
  ],
  [
    "api/[...path].js",
    "startupOfficeActivationSnapshot",
    "beta ops activation snapshot",
  ],
  [
    "web/src/components/startup-office/BetaOpsPanel.tsx",
    "activationProgressText",
    "activation UI",
  ],
  [
    "api/lib/startup-office/activationAnalytics.test.js",
    "first loop, approval, repeat loop, and export progress",
    "activation regression test",
  ],
  [
    "docs/specs/SILICON-VALLEY-PRODUCTION-AUDIT.md",
    "activation analytics",
    "production audit activation evidence",
  ],
]) {
  assertContains(relativePath, snippet, label);
}

console.log("startup-office activation analytics check passed");
