#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function fail(message) {
  console.error(`startup-office loop rollout check failed: ${message}`);
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
  packageJson.scripts?.["startup-office:loop-rollout"] !==
  "node scripts/check-startup-office-loop-rollout.cjs"
) {
  fail("package.json must expose startup-office:loop-rollout");
}

const policy = JSON.parse(read("shared/startup-office-rollout-policy.json"));
for (const slug of ["idea-validation", "offer-package", "customer-discovery", "weekly-operator-review"]) {
  if (!policy.stable_loops?.includes(slug)) fail(`rollout policy must enable stable loop ${slug}`);
}
if (!policy.gated_loops?.some((loop) => loop.slug === "launch-campaign")) {
  fail("rollout policy must gate launch-campaign");
}
if (policy.flag !== "startup_office_rollout.enabled_loops") {
  fail("rollout policy must publish the workspace flag path");
}

assertContains(
  "api/lib/startup-office/loopRollout.js",
  ["startupOfficeLoopRolloutDecision", "assertStartupOfficeLoopRollout", "workspace_flag_required"],
  "loop rollout helper",
);

assertContains(
  "api/lib/startup-office/workflowHandlers.js",
  ["assertStartupOfficeLoopRollout", "rollout", "workspaceSettingsForMembership"],
  "workflow rollout enforcement",
);

assertContains(
  "api/lib/startup-office/workflowHandlers.test.js",
  ["blocks gated loops unless workspace rollout flag enables them", "launch-campaign", "operator_preview"],
  "workflow rollout tests",
);

assertContains(
  "scripts/startup-office-beta-release-gate.cjs",
  ['"startup-office:loop-rollout"'],
  "beta release gate rollout contract",
);

console.log("startup-office loop rollout check passed");
