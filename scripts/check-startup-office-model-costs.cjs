#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function fail(message) {
  console.error(`startup-office model costs check failed: ${message}`);
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
  packageJSON.scripts?.["startup-office:model-costs"] !==
  "node scripts/check-startup-office-model-costs.cjs"
) {
  fail("package.json must expose startup-office:model-costs");
}

for (const [relativePath, snippets, label] of [
  [
    "workers/startup-office/modelCosts.js",
    [
      "LAF_OFFICE_MODEL_PRICING_JSON",
      "estimated_from_provider_usage",
      "provider_usage_without_pricing",
      "validateModelPricingCatalog",
    ],
    "model pricing estimator",
  ],
  [
    "workers/startup-office/modelClient.js",
    [
      "modelCostEstimate",
      "billing_reconciliation",
      "estimated_cents",
      "pricing_key",
    ],
    "model client cost metadata",
  ],
  [
    "workers/startup-office/modelCosts.test.js",
    [
      "estimates model costs from provider usage and pricing catalog",
      "pricing catalog validation requires every configured model route",
    ],
    "model cost tests",
  ],
  [
    "scripts/hosted-env-preflight.cjs",
    [
      "validateModelPricingCatalog",
      "Startup Office model pricing: configured",
      "startup_office_model_pricing_configured",
    ],
    "preflight model cost validation",
  ],
  [
    "api/lib/startup-office/runOutcomeRecorder.js",
    [
      "cost_billing_reconciliation",
      "cost_pricing_key",
      "cost_raw_estimated_cents",
    ],
    "usage event cost provenance",
  ],
  [
    "docs/ops/STARTUP-OFFICE-DEPLOYMENT-RUNBOOK.md",
    [
      "LAF_OFFICE_MODEL_PRICING_JSON",
      "input_cents_per_1m",
      "output_cents_per_1m",
    ],
    "deployment runbook pricing env",
  ],
  [
    "docs/specs/SILICON-VALLEY-PRODUCTION-AUDIT.md",
    ["startup-office:model-costs", "operator pricing catalog"],
    "production audit model cost evidence",
  ],
]) {
  for (const snippet of snippets) assertContains(relativePath, snippet, label);
}

if (!read("scripts/startup-office-beta-release-gate.cjs").includes("startup-office:model-costs")) {
  fail("beta release gate must include startup-office:model-costs");
}

console.log("startup-office model costs check passed");
