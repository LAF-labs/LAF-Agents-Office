#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function fail(message) {
  console.error(`startup-office client telemetry check failed: ${message}`);
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

const pkg = JSON.parse(read("package.json"));
if (
  pkg.scripts?.["startup-office:client-telemetry"] !==
  "node scripts/check-startup-office-client-telemetry.cjs"
) {
  fail("package.json must expose startup-office:client-telemetry");
}

for (const [relativePath, snippet, label] of [
  [
    "api/lib/hosted/clientTelemetryHandlers.js",
    "client.error_reported",
    "server telemetry audit action",
  ],
  [
    "api/lib/hosted/clientTelemetryHandlers.js",
    "redactClientText",
    "server telemetry redaction",
  ],
  [
    "api/lib/hosted/apiRouteDispatcher.js",
    'path === "client-errors"',
    "hosted client telemetry route",
  ],
  [
    "api/lib/hosted/actionRateLimitRules.js",
    "hosted_client_error_report",
    "client telemetry rate limit",
  ],
  [
    "web/src/lib/clientTelemetry.ts",
    "installClientErrorReporter",
    "browser error listener",
  ],
  [
    "web/src/lib/clientTelemetry.ts",
    "currentClientTelemetryRoute",
    "workspace-safe route helper",
  ],
  [
    "web/src/main.tsx",
    "installClientErrorReporter",
    "main telemetry installer",
  ],
  [
    "scripts/startup-office-beta-release-gate.cjs",
    "api/lib/hosted/clientTelemetryHandlers.test.js",
    "server telemetry release-gate test",
  ],
  [
    "scripts/startup-office-beta-release-gate.cjs",
    "src/lib/clientTelemetry.test.ts",
    "browser telemetry release-gate test",
  ],
  [
    "docs/specs/SILICON-VALLEY-PRODUCTION-AUDIT.md",
    "workspace-scoped client.error_reported audit events",
    "production audit progress log",
  ],
]) {
  assertContains(relativePath, snippet, label);
}

console.log("startup-office client telemetry check passed");
