#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");

function fail(message) {
  console.error(`legacy runtime check failed: ${message}`);
  process.exitCode = 1;
}

function trackedFiles() {
  return execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" })
    .split("\n")
    .filter(Boolean);
}

const tracked = trackedFiles();

const forbiddenPaths = [
  ".golangci.yml",
  ".goreleaser.yml",
  "CHANGELOG.md",
  "DESIGN-NOTEBOOK.md",
  "DESIGN-WIKI.md",
  "FORKING.md",
  "TESTING-WIKI.md",
  "USER_GUIDE_KO.md",
  "VERSION",
  "go.mod",
  "go.sum",
  "laf-office",
];

for (const file of forbiddenPaths) {
  if (tracked.includes(file)) {
    fail(`${file} must not be tracked in the hosted SaaS tree`);
  }
}

const forbiddenPrefixes = [
  "bench/",
  "claude-code-plugin/",
  "cmd/",
  "dist/",
  "internal/",
  "npm/",
  "ops/",
  "packaging/",
  "testdata/",
  "tests/",
];

for (const file of tracked) {
  if (forbiddenPrefixes.some((prefix) => file.startsWith(prefix))) {
    fail(`${file} belongs to the retired local runtime surface`);
  }
}

const retiredScriptPaths = [
  "scripts/benchmark.sh",
  "scripts/bootstrap.sh",
  "scripts/check-staged-go.sh",
  "scripts/debug-tagging/",
  "scripts/demo-entity-synthesis.sh",
  "scripts/demo-wiki-live.sh",
  "scripts/install-latest-laf-office-cli.sh",
  "scripts/install.sh",
  "scripts/laf-memory-capture.sh",
  "scripts/laf-squad-tmux.sh",
  "scripts/laf-superworkflow-check.sh",
  "scripts/smoke-broker-restart.sh",
  "scripts/sync-obsidian-wiki.sh",
  "scripts/test-go.sh",
];

for (const file of tracked) {
  if (retiredScriptPaths.some((retired) => file === retired || file.startsWith(retired))) {
    fail(`${file} is a retired local runtime script`);
  }
}

const scanRoots = [
  "api/",
  "web/src/",
  "workers/",
  "website/",
  "README.md",
  "ARCHITECTURE.md",
  "DEVELOPMENT.md",
  "DESIGN.md",
  ".github/",
  "lefthook.yml",
  "package.json",
];

const allowedFiles = new Set([
  "api/hosted-api.test.js",
  "scripts/check-no-legacy-runtime.cjs",
  "scripts/check-startup-office-surface.cjs",
]);

const forbiddenText = [
  [/laf[-\s]?bridge/i, "laf bridge"],
  [/runner_(?:pairing|job|jobs|capabilities|devices?)/i, "runner persistence"],
  [/bridge_(?:pairing|devices?)/i, "bridge persistence"],
  [/project_local_bindings/i, "project local binding"],
  [/claim_runner_job/i, "runner claim function"],
  [/worktree_(?:path|branch)/i, "worktree field"],
  [/managed_checkout|local_worktree/i, "local checkout execution mode"],
  [/headless_(?:claude|codex|opencode)/i, "headless local provider runtime"],
  [/\btmux\b/i, "tmux runtime"],
];

const binaryExtensions = new Set([
  ".avif",
  ".gif",
  ".ico",
  ".jpeg",
  ".jpg",
  ".mp4",
  ".pdf",
  ".png",
  ".webm",
  ".woff",
  ".woff2",
]);

for (const file of tracked) {
  if (allowedFiles.has(file)) continue;
  if (!scanRoots.some((rootPath) => file === rootPath || file.startsWith(rootPath))) continue;
  if (binaryExtensions.has(path.extname(file).toLowerCase())) continue;
  const absolute = path.join(root, file);
  let body = "";
  try {
    body = fs.readFileSync(absolute, "utf8");
  } catch {
    continue;
  }
  for (const [pattern, label] of forbiddenText) {
    if (pattern.test(body)) {
      fail(`${file} still mentions ${label}`);
    }
  }
}

if (!process.exitCode) {
  console.log("legacy runtime check passed");
}
