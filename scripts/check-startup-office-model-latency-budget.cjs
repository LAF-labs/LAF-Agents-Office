#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const manifestPath = "shared/startup-office-model-latency-budget.json";
const {
  STARTUP_OFFICE_LOOP_DEFINITIONS,
} = require("../api/lib/startup-office/loopDefinitions");
const {
  STARTUP_OFFICE_MODEL_LATENCY_BUDGET_VERSION,
  STARTUP_OFFICE_MODEL_LATENCY_BUDGETS,
} = require("../workers/startup-office/modelLatencyBudgets");

function fail(message) {
  console.error(`startup-office model latency budget check failed: ${message}`);
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

const manifest = JSON.parse(read(manifestPath));
const pkg = JSON.parse(read("package.json"));
const releaseGate = read("scripts/startup-office-beta-release-gate.cjs");

if (manifest.version !== STARTUP_OFFICE_MODEL_LATENCY_BUDGET_VERSION) {
  fail(`unexpected manifest version ${manifest.version || "<missing>"}`);
}
if (
  pkg.scripts?.["startup-office:model-latency-budget"] !==
  "node scripts/check-startup-office-model-latency-budget.cjs"
) {
  fail("package.json must expose startup-office:model-latency-budget");
}
if (!releaseGate.includes('"startup-office:model-latency-budget"')) {
  fail("beta release gate must include startup-office:model-latency-budget");
}

const loopSlugs = STARTUP_OFFICE_LOOP_DEFINITIONS.map((loop) => loop.slug).sort();
const manifestSlugs = Object.keys(manifest.budgets || {}).sort();
const codeSlugs = Object.keys(STARTUP_OFFICE_MODEL_LATENCY_BUDGETS).sort();
if (JSON.stringify(loopSlugs) !== JSON.stringify(manifestSlugs)) {
  fail("manifest budgets must cover every loop definition exactly");
}
if (JSON.stringify(loopSlugs) !== JSON.stringify(codeSlugs)) {
  fail("code budgets must cover every loop definition exactly");
}

for (const slug of loopSlugs) {
  const manifestBudget = manifest.budgets[slug];
  const codeBudget = STARTUP_OFFICE_MODEL_LATENCY_BUDGETS[slug];
  for (const key of ["target_ms", "warning_ms", "timeout_ms"]) {
    if (manifestBudget?.[key] !== codeBudget?.[key]) {
      fail(`${slug} ${key} differs between manifest and code`);
    }
  }
  if (!(codeBudget.target_ms > 0)) fail(`${slug} target_ms must be positive`);
  if (codeBudget.warning_ms < codeBudget.target_ms) {
    fail(`${slug} warning_ms must be >= target_ms`);
  }
  if (codeBudget.timeout_ms < codeBudget.warning_ms) {
    fail(`${slug} timeout_ms must be >= warning_ms`);
  }
}

for (const [relativePath, snippet, label] of [
  ["workers/startup-office/loopEngine.js", "startupOfficeModelLatencyBudget(loop.slug)", "loop budget selection"],
  ["workers/startup-office/loopEngine.js", "startupOfficeModelLatencyRecord(modelLatencyBudget", "latency measurement"],
  ["workers/startup-office/loopEngine.js", "model_latency_budget", "latency budget persistence"],
  ["workers/startup-office/loopEngine.test.js", "startup-office-model-latency-budget.v1", "loop engine regression test"],
  ["workers/startup-office/modelLatencyBudgets.test.js", "model latency budgets cover every Startup Office loop", "budget unit test"],
  ["docs/specs/SILICON-VALLEY-PRODUCTION-AUDIT.md", manifestPath, "production audit evidence"],
]) {
  assertContains(relativePath, snippet, label);
}

console.log(
  `startup-office model latency budget check passed: ${loopSlugs.length} loop budgets`,
);
