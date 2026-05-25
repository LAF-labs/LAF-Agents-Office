#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function fail(message) {
  console.error(`startup-office plan limits check failed: ${message}`);
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
  pkg.scripts?.["startup-office:plan-limits"] !==
  "node scripts/check-startup-office-plan-limits.cjs"
) {
  fail("package.json must expose startup-office:plan-limits");
}

const schema = JSON.parse(read("supabase/schema/current.json"));
if (String(schema.latestMigration || "") < "20260526020000") {
  fail("schema latestMigration must include the plan limits migration or a later migration");
}
const billing = schema.activeTables.find((table) => table.name === "workspace_billing");
if (!billing?.columns?.includes("seat_limit")) {
  fail("workspace_billing must include seat_limit");
}

for (const [relativePath, snippet, label] of [
  [
    "supabase/migrations/20260526020000_add_startup_office_plan_limits.sql",
    "add column if not exists seat_limit integer not null default 5",
    "seat limit migration",
  ],
  [
    "api/lib/startup-office/planLimits.js",
    "assertStartupOfficeSeatLimit",
    "seat limit helper",
  ],
  [
    "api/lib/startup-office/planLimits.js",
    "assertStartupOfficeStorageLimit",
    "storage limit helper",
  ],
  [
    "api/lib/hosted/inviteHandlers.js",
    "assertStartupOfficeSeatLimit",
    "invite seat limit enforcement",
  ],
  [
    "api/lib/startup-office/objectHandlers.js",
    "enforceStorageLimit",
    "object storage limit enforcement",
  ],
  [
    "api/lib/startup-office/workflowEntitlements.js",
    "monthly Startup Office run limit reached",
    "run limit enforcement",
  ],
  [
    "api/lib/startup-office/workflowEntitlements.js",
    "monthly Startup Office model spend limit reached",
    "spend limit enforcement",
  ],
  [
    "api/[...path].js",
    "pending_invites: invites.length",
    "seat usage aggregation",
  ],
  [
    "api/[...path].js",
    "startupOfficeStorageUsage",
    "storage usage aggregation",
  ],
  [
    "scripts/startup-office-beta-release-gate.cjs",
    '"startup-office:plan-limits"',
    "release gate",
  ],
  [
    "api/lib/startup-office/planLimits.test.js",
    "storage limit blocks writes",
    "plan limit regression tests",
  ],
]) {
  assertContains(relativePath, snippet, label);
}

const goals = read("docs/specs/CLOSED-BETA-100-GOALS.md");
if (!/\| G072 \| Complete \| Add plan limits for closed beta\./.test(goals)) {
  fail("G072 must be marked complete");
}
if (!goals.includes("scripts/check-startup-office-plan-limits.cjs")) {
  fail("G072 evidence must include the plan limits check");
}

console.log("startup-office plan limits check passed");
