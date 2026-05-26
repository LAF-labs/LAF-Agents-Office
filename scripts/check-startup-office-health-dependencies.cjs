#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function fail(message) {
  console.error(`startup-office health dependency check failed: ${message}`);
  process.exit(1);
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function assertContains(relativePath, snippets, label) {
  const source = read(relativePath);
  for (const snippet of snippets) {
    if (!source.includes(snippet)) fail(`${label} is missing ${snippet} in ${relativePath}`);
  }
}

const pkg = JSON.parse(read("package.json"));
if (
  pkg.scripts?.["startup-office:health-dependencies"] !==
  "node scripts/check-startup-office-health-dependencies.cjs"
) {
  fail("package.json must expose startup-office:health-dependencies");
}

assertContains(
  "api/lib/hosted/healthHandlers.js",
  [
    "createHostedHealthHandlers",
    "supabase_rest",
    "supabase_auth",
    "startup_office_worker_jobs_table",
    "startup_office_outbox_events_table",
    "startup_office_model_config",
    "outbox_email_config",
  ],
  "hosted health handlers",
);
assertContains(
  "api/lib/hosted/apiRouteDispatcher.js",
  ['path === "health/dependencies"', "healthHandlers.dependencies"],
  "hosted API health route",
);
assertContains(
  "api/lib/hosted/healthHandlers.test.js",
  ["core Supabase, worker, outbox, and config dependencies", "returns 503"],
  "health handler tests",
);
assertContains(
  "api/hosted-api.test.js",
  ["health/dependencies", "dependency-aware health"],
  "hosted API health integration test",
);
assertContains(
  "scripts/startup-office-beta-release-gate.cjs",
  ['"startup-office:health-dependencies"', "api/lib/hosted/healthHandlers.test.js"],
  "beta release gate",
);
assertContains(
  "docs/specs/SILICON-VALLEY-PRODUCTION-AUDIT.md",
  ["startup-office:health-dependencies", "Health checks now cover hosted dependencies"],
  "production audit evidence",
);

console.log("startup-office health dependency check passed");
