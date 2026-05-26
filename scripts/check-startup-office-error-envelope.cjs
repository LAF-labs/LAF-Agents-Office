#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function fail(message) {
  console.error(`startup-office error envelope check failed: ${message}`);
  process.exit(1);
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

const pkg = JSON.parse(read("package.json"));
if (
  pkg.scripts?.["startup-office:error-envelope"] !==
  "node scripts/check-startup-office-error-envelope.cjs"
) {
  fail("package.json must expose startup-office:error-envelope");
}

if (!read("scripts/startup-office-beta-release-gate.cjs").includes('"startup-office:error-envelope"')) {
  fail("beta release gate must include startup-office:error-envelope");
}

for (const [relativePath, snippets, label] of [
  [
    "api/lib/hosted/errorEnvelope.js",
    ["hostedAPIErrorPayload", "code", "message", "retryable", "status"],
    "hosted error envelope helper",
  ],
  [
    "api/lib/hosted/apiEntrypoint.js",
    ["hostedAPIErrorPayload", "requestIDFor(req)", "defaultHostedAPIErrorMessage"],
    "hosted API facade",
  ],
  [
    "api/hosted-api.test.js",
    ["hosted_api_route_not_found", "rate_limit_exceeded", "request_body_exceeds_524288_bytes"],
    "hosted API tests",
  ],
  [
    "web/src/api/client.ts",
    ["const { message } = value as { message?: unknown }"],
    "web API client envelope unwrap",
  ],
  [
    "docs/specs/SILICON-VALLEY-PRODUCTION-AUDIT.md",
    ["SV-I023", "startup-office:error-envelope"],
    "production audit",
  ],
]) {
  const body = read(relativePath);
  for (const snippet of snippets) {
    if (!body.includes(snippet)) fail(`${label} is missing ${snippet}`);
  }
}

console.log("startup-office error envelope check passed");
