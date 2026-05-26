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
  console.error(`startup-office export coverage check failed: ${message}`);
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
  pkg.scripts?.["startup-office:export-coverage"] !==
  "node scripts/check-startup-office-export-coverage.cjs"
) {
  fail("package.json must expose startup-office:export-coverage");
}
if (!read("scripts/startup-office-beta-release-gate.cjs").includes('"startup-office:export-coverage"')) {
  fail("beta release gate must include startup-office:export-coverage");
}

const schema = JSON.parse(read("supabase/schema/current.json"));
const omittedTableNames = STARTUP_OFFICE_EXPORT_OMITTED_TABLES.map((table) => table.name);
const requiredWorkspaceTables = schema.activeTables
  .filter((table) => table.tenantColumn === "team_id" || table.name === "teams")
  .map((table) => table.name)
  .filter((name) => !omittedTableNames.includes(name));

assertEqualList(STARTUP_OFFICE_EXPORTED_TABLES, requiredWorkspaceTables, "export table manifest");
for (const table of STARTUP_OFFICE_EXPORT_OMITTED_TABLES) {
  if (!table.reason || table.reason.length < 20) {
    fail(`${table.name} must include a concrete omission reason`);
  }
}

const exportSource =
  read("api/lib/startup-office/exportHandlers.js") +
  read("api/lib/startup-office/exportBundleBuilder.js");
const exportManifest = read("api/lib/startup-office/exportManifest.js");
if (!exportManifest.includes(STARTUP_OFFICE_EXPORT_SCHEMA_VERSION)) {
  fail("export manifest is missing the current schema version");
}
for (const snippet of [
  "startupOfficeExportManifest",
  "startupOfficeExportLimitReport",
  "export_manifest",
  "export_limits",
  "export_chunks",
  "billing_documents",
  "channel_messages",
  "deletion_requests",
  "orchestration_intents",
  "support_access_events",
  "terms_acceptances",
  "usage_events",
  "workspace_billing",
  "workspace_settings",
  "STARTUP_OFFICE_EXPORT_ROW_LIMIT",
  "startupOfficeExportChunkManifest",
]) {
  if (!exportSource.includes(snippet)) {
    fail(`export handler is missing ${snippet}`);
  }
}
if (exportSource.includes("token_hash")) {
  fail("export handler must not expose invite token_hash values");
}

for (const [relativePath, snippets, label] of [
  [
    "api/lib/startup-office/queryHandlers.test.js",
    ["startup-office-export.v2", "does not expose invite token hashes"],
    "export unit test",
  ],
  [
    "docs/ops/STARTUP-OFFICE-CLOSED-BETA-LAUNCH-KIT.md",
    ["Export Coverage", "startup-office-export.v2"],
    "closed beta export runbook",
  ],
  [
    "docs/specs/CLOSED-BETA-100-GOALS.md",
    ["startup-office-export.v2", "scripts/check-startup-office-export-coverage.cjs"],
    "closed beta export goal",
  ],
]) {
  for (const snippet of snippets) {
    if (!read(relativePath).includes(snippet)) {
      fail(`${label} is missing ${snippet} in ${relativePath}`);
    }
  }
}

console.log(
  `startup-office export coverage check passed: ${STARTUP_OFFICE_EXPORTED_TABLES.length} exported tables, ${omittedTableNames.length} documented omissions`,
);
