#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function fail(message) {
  console.error(`startup-office migration recovery check failed: ${message}`);
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
  packageJson.scripts?.["startup-office:migration-recovery"] !==
  "node scripts/check-startup-office-migration-recovery.cjs"
) {
  fail("package.json must expose startup-office:migration-recovery");
}

assertContains(
  "scripts/startup-office-beta-release-gate.cjs",
  '"startup-office:migration-recovery"',
  "beta release gate",
);

for (const [snippet, label] of [
  ["## Migration Failure Recovery", "migration recovery section"],
  ["forward-only in production", "forward-only production policy"],
  ["Do not edit, delete,", "immutable migration warning"],
  ["rename, reorder, squash", "immutable migration warning continuation"],
  ["supabase_migrations.schema_migrations", "applied-version inspection"],
  ["npx supabase migration new fix_startup_office_", "forward-fix creation command"],
  ["Any repair query touching Startup", "tenant repair boundary"],
  ["Office tables must filter or join through `team_id`", "tenant repair boundary continuation"],
  ["npm run startup-office:rls-live", "live RLS verification requirement"],
  ["npm run beta:release-gate", "release gate requirement"],
  ["npx supabase db push", "migration apply command"],
  ["npm run hosted-env:preflight -- --no-env-file", "production preflight requirement"],
  ["Point-in-time restore path", "PITR fallback"],
  ["pause the hosted app, loop worker, outbox", "restore downtime instruction"],
]) {
  assertContains("docs/ops/STARTUP-OFFICE-DEPLOYMENT-RUNBOOK.md", snippet, label);
}

console.log("startup-office migration recovery check passed");
