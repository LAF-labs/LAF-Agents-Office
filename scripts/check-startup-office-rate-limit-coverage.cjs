#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const {
  STARTUP_OFFICE_ROUTE_CONTRACTS,
} = require("../api/lib/startup-office/routes");
const {
  matchHostedActionRateLimit,
} = require("../api/lib/hosted/rateLimits");

const root = path.resolve(__dirname, "..");

function fail(message) {
  console.error(`startup-office rate limit coverage check failed: ${message}`);
  process.exit(1);
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

const packageJson = JSON.parse(read("package.json"));
if (
  packageJson.scripts?.["startup-office:rate-limits"] !==
  "node scripts/check-startup-office-rate-limit-coverage.cjs"
) {
  fail("package.json must expose startup-office:rate-limits");
}
if (!read("scripts/startup-office-beta-release-gate.cjs").includes('"startup-office:rate-limits"')) {
  fail("beta release gate must include startup-office:rate-limits");
}

const PATTERN_SAMPLES = Object.freeze({
  approvalAction: ["startup-office/approvals/approval-1/approve", "approvals/approval-1/revise"],
  artifactObjectAction: [
    "startup-office/artifacts/artifact-1/save-as-asset",
    "startup-office/artifacts/artifact-1/record-signal",
  ],
  loopRun: ["startup-office/loops/idea-validation/run", "loops/customer-discovery/run"],
  objectCollection: [
    "startup-office/assets",
    "startup-office/customers",
    "startup-office/metrics",
    "startup-office/signals",
  ],
  objectItem: [
    "startup-office/assets/asset-1",
    "startup-office/customers/customer-1",
    "startup-office/metrics/metric-1",
    "startup-office/signals/signal-1",
  ],
  run: ["startup-office/runs/run-1/retry", "runs/run-1/cancel"],
  supportAccessAction: [
    "startup-office/support-access/event-1/revoke",
    "startup-office/support-access/event-1/log-access",
  ],
  workerJobAction: [
    "startup-office/admin/worker-jobs/job-1/retry",
    "startup-office/admin/worker-jobs/job-1/cancel",
  ],
});

let checked = 0;
for (const contract of STARTUP_OFFICE_ROUTE_CONTRACTS) {
  for (const method of contract.methods) {
    if (method === "GET") continue;
    const paths = samplePathsForContract(contract);
    for (const routePath of paths) {
      checked += 1;
      const rule = matchHostedActionRateLimit(method, routePath);
      if (!rule) {
        fail(`${contract.id}.${method} is missing ingress rate limit for ${routePath}`);
      }
      if (!rule.scope || !Number.isInteger(rule.limit) || rule.limit < 1) {
        fail(`${contract.id}.${method} matched an invalid rate limit for ${routePath}`);
      }
    }
  }
}

console.log(`startup-office rate limit coverage check passed: ${checked} mutating route samples`);

function samplePathsForContract(contract) {
  if (contract.paths?.length) return contract.paths;
  const samples = PATTERN_SAMPLES[contract.id];
  if (!samples?.length) fail(`${contract.id} needs rate-limit sample paths`);
  return samples;
}
