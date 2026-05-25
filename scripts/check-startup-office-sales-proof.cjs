#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function fail(message) {
  console.error(`startup-office sales proof check failed: ${message}`);
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
if (pkg.scripts?.["startup-office:sales-proof"] !== "node scripts/check-startup-office-sales-proof.cjs") {
  fail("package.json must expose startup-office:sales-proof");
}

for (const [relativePath, snippet, label] of [
  ["web/src/components/auth/AuthScreen.tsx", "auth-proof-grid", "entry sales proof UI"],
  ["web/src/lib/i18n.ts", "Founder use cases", "founder use case copy"],
  ["web/src/lib/i18n.ts", "Beta outcomes", "beta outcome copy"],
  ["web/src/lib/i18n.ts", "Trust controls", "trust control copy"],
  ["web/src/lib/i18n.ts", "versioned beta terms", "transparent terms proof"],
  ["web/src/styles/auth.css", "auth-proof-grid", "sales proof styling"],
  ["web/src/components/auth/AuthScreen.test.tsx", "Startup Office sales proof", "sales proof UI test"],
  [
    "docs/specs/SILICON-VALLEY-PRODUCTION-AUDIT.md",
    "SV-G098",
    "production audit sales proof goal",
  ],
]) {
  assertContains(relativePath, snippet, label);
}

console.log("startup-office sales proof check passed");
