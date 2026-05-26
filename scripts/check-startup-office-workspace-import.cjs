#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function fail(message) {
  console.error(`startup-office workspace import check failed: ${message}`);
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

const pkg = JSON.parse(read("package.json"));
if (
  pkg.scripts?.["startup-office:workspace-import"] !==
  "node scripts/check-startup-office-workspace-import.cjs"
) {
  fail("package.json must expose startup-office:workspace-import");
}

for (const [relativePath, snippets, label] of [
  [
    "api/lib/startup-office/workspaceImportAdapters.js",
    [
      "STARTUP_OFFICE_WORKSPACE_IMPORT_LIMIT",
      "assets",
      "customers",
      "metrics",
      "signals",
      "startup-office-workspace-import",
    ],
    "workspace import adapter",
  ],
  [
    "api/lib/startup-office/workspaceImportAdapters.js",
    ["memory:promote", "startup_office.workspace_imported"],
    "workspace import handler",
  ],
  [
    "api/lib/startup-office/importHandlers.js",
    ["createStartupOfficeWorkspaceImportHandler", "workspaceImport"],
    "workspace import handler wiring",
  ],
  [
    "api/lib/startup-office/importHandlers.test.js",
    [
      "workspace import restores operating objects from an export bundle",
      "workspace import rejects empty and oversized imports",
    ],
    "workspace import tests",
  ],
  [
    "api/lib/startup-office/routes.js",
    ["workspaceImport", "startup-office/import", "importStartupOfficeWorkspace"],
    "workspace import route contract",
  ],
  [
    "api/lib/startup-office/authorization.js",
    ["workspaceImport", "approveMemory"],
    "workspace import authorization",
  ],
  [
    "api/lib/hosted/actionRateLimitRules.js",
    ["startup-office\\/import", "startup_office_workspace_import"],
    "workspace import ingress rate limit",
  ],
  [
    "web/src/api/startupOffice.ts",
    ["StartupOfficeWorkspaceImportResponse", "importStartupOfficeWorkspace"],
    "web workspace import client",
  ],
  [
    "scripts/startup-office-beta-release-gate.cjs",
    ["startup-office:workspace-import", "api/lib/startup-office/importHandlers.test.js"],
    "release gate workspace import coverage",
  ],
  [
    "docs/specs/SILICON-VALLEY-PRODUCTION-AUDIT.md",
    ["startup-office:workspace-import", "non-memory operating objects"],
    "production audit workspace import evidence",
  ],
  [
    "docs/specs/CLOSED-BETA-100-GOALS.md",
    ["startup-office:workspace-import", "scripts/check-startup-office-workspace-import.cjs"],
    "closed beta goals workspace import evidence",
  ],
]) {
  for (const snippet of snippets) assertContains(relativePath, snippet, label);
}

console.log("startup-office workspace import check passed");
