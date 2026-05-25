#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const manifestPath = "shared/startup-office-product-identity.json";

function fail(message) {
  console.error(`startup-office product identity check failed: ${message}`);
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

function assertStartsWith(relativePath, expected, label) {
  const body = read(relativePath);
  if (!body.startsWith(expected)) fail(`${label} must start with ${JSON.stringify(expected)}`);
}

const manifest = JSON.parse(read(manifestPath));
if (manifest.version !== "startup-office-product-identity.v1") {
  fail(`unexpected product identity manifest version ${manifest.version || "<missing>"}`);
}
for (const field of ["productName", "rootPackageName", "webPackageName", "historicalRepoSlug"]) {
  if (!manifest[field]) fail(`${manifestPath} must define ${field}`);
}

const pkg = JSON.parse(read("package.json"));
const webPkg = JSON.parse(read("web/package.json"));
if (pkg.name !== manifest.rootPackageName) fail(`root package name must be ${manifest.rootPackageName}`);
if (webPkg.name !== manifest.webPackageName) fail(`web package name must be ${manifest.webPackageName}`);
if (!pkg.description.includes(manifest.productName)) fail("root package description must name Startup Office");
if (!webPkg.description?.includes(manifest.productName)) fail("web package description must name Startup Office");
if (
  pkg.scripts?.["startup-office:product-identity"] !==
  "node scripts/check-startup-office-product-identity.cjs"
) {
  fail("package.json must expose startup-office:product-identity");
}

assertContains("bun.lock", [`"name": "${manifest.rootPackageName}"`], "root lockfile identity");
assertContains("web/bun.lock", [`"name": "${manifest.webPackageName}"`], "web lockfile identity");
assertStartsWith("README.md", "# Startup Office", "README product identity");
assertStartsWith("ARCHITECTURE.md", "# Startup Office Architecture", "architecture product identity");
assertContains(
  "DEVELOPMENT.md",
  ["Startup Office is now a hosted Startup Office SaaS."],
  "development product identity",
);
assertContains(
  ".github/CODEOWNERS",
  ["# Startup Office code owners"],
  "CODEOWNERS product identity",
);
assertContains(
  "scripts/startup-office-beta-release-gate.cjs",
  ['"startup-office:product-identity"'],
  "beta release gate",
);
assertContains(
  "docs/specs/SILICON-VALLEY-PRODUCTION-AUDIT.md",
  ["startup-office:product-identity", "Startup Office product identity now has a tracked manifest"],
  "production audit product identity evidence",
);

console.log(
  `startup-office product identity check passed: ${manifest.rootPackageName}, ${manifest.webPackageName}`,
);
