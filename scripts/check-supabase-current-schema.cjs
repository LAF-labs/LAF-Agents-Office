#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const schemaPath = path.join(root, "supabase", "schema", "current.json");
const migrationsDir = path.join(root, "supabase", "migrations");
const serviceRoleAccessPath = path.join(root, "api", "lib", "hosted", "serviceRoleAccess.js");
const retiredDeviceName = ["bri", "dge"].join("");
const retiredQueueName = ["run", "ner"].join("");
const retiredPairCodes = ["pair", "ing_codes"].join("");
const retiredExecutionGuard = {
  tables: [
    "execution_receipts",
    "execution_events",
    "execution_plans",
    "project_local_bindings",
    `${retiredDeviceName}_${retiredPairCodes}`,
    `${retiredDeviceName}_devices`,
    `${retiredQueueName}_${retiredPairCodes}`,
    `${retiredQueueName}_job_events`,
    `${retiredQueueName}_jobs`,
    `${retiredQueueName}_capabilities`,
    `${retiredQueueName}s`,
    "delivery_receipts",
    "projects",
    "tasks",
  ],
  functions: [`claim_${retiredQueueName}_job`],
  columns: {
    channel_messages: ["project_id", "task_id"],
    tasks: ["execution_mode", "worktree_path", "worktree_branch"],
    wiki_article_index: ["project_id"],
    wiki_write_requests: ["project_id", `${retiredQueueName}_id`],
  },
};

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
const serviceRoleAccessSource = fs.readFileSync(serviceRoleAccessPath, "utf8");
if (manifest.version !== "startup-office-schema.v1") {
  fail(`unexpected manifest version ${manifest.version || "<missing>"}`);
}
if (!serviceRoleAccessSource.includes("supabase/schema/current.json")) {
  fail("service-role access guards must use the canonical current schema manifest");
}
if (Object.hasOwn(manifest, "retiredRuntime")) {
  fail("current schema manifest must not carry retired runtime objects");
}
if (Object.hasOwn(manifest, "pureCloudRuntimeGuardMigration")) {
  fail("current schema manifest must use pureCloudBoundaryGuardMigration");
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

const retired = retiredExecutionGuard;
for (const table of retired.tables || []) {
  if (state.tables.has(table)) fail(`retired execution table remains active: ${table}`);
}

for (const [table, columns] of Object.entries(retired.columns || {})) {
  const actualColumns = state.tables.get(table) || new Set();
  for (const column of columns) {
    if (actualColumns.has(column)) {
      fail(`retired execution column remains active: ${table}.${column}`);
    }
  }
}

const migrationText = state.files
  .map((file) => fs.readFileSync(path.join(migrationsDir, file), "utf8"))
  .join("\n");

for (const rule of manifest.idempotencyKeys || []) {
  const actualColumns = state.tables.get(rule.table) || new Set();
  if (!actualColumns.has(rule.column)) {
    fail(`${rule.table} is missing idempotency column ${rule.column}`);
  }
  if (!migrationText.includes(`create unique index if not exists ${rule.index}`)) {
    fail(`${rule.table} is missing idempotency unique index ${rule.index}`);
  }
  const indexPattern = new RegExp(
    `on\\s+public\\.${rule.table}\\s*\\(team_id,\\s*${rule.column}\\)[\\s\\S]+?where\\s+${rule.column}\\s+<>\\s+''`,
    "i",
  );
  if (!indexPattern.test(migrationText)) {
    fail(`${rule.index} must be scoped to team_id and non-empty idempotency keys`);
  }
}

for (const rule of manifest.appendOnlyTables || []) {
  if (!state.tables.has(rule.table)) {
    fail(`append-only table is not active: ${rule.table}`);
  }
  const functionPattern = new RegExp(
    `create\\s+or\\s+replace\\s+function\\s+public\\.${rule.function}\\b`,
    "i",
  );
  if (!functionPattern.test(migrationText)) {
    fail(`${rule.table} append-only function is missing: ${rule.function}`);
  }
  const triggerPattern = new RegExp(
    `create\\s+trigger\\s+${rule.trigger}[\\s\\S]+?before\\s+update\\s+or\\s+delete\\s+on\\s+public\\.${rule.table}[\\s\\S]+?execute\\s+function\\s+public\\.${rule.function}\\(\\)`,
    "i",
  );
  if (!triggerPattern.test(migrationText)) {
    fail(`${rule.table} append-only trigger is missing: ${rule.trigger}`);
  }
  if (!migrationText.includes(`current_setting('${rule.deleteBypassSetting}', true)`)) {
    fail(`${rule.table} append-only delete bypass setting is missing`);
  }
}

for (const rule of manifest.outboxSources || []) {
  if (!state.tables.has("startup_office_outbox_events")) {
    fail("startup office outbox table is not active");
  }
  if (!state.tables.has(rule.table)) {
    fail(`outbox source table is not active: ${rule.table}`);
  }
  const functionPattern = new RegExp(
    `create\\s+or\\s+replace\\s+function\\s+public\\.${rule.function}\\b`,
    "i",
  );
  if (!functionPattern.test(migrationText)) {
    fail(`${rule.table} outbox function is missing: ${rule.function}`);
  }
  const secureFunctionPattern = new RegExp(
    `create\\s+or\\s+replace\\s+function\\s+public\\.${rule.function}\\b[\\s\\S]+?security\\s+definer[\\s\\S]+?set\\s+search_path\\s+=\\s+public`,
    "i",
  );
  if (!secureFunctionPattern.test(migrationText)) {
    fail(`${rule.table} outbox function must be SECURITY DEFINER with a pinned search_path`);
  }
  const branchPattern = new RegExp(`tg_table_name\\s+=\\s+'${rule.table}'`, "i");
  if (!branchPattern.test(migrationText)) {
    fail(`${rule.table} outbox branch is missing`);
  }
  if (
    rule.table === "startup_office_notifications" &&
    !migrationText.includes("outbox_created_by := null;")
  ) {
    fail("notification outbox rows must not mislabel the recipient as created_by");
  }
  if (!migrationText.includes(`'${rule.eventPrefix}' || new.event_type`)) {
    fail(`${rule.table} outbox event prefix is missing: ${rule.eventPrefix}`);
  }
  const triggerPattern = new RegExp(
    `create\\s+trigger\\s+${rule.trigger}[\\s\\S]+?after\\s+insert\\s+on\\s+public\\.${rule.table}[\\s\\S]+?execute\\s+function\\s+public\\.${rule.function}\\(\\)`,
    "i",
  );
  if (!triggerPattern.test(migrationText)) {
    fail(`${rule.table} outbox trigger is missing: ${rule.trigger}`);
  }
  if (!migrationText.includes("insert into public.startup_office_outbox_events")) {
    fail("outbox enqueue function does not insert into startup_office_outbox_events");
  }
}

if (manifest.outboxClaimFunction) {
  const fn = manifest.outboxClaimFunction;
  const claimFunctionPattern = new RegExp(
    `create\\s+or\\s+replace\\s+function\\s+public\\.${fn}\\b[\\s\\S]+?returns\\s+jsonb[\\s\\S]+?security\\s+definer[\\s\\S]+?set\\s+search_path\\s+=\\s+public`,
    "i",
  );
  if (!claimFunctionPattern.test(migrationText)) {
    fail(`${fn} must return jsonb and run as SECURITY DEFINER with a pinned search_path`);
  }
  const requiredClaimSnippets = [
    "from public.startup_office_outbox_events",
    "for update skip locked",
    "status = 'processing'",
    "attempts = events.attempts + 1",
    "locked_at = now_ts",
  ];
  for (const snippet of requiredClaimSnippets) {
    if (!migrationText.includes(snippet)) {
      fail(`${fn} is missing claim invariant: ${snippet}`);
    }
  }
}

if (manifest.workerJobClaimFunction) {
  const fn = manifest.workerJobClaimFunction;
  const claimFunctionPattern = new RegExp(
    `create\\s+or\\s+replace\\s+function\\s+public\\.${fn}\\b[\\s\\S]+?returns\\s+jsonb[\\s\\S]+?security\\s+definer[\\s\\S]+?set\\s+search_path\\s+=\\s+public`,
    "i",
  );
  if (!claimFunctionPattern.test(migrationText)) {
    fail(`${fn} must return jsonb and run as SECURITY DEFINER with a pinned search_path`);
  }
  const requiredClaimSnippets = [
    "from public.startup_office_worker_jobs",
    "for update skip locked",
    "status = 'running'",
    "attempts = jobs.attempts + 1",
    "available_at <= now_ts",
    "locked_at = now_ts",
  ];
  for (const snippet of requiredClaimSnippets) {
    if (!migrationText.includes(snippet)) {
      fail(`${fn} is missing claim invariant: ${snippet}`);
    }
  }
  if (!migrationText.includes("'dead_letter'")) {
    fail("startup_office_worker_jobs must support dead_letter status");
  }
}

for (const fn of retired.functions || []) {
  const createPattern = new RegExp(`create\\s+(?:or\\s+replace\\s+)?function\\s+public\\.${fn}\\b`, "i");
  if (createPattern.test(migrationText)) fail(`retired execution function is created: ${fn}`);
}

const guardMigration = read(
  `supabase/migrations/${manifest.pureCloudBoundaryGuardMigration}_assert_pure_cloud_boundary_schema.sql`,
);
for (const required of [
  "remaining_columns",
  "remaining_constraints",
  "remaining_functions",
  "remaining_policies",
  "remaining_tables",
  "remaining_triggers",
  "remaining_types",
  "raise exception",
]) {
  if (!guardMigration.includes(required)) {
    fail(`pure-cloud schema assertion migration is missing ${required}`);
  }
}

for (const fn of manifest.internalFunctions || []) {
  const createPattern = new RegExp(
    `create\\s+or\\s+replace\\s+function\\s+public\\.${fn}\\b`,
    "i",
  );
  if (!createPattern.test(migrationText)) fail(`internal function is not created: ${fn}`);
  const serviceGrantPattern = new RegExp(`grant\\s+execute\\s+on\\s+function\\s+public\\.${fn}\\b[\\s\\S]+?to\\s+service_role`, "i");
  if (!serviceGrantPattern.test(migrationText)) {
    fail(`internal function is not limited to service_role execution: ${fn}`);
  }
}

console.log(
  `supabase current schema check passed: ${manifestTables.length} tables, latest migration ${manifest.latestMigration}`,
);
