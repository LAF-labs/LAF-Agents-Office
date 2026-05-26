#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function fail(message) {
  console.error(`startup-office beta terms check failed: ${message}`);
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
if (pkg.scripts?.["startup-office:beta-terms"] !== "node scripts/check-startup-office-beta-terms.cjs") {
  fail("package.json must expose startup-office:beta-terms");
}

const schema = JSON.parse(read("supabase/schema/current.json"));
if (String(schema.latestMigration || "") < "20260526060000") {
  fail("schema latestMigration must include the beta terms migration");
}
const termsTable = schema.activeTables.find((table) => table.name === "startup_office_terms_acceptances");
if (!termsTable) fail("schema must register startup_office_terms_acceptances");
for (const column of [
  "accepted_by",
  "terms_version",
  "privacy_version",
  "dpa_version",
  "ai_use_version",
  "retention_version",
  "deletion_version",
  "accepted_at",
]) {
  if (!termsTable.columns.includes(column)) {
    fail(`startup_office_terms_acceptances must include ${column}`);
  }
}

for (const [relativePath, snippet, label] of [
  [
    "supabase/migrations/20260526060000_add_startup_office_beta_terms.sql",
    "startup_office_terms_acceptances_select_team_members",
    "beta terms migration",
  ],
  [
    "api/lib/startup-office/betaTerms.js",
    "startup-office-beta-terms-2026-05-26",
    "terms version package",
  ],
  [
    "api/lib/startup-office/termsHandlers.js",
    "startup_office.terms_accepted",
    "terms acceptance handler",
  ],
  [
    "api/lib/startup-office/routes.js",
    "acceptStartupOfficeTerms",
    "terms route contract",
  ],
  [
    "api/lib/startup-office/authorization.js",
    "terms: routeAccess",
    "terms authorization",
  ],
  [
    "api/lib/startup-office/operationsStore.js",
    "startupOfficeTermsSnapshot",
    "terms beta ops snapshot",
  ],
  [
    "api/lib/startup-office/commercialBilling.js",
    "Accept the current beta terms before starting paid beta.",
    "paid beta terms gate",
  ],
  [
    "web/src/components/startup-office/BetaOpsPanel.tsx",
    "startup-office-terms-action",
    "terms acceptance UI",
  ],
  [
    "web/src/components/startup-office/StartupOfficeApp.test.tsx",
    "Accept beta terms",
    "terms acceptance UI test",
  ],
  [
    "docs/legal/STARTUP-OFFICE-BETA-TERMS.md",
    "Privacy Policy",
    "legal terms package",
  ],
]) {
  assertContains(relativePath, snippet, label);
}

console.log("startup-office beta terms check passed");
