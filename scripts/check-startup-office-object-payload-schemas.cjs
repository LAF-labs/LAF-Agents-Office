#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const {
  STARTUP_OFFICE_OBJECT_PAYLOAD_SCHEMAS,
} = require("../api/lib/startup-office/objectPayloadSchemas");

const root = path.resolve(__dirname, "..");

function fail(message) {
  console.error(`startup-office object payload schema check failed: ${message}`);
  process.exit(1);
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

const pkg = JSON.parse(read("package.json"));
if (
  pkg.scripts?.["startup-office:object-payload-schemas"] !==
  "node scripts/check-startup-office-object-payload-schemas.cjs"
) {
  fail("package.json must expose startup-office:object-payload-schemas");
}

if (!read("scripts/startup-office-beta-release-gate.cjs").includes('"startup-office:object-payload-schemas"')) {
  fail("beta release gate must include startup-office:object-payload-schemas");
}

for (const kind of ["assets", "customers", "metrics", "signals"]) {
  const schema = STARTUP_OFFICE_OBJECT_PAYLOAD_SCHEMAS[kind];
  if (!schema?.create?.length) fail(`${kind} create schema is missing`);
  if (!schema?.patch?.length) fail(`${kind} patch schema is missing`);
}

for (const [relativePath, snippets, label] of [
  [
    "api/lib/startup-office/objectPayloadSchemas.js",
    ["assertStartupOfficeObjectPayloadSchema", "assertStartupOfficeArtifactActionPayload", "unsupported payload fields"],
    "object payload schema helper",
  ],
  [
    "api/lib/startup-office/objectHandlers.js",
    [
      "assertStartupOfficeObjectPayloadSchema(kind, \"create\"",
      "assertStartupOfficeObjectPayloadSchema(kind, \"patch\"",
      "assertStartupOfficeArtifactActionPayload(action",
    ],
    "object handlers",
  ],
  [
    "api/lib/startup-office/objectPayloadSchemas.test.js",
    ["reject unknown fields", "artifact action payload schemas"],
    "object payload schema tests",
  ],
  [
    "docs/specs/SILICON-VALLEY-PRODUCTION-AUDIT.md",
    ["SV-I021", "startup-office:object-payload-schemas"],
    "production audit",
  ],
]) {
  const body = read(relativePath);
  for (const snippet of snippets) {
    if (!body.includes(snippet)) fail(`${label} is missing ${snippet}`);
  }
}

console.log("startup-office object payload schema check passed");
