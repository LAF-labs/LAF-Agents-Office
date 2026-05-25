#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function fail(message) {
  console.error(`startup-office payload limit check failed: ${message}`);
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
  packageJson.scripts?.["startup-office:payload-limits"] !==
  "node scripts/check-startup-office-payload-limits.cjs"
) {
  fail("package.json must expose startup-office:payload-limits");
}

assertContains(
  "scripts/startup-office-beta-release-gate.cjs",
  '"startup-office:payload-limits"',
  "beta release gate",
);

for (const [relativePath, snippet, label] of [
  [
    "api/lib/startup-office/payloadLimits.js",
    "STARTUP_OFFICE_PAYLOAD_LIMITS",
    "payload limit constants",
  ],
  [
    "api/lib/startup-office/objectHandlers.js",
    "assertObjectPayloadLimits",
    "asset request payload guard",
  ],
  [
    "api/lib/startup-office/objectHandlers.js",
    "artifact asset body",
    "artifact-to-asset payload guard",
  ],
  [
    "workers/startup-office/loopEngine.js",
    "model artifact content",
    "model artifact payload guard",
  ],
  [
    "workers/startup-office/loopEngine.js",
    "model structured output",
    "model structured output payload guard",
  ],
  [
    "api/lib/startup-office/objectHandlers.test.js",
    "asset writes reject oversized user payloads before database writes",
    "asset payload behavior test",
  ],
  [
    "api/lib/startup-office/objectHandlers.test.js",
    "artifact to asset action rejects oversized model artifacts before database writes",
    "artifact asset payload behavior test",
  ],
  [
    "workers/startup-office/loopEngine.test.js",
    "startup office loop engine rejects oversized model artifacts before database writes",
    "model artifact payload behavior test",
  ],
]) {
  assertContains(relativePath, snippet, label);
}

console.log("startup-office payload limit check passed");
