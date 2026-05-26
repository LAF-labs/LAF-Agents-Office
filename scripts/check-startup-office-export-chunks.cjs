#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const {
  STARTUP_OFFICE_EXPORT_CHUNK_COLLECTIONS,
  STARTUP_OFFICE_EXPORT_CHUNK_LIMIT,
  startupOfficeExportChunkManifest,
} = require("../api/lib/startup-office/exportManifest");

const root = path.resolve(__dirname, "..");
const manifestPath = "shared/startup-office-export-chunks.json";

function fail(message) {
  console.error(`startup-office export chunks check failed: ${message}`);
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

function sorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

const manifest = JSON.parse(read(manifestPath));
const packageJSON = JSON.parse(read("package.json"));
const chunkManifest = startupOfficeExportChunkManifest();

if (manifest.version !== "startup-office-export-chunks.v1") {
  fail(`unexpected manifest version ${manifest.version || "<missing>"}`);
}

if (
  packageJSON.scripts?.["startup-office:export-chunks"] !==
  "node scripts/check-startup-office-export-chunks.cjs"
) {
  fail("package.json must expose startup-office:export-chunks");
}

if (STARTUP_OFFICE_EXPORT_CHUNK_LIMIT !== manifest.max_limit) {
  fail(`chunk limit expected ${manifest.max_limit}, found ${STARTUP_OFFICE_EXPORT_CHUNK_LIMIT}`);
}

const codeCollections = Object.keys(STARTUP_OFFICE_EXPORT_CHUNK_COLLECTIONS);
if (JSON.stringify(sorted(codeCollections)) !== JSON.stringify(sorted(manifest.collections))) {
  fail("chunk collection manifest does not match exportManifest.js");
}

if (chunkManifest.max_limit !== manifest.max_limit) {
  fail("startupOfficeExportChunkManifest must expose max_limit");
}

for (const collection of manifest.collections) {
  const descriptor = STARTUP_OFFICE_EXPORT_CHUNK_COLLECTIONS[collection];
  if (!descriptor?.source_table || !descriptor?.cursor_field) {
    fail(`${collection} must define source_table and cursor_field`);
  }
}

for (const [relativePath, snippets, label] of [
  [
    "api/lib/startup-office/exportHandlers.js",
    [
      "req.query?.collection",
      "startupOfficePageRequest",
      "startupOfficePageResult",
      "export_chunk",
      "collection must be one of",
    ],
    "chunked export handler",
  ],
  [
    "api/lib/startup-office/exportManifest.js",
    [
      "STARTUP_OFFICE_EXPORT_CHUNK_COLLECTIONS",
      "startupOfficeExportChunkManifest",
      "chunked_endpoint",
    ],
    "chunked export manifest",
  ],
  [
    "api/lib/startup-office/queryHandlers.test.js",
    [
      "returns cursor-paginated collection chunks",
      "rejects unsupported chunk collections",
      "chunked_endpoint",
    ],
    "chunked export tests",
  ],
  [
    "scripts/startup-office-beta-release-gate.cjs",
    ["startup-office:export-chunks"],
    "release gate",
  ],
  [
    "docs/specs/SILICON-VALLEY-PRODUCTION-AUDIT.md",
    [manifestPath, "startup-office:export-chunks"],
    "production audit evidence",
  ],
]) {
  for (const snippet of snippets) assertContains(relativePath, snippet, label);
}

console.log(
  `startup-office export chunks check passed: ${manifest.collections.length} chunked collections`,
);
