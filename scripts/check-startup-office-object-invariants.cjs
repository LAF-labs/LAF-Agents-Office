#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const {
  STARTUP_OFFICE_OBJECT_INVARIANTS,
} = require("../api/lib/startup-office/objectInvariants");

const root = path.resolve(__dirname, "..");

function fail(message) {
  console.error(`startup-office object invariant check failed: ${message}`);
  process.exit(1);
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

const pkg = JSON.parse(read("package.json"));
if (
  pkg.scripts?.["startup-office:object-invariants"] !==
  "node scripts/check-startup-office-object-invariants.cjs"
) {
  fail("package.json must expose startup-office:object-invariants");
}

if (!read("scripts/startup-office-beta-release-gate.cjs").includes('"startup-office:object-invariants"')) {
  fail("beta release gate must include startup-office:object-invariants");
}

for (const kind of ["assets", "customers", "metrics", "signals"]) {
  if (!STARTUP_OFFICE_OBJECT_INVARIANTS[kind]) fail(`${kind} invariant is missing`);
}

for (const [relativePath, snippets, label] of [
  [
    "api/lib/startup-office/objectInvariants.js",
    [
      "STARTUP_OFFICE_OBJECT_INVARIANTS",
      "startupOfficeAssetStatus",
      "startupOfficeCustomerStatus",
      "startupOfficeSignalStatus",
      "startupOfficeSignalType",
    ],
    "object invariant module",
  ],
  [
    "api/[...path].js",
    ["startupOfficeAssetStatus", "startupOfficeCustomerStatus", "startupOfficeSignalStatus", "startupOfficeSignalType"],
    "hosted object writes",
  ],
  [
    "api/lib/startup-office/serializers.js",
    ["startupOfficeAssetStatus(row.status)", "startupOfficeCustomerStatus(row.status)", "startupOfficeSignalType(row.signal_type)"],
    "object serializers",
  ],
  [
    "api/lib/startup-office/objectHandlers.js",
    ["startupOfficeSignalType(body.signal_type || body.type || \"internal\")"],
    "artifact signal handler",
  ],
  [
    "docs/specs/SILICON-VALLEY-PRODUCTION-AUDIT.md",
    ["SV-I020", "startup-office:object-invariants"],
    "production audit",
  ],
]) {
  const body = read(relativePath);
  for (const snippet of snippets) {
    if (!body.includes(snippet)) fail(`${label} is missing ${snippet}`);
  }
}

if (/function startupOffice(?:AssetStatus|CustomerStatus|SignalStatus|SignalType)\b/.test(read("api/[...path].js"))) {
  fail("hosted facade must not redefine object invariant normalizers");
}

console.log("startup-office object invariant check passed");
