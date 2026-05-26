#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function fail(message) {
  console.error(`startup-office paid beta package check failed: ${message}`);
  process.exit(1);
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function assertContains(relativePath, snippets, label) {
  const body = read(relativePath);
  for (const snippet of snippets) {
    if (!body.includes(snippet)) fail(`${label} is missing ${snippet} in ${relativePath}`);
  }
}

const pkg = JSON.parse(read("package.json"));
if (
  pkg.scripts?.["startup-office:paid-beta-package"] !==
  "node scripts/check-startup-office-paid-beta-package.cjs"
) {
  fail("package.json must expose startup-office:paid-beta-package");
}

const packageContract = JSON.parse(read("shared/startup-office-paid-beta-package.json"));
if (packageContract.plan !== "founder_beta") fail("paid beta package must use founder_beta plan");
if (packageContract.price?.amount_cents !== 50000) fail("paid beta package must pin $500/month");
for (const [key, expected] of [
  ["seat_limit", 5],
  ["monthly_run_limit", 50],
  ["monthly_model_spend_cents", 20000],
  ["storage_mb_limit", 1024],
]) {
  if (packageContract.limits?.[key] !== expected) {
    fail(`paid beta package limit ${key} must be ${expected}`);
  }
}

assertContains(
  "api/lib/startup-office/paidBetaPackage.js",
  ["startupOfficePackageBillingDefaults", "startupOfficePackageCommercialSummary"],
  "paid beta package helper",
);
assertContains(
  "api/lib/startup-office/commercialBilling.js",
  ["startupOfficePackageBillingDefaults", "startupOfficePackageCommercialSummary", "package:"],
  "commercial billing package integration",
);
assertContains(
  "api/lib/startup-office/commercialBilling.test.js",
  ["Founder Beta Package", "$500/month", "startupOfficePackageBillingDefaults"],
  "paid beta package regression test",
);
assertContains(
  "website/index.html",
  ["Founder Beta Package", "$500/month", "50 AI runs", "approval receipts"],
  "website paid beta package",
);
assertContains(
  "scripts/startup-office-beta-release-gate.cjs",
  ['"startup-office:paid-beta-package"'],
  "beta release gate",
);
assertContains(
  "docs/specs/SILICON-VALLEY-PRODUCTION-AUDIT.md",
  ["startup-office:paid-beta-package", "Founder Beta Package"],
  "production audit paid beta evidence",
);

console.log("startup-office paid beta package check passed");
