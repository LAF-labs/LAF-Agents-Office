#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function fail(message) {
  console.error(`startup-office pagination check failed: ${message}`);
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

const packageJSON = JSON.parse(read("package.json"));
if (
  packageJSON.scripts?.["startup-office:pagination"] !==
  "node scripts/check-startup-office-pagination.cjs"
) {
  fail("package.json must expose startup-office:pagination");
}

for (const [relativePath, snippets, label] of [
  [
    "api/lib/startup-office/pagination.js",
    [
      "startupOfficePageRequest",
      "startupOfficePageResult",
      "applyStartupOfficeCursor",
      "cursor must be an ISO timestamp",
      "request_limit",
    ],
    "pagination helper",
  ],
  [
    "api/lib/startup-office/queryHandlers.js",
    ["startupOfficePageRequest", "startupOfficePageResult", "pagination"],
    "receipts pagination handler",
  ],
  [
    "api/lib/startup-office/objectHandlers.js",
    ["startupOfficePageRequest", "startupOfficePageResult", "pagination"],
    "object list pagination handler",
  ],
  [
    "api/lib/startup-office/repositories.js",
    ["applyStartupOfficeCursor(query, options.cursor)"],
    "repository cursor filters",
  ],
  [
    "api/[...path].js",
    ["applyStartupOfficeCursor(query, options.cursor)"],
    "operating object cursor filters",
  ],
  [
    "web/src/api/startupOffice.ts",
    ["StartupOfficePagination", "cursor: opts?.cursor"],
    "web pagination contract",
  ],
  [
    "scripts/startup-office-beta-release-gate.cjs",
    [
      "startup-office:pagination",
      "api/lib/startup-office/pagination.test.js",
      "api/lib/startup-office/objectHandlers.test.js",
      "api/lib/startup-office/queryHandlers.test.js",
    ],
    "release gate pagination coverage",
  ],
  [
    "docs/specs/SILICON-VALLEY-PRODUCTION-AUDIT.md",
    ["startup-office:pagination", "Receipts and operating object lists now expose cursor pagination"],
    "production audit pagination evidence",
  ],
]) {
  for (const snippet of snippets) assertContains(relativePath, snippet, label);
}

console.log("startup-office pagination check passed");
