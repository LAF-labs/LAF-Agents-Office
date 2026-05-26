#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const manifestPath = "shared/startup-office-security-review.json";

function fail(message) {
  console.error(`startup-office security review check failed: ${message}`);
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

function assertArray(value, label, minLength) {
  if (!Array.isArray(value) || value.length < minLength) {
    fail(`${label} must contain at least ${minLength} entries`);
  }
}

function assertCommandExists(command, pkg) {
  const match = command.match(/^npm run ([\w:-]+)(?:\s|$)/);
  if (match && !pkg.scripts?.[match[1]]) {
    fail(`package.json is missing script for ${command}`);
  }
}

const pkg = JSON.parse(read("package.json"));
const manifest = JSON.parse(read(manifestPath));

if (
  pkg.scripts?.["startup-office:security-review"] !==
  "node scripts/check-startup-office-security-review.cjs"
) {
  fail("package.json must expose startup-office:security-review");
}
if (manifest.version !== "startup-office-security-review.v1") {
  fail(`unexpected security review manifest version ${manifest.version || "<missing>"}`);
}
if (manifest.status !== "release_gated_closed_beta_packet") {
  fail("security review packet must be marked release_gated_closed_beta_packet");
}
assertArray(manifest.required_sections, "required sections", 6);
assertArray(manifest.artifacts, "security review artifacts", 8);

for (const section of manifest.required_sections) {
  assertContains(manifest.review_document, section, "security review document");
}

for (const artifact of manifest.artifacts) {
  for (const field of ["id", "title", "gate", "source"]) {
    if (!artifact[field]) fail(`${artifact.id || "<unknown artifact>"} is missing ${field}`);
  }
  assertCommandExists(artifact.gate, pkg);
  assertContains("scripts/startup-office-beta-release-gate.cjs", `"${artifact.gate.replace("npm run ", "")}"`, `${artifact.id} release gate`);
  assertContains(manifest.review_document, artifact.gate, `${artifact.id} review evidence`);
  if (!fs.existsSync(path.join(root, artifact.source))) {
    fail(`${artifact.id} source does not exist: ${artifact.source}`);
  }
}

for (const snippet of [
  manifestPath,
  "cross-tenant access",
  "service-role abuse",
  "credential exposure",
  "Public self-serve remains blocked",
]) {
  assertContains(manifest.review_document, snippet, "security review content");
}

assertContains(
  "docs/specs/SILICON-VALLEY-PRODUCTION-AUDIT.md",
  manifestPath,
  "production audit security review evidence",
);
assertContains(
  "scripts/startup-office-beta-release-gate.cjs",
  "\"startup-office:security-review\"",
  "release gate",
);

console.log(
  `startup-office security review check passed: ${manifest.artifacts.length} artifacts`,
);
