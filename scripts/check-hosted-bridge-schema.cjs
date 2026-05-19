#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const migrationDir = path.join(root, "supabase", "migrations");

const requiredTables = [
  "bridge_devices",
  "bridge_pairing_codes",
  "execution_plans",
  "execution_events",
  "execution_receipts",
  "delivery_receipts",
  "projects",
  "tasks",
  "teams",
];

const removedTables = [
  "project_local_bindings",
  "runners",
  "runner_capabilities",
  "runner_jobs",
  "runner_job_events",
  "runner_pairing_codes",
];

const requiredColumns = {
  bridge_devices: [
    "capabilities",
    "device_kind",
    "public_key",
    "status",
    "token_hash",
  ],
  bridge_pairing_codes: ["claimed_device_id", "code_hash", "status"],
  delivery_receipts: ["delivery_status", "delivery_summary", "delivery_url"],
  execution_events: ["event_type", "payload", "sequence"],
  execution_plans: [
    "device_id",
    "local_approval_status",
    "mode",
    "nonce",
    "payload_hash",
    "policy",
    "provider",
    "signature",
    "signature_key_id",
    "status",
  ],
  execution_receipts: [
    "artifacts",
    "changed_files",
    "device_id",
    "plan_id",
    "provider",
    "status",
    "usage",
  ],
  wiki_write_requests: ["article_path", "status"],
};

const removedColumns = {
  execution_plans: ["binding_id"],
  tasks: ["worktree_path"],
  wiki_write_requests: ["runner_id"],
};

const removedFunctions = ["claim_runner_job"];

function main() {
  const result = analyzeMigrations();
  const failures = validateFinalSchema(result);
  if (failures.length > 0) {
    process.stderr.write("Hosted Bridge schema check failed:\n");
    for (const failure of failures) {
      process.stderr.write(`- ${failure}\n`);
    }
    process.exit(1);
  }
  process.stdout.write("Hosted Bridge final schema check passed.\n");
}

function analyzeMigrations() {
  const tables = new Set();
  const columns = new Map();
  const functions = new Set();
  const migrations = fs
    .readdirSync(migrationDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const migration of migrations) {
    const sql = stripLineComments(
      fs.readFileSync(path.join(migrationDir, migration), "utf8"),
    );
    applyCreateTables(sql, tables, columns);
    applyAlterTables(sql, columns);
    applyCreateFunctions(sql, functions);
    applyDropFunctions(sql, functions);
    applyDropTables(sql, tables, columns);
  }

  return { columns, functions, migrations, tables };
}

function stripLineComments(sql) {
  return sql.replace(/--.*$/gm, "");
}

function ensureColumnSet(columns, table) {
  let set = columns.get(table);
  if (!set) {
    set = new Set();
    columns.set(table, set);
  }
  return set;
}

function applyCreateTables(sql, tables, columns) {
  const createTableRe =
    /create\s+table\s+if\s+not\s+exists\s+public\.([a-z0-9_]+)\s*\(([\s\S]*?)\n\);/gi;
  for (const match of sql.matchAll(createTableRe)) {
    const table = match[1].toLowerCase();
    tables.add(table);
    const columnSet = ensureColumnSet(columns, table);
    for (const column of parseColumnNames(match[2])) {
      columnSet.add(column);
    }
  }
}

function applyAlterTables(sql, columns) {
  const alterRe =
    /alter\s+table\s+(?:if\s+exists\s+)?public\.([a-z0-9_]+)([\s\S]*?);/gi;
  for (const match of sql.matchAll(alterRe)) {
    const table = match[1].toLowerCase();
    const body = match[2];
    const columnSet = ensureColumnSet(columns, table);
    const addColumnRe = /add\s+column\s+(?:if\s+not\s+exists\s+)?([a-z0-9_]+)/gi;
    for (const add of body.matchAll(addColumnRe)) {
      columnSet.add(add[1].toLowerCase());
    }
    const dropColumnRe = /drop\s+column\s+(?:if\s+exists\s+)?([a-z0-9_]+)/gi;
    for (const drop of body.matchAll(dropColumnRe)) {
      columnSet.delete(drop[1].toLowerCase());
    }
  }
}

function applyCreateFunctions(sql, functions) {
  const createFunctionRe =
    /create\s+(?:or\s+replace\s+)?function\s+public\.([a-z0-9_]+)/gi;
  for (const match of sql.matchAll(createFunctionRe)) {
    functions.add(match[1].toLowerCase());
  }
}

function applyDropFunctions(sql, functions) {
  const dropFunctionRe = /drop\s+function\s+if\s+exists\s+public\.([a-z0-9_]+)/gi;
  for (const match of sql.matchAll(dropFunctionRe)) {
    functions.delete(match[1].toLowerCase());
  }
}

function applyDropTables(sql, tables, columns) {
  const dropTableRe = /drop\s+table\s+if\s+exists\s+public\.([a-z0-9_]+)/gi;
  for (const match of sql.matchAll(dropTableRe)) {
    const table = match[1].toLowerCase();
    tables.delete(table);
    columns.delete(table);
  }
}

