#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function fail(message) {
  console.error(`startup-office cancellation contract check failed: ${message}`);
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

const packageJson = JSON.parse(read("package.json"));
if (
  packageJson.scripts?.["startup-office:cancellation"] !==
  "node scripts/check-startup-office-cancellation-contract.cjs"
) {
  fail("package.json must expose startup-office:cancellation");
}

assertContains(
  "scripts/startup-office-beta-release-gate.cjs",
  '"startup-office:cancellation"',
  "beta release gate",
);

for (const [relativePath, snippets, label] of [
  [
    "api/lib/startup-office/workflowRunHandlers.js",
    [
      "cancelOpenWorkerJobs",
      "startup_office_worker_jobs",
      "in.(queued,running,failed)",
      "canceled_worker_job_count",
    ],
    "run cancel worker-job propagation",
  ],
  [
    "workers/startup-office/loopEngine.js",
    [
      "finishCanceledRun",
      'stage: "before_start"',
      'stage: "before_model"',
      'stage: "after_model"',
      "cancellation_stage",
      'status: "canceled"',
    ],
    "loop engine cancellation guard",
  ],
  [
    "api/lib/startup-office/workflowHandlers.test.js",
    [
      "startup_office_worker_jobs",
      "canceled_worker_job_count",
      "run handler returns run detail and can cancel an unfinished run",
    ],
    "workflow cancellation tests",
  ],
  [
    "workers/startup-office/loopEngine.test.js",
    [
      "stops before side effects when a run is canceled during generation",
      "after_model",
      "state.artifacts.length, 0",
    ],
    "loop engine cancellation tests",
  ],
  [
    "docs/specs/SILICON-VALLEY-PRODUCTION-AUDIT.md",
    ["startup-office:cancellation", "distributed cancellation"],
    "production audit cancellation evidence",
  ],
]) {
  for (const snippet of snippets) assertContains(relativePath, snippet, label);
}

console.log("startup-office cancellation contract check passed");
