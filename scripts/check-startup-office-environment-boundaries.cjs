#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function fail(message) {
  console.error(`startup-office environment boundary check failed: ${message}`);
  process.exit(1);
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function assertFile(relativePath, label) {
  if (!fs.existsSync(path.join(root, relativePath))) {
    fail(`${label} is missing ${relativePath}`);
  }
}

function assertContains(relativePath, snippets, label) {
  const body = read(relativePath);
  for (const snippet of snippets) {
    if (!body.includes(snippet)) fail(`${label} is missing ${snippet} in ${relativePath}`);
  }
}

const manifestPath = "shared/startup-office-environment-boundaries.json";
const manifest = JSON.parse(read(manifestPath));
if (manifest.version !== "startup-office-environment-boundaries.v1") {
  fail(`${manifestPath} must use startup-office-environment-boundaries.v1`);
}

const packageJSON = JSON.parse(read("package.json"));
if (
  packageJSON.scripts?.["startup-office:environment-boundaries"] !==
  "node scripts/check-startup-office-environment-boundaries.cjs"
) {
  fail("package.json must expose startup-office:environment-boundaries");
}

if (manifest.provider_policy.production.allowed.join(",") !== "openai") {
  fail("production provider policy must allow only openai");
}
if (manifest.provider_policy.production.blocked.join(",") !== "fake,disabled") {
  fail("production provider policy must block fake and disabled");
}
for (const checkName of [
  "startup-office:environment-boundaries",
  "startup-office:live-model-smoke-check",
  "hosted-env:preflight:test",
]) {
  if (!manifest.release_checks.includes(checkName)) {
    fail(`release_checks must include ${checkName}`);
  }
}

for (const relativePath of [
  ...manifest.provider_policy.production.guarded_by,
  ...manifest.provider_policy.local_and_test.covered_by,
  ...manifest.demo_seed.paths,
  ...manifest.mock_fixtures.paths,
  ...manifest.live_checks.paths,
]) {
  assertFile(relativePath, "environment boundary manifest");
}

assertContains(
  "scripts/startup-office-beta-release-gate.cjs",
  ['"startup-office:environment-boundaries"'],
  "release gate environment boundary wiring",
);
assertContains(
  "scripts/hosted-env-preflight.cjs",
  [
    'provider === "fake" || provider === "disabled"',
    "fake and disabled are local/test only",
  ],
  "hosted env preflight provider policy",
);
assertContains(
  "scripts/hosted-env-preflight.test.cjs",
  [
    "preflight rejects fake or disabled AI providers outside local rehearsals",
    "fake and disabled are local/test only",
  ],
  "hosted env preflight provider tests",
);
assertContains(
  "scripts/startup-office-live-model-smoke.cjs",
  [
    "live smoke requires LAF_OFFICE_STARTUP_OFFICE_AI_PROVIDER=openai",
    "live smoke must not use the fake provider",
  ],
  "live model smoke provider policy",
);
assertContains(
  "scripts/startup-office-live-model-smoke.test.cjs",
  ["live model smoke rejects fake provider even when enabled"],
  "live model smoke provider tests",
);
assertContains(
  "api/lib/startup-office/demoSeedHandlers.js",
  [
    'process.env.NODE_ENV === "production"',
    "LAF_OFFICE_ENABLE_DEMO_SEED",
    'throw createHTTPError(404, "not found")',
  ],
  "demo seed production guard",
);
assertContains(
  "api/lib/startup-office/demoSeedHandlers.test.js",
  ["demo seed handler is unavailable in production unless explicitly enabled"],
  "demo seed production tests",
);
assertContains(
  "web/src/api/notebook.ts",
  ["Uses the live broker by default", "Mock fixtures are", "VITE_NOTEBOOK_MOCK=true"],
  "notebook fixture boundary",
);
assertContains(
  "web/src/api/wiki.ts",
  [
    "Uses the live broker by default",
    "Demo fixtures remain for preview paths",
    "canonical company memory paths never fall back",
  ],
  "wiki fixture boundary",
);
assertContains(
  "docs/specs/SILICON-VALLEY-PRODUCTION-AUDIT.md",
  [
    "Startup Office environment boundaries now have a tracked manifest",
    "startup-office:environment-boundaries",
    "SV-I183",
  ],
  "production audit environment boundary evidence",
);
assertContains(
  "docs/specs/CLOSED-BETA-100-GOALS.md",
  [
    "startup-office:environment-boundaries",
    "shared/startup-office-environment-boundaries.json",
  ],
  "closed beta goals environment boundary evidence",
);

console.log("startup-office environment boundary check passed");
