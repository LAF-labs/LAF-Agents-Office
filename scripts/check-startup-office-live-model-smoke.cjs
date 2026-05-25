#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function fail(message) {
  console.error(`startup-office live model smoke check failed: ${message}`);
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
  packageJSON.scripts?.["startup-office:live-model-smoke"] !==
  "node scripts/startup-office-live-model-smoke.cjs"
) {
  fail("package.json must expose startup-office:live-model-smoke");
}
if (
  packageJSON.scripts?.["startup-office:live-model-smoke-check"] !==
  "node scripts/check-startup-office-live-model-smoke.cjs"
) {
  fail("package.json must expose startup-office:live-model-smoke-check");
}
if (
  packageJSON.scripts?.["startup-office:live-model-smoke:test"] !==
  "node --test scripts/startup-office-live-model-smoke.test.cjs"
) {
  fail("package.json must expose startup-office:live-model-smoke:test");
}

for (const [relativePath, snippets, label] of [
  [
    "scripts/startup-office-live-model-smoke.cjs",
    [
      "LAF_RUN_LIVE_MODEL_SMOKE",
      "createStartupOfficeModelClient",
      "evaluateStartupOfficeOutput",
      "live smoke requires LAF_OFFICE_STARTUP_OFFICE_AI_PROVIDER=openai",
      "live model response did not include provider usage tokens",
    ],
    "live model smoke script",
  ],
  [
    "scripts/startup-office-live-model-smoke.test.cjs",
    [
      "skipped unless explicitly enabled",
      "rejects fake provider",
      "verifies one OpenAI structured model path",
    ],
    "live model smoke tests",
  ],
  [
    "scripts/startup-office-beta-release-gate.cjs",
    [
      "startup-office:live-model-smoke-check",
      "startup-office:live-model-smoke:test",
    ],
    "release gate static live-smoke checks",
  ],
  [
    "docs/ops/STARTUP-OFFICE-DEPLOYMENT-RUNBOOK.md",
    ["startup-office:live-model-smoke", "LAF_RUN_LIVE_MODEL_SMOKE=1"],
    "deployment runbook live-smoke instructions",
  ],
  [
    "docs/specs/SILICON-VALLEY-PRODUCTION-AUDIT.md",
    ["startup-office:live-model-smoke", "manual gated script"],
    "production audit live-smoke evidence",
  ],
]) {
  for (const snippet of snippets) assertContains(relativePath, snippet, label);
}

console.log("startup-office live model smoke check passed");
