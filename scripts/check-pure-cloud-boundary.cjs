#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const deviceRuntime = ["bri", "dge"].join("");
const queueRuntime = ["run", "ner"].join("");
const pairToken = ["pair", "ing"].join("");
const providerModeToken = ["head", "less"].join("");

function fail(message) {
  console.error(`pure-cloud boundary check failed: ${message}`);
  process.exitCode = 1;
}

function trackedFiles() {
  return execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" })
    .split("\n")
    .filter(Boolean);
}

const tracked = trackedFiles();
const existingTracked = tracked.filter((file) =>
  fs.existsSync(path.join(root, file)),
);

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
  if (existingTracked.includes(file)) {
    fail(`${file} must not be tracked in the hosted SaaS tree`);
  }
}

const forbiddenPrefixes = [
  ".claude/",
  ".laf-office/",
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
  "web/e2e/",
];

  for (const file of existingTracked) {
  if (forbiddenPrefixes.some((prefix) => file.startsWith(prefix))) {
    fail(`${file} belongs to the retired customer-managed execution surface`);
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

for (const file of existingTracked) {
  if (retiredScriptPaths.some((retired) => file === retired || file.startsWith(retired))) {
    fail(`${file} is a retired local runtime script`);
  }
}

const scanRoots = [
  "api/",
  "scripts/",
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
  "scripts/check-pure-cloud-boundary.cjs",
  "scripts/check-supabase-current-schema.cjs",
  "scripts/check-startup-office-surface.cjs",
]);

const forbiddenText = [
  [new RegExp(`laf[-\\s]?${deviceRuntime}`, "i"), "retired connector setup"],
  [new RegExp(`\\b${deviceRuntime}\\b`, "i"), "retired device connector copy"],
  [new RegExp(`\\b${queueRuntime}\\b`, "i"), "retired queue copy"],
  [
    new RegExp(`${queueRuntime}_(?:${pairToken}|job|jobs|capabilities|devices?)`, "i"),
    "retired queue persistence",
  ],
  [new RegExp(`${deviceRuntime}_(?:${pairToken}|devices?)`, "i"), "retired device persistence"],
  [/project_local_bindings/i, "project local binding"],
  [new RegExp(`claim_${queueRuntime}_job`, "i"), "retired queue claim function"],
  [/worktree_(?:path|branch)/i, "worktree field"],
  [/\blocal_id\b/i, "retired local sync id"],
  [/managed_checkout|local_worktree/i, "local checkout execution mode"],
  [new RegExp(`${providerModeToken}_(?:claude|codex|opencode)`, "i"), "retired provider mode"],
  [
    new RegExp(`\\blocal\\s+(?:runtime|${queueRuntime}|${deviceRuntime}|execution)\\b`, "i"),
    "local runtime copy",
  ],
  [/로컬\s*(?:런타임|실행기)/i, "Korean local runtime copy"],
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

for (const file of existingTracked) {
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
  console.log("pure-cloud boundary check passed");
}
