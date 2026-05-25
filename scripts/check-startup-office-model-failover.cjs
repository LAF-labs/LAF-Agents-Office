#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function fail(message) {
  console.error(`startup-office model failover check failed: ${message}`);
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

const packageJSON = JSON.parse(read("package.json"));
if (
  packageJSON.scripts?.["startup-office:model-failover"] !==
  "node scripts/check-startup-office-model-failover.cjs"
) {
  fail("package.json must expose startup-office:model-failover");
}

for (const [relativePath, snippets, label] of [
  [
    "workers/startup-office/modelClient.js",
    [
      "openAIProviderConfigs",
      "LAF_OFFICE_OPENAI_FALLBACK_API_KEY",
      "LAF_OFFICE_OPENAI_FALLBACK_BASE_URL",
      "LAF_OFFICE_STARTUP_OFFICE_FALLBACK_MODEL",
      "isRetryableModelError",
      "provider_attempts",
      "openai_fallback",
    ],
    "model client fallback chain",
  ],
  [
    "workers/startup-office/modelClient.test.js",
    [
      "falls back to an OpenAI-compatible model route on transient failures",
      "openai_fallback",
      "provider_attempts",
    ],
    "model client fallback tests",
  ],
  [
    "scripts/hosted-env-preflight.cjs",
    [
      "startup_office_ai_fallback_enabled",
      "LAF_OFFICE_OPENAI_FALLBACK_API_KEY",
      "Startup Office AI fallback: enabled",
    ],
    "preflight fallback env",
  ],
  [
    "scripts/hosted-env-preflight.test.cjs",
    [
      "validates Startup Office AI fallback env without printing secrets",
      "fallback-key",
      "doesNotMatch",
    ],
    "preflight fallback tests",
  ],
  [
    "docs/ops/STARTUP-OFFICE-DEPLOYMENT-RUNBOOK.md",
    [
      "LAF_OFFICE_OPENAI_FALLBACK_API_KEY",
      "LAF_OFFICE_OPENAI_FALLBACK_BASE_URL",
      "LAF_OFFICE_STARTUP_OFFICE_FALLBACK_MODEL",
    ],
    "deployment runbook fallback vars",
  ],
  [
    "docs/specs/SILICON-VALLEY-PRODUCTION-AUDIT.md",
    ["startup-office:model-failover", "OpenAI-compatible fallback"],
    "production audit fallback evidence",
  ],
]) {
  for (const snippet of snippets) assertContains(relativePath, snippet, label);
}

if (!read("scripts/startup-office-beta-release-gate.cjs").includes("startup-office:model-failover")) {
  fail("beta release gate must include startup-office:model-failover");
}

console.log("startup-office model failover check passed");
