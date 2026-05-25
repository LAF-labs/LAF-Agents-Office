#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const schemaPath = path.join(root, "supabase", "schema", "current.json");
const migrationsDir = path.join(root, "supabase", "migrations");

function fail(message) {
  console.error(`supabase current schema check failed: ${message}`);
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

function columnNameFromDefinition(line) {
  const match = line.trim().match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s+/);
  if (!match) return "";
  const keyword = match[1].toLowerCase();
  if (["constraint", "foreign", "primary", "unique", "check"].includes(keyword)) {
    return "";
  }
  return match[1];
}

function readStatement(lines, startIndex) {
  let statement = lines[startIndex];
  let index = startIndex;
  while (index + 1 < lines.length && !/;\s*$/.test(statement)) {
    index += 1;
    statement += `\n${lines[index]}`;
  }
  return { index, statement };
}

function parseMigrationState() {
  const files = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();
  const tables = new Map();
  const rlsTables = new Set();

  for (const file of files) {
    const body = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    const lines = body.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const createTable = lines[index].match(
        /^create table if not exists public\.([a-z0-9_]+) \(/i,
      );
      if (createTable) {
        const tableName = createTable[1];
        if (!tables.has(tableName)) tables.set(tableName, new Set());
        index += 1;
        while (index < lines.length && lines[index].trim() !== ");") {
          const columnName = columnNameFromDefinition(lines[index]);
          if (columnName) tables.get(tableName).add(columnName);
          index += 1;
        }
        continue;
      }

      const alterTable = lines[index].match(
        /^alter table(?: if exists)? public\.([a-z0-9_]+)/i,
      );
      if (alterTable) {
        const tableName = alterTable[1];
        const statement = readStatement(lines, index);
        index = statement.index;
        if (!tables.has(tableName)) tables.set(tableName, new Set());
        for (const match of statement.statement.matchAll(
          /add column if not exists\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi,
        )) {
          tables.get(tableName).add(match[1]);
        }
        for (const match of statement.statement.matchAll(
          /drop column if exists\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi,
        )) {
          tables.get(tableName).delete(match[1]);
        }
      }

      const rls = lines[index].match(
        /^alter table public\.([a-z0-9_]+) enable row level security;/i,
      );
      if (rls) rlsTables.add(rls[1]);

      const dropTable = lines[index].match(
        /^drop table if exists public\.([a-z0-9_]+) cascade;/i,
      );
      if (dropTable) tables.delete(dropTable[1]);
    }
  }

  return { files, rlsTables, tables };
}

const manifest = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
if (manifest.version !== "startup-office-schema.v1") {
  fail(`unexpected manifest version ${manifest.version || "<missing>"}`);
}

const state = parseMigrationState();
const latestMigration = state.files.at(-1)?.replace(/_.+$/, "");
if (latestMigration !== manifest.latestMigration) {
  fail(
    `manifest latestMigration ${manifest.latestMigration} does not match latest migration ${latestMigration}`,
  );
}

const manifestTables = manifest.activeTables || [];
const tableNames = manifestTables.map((table) => table.name);
assertEqualList(state.tables.keys(), tableNames, "active table list");

const duplicateTables = tableNames.filter((name, index) => tableNames.indexOf(name) !== index);
if (duplicateTables.length) fail(`duplicate table manifest entries: ${duplicateTables.join(", ")}`);

for (const table of manifestTables) {
  if (!table.domain) fail(`${table.name} is missing a domain`);
  const actualColumns = state.tables.get(table.name);
  assertEqualList(actualColumns || [], table.columns || [], `${table.name} columns`);
  if (table.tenantColumn && !actualColumns.has(table.tenantColumn)) {
    fail(`${table.name} tenant column ${table.tenantColumn} is not present`);
  }
  if (table.rls && !state.rlsTables.has(table.name)) {
    fail(`${table.name} does not enable row level security`);
  }
}

const retired = manifest.retiredRuntime || {};
for (const table of retired.tables || []) {
  if (state.tables.has(table)) fail(`retired runtime table remains active: ${table}`);
}

for (const [table, columns] of Object.entries(retired.columns || {})) {
  const actualColumns = state.tables.get(table) || new Set();
  for (const column of columns) {
    if (actualColumns.has(column)) {
      fail(`retired runtime column remains active: ${table}.${column}`);
    }
  }
}

const migrationText = state.files
  .map((file) => fs.readFileSync(path.join(migrationsDir, file), "utf8"))
  .join("\n");
for (const fn of retired.functions || []) {
  const createPattern = new RegExp(`create\\s+(?:or\\s+replace\\s+)?function\\s+public\\.${fn}\\b`, "i");
  if (createPattern.test(migrationText)) fail(`retired runtime function is created: ${fn}`);
}

const guardMigration = read(
  `supabase/migrations/${manifest.latestMigration}_assert_pure_cloud_runtime_schema.sql`,
);
for (const required of ["remaining_columns", "remaining_functions", "remaining_tables", "raise exception"]) {
  if (!guardMigration.includes(required)) {
    fail(`pure-cloud schema assertion migration is missing ${required}`);
  }
}

console.log(
  `supabase current schema check passed: ${manifestTables.length} tables, latest migration ${manifest.latestMigration}`,
);
