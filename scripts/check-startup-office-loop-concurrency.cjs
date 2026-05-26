#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function fail(message) {
  console.error(`startup-office loop concurrency check failed: ${message}`);
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

const packageJson = JSON.parse(read("package.json"));
if (
  packageJson.scripts?.["startup-office:loop-concurrency"] !==
  "node scripts/check-startup-office-loop-concurrency.cjs"
) {
  fail("package.json must expose startup-office:loop-concurrency");
}

assertContains(
  "scripts/startup-office-beta-release-gate.cjs",
  ['"startup-office:loop-worker:test"', '"startup-office:loop-concurrency"'],
  "beta release gate loop concurrency contract",
);

assertContains(
  "supabase/migrations/20260525110000_claim_startup_office_worker_jobs.sql",
  ["for update skip locked", "reclaimed stale worker lease", "p_lock_ms", "attempts = jobs.attempts + 1"],
  "worker job lease RPC",
);

assertContains(
  "workers/startup-office/loopWorker.js",
  ["processBatch", "Math.min(Number(limit) || 5, 50)", "terminalRunStatus"],
  "loop worker batch and terminal contract",
);

assertContains(
  "workers/startup-office/loopWorker.test.js",
  [
    "processes concurrent unique loop jobs without duplicate side effects",
    "Promise.all",
    "batch load is capped and stops at idle",
    "processBatch({ limit: 1000 })",
  ],
  "loop worker concurrency tests",
);

console.log("startup-office loop concurrency check passed");
