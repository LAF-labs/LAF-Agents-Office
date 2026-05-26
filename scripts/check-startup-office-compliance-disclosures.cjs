#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function fail(message) {
  console.error(`startup-office compliance disclosure check failed: ${message}`);
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
  pkg.scripts?.["startup-office:compliance-disclosures"] !==
  "node scripts/check-startup-office-compliance-disclosures.cjs"
) {
  fail("package.json must expose startup-office:compliance-disclosures");
}

const manifest = JSON.parse(read("shared/startup-office-compliance-disclosures.json"));
if (manifest.version !== 1) fail("unexpected compliance disclosure manifest version");
for (const required of ["approval_desk", "artifact_copy_export", "receipt_trace"]) {
  if (!manifest.decision_points?.includes(required)) {
    fail(`compliance disclosure manifest must include ${required}`);
  }
}
for (const required of ["legal_sensitive", "pricing_change", "payment", "public_claim"]) {
  if (!manifest.regulated_gate_types?.includes(required)) {
    fail(`compliance disclosure manifest must include gate ${required}`);
  }
}

assertContains(
  "workers/startup-office/complianceDisclosures.js",
  ["startupOfficeComplianceDisclosureText", "startup-office-compliance-disclosures.json"],
  "worker compliance helper",
);
assertContains(
  "workers/startup-office/approvalGates.js",
  ["startupOfficeComplianceDisclosureText", "legal_sensitive"],
  "approval gate compliance policy",
);
assertContains(
  "workers/startup-office/qualityChecks.js",
  ["regulated legal, financial, tax, or medical advice requires expert review language"],
  "regulated advice quality check",
);
assertContains(
  "web/src/components/startup-office/ComplianceDisclosure.tsx",
  ["startup-compliance-disclosure", "complianceDisclosureTitle", "complianceDisclosureBody"],
  "web compliance disclosure component",
);
for (const [relativePath, point] of [
  ["web/src/components/startup-office/ApprovalDeskPanel.tsx", "approval_desk"],
  ["web/src/components/startup-office/ArtifactViewer.tsx", "artifact_copy_export"],
  ["web/src/components/startup-office/ReceiptsTimelinePanel.tsx", "receipt_trace"],
]) {
  assertContains(relativePath, ["ComplianceDisclosure"], `${point} UI disclosure`);
}
assertContains(
  "web/src/components/startup-office/StartupOfficeApp.test.tsx",
  ["AI decision boundary", "expert review before external use"],
  "UI disclosure regression test",
);
assertContains(
  "scripts/startup-office-beta-release-gate.cjs",
  ['"startup-office:compliance-disclosures"'],
  "beta release gate",
);
assertContains(
  "docs/specs/SILICON-VALLEY-PRODUCTION-AUDIT.md",
  ["startup-office:compliance-disclosures", "AI decision boundary"],
  "production audit disclosure evidence",
);

console.log("startup-office compliance disclosure check passed");
