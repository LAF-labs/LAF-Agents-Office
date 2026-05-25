#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function fail(message) {
  console.error(`startup-office cost metering check failed: ${message}`);
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
  pkg.scripts?.["startup-office:cost-metering"] !==
  "node scripts/check-startup-office-cost-metering.cjs"
) {
  fail("package.json must expose startup-office:cost-metering");
}

const schema = JSON.parse(read("supabase/schema/current.json"));
if (schema.latestMigration !== "20260526010000") {
  fail("schema latestMigration must point at the cost metering migration");
}
const usageEvents = schema.activeTables.find(
  (table) => table.name === "startup_office_usage_events",
);
if (!usageEvents) fail("startup_office_usage_events must remain active");
for (const column of ["team_id", "run_id", "tool_calls", "idempotency_key"]) {
  if (!usageEvents.columns.includes(column)) {
    fail(`startup_office_usage_events is missing ${column}`);
  }
}

for (const [relativePath, snippet, label] of [
  [
    "supabase/migrations/20260526010000_add_startup_office_cost_metering.sql",
    "add column if not exists tool_calls integer not null default 0",
    "tool call column migration",
  ],
  [
    "supabase/migrations/20260526010000_add_startup_office_cost_metering.sql",
    "idx_startup_office_usage_events_idempotency_key",
    "idempotent usage event index",
  ],
  [
    "api/lib/startup-office/runOutcomeRecorder.js",
    "startupOfficeUsageEventBody",
    "shared usage event body builder",
  ],
  [
    "api/lib/startup-office/runOutcomeRecorder.js",
    "tool_calls: toolCalls.total",
    "tool call persistence",
  ],
  [
    "api/lib/startup-office/runOutcomeRecorder.js",
    "worker_duration_ms: workerDurationMs",
    "worker duration persistence",
  ],
  [
    "workers/startup-office/loopWorker.js",
    "recordUsageEvent",
    "worker usage recorder hook",
  ],
  [
    "scripts/startup-office-loop-worker.cjs",
    "recordStartupOfficeUsageEvent",
    "deployed worker usage recorder",
  ],
  [
    "api/[...path].js",
    "out.tool_calls += Number(event.tool_calls || 0);",
    "workspace usage aggregation",
  ],
  [
    "api/lib/hosted/usageHandlers.js",
    "tool_calls: toolCalls",
    "hosted usage response",
  ],
  [
    "scripts/startup-office-beta-release-gate.cjs",
    '"startup-office:cost-metering"',
    "release gate",
  ],
  [
    "api/lib/startup-office/runOutcomeRecorder.test.js",
    "attributes tokens, tools, duration, and cost to workspace",
    "usage event regression test",
  ],
]) {
  assertContains(relativePath, snippet, label);
}

const goals = read("docs/specs/CLOSED-BETA-100-GOALS.md");
if (!/\| G071 \| Complete \| Add cost metering per workspace\./.test(goals)) {
  fail("G071 must be marked complete");
}
if (!goals.includes("scripts/check-startup-office-cost-metering.cjs")) {
  fail("G071 evidence must include the cost metering check");
}

console.log("startup-office cost metering check passed");
