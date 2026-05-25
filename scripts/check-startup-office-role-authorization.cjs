#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function fail(message) {
  console.error(`startup-office role authorization check failed: ${message}`);
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
  packageJson.scripts?.["startup-office:role-authorization"] !==
  "node scripts/check-startup-office-role-authorization.cjs"
) {
  fail("package.json must expose startup-office:role-authorization");
}

assertContains(
  "scripts/startup-office-beta-release-gate.cjs",
  '"startup-office:role-authorization"',
  "beta release gate",
);

for (const [relativePath, snippet, label] of [
  [
    "api/lib/startup-office/roleAuthorization.test.js",
    "Startup Office route authorization matches role capability matrix",
    "role matrix behavior test",
  ],
  [
    "api/lib/startup-office/roleAuthorization.test.js",
    "Startup Office role ladder preserves founder-control boundaries",
    "role ladder behavior test",
  ],
  [
    "api/lib/startup-office/roleAuthorization.test.js",
    "viewer",
    "viewer role coverage",
  ],
  [
    "api/lib/startup-office/roleAuthorization.test.js",
    "member",
    "member role coverage",
  ],
  [
    "api/lib/startup-office/roleAuthorization.test.js",
    "manager",
    "manager role coverage",
  ],
  [
    "api/lib/startup-office/roleAuthorization.test.js",
    "admin",
    "admin role coverage",
  ],
  [
    "api/lib/startup-office/roleAuthorization.test.js",
    "owner",
    "owner role coverage",
  ],
  [
    "api/lib/startup-office/roleAuthorization.test.js",
    "approvalAction.POST",
    "approval promotion boundary",
  ],
  [
    "api/lib/startup-office/roleAuthorization.test.js",
    "workerJobAction.POST",
    "admin recovery boundary",
  ],
  [
    "api/lib/startup-office/roleAuthorization.test.js",
    "policy.PATCH",
    "workspace management boundary",
  ],
]) {
  assertContains(relativePath, snippet, label);
}

console.log("startup-office role authorization check passed");
