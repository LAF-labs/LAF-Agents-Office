#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function fail(message) {
  console.error(`startup-office customer csv check failed: ${message}`);
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
  packageJSON.scripts?.["startup-office:customer-csv"] !==
  "node scripts/check-startup-office-customer-csv.cjs"
) {
  fail("package.json must expose startup-office:customer-csv");
}

for (const [relativePath, snippets, label] of [
  [
    "api/lib/startup-office/customerCsv.js",
    ["CUSTOMER_CSV_FIELDS", "startupOfficeCustomersCSV", "parseStartupOfficeCustomersCSV", "profile_json"],
    "customer csv helper",
  ],
  [
    "api/lib/startup-office/customerCsvHandlers.js",
    ["createStartupOfficeCustomerCsvHandlers", "startup_office.customers_csv_imported", "text/csv"],
    "customer csv handler",
  ],
  [
    "api/lib/startup-office/customerCsvHandlers.test.js",
    ["exports founder CRM rows", "imports CSV rows as customers", "enforces storage limits"],
    "customer csv handler tests",
  ],
  [
    "api/lib/startup-office/routes.js",
    ["customerCsv", "startup-office/customers/csv", "getStartupOfficeCustomerCsv", "importStartupOfficeCustomerCsv"],
    "customer csv route contract",
  ],
  [
    "api/lib/startup-office/authorization.js",
    ["customerCsv", "draftMemory"],
    "customer csv authorization",
  ],
  [
    "api/lib/hosted/actionRateLimitRules.js",
    ["startup-office\\/customers\\/csv", "startup_office_customer_csv_import"],
    "customer csv import rate limit",
  ],
  [
    "web/src/api/startupOffice.ts",
    ["StartupOfficeCustomerCsvResponse", "getStartupOfficeCustomerCsv", "importStartupOfficeCustomerCsv"],
    "web customer csv client",
  ],
  [
    "scripts/startup-office-beta-release-gate.cjs",
    ["startup-office:customer-csv", "api/lib/startup-office/customerCsvHandlers.test.js"],
    "release gate customer csv coverage",
  ],
  [
    "docs/specs/SILICON-VALLEY-PRODUCTION-AUDIT.md",
    ["startup-office:customer-csv", "customer CSV"],
    "production audit customer csv evidence",
  ],
]) {
  for (const snippet of snippets) assertContains(relativePath, snippet, label);
}

console.log("startup-office customer csv check passed");
