#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function fail(message) {
  console.error(`startup-office code ownership check failed: ${message}`);
  process.exit(1);
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function assertContains(relativePath, snippets, label) {
  const body = read(relativePath);
  for (const snippet of snippets) {
    if (!body.includes(snippet)) fail(`${label} is missing ${snippet} in ${relativePath}`);
  }
}

const pkg = JSON.parse(read("package.json"));
if (
  pkg.scripts?.["startup-office:code-ownership"] !==
  "node scripts/check-startup-office-code-ownership.cjs"
) {
  fail("package.json must expose startup-office:code-ownership");
}

assertContains(
  ".github/CODEOWNERS",
  [
    "# Startup Office production domain boundaries",
    "/api/lib/startup-office/            @FranDias",
    "/workers/startup-office/            @FranDias",
    "/web/src/components/startup-office/ @FranDias",
    "/web/src/api/startupOffice.ts       @FranDias",
    "/supabase/migrations/               @FranDias",
    "/supabase/schema/                   @FranDias",
    "/docs/ops/                  @FranDias",
    "/scripts/check-startup-office-*.cjs @FranDias",
    "/scripts/startup-office-*.cjs       @FranDias",
  ],
  "CODEOWNERS Startup Office domain boundaries",
);

assertContains(
  "scripts/startup-office-beta-release-gate.cjs",
  ['"startup-office:code-ownership"'],
  "beta release gate",
);

assertContains(
  "docs/specs/SILICON-VALLEY-PRODUCTION-AUDIT.md",
  ["startup-office:code-ownership", "CODEOWNERS now pins Startup Office"],
  "production audit ownership evidence",
);

console.log("startup-office code ownership check passed");
