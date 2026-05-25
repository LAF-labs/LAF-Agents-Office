#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const manifestPath = "shared/startup-office-dev-workflow.json";

function fail(message) {
  console.error(`startup-office dev workflow check failed: ${message}`);
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

function assertCommandExists(command, pkg, webPkg) {
  const rootMatch = command.match(/^npm run ([\w:-]+)$/);
  if (rootMatch && !pkg.scripts?.[rootMatch[1]]) {
    fail(`package.json is missing script for ${command}`);
  }
  const webMatch = command.match(/^npm --prefix web run ([\w:-]+)$/);
  if (webMatch && !webPkg.scripts?.[webMatch[1]]) {
    fail(`web/package.json is missing script for ${command}`);
  }
}

const pkg = JSON.parse(read("package.json"));
const webPkg = JSON.parse(read("web/package.json"));
if (
  pkg.scripts?.["startup-office:dev-workflow"] !==
  "node scripts/check-startup-office-dev-workflow.cjs"
) {
  fail("package.json must expose startup-office:dev-workflow");
}

const manifest = JSON.parse(read(manifestPath));
if (manifest.version !== "startup-office-dev-workflow.v1") {
  fail(`unexpected dev workflow manifest version ${manifest.version || "<missing>"}`);
}
for (const field of ["setup", "localServices", "repoChecks", "liveChecks"]) {
  if (!Array.isArray(manifest[field]) || manifest[field].length === 0) {
    fail(`${manifestPath} must define non-empty ${field}`);
  }
}

for (const command of manifest.repoChecks) assertCommandExists(command, pkg, webPkg);
for (const service of manifest.localServices) {
  if (!service.name || !service.command) fail("localServices entries need name and command");
  assertCommandExists(service.command.replace(/^cd web && bun run /, "npm --prefix web run "), pkg, webPkg);
}
for (const command of manifest.liveChecks) assertCommandExists(command, pkg, webPkg);

assertContains(
  "DEVELOPMENT.md",
  [
    "shared/startup-office-dev-workflow.json",
    "npm run startup-office:dev-workflow",
    "npm run hosted-api:dev",
    "cd web && bun run dev",
    "npm run startup-office:loop-worker",
    "npm run startup-office:outbox-worker",
    "npm run beta:release-gate",
    "npm run startup-office:web-lint-budget",
    "npm run startup-office:rls-live",
  ],
  "development workflow documentation",
);
assertContains(
  "scripts/startup-office-beta-release-gate.cjs",
  ['"startup-office:dev-workflow"'],
  "beta release gate",
);
assertContains(
  "docs/specs/SILICON-VALLEY-PRODUCTION-AUDIT.md",
  ["startup-office:dev-workflow", "Startup Office development workflow now has a tracked manifest"],
  "production audit dev workflow evidence",
);

console.log(
  `startup-office dev workflow check passed: ${manifest.localServices.length} services, ${manifest.repoChecks.length} repo checks, ${manifest.liveChecks.length} live checks`,
);
