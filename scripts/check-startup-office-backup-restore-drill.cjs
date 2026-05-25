#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const {
  STARTUP_OFFICE_EXPORTED_TABLES,
  STARTUP_OFFICE_EXPORT_OMITTED_TABLES,
  STARTUP_OFFICE_EXPORT_SCHEMA_VERSION,
} = require("../api/lib/startup-office/exportManifest");

const root = path.resolve(__dirname, "..");

function fail(message) {
  console.error(`startup-office backup restore drill check failed: ${message}`);
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

function assertContains(relativePath, snippets, label) {
  const source = read(relativePath);
  for (const snippet of snippets) {
    if (!source.includes(snippet)) fail(`${label} is missing ${snippet} in ${relativePath}`);
  }
}

const pkg = JSON.parse(read("package.json"));
if (
  pkg.scripts?.["startup-office:backup-restore-drill"] !==
  "node scripts/check-startup-office-backup-restore-drill.cjs"
) {
  fail("package.json must expose startup-office:backup-restore-drill");
}

const schema = JSON.parse(read("supabase/schema/current.json"));
const omittedTableNames = STARTUP_OFFICE_EXPORT_OMITTED_TABLES.map((table) => table.name);
const workspaceTables = schema.activeTables
  .filter((table) => table.tenantColumn === "team_id" || table.name === "teams")
  .map((table) => table.name);
const requiredExportTables = workspaceTables.filter((name) => !omittedTableNames.includes(name));

assertEqualList(STARTUP_OFFICE_EXPORTED_TABLES, requiredExportTables, "backup export table manifest");
assertEqualList(
  workspaceTables,
  [...STARTUP_OFFICE_EXPORTED_TABLES, ...omittedTableNames],
  "backup workspace table coverage",
);
for (const table of STARTUP_OFFICE_EXPORT_OMITTED_TABLES) {
  if (!table.reason || table.reason.length < 20) {
    fail(`${table.name} must have a concrete restore omission reason`);
  }
}

assertContains(
  "api/lib/startup-office/exportManifest.js",
  [STARTUP_OFFICE_EXPORT_SCHEMA_VERSION, "STARTUP_OFFICE_EXPORTED_TABLES", "STARTUP_OFFICE_EXPORT_OMITTED_TABLES"],
  "export manifest",
);
assertContains(
  "api/lib/startup-office/exportHandlers.js",
  ["restore_notes", "export_manifest", "workspace_billing", "terms_acceptances"],
  "export restore payload",
);
assertContains(
  "api/lib/startup-office/importHandlers.js",
  ["imported_from_schema_version", 'status: "approved"', "STARTUP_OFFICE_MEMORY_IMPORT_LIMIT"],
  "memory restore handler",
);
assertContains(
  "api/lib/startup-office/importHandlers.test.js",
  ["restores approved company memory from an export bundle", "memory import accepts direct memory_pages arrays"],
  "memory restore tests",
);
assertContains(
  "docs/ops/STARTUP-OFFICE-BACKUP-RESTORE-DRILL.md",
  [
    "Supabase point-in-time recovery or daily backup",
    "startup-office-export.v2",
    "POST /startup-office/memory/import",
    "Evidence Record",
    "receipt_trace_spot_check",
  ],
  "backup restore drill runbook",
);
assertContains(
  "docs/ops/STARTUP-OFFICE-DEPLOYMENT-RUNBOOK.md",
  ["Point-in-time restore path", "pause the hosted app, loop worker, outbox"],
  "deployment restore runbook",
);
assertContains(
  "docs/ops/STARTUP-OFFICE-CLOSED-BETA-LAUNCH-KIT.md",
  ["Backup And Restore Drill", "supabase/schema/current.json"],
  "closed beta backup drill",
);
assertContains(
  "scripts/startup-office-beta-release-gate.cjs",
  ['"startup-office:backup-restore-drill"'],
  "beta release gate",
);
assertContains(
  "docs/specs/SILICON-VALLEY-PRODUCTION-AUDIT.md",
  ["startup-office:backup-restore-drill", "Backup and restore verification is now repository-controlled"],
  "production audit evidence",
);

console.log(
  `startup-office backup restore drill check passed: ${workspaceTables.length} workspace tables covered`,
);
