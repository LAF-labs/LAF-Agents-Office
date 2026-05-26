#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function fail(message) {
  console.error(`startup-office receipt integrity check failed: ${message}`);
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
  packageJSON.scripts?.["startup-office:receipt-integrity"] !==
  "node scripts/check-startup-office-receipt-integrity.cjs"
) {
  fail("package.json must expose startup-office:receipt-integrity");
}

for (const [relativePath, snippets, label] of [
  [
    "api/lib/startup-office/receiptIntegrity.js",
    [
      "startupOfficeReceiptIntegrity",
      "RECEIPT_CANONICAL_FIELDS",
      "RECEIPT_DIGEST_INPUT_VERSION",
      'crypto.createHash("sha256")',
      "stableJSONStringify",
    ],
    "receipt integrity helper",
  ],
  [
    "api/lib/startup-office/serializers.js",
    ["integrity: startupOfficeReceiptIntegrity(receipt)"],
    "receipt integrity API serialization",
  ],
  [
    "web/src/components/apps/ReceiptsApp.tsx",
    ["app-trace-integrity", "shortDigest(digest)"],
    "receipt digest UI",
  ],
  [
    "api/lib/startup-office/receiptIntegrity.test.js",
    [
      "receipt integrity digest is stable",
      "declares the digest input contract",
      "changes when customer-visible receipt evidence changes",
    ],
    "receipt integrity tests",
  ],
  [
    "scripts/startup-office-beta-release-gate.cjs",
    [
      "startup-office:receipt-integrity",
      "api/lib/startup-office/receiptIntegrity.test.js",
      "src/components/apps/ReceiptsApp.test.tsx",
    ],
    "release gate receipt integrity coverage",
  ],
  [
    "scripts/check-startup-office-closed-beta-launch.cjs",
    ["startup-office:receipt-integrity"],
    "closed beta launch receipt integrity coverage",
  ],
  [
    "docs/specs/SILICON-VALLEY-PRODUCTION-AUDIT.md",
    ["canonical SHA-256 digest", "startup-office:receipt-integrity"],
    "production audit receipt integrity evidence",
  ],
  [
    "docs/specs/CLOSED-BETA-100-GOALS.md",
    ["receipt integrity", "scripts/check-startup-office-receipt-integrity.cjs"],
    "closed beta goals receipt integrity evidence",
  ],
]) {
  for (const snippet of snippets) assertContains(relativePath, snippet, label);
}

console.log("startup-office receipt integrity check passed");
