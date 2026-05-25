#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function fail(message) {
  console.error(`startup-office model timeout check failed: ${message}`);
  process.exit(1);
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function assertContains(relativePath, snippets, label) {
  const source = read(relativePath);
  for (const snippet of snippets) {
    if (!source.includes(snippet)) fail(`${label} is missing ${snippet} in ${relativePath}`);
  }
}

const pkg = JSON.parse(read("package.json"));
if (
  pkg.scripts?.["startup-office:model-timeouts"] !==
  "node scripts/check-startup-office-model-timeouts.cjs"
) {
  fail("package.json must expose startup-office:model-timeouts");
}

const schema = JSON.parse(read("supabase/schema/current.json"));
if (String(schema.latestMigration || "") < "20260526080000") {
  fail("schema latestMigration must include the model timeout migration");
}
for (const tableName of ["startup_office_runs", "startup_office_worker_jobs"]) {
  const table = schema.activeTables.find((entry) => entry.name === tableName);
  if (!table) fail(`${tableName} must be present in schema manifest`);
  for (const column of ["model_timeout_ms", "model_deadline_at", "timed_out_at"]) {
    if (!table.columns.includes(column)) fail(`${tableName} is missing ${column}`);
  }
}

assertContains(
  "supabase/migrations/20260526080000_add_startup_office_model_timeouts.sql",
  [
    "model_timeout_ms integer not null default 120000",
    "model_deadline_at timestamptz",
    "timed_out_at timestamptz",
    "idx_startup_office_worker_jobs_model_deadline",
  ],
  "model timeout migration",
);
assertContains(
  "workers/startup-office/loopEngine.js",
  [
    "STARTUP_OFFICE_MODEL_TIMEOUT_POLICY_VERSION",
    "generateStructuredWithTimeout",
    "LAF_STARTUP_OFFICE_MODEL_TIMEOUT_MS",
    "model_deadline_at",
    "timed_out_at",
  ],
  "loop engine model timeout enforcement",
);
assertContains(
  "workers/startup-office/loopEngine.test.js",
  ["model calls that exceed the durable timeout", "model call timed out after 1ms"],
  "loop engine model timeout tests",
);
assertContains(
  "scripts/startup-office-loop-worker.cjs",
  ["modelTimeoutMs: process.env.LAF_STARTUP_OFFICE_MODEL_TIMEOUT_MS"],
  "loop worker timeout configuration",
);
assertContains(
  ".github/workflows/startup-office-loop-worker.yml",
  ["LAF_STARTUP_OFFICE_MODEL_TIMEOUT_MS"],
  "loop worker workflow timeout environment",
);
assertContains(
  "scripts/startup-office-beta-release-gate.cjs",
  ['"startup-office:model-timeouts"'],
  "beta release gate",
);
assertContains(
  "docs/specs/SILICON-VALLEY-PRODUCTION-AUDIT.md",
  ["startup-office:model-timeouts", "Model timeout policy is now durable"],
  "production audit evidence",
);

console.log("startup-office model timeout check passed");
