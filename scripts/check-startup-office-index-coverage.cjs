#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const manifestPath = "shared/startup-office-index-coverage.json";
const migrationsDir = path.join(root, "supabase", "migrations");

function fail(message) {
  console.error(`startup-office index coverage check failed: ${message}`);
  process.exit(1);
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function normalizedColumns(rawColumns) {
  return rawColumns
    .split(",")
    .map((part) =>
      part
        .trim()
        .replace(/\s+(asc|desc)\b/gi, "")
        .replace(/\s+nulls\s+(first|last)\b/gi, "")
        .replace(/\s+where\s+.+$/i, "")
        .trim(),
    )
    .filter(Boolean);
}

function migrationSQL() {
  return fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .map((file) => fs.readFileSync(path.join(migrationsDir, file), "utf8"))
    .join("\n");
}

function parseIndexes(sql) {
  const indexes = new Map();
  const pattern =
    /create\s+(?:unique\s+)?index\s+if\s+not\s+exists\s+([a-z0-9_]+)\s+on\s+public\.([a-z0-9_]+)\s*\(([\s\S]*?)\)\s*(?:where[\s\S]*?)?;/gi;
  for (const match of sql.matchAll(pattern)) {
    indexes.set(match[1], {
      columns: normalizedColumns(match[3]),
      table: match[2],
    });
  }
  return indexes;
}

function assertContains(relativePath, snippet, label) {
  if (!read(relativePath).includes(snippet)) {
    fail(`${label} is missing ${snippet} in ${relativePath}`);
  }
}

const manifest = JSON.parse(read(manifestPath));
const pkg = JSON.parse(read("package.json"));
const schema = JSON.parse(read("supabase/schema/current.json"));
const releaseGate = read("scripts/startup-office-beta-release-gate.cjs");
const indexes = parseIndexes(migrationSQL());

if (manifest.version !== "startup-office-index-coverage.v1") {
  fail(`unexpected manifest version ${manifest.version || "<missing>"}`);
}
if (schema.latestMigration !== manifest.latest_migration) {
  fail(`schema latestMigration ${schema.latestMigration} does not match ${manifest.latest_migration}`);
}
if (
  pkg.scripts?.["startup-office:index-coverage"] !==
  "node scripts/check-startup-office-index-coverage.cjs"
) {
  fail("package.json must expose startup-office:index-coverage");
}
if (!releaseGate.includes('"startup-office:index-coverage"')) {
  fail("beta release gate must include startup-office:index-coverage");
}

const requiredIndexes = manifest.required_indexes || [];
if (requiredIndexes.length < 35) {
  fail(`expected broad index coverage, found ${requiredIndexes.length} required indexes`);
}

for (const expected of requiredIndexes) {
  const actual = indexes.get(expected.name);
  if (!actual) fail(`missing required index ${expected.name}`);
  if (actual.table !== expected.table) {
    fail(`${expected.name} table expected ${expected.table}, found ${actual.table}`);
  }
  const actualPrefix = actual.columns.slice(0, expected.columns.length);
  if (JSON.stringify(actualPrefix) !== JSON.stringify(expected.columns)) {
    fail(
      `${expected.name} columns expected ${expected.columns.join(",")}, found ${actual.columns.join(",")}`,
    );
  }
}

for (const expected of requiredIndexes) {
  if (
    expected.table.startsWith("startup_office_") &&
    !expected.columns.includes("team_id") &&
    !["idx_startup_office_worker_jobs_claim", "idx_startup_office_outbox_events_source"].includes(expected.name)
  ) {
    fail(`${expected.name} must include team_id or be an approved global worker/outbox index`);
  }
}

for (const [relativePath, snippet, label] of [
  ["supabase/migrations/20260526090000_add_startup_office_index_coverage.sql", "idx_startup_office_runs_team_created", "large export run index"],
  ["supabase/migrations/20260526090000_add_startup_office_index_coverage.sql", "idx_startup_office_memory_pages_team_created", "memory export index"],
  ["api/lib/startup-office/exportManifest.js", "STARTUP_OFFICE_EXPORT_CHUNK_COLLECTIONS", "chunk export table list"],
  ["api/lib/startup-office/supportTimeline.js", "order: options.order || \"created_at.desc\"", "support timeline order"],
  ["api/lib/startup-office/repositories.js", "order: \"created_at.desc\"", "repository list order"],
  ["api/lib/startup-office/objectQueries.js", "created_at.desc", "operating object list order"],
  ["docs/specs/SILICON-VALLEY-PRODUCTION-AUDIT.md", manifestPath, "production audit evidence"],
]) {
  assertContains(relativePath, snippet, label);
}

console.log(
  "startup-office index coverage check passed: " +
    `${requiredIndexes.length} required indexes for large-workspace query shapes`,
);