function parseColumnNames(body) {
  const names = [];
  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim();
    const match = trimmed.match(/^([a-z][a-z0-9_]*)\s+/i);
    if (!match) continue;
    const name = match[1].toLowerCase();
    if (
      name === "check" ||
      name === "constraint" ||
      name === "exclude" ||
      name === "foreign" ||
      name === "primary" ||
      name === "unique"
    ) {
      continue;
    }
    names.push(name);
  }
  return names;
}

function validateFinalSchema({ columns, functions, migrations, tables }) {
  const failures = [];
  const migrationVersions = new Map();
  for (const migration of migrations) {
    const match = migration.match(/^(\d{14})_[a-z0-9_]+\.sql$/);
    if (!match) {
      failures.push(`${migration}: migration filename must use a 14-digit Supabase timestamp prefix`);
      continue;
    }
    const existing = migrationVersions.get(match[1]);
    if (existing) {
      failures.push(`${migration}: duplicate Supabase migration version ${match[1]} already used by ${existing}`);
    }
    migrationVersions.set(match[1], migration);
  }
  const cleanupIndex = migrations.indexOf("20260519000000_bridge_only_execution_surface.sql");
  const bridgeIndex = migrations.indexOf("20260515010000_laf_bridge_execution.sql");
  const governanceMigration = "20260514000000_agentic_workspace_governance.sql";
  const constraintsMigration = "20260520000000_bridge_only_model_constraints.sql";
  const constraintsIndex = migrations.indexOf(constraintsMigration);
  if (cleanupIndex === -1) {
    failures.push("missing Bridge-only cleanup migration");
  } else if (bridgeIndex === -1 || cleanupIndex <= bridgeIndex) {
    failures.push("Bridge-only cleanup migration must run after Bridge execution schema");
  }
  if (constraintsIndex === -1) {
    failures.push("missing Bridge-only model constraints migration");
  } else if (cleanupIndex === -1 || constraintsIndex <= cleanupIndex) {
    failures.push("Bridge-only model constraints migration must run after legacy cleanup");
  } else {
    const constraintsSQL = fs.readFileSync(
      path.join(migrationDir, constraintsMigration),
      "utf8",
    );
    const requiredConstraintPatterns = [
      /set device_kind = 'desktop'\s+where device_kind = 'team_bridge'/,
      /set mode = 'my_bridge'\s+where mode = 'team_bridge'/,
      /set model_mode = 'my_bridge'\s+where model_mode in \('local_cli', 'team_bridge'\)/,
      /bridge_devices_device_kind_check\s+check \(device_kind in \('desktop'\)\)/,
      /execution_plans_mode_check\s+check \(mode in \('laf_model', 'my_bridge', 'record_only'\)\)/,
      /tasks_model_mode_check\s+check \(model_mode in \('laf_model', 'my_bridge', 'record_only'\)\)/,
      /channel_messages_model_mode_check\s+check \(model_mode in \('laf_model', 'my_bridge', 'record_only'\)\)/,
    ];
    for (const pattern of requiredConstraintPatterns) {
      if (!pattern.test(constraintsSQL)) {
        failures.push(`Bridge-only model constraints migration missing ${pattern}`);
      }
    }
    if (/check \([^)]*team_bridge/.test(constraintsSQL)) {
      failures.push("Bridge-only model constraints migration keeps team_bridge in final checks");
    }
  }
  if (migrations.includes(governanceMigration)) {
    const governanceSQL = fs.readFileSync(
      path.join(migrationDir, governanceMigration),
      "utf8",
    );
    if (
      !/check \(model_mode in \('laf_model', 'my_bridge', 'record_only'\)\)/.test(governanceSQL)
    ) {
      failures.push("fresh task model_mode constraint is not Bridge-only");
    }
    if (/check \(model_mode in \([^)]*local_cli/.test(governanceSQL)) {
      failures.push("fresh task model_mode constraint still allows local_cli");
    }
  }

  for (const table of requiredTables) {
    if (!tables.has(table)) failures.push(`final schema missing public.${table}`);
  }
  for (const table of removedTables) {
    if (tables.has(table)) failures.push(`final schema still contains public.${table}`);
  }
  for (const func of removedFunctions) {
    if (functions.has(func)) failures.push(`final schema still contains public.${func}()`);
  }

  for (const [table, expectedColumns] of Object.entries(requiredColumns)) {
    const actual = columns.get(table) || new Set();
    for (const column of expectedColumns) {
      if (!actual.has(column)) {
        failures.push(`final schema missing public.${table}.${column}`);
      }
    }
  }
  for (const [table, forbiddenColumns] of Object.entries(removedColumns)) {
    const actual = columns.get(table) || new Set();
    for (const column of forbiddenColumns) {
      if (actual.has(column)) {
        failures.push(`final schema still contains public.${table}.${column}`);
      }
    }
  }

  return failures;
}

if (require.main === module) {
  main();
}

module.exports = {
  analyzeMigrations,
  parseColumnNames,
  validateFinalSchema,
};
