#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const {
  STARTUP_OFFICE_OBJECT_QUERY_CONTRACTS,
} = require("../api/lib/startup-office/objectQueries");

const root = path.resolve(__dirname, "..");

function fail(message) {
  console.error(`startup-office object query contract check failed: ${message}`);
  process.exit(1);
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

const pkg = JSON.parse(read("package.json"));
if (
  pkg.scripts?.["startup-office:object-query-contracts"] !==
  "node scripts/check-startup-office-object-query-contracts.cjs"
) {
  fail("package.json must expose startup-office:object-query-contracts");
}

if (!read("scripts/startup-office-beta-release-gate.cjs").includes('"startup-office:object-query-contracts"')) {
  fail("beta release gate must include startup-office:object-query-contracts");
}

for (const kind of ["assets", "customers", "metrics", "signals"]) {
  const contract = STARTUP_OFFICE_OBJECT_QUERY_CONTRACTS[kind];
  if (!contract) fail(`${kind} is missing a query contract`);
  if (!contract.sorts.includes("created_at.desc")) {
    fail(`${kind} must support the stable default sort`);
  }
  if (Object.keys(contract.filters).length === 0) {
    fail(`${kind} must declare at least one filter`);
  }
}

for (const [relativePath, snippets, label] of [
  [
    "api/lib/startup-office/objectQueries.js",
    ["startupOfficeObjectListOptions", "applyStartupOfficeObjectListQuery", "sort must be one of"],
    "object query contract helper",
  ],
  [
    "api/lib/startup-office/objectHandlers.js",
    ["startupOfficeObjectListOptions(kind, req.query", "startupOfficePageRequest"],
    "object handler query parser",
  ],
  [
    "api/[...path].js",
    ["applyStartupOfficeObjectListQuery(query, kind, options)"],
    "object row REST query",
  ],
  [
    "api/lib/startup-office/objectQueries.test.js",
    ["rejects unsupported sort fields", "applies filters and sort to REST query"],
    "object query contract tests",
  ],
  [
    "docs/specs/SILICON-VALLEY-PRODUCTION-AUDIT.md",
    ["SV-I026", "startup-office:object-query-contracts"],
    "production audit",
  ],
]) {
  const body = read(relativePath);
  for (const snippet of snippets) {
    if (!body.includes(snippet)) fail(`${label} is missing ${snippet}`);
  }
}

console.log("startup-office object query contract check passed");
