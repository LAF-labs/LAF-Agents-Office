#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");

function fail(message) {
  console.error(`startup-office static analysis check failed: ${message}`);
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

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });
  if (result.status !== 0) {
    fail(`${command} ${args.join(" ")} failed: ${(result.stderr || result.stdout).trim()}`);
  }
  return result.stdout;
}

function isCheckedJavaScript(relativePath) {
  if (!/\.(?:cjs|mjs|js)$/.test(relativePath)) return false;
  return (
    relativePath === "api/[...path].js" ||
    relativePath.startsWith("scripts/") ||
    relativePath.startsWith("api/lib/hosted/") ||
    relativePath.startsWith("api/lib/startup-office/") ||
    relativePath.startsWith("workers/startup-office/")
  );
}

const pkg = JSON.parse(read("package.json"));
if (
  pkg.scripts?.["startup-office:static-analysis"] !==
  "node scripts/check-startup-office-static-analysis.cjs"
) {
  fail("package.json must expose startup-office:static-analysis");
}
if (
  pkg.scripts?.["startup-office:web-lint-budget"] !==
  "node scripts/check-startup-office-web-lint-budget.cjs"
) {
  fail("package.json must expose startup-office:web-lint-budget");
}

const webPackage = JSON.parse(read("web/package.json"));
for (const scriptName of ["lint", "typecheck", "build"]) {
  if (!webPackage.scripts?.[scriptName]) fail(`web/package.json must expose ${scriptName}`);
}

assertContains(
  ".github/workflows/ci.yml",
  ["startup-office:web-lint-budget", "npm run typecheck", "npm run build"],
  "web CI static analysis",
);
assertContains(
  "scripts/startup-office-beta-release-gate.cjs",
  [
    '"startup-office:static-analysis"',
    '"startup-office:web-lint-budget"',
    '"typecheck"',
    '"build"',
  ],
  "beta release gate",
);
assertContains(
  "docs/specs/SILICON-VALLEY-PRODUCTION-AUDIT.md",
  ["startup-office:static-analysis", "Static analysis now has a release-gate check"],
  "production audit static-analysis evidence",
);

const trackedFiles = run("git", ["ls-files"]).trim().split(/\r?\n/).filter(Boolean);
const checkedFiles = trackedFiles.filter(isCheckedJavaScript);
if (checkedFiles.length < 200) fail(`expected broad JS syntax coverage, found ${checkedFiles.length} files`);
for (const relativePath of checkedFiles) {
  run("node", ["--check", relativePath]);
}

console.log(`startup-office static analysis check passed: ${checkedFiles.length} JS files syntax-checked`);
