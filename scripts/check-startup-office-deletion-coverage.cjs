#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const {
  STARTUP_OFFICE_DELETION_MANIFEST_VERSION,
  STARTUP_OFFICE_PURGED_TABLES,
  STARTUP_OFFICE_RETAINED_TABLES,
} = require("../api/lib/startup-office/deletionManifest");

const root = path.resolve(__dirname, "..");
const purgeMigration =
  "supabase/migrations/20260526070000_add_startup_office_workspace_purge.sql";

function fail(message) {
  console.error(`startup-office deletion coverage check failed: ${message}`);
  process.exit(1);
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function sorted(values) {
  return [...values].sort((a, b) => a.localeCompare(b));
}

function assertEqualList(actual, expected, label) {
  const left = sorted(actual);
  const right = sorted(expected);
  if (JSON.stringify(left) !== JSON.stringify(right)) {
    const missing = right.filter((item) => !left.includes(item));
    const extra = left.filter((item) => !right.includes(item));
    fail(
      `${label} mismatch` +
        (missing.length ? `; missing: ${missing.join(", ")}` : "") +
        (extra.length ? `; extra: ${extra.join(", ")}` : ""),
    );
  }
}

const pkg = JSON.parse(read("package.json"));
if (
  pkg.scripts?.["startup-office:deletion-coverage"] !==
  "node scripts/check-startup-office-deletion-coverage.cjs"
) {
  fail("package.json must expose startup-office:deletion-coverage");
}
if (!read("scripts/startup-office-beta-release-gate.cjs").includes('"startup-office:deletion-coverage"')) {
  fail("beta release gate must include startup-office:deletion-coverage");
}

const schema = JSON.parse(read("supabase/schema/current.json"));
if (String(schema.latestMigration || "") < "20260526070000") {
  fail("schema latestMigration must include the workspace purge migration");
}
const retainedTableNames = STARTUP_OFFICE_RETAINED_TABLES.map((table) => table.name);
const requiredWorkspaceTables = schema.activeTables
  .filter((table) => table.tenantColumn === "team_id" || table.name === "teams")
  .map((table) => table.name)
  .filter((name) => !retainedTableNames.includes(name));

assertEqualList(STARTUP_OFFICE_PURGED_TABLES, requiredWorkspaceTables, "workspace purge table manifest");

const purgeMigrationSource = read(purgeMigration);
for (const tableName of STARTUP_OFFICE_PURGED_TABLES) {
  if (!purgeMigrationSource.includes(`'${tableName}'`)) {
    fail(`purge SQL is missing purged table ${tableName}`);
  }
}
for (const tableName of retainedTableNames) {
  if (!purgeMigrationSource.includes(tableName)) {
    fail(`purge SQL is missing retained table ${tableName}`);
  }
}
for (const snippet of [
  "create table if not exists public.startup_office_deletion_tombstones",
  "create or replace function public.purge_startup_office_workspace",
  "request.jwt.claim.role",
  "startup office workspace purge requires service_role",
  "set_config('app.allow_receipt_delete', 'on', true)",
  "delete from public.teams where id = target_team_id",
  "grant execute on function public.purge_startup_office_workspace(uuid, uuid)",
]) {
  if (!purgeMigrationSource.includes(snippet)) {
    fail(`purge migration is missing ${snippet}`);
  }
}

for (const [relativePath, snippets, label] of [
  [
    "api/lib/startup-office/deletionManifest.js",
    [
      STARTUP_OFFICE_DELETION_MANIFEST_VERSION,
      "startup_office_deletion_tombstones",
      "purge_startup_office_workspace",
    ],
    "deletion manifest",
  ],
  [
    "api/lib/startup-office/lifecycleHandlers.js",
    [
      "purge_startup_office_workspace",
      "PURGE STARTUP OFFICE",
      "deletion_manifest",
    ],
    "deletion lifecycle handler",
  ],
  [
    "api/lib/startup-office/routes.js",
    ["deletionPurge", "startup-office/deletion-request/([^/]+)/purge"],
    "deletion purge route",
  ],
  [
    "api/lib/hosted/actionRateLimitRules.js",
    ["startup_office_deletion_purge"],
    "deletion purge rate limit",
  ],
  [
    "docs/legal/STARTUP-OFFICE-BETA-TERMS.md",
    ["startup_office_deletion_tombstones", "purge_startup_office_workspace"],
    "legal deletion terms",
  ],
  [
    "docs/ops/STARTUP-OFFICE-CLOSED-BETA-LAUNCH-KIT.md",
    ["Workspace Deletion Processing", "startup_office_deletion_tombstones"],
    "closed beta deletion runbook",
  ],
]) {
  for (const snippet of snippets) {
    if (!read(relativePath).includes(snippet)) {
      fail(`${label} is missing ${snippet} in ${relativePath}`);
    }
  }
}

console.log(
  `startup-office deletion coverage check passed: ${STARTUP_OFFICE_PURGED_TABLES.length} purged tables`,
);
