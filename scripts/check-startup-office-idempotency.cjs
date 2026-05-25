#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function fail(message) {
  console.error(`startup-office idempotency check failed: ${message}`);
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

const packageJson = JSON.parse(read("package.json"));
if (
  packageJson.scripts?.["startup-office:idempotency"] !==
  "node scripts/check-startup-office-idempotency.cjs"
) {
  fail("package.json must expose startup-office:idempotency");
}

assertContains(
  "scripts/startup-office-beta-release-gate.cjs",
  '"startup-office:idempotency"',
  "beta release gate",
);

for (const [relativePath, snippet, label] of [
  [
    "api/lib/startup-office/validation.js",
    'headerValue(req, "idempotency-key")',
    "header idempotency key parsing",
  ],
  [
    "api/lib/startup-office/validation.js",
    "value.idempotency_key || value.idempotencyKey",
    "body idempotency key parsing",
  ],
  [
    "api/lib/startup-office/workflowHandlers.js",
    "repository.findRunByIdempotencyKey",
    "loop run idempotent replay lookup",
  ],
  [
    "api/lib/startup-office/workflowHandlers.js",
    "idempotent: true",
    "loop run idempotent replay response",
  ],
  [
    "api/lib/startup-office/workflowHandlers.js",
    "idempotency_key: idempotencyKey",
    "loop run idempotency key persistence",
  ],
  [
    "api/lib/startup-office/repositories.js",
    "err.status !== 409",
    "repository conflict fallback",
  ],
  [
    "api/lib/startup-office/workflowHandlers.test.js",
    "loopRun replays an existing idempotent run without duplicate side effects",
    "workflow idempotency replay test",
  ],
  [
    "api/lib/startup-office/repositories.test.js",
    "repository returns an existing run when idempotent create conflicts",
    "repository idempotency conflict test",
  ],
]) {
  assertContains(relativePath, snippet, label);
}

const schema = JSON.parse(read("supabase/schema/current.json"));
const runRule = (schema.idempotencyKeys || []).find(
  (rule) =>
    rule.table === "startup_office_runs" &&
    rule.column === "idempotency_key" &&
    rule.index === "idx_startup_office_runs_idempotency_key",
);
if (!runRule) {
  fail("current schema must declare startup_office_runs idempotency key");
}

const migration = read("supabase/migrations/20260525050000_startup_office_idempotency_keys.sql");
for (const snippet of [
  "alter table if exists public.startup_office_runs",
  "idx_startup_office_runs_idempotency_key",
  "on public.startup_office_runs(team_id, idempotency_key)",
  "where idempotency_key <> ''",
]) {
  if (!migration.includes(snippet)) {
    fail(`idempotency migration is missing ${snippet}`);
  }
}

console.log("startup-office idempotency check passed");
