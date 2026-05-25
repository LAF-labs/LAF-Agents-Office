#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function fail(message) {
  console.error(`startup-office loop chaos check failed: ${message}`);
  process.exit(1);
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function assertContains(relativePath, snippets, label) {
  const source = read(relativePath);
  for (const snippet of snippets) {
    if (!source.includes(snippet)) fail(`${label} is missing ${snippet} in ${relativePath}`);
  }
}

const pkg = JSON.parse(read("package.json"));
if (pkg.scripts?.["startup-office:loop-chaos"] !== "node --test workers/startup-office/loopFailureInjection.test.js") {
  fail("package.json must expose startup-office:loop-chaos");
}

assertContains(
  "workers/startup-office/loopFailureInjection.test.js",
  [
    "core loop chaos: model failure leaves no business side effects",
    "core loop chaos: artifact write failure is visible and never creates approval",
    "core loop chaos: approval write failure fails closed after artifact creation",
    "injected model outage",
    "injected artifact write failure",
    "injected approval write failure",
  ],
  "loop failure injection suite",
);
assertContains(
  "scripts/startup-office-beta-release-gate.cjs",
  ['"startup-office:loop-chaos"'],
  "beta release gate",
);
assertContains(
  "docs/specs/SILICON-VALLEY-PRODUCTION-AUDIT.md",
  ["startup-office:loop-chaos", "deterministic core-loop failure injection"],
  "production audit evidence",
);
assertContains(
  "docs/specs/CLOSED-BETA-100-GOALS.md",
  ["loop failure-injection"],
  "closed beta release gate evidence",
);

console.log("startup-office loop chaos check passed");
