#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function fail(message) {
  console.error(`startup-office memory import check failed: ${message}`);
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
  pkg.scripts?.["startup-office:memory-import"] !==
  "node scripts/check-startup-office-memory-import.cjs"
) {
  fail("package.json must expose startup-office:memory-import");
}

for (const [relativePath, snippets, label] of [
  [
    "api/lib/startup-office/importHandlers.js",
    [
      "createStartupOfficeImportHandlers",
      "STARTUP_OFFICE_MEMORY_IMPORT_LIMIT",
      "memory:promote",
      "startup_office.memory_imported",
      "startup-office-memory-import",
    ],
    "memory import handler",
  ],
  [
    "api/lib/startup-office/importHandlers.test.js",
    [
      "restores approved company memory from an export bundle",
      "accepts direct memory_pages arrays",
      "rejects empty, oversized, and malformed imports",
    ],
    "memory import tests",
  ],
  [
    "api/lib/startup-office/routes.js",
    ["memoryImport", "startup-office/memory/import", "importStartupOfficeMemory"],
    "memory import route contract",
  ],
  [
    "api/lib/startup-office/authorization.js",
    ["memoryImport", "approveMemory"],
    "memory import authorization",
  ],
  [
    "api/lib/hosted/actionRateLimitRules.js",
    ["startup-office\\/memory\\/import", "startup_office_memory_import"],
    "memory import ingress rate limit",
  ],
  [
    "web/src/api/startupOffice.ts",
    ["StartupOfficeMemoryImportResponse", "importStartupOfficeMemory"],
    "web memory import client",
  ],
  [
    "scripts/startup-office-beta-release-gate.cjs",
    [
      "startup-office:memory-import",
      "api/lib/startup-office/importHandlers.test.js",
    ],
    "release gate memory import coverage",
  ],
  [
    "docs/specs/SILICON-VALLEY-PRODUCTION-AUDIT.md",
    ["startup-office:memory-import", "Founder can restore company memory"],
    "production audit memory import evidence",
  ],
  [
    "docs/specs/CLOSED-BETA-100-GOALS.md",
    ["startup-office:memory-import", "scripts/check-startup-office-memory-import.cjs"],
    "closed beta goals memory import evidence",
  ],
]) {
  for (const snippet of snippets) assertContains(relativePath, snippet, label);
}

console.log("startup-office memory import check passed");
