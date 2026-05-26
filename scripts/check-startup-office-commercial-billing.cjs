#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function fail(message) {
  console.error(`startup-office commercial billing check failed: ${message}`);
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
  pkg.scripts?.["startup-office:commercial-billing"] !==
  "node scripts/check-startup-office-commercial-billing.cjs"
) {
  fail("package.json must expose startup-office:commercial-billing");
}

const schema = JSON.parse(read("supabase/schema/current.json"));
const billingDocuments = schema.activeTables.find(
  (table) => table.name === "startup_office_billing_documents",
);
if (!billingDocuments) fail("schema must register startup_office_billing_documents");
for (const column of ["document_type", "status", "reference_url", "external_reference", "amount_cents"]) {
  if (!billingDocuments.columns.includes(column)) {
    fail(`startup_office_billing_documents must include ${column}`);
  }
}

for (const [relativePath, snippet, label] of [
  [
    "supabase/migrations/20260526040000_add_startup_office_commercial_billing.sql",
    "document_type in ('agreement', 'invoice', 'receipt', 'plan_change')",
    "commercial billing migration",
  ],
  [
    "api/lib/startup-office/commercialBilling.js",
    "paid beta requires signed agreement",
    "paid beta evidence guard",
  ],
  [
    "api/lib/startup-office/operationsHandlers.js",
    "startupOfficeBillingDocumentPayload",
    "billing operation document writer",
  ],
  [
    "api/lib/startup-office/workflowEntitlements.js",
    "startupOfficeEntitlementBlock",
    "central entitlement run gate",
  ],
  [
    "api/lib/startup-office/operationsStore.js",
    "startupOfficeBillingDocuments",
    "billing document snapshot",
  ],
  [
    "web/src/components/startup-office/BetaOpsPanel.tsx",
    "billing_documents",
    "commercial billing UI",
  ],
  [
    "web/src/components/startup-office/StartupOfficeApp.test.tsx",
    "Paid beta is commercially cleared.",
    "commercial billing UI test",
  ],
  [
    "api/lib/startup-office/commercialBilling.test.js",
    "paid beta validation rejects paid status without evidence",
    "commercial billing regression test",
  ],
  [
    "docs/specs/SILICON-VALLEY-PRODUCTION-AUDIT.md",
    "commercial billing document",
    "production audit commercial billing evidence",
  ],
]) {
  assertContains(relativePath, snippet, label);
}

console.log("startup-office commercial billing check passed");
