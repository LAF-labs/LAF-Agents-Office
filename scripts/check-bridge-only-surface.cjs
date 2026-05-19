#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");

const scanPrefixes = [
  ".github/",
  "api/",
  "docs/",
  "npm/",
  "npm-bridge/",
  "packaging/",
  "scripts/",
  "web/public/",
  "web/src/",
];
const scanFiles = new Set([
  "ARCHITECTURE.md",
  "CLAUDE.md",
  "DESIGN.md",
  "FORKING.md",
  "README.md",
  "USER_GUIDE_KO.md",
  ".laf-office/subagents/tester.md",
  "claude-code-plugin/commands/LAF-Specific-Rules.md",
  "internal/commands/cmd_system.go",
  "internal/commands/cmd_superworkflow.go",
  "internal/commands/slash.go",
  "website/index.html",
  "web/index.html",
]);

const ignoredFiles = new Set([
  "web/bun.lock",
  "api/hosted-api.test.js",
  "scripts/check-bridge-only-surface.cjs",
  "scripts/check-hosted-bridge-schema.cjs",
  "scripts/hosted-bridge-release-gate.test.cjs",
  "scripts/hosted-bridge-smoke.cjs",
  "scripts/hosted-bridge-smoke.test.cjs",
  "web/src/components/apps/SettingsApp.test.tsx",
]);

const removedProductPaths = [
  "cmd/laf-runner",
  "cmd/laf-runner-installer",
  "cmd/laf-runner/main.go",
  "cmd/laf-runner-installer/main_other.go",
  "cmd/laf-runner-installer/main_windows.go",
  "docs/specs/HOSTED-RUNNER-PROTOCOL.md",
  "dist/laf-runner-macos-arm64-0.0.7.1.pkg",
  "dist/laf-runner-windows-x64-0.0.7.1.msi",
  "internal/team/broker_runner.go",
  "internal/team/broker_runner_test.go",
  "internal/team/runner_background.go",
  "internal/team/runner_background_test.go",
  "internal/team/runner_background_unix.go",
  "internal/team/runner_background_windows.go",
  "internal/team/runner_cli.go",
  "internal/team/runner_protocol.go",
  "packaging/macos/build-runner-pkg.sh",
  "packaging/macos/install-runner-protocol.sh",
  "packaging/windows/build-runner-dev-package.ps1",
  "packaging/windows/build-runner-msi.ps1",
  "packaging/windows/install-runner-protocol.ps1",
  "packaging/windows/install-runner.ps1",
  "packaging/windows/laf-runner.wxs",
  "packaging/windows/uninstall-runner.ps1",
  "web/public/downloads/laf-runner-macos-arm64-0.0.7.1.pkg",
  "web/public/downloads/laf-runner-windows-x64-0.0.7.1.msi",
];

const removedRunnerBoundaryPaths = [
  "bench/slice-1/runner",
  "cmd/eval-prompts/runner.go",
  "internal/team/headless_task_runners.go",
  "internal/team/headless_task_runners_test.go",
];

const forbidden = [
  { label: "laf-runner command/package", pattern: /\blaf-runner\b/i },
  { label: "flagged Bridge pair command", pattern: /\blaf-bridge(?:@[A-Za-z0-9._~+-]+)?\s+pair\s+--(?!(?:help|h)(?:[=\s]|$))[A-Za-z0-9][A-Za-z0-9-]*(?:[=\s]|$)/i },
  { label: "runner pair command", pattern: /\brunner\s+pair\b/i },
  { label: "runner start command", pattern: /\brunner\s+start\b/i },
  { label: "runner status command", pattern: /\brunner\s+status\b/i },
  { label: "runner pairing wording", pattern: /\brunner\s+pairing\b/i },
  { label: "runner API route", pattern: /(^|[^A-Za-z0-9_])\/runner(?:\/|["'`\s]|$)/i },
  { label: "runner_job payload", pattern: /\brunner_job\b/i },
  { label: "runner_jobs table/payload", pattern: /\brunner_jobs\b/i },
  { label: "local-first product positioning", pattern: /\blocal[- ]first\b/i },
  { label: "Korean local-first product positioning", pattern: /로컬\s*우선/ },
  { label: "hosted mode as secondary positioning", pattern: /\bHosted Mode\b/ },
  { label: "local deployment slash-command copy", pattern: /\bLocal (?:deployment\/simulation|simulation\/deploy) workflow\b/i },
];

const removedProductArtifactRoots = [
  "cmd",
  "dist",
  "packaging",
  "web/public/downloads",
];

const removedProductArtifactName = /\b(?:laf-runner|runner-installer)\b/i;

function extractWorkflowJob(workflowText, jobName) {
  const match = workflowText.match(
    new RegExp(`\\n  ${jobName.replaceAll("-", "\\-")}:[\\s\\S]*?(?=\\n  [A-Za-z0-9_-]+:|\\n*$)`),
  );
  return match ? match[0] : "";
}

function gitFiles() {
  const out = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
    cwd: root,
  });
  return out
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .sort();
}

function shouldScan(relPath) {
  if (ignoredFiles.has(relPath)) return false;
  if (scanFiles.has(relPath)) return true;
  return scanPrefixes.some((prefix) => relPath.startsWith(prefix));
}

function readText(relPath) {
  const absPath = path.join(root, relPath);
  if (!fs.existsSync(absPath)) return null;
  const stat = fs.statSync(absPath);
  if (!stat.isFile()) return null;
  const raw = fs.readFileSync(absPath);
  if (raw.includes(0)) return null;
  return raw.toString("utf8");
}

function readJSON(relPath, failures) {
  const text = readText(relPath);
  if (text === null) {
    failures.push(`${relPath}: missing JSON file`);
    return null;
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    failures.push(`${relPath}: invalid JSON: ${error.message}`);
    return null;
  }
}

function assertContains(relPath, needle, description, failures) {
  const text = readText(relPath);
  if (text === null || !text.includes(needle)) {
    failures.push(`${relPath}: missing ${description}: ${needle}`);
  }
}

function assertNotContains(relPath, needle, description, failures) {
  const text = readText(relPath);
  if (text !== null && text.includes(needle)) {
    failures.push(`${relPath}: unexpected ${description}: ${needle}`);
  }
}

function blockAfterConst(text, constName) {
  const index = text.indexOf(`const ${constName}`);
  if (index === -1) return "";
  const start = text.indexOf("[", index);
  if (start === -1) return "";
  let depth = 0;
  for (let pos = start; pos < text.length; pos += 1) {
    const char = text[pos];
    if (char === "[") depth += 1;
    if (char === "]") {
      depth -= 1;
      if (depth === 0) return text.slice(start, pos + 1);
    }
  }
  return "";
}

function hostedAPICommandNames() {
  const text = readText("api/[...path].js") || "";
  const block = blockAfterConst(text, "HOSTED_WEB_COMMANDS");
  return [...block.matchAll(/\{\s*name:\s*"([^"]+)"/g)]
    .map((match) => match[1])
    .sort();
}

function hostedWebFallbackCommandNames() {
  const text = readText("web/src/hooks/useCommands.ts") || "";
  const block = blockAfterConst(text, "HOSTED_FALLBACK_COMMAND_NAMES");
  return [...block.matchAll(/"\/([^"]+)"/g)]
    .map((match) => match[1])
    .sort();
}

function assertHostedAPIRouting(failures) {
  const vercel = readJSON("vercel.json", failures);
  if (vercel) {
    const rewrites = Array.isArray(vercel.rewrites) ? vercel.rewrites : [];
    const apiRewrite = rewrites.find(
      (rewrite) =>
        rewrite?.source === "/api/:path*" &&
        rewrite?.destination === "/api?path=:path*",
    );
    if (!apiRewrite) {
      failures.push(
        "vercel.json: /api/:path* must rewrite to /api?path=:path* for the hosted API facade",
      );
    }
    if (!vercel.functions?.["api/index.js"]) {
      failures.push("vercel.json: missing api/index.js serverless function config");
    }
  }

  assertContains(
    "api/index.js",
    'module.exports = require("./[...path].js");',
    "hosted API index facade",
    failures,
  );
  assertContains(
    "api/[...path].js",
    "const raw = req.query?.path;",
    "Vercel rewrite path query handling",
    failures,
  );
}

function assertHostedSlashCommandRegistry(failures) {
  assertContains(
    "api/[...path].js",
    "const HOSTED_WEB_COMMANDS = Object.freeze",
    "hosted-safe web slash-command registry",
    failures,
  );
  assertContains(
    "api/[...path].js",
    "writeJSON(res, 200, HOSTED_WEB_COMMANDS);",
    "hosted /commands returns hosted-safe registry instead of local fallback trigger",
    failures,
  );
  assertNotContains(
    "api/[...path].js",
    "Local deployment/simulation",
    "local deployment command copy in hosted command registry",
    failures,
  );
  assertContains(
    "api/hosted-api.test.js",
    "hosted commands expose hosted-safe slash command registry",
    "hosted slash-command registry regression test",
    failures,
  );
  assertContains(
    "api/hosted-api.test.js",
    "hosted slash command endpoint refuses unsupported workflows instead of faking success",
    "hosted slash-command endpoint unsupported workflow regression test",
    failures,
  );
  assertNotContains(
    "api/hosted-api.test.js",
    "command runner",
    "hosted slash command endpoint generic runner wording",
    failures,
  );
  assertContains(
    "api/[...path].js",
    "slash command is not available in the hosted workspace",
    "hosted slash-command endpoint rejects unsupported local workflows",
    failures,
  );
  assertContains(
    "api/hosted-api.test.js",
    "deploy-simulation",
    "hosted slash-command registry hides local deployment workflow",
    failures,
  );
  const apiNames = hostedAPICommandNames();
  const webNames = hostedWebFallbackCommandNames();
  if (apiNames.length === 0) {
    failures.push("api/[...path].js: hosted slash-command registry names could not be parsed");
  }
  if (webNames.length === 0) {
    failures.push("web/src/hooks/useCommands.ts: hosted fallback slash-command names could not be parsed");
  }
  if (JSON.stringify(apiNames) !== JSON.stringify(webNames)) {
    failures.push(
      `hosted slash-command registry drift: api=${apiNames.join(",")} web=${webNames.join(",")}`,
    );
  }
}

function assertBridgeOnlyMigrationOrder(failures) {
  const migrationDir = path.join(root, "supabase", "migrations");
  const cleanup = "20260519000000_bridge_only_execution_surface.sql";
  const bridgeSchema = "20260515010000_laf_bridge_execution.sql";
  const bridgePhase = "20260515020000_laf_bridge_phase_0_1.sql";
  const legacyBridgeSchema = "20260515010000_desktop_bridge_execution.sql";
  const legacyBridgePhase = "20260515020000_desktop_bridge_phase_0_1.sql";
  const governance = "20260514000000_agentic_workspace_governance.sql";
  const migrations = fs
    .readdirSync(migrationDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();
  const migrationVersions = new Map();
  for (const migration of migrations) {
    const match = migration.match(/^(\d{14})_[a-z0-9_]+\.sql$/);
    if (!match) {
      failures.push(
        `supabase/migrations/${migration}: migration filename must use a unique 14-digit Supabase timestamp prefix`,
      );
      continue;
    }
    const existing = migrationVersions.get(match[1]);
    if (existing) {
      failures.push(
        `supabase/migrations/${migration}: duplicate Supabase migration version ${match[1]} already used by ${existing}`,
      );
    }
    migrationVersions.set(match[1], migration);
  }
  const cleanupIndex = migrations.indexOf(cleanup);
  const bridgeSchemaIndex = migrations.indexOf(bridgeSchema);
  if (cleanupIndex === -1) {
    failures.push(`supabase/migrations: missing ${cleanup}`);
    return;
  }
  if (migrations.includes(legacyBridgeSchema)) {
    failures.push(`supabase/migrations/${legacyBridgeSchema}: legacy Desktop Bridge migration filename still exists`);
  }
  if (migrations.includes(legacyBridgePhase)) {
    failures.push(`supabase/migrations/${legacyBridgePhase}: legacy Desktop Bridge phase migration filename still exists`);
  }
  if (bridgeSchemaIndex === -1) {
    failures.push(`supabase/migrations: missing ${bridgeSchema}`);
  } else if (cleanupIndex <= bridgeSchemaIndex) {
    failures.push(
      `supabase/migrations: ${cleanup} must run after ${bridgeSchema}`,
    );
  }
  if (!migrations.includes(bridgePhase)) {
    failures.push(`supabase/migrations: missing ${bridgePhase}`);
  }

  const legacyRunnerCreation =
    /create\s+table\s+if\s+not\s+exists\s+public\.(?:runners|runner_[a-z_]+)|create\s+or\s+replace\s+function\s+public\.claim_runner_job|alter\s+table\s+public\.runner_[a-z_]+|create\s+(?:index|policy)[\s\S]*?\b(?:runners|runner_[a-z_]+)\b/i;
  for (const migration of migrations) {
    if (migration === cleanup) continue;
    const sql = fs.readFileSync(path.join(migrationDir, migration), "utf8");
    if (legacyRunnerCreation.test(sql)) {
      failures.push(
        `supabase/migrations/${migration}: legacy Runner schema creation remains in fresh hosted install path`,
      );
    }
  }

  if (migrations.includes(governance)) {
    const sql = fs.readFileSync(path.join(migrationDir, governance), "utf8");
    if (!/check \(model_mode in \('laf_model', 'my_bridge', 'record_only'\)\)/.test(sql)) {
      failures.push(
        `supabase/migrations/${governance}: fresh task model_mode constraint must be Bridge-only`,
      );
    }
    if (/check \(model_mode in \([^)]*local_cli/.test(sql)) {
      failures.push(
        `supabase/migrations/${governance}: fresh task model_mode constraint must not allow local_cli`,
      );
    }
  }

  const legacyRunnerSchema = /\b(runners|runner_capabilities|runner_jobs|runner_job_events|runner_pairing_codes|claim_runner_job)\b/;
  for (let index = cleanupIndex + 1; index < migrations.length; index += 1) {
    const migration = migrations[index];
    const sql = fs.readFileSync(path.join(migrationDir, migration), "utf8");
    if (legacyRunnerSchema.test(sql)) {
      failures.push(
        `supabase/migrations/${migration}: legacy Runner schema appears after Bridge-only cleanup migration`,
      );
    }
  }
}

function walkFilesAndDirs(startDir) {
  const absStart = path.join(root, startDir);
  if (!fs.existsSync(absStart)) return [];
  const results = [];
  const pending = [absStart];
  while (pending.length > 0) {
    const current = pending.pop();
    const relPath = path.relative(root, current).replaceAll(path.sep, "/");
    results.push(relPath);
    const stat = fs.statSync(current);
    if (!stat.isDirectory()) continue;
    for (const entry of fs.readdirSync(current)) {
      pending.push(path.join(current, entry));
    }
  }
  return results;
}

function assertNoRunnerProductArtifactsOnDisk(failures) {
  for (const artifactRoot of removedProductArtifactRoots) {
    for (const relPath of walkFilesAndDirs(artifactRoot)) {
      const base = path.basename(relPath);
      if (removedProductArtifactName.test(base)) {
        failures.push(`${relPath}: legacy Runner product artifact remains on disk`);
      }
    }
  }
}

function assertReleasePublishesBridgeSafely(failures) {
  const release = readText(".github/workflows/release.yml") || "";
  const autoRelease = readText(".github/workflows/auto-release.yml") || "";
  const releaseVersionGuardText =
    "release tag must be canonical npm-compatible SemVer without build metadata";
  if (!release.includes(releaseVersionGuardText)) {
    failures.push(
      ".github/workflows/release.yml: release tag guard must reject non-canonical npm SemVer/build metadata before publishing assets",
    );
  }
  const versionGuard = release.indexOf(releaseVersionGuardText);
  const goreleaser = release.indexOf("goreleaser/goreleaser-action");
  if (versionGuard !== -1 && goreleaser !== -1 && versionGuard > goreleaser) {
    failures.push(
      ".github/workflows/release.yml: release tag SemVer guard must run before goreleaser publishes assets",
    );
  }
  const npmPreflight = release.indexOf("Preflight npm publish readiness");
  if (npmPreflight === -1) {
    failures.push(
      ".github/workflows/release.yml: missing npm publish readiness preflight before goreleaser",
    );
  }
  if (npmPreflight !== -1 && goreleaser !== -1 && npmPreflight > goreleaser) {
    failures.push(
      ".github/workflows/release.yml: npm publish readiness preflight must run before goreleaser publishes assets",
    );
  }
  if (!release.includes("npm whoami >/dev/null")) {
    failures.push(
      ".github/workflows/release.yml: npm publish preflight must validate NPM_TOKEN before missing package publish",
    );
  }
  const setupGo = release.indexOf("actions/setup-go");
  const setOfficePackageVersion = release.indexOf("Set npm package version");
  const setBridgePackageVersion = release.indexOf("Set LAF Bridge npm package version");
  const npmPublishDryRun = release.indexOf("Dry-run npm publish artifacts");
  const hostedBridgeSchema = release.indexOf("npm run hosted-bridge:schema");
  const hostedBridgeOps = release.indexOf("npm run hosted-bridge:ops:test");
  const hostedBridgeIntegration = release.indexOf("npm run hosted-bridge:smoke:integration");
  if (hostedBridgeSchema === -1) {
    failures.push(
      ".github/workflows/release.yml: missing hosted Bridge schema guard before release publish",
    );
  }
  if (hostedBridgeOps === -1) {
    failures.push(
      ".github/workflows/release.yml: missing hosted Bridge ops guard before release publish",
    );
  }
  if (hostedBridgeIntegration === -1) {
    failures.push(
      ".github/workflows/release.yml: missing hosted Bridge integration smoke before release publish",
    );
  }
  if (
    hostedBridgeSchema !== -1 &&
    hostedBridgeIntegration !== -1 &&
    hostedBridgeSchema > hostedBridgeIntegration
  ) {
    failures.push(
      ".github/workflows/release.yml: hosted Bridge schema guard must run before integration smoke",
    );
  }
  if (
    hostedBridgeOps !== -1 &&
    hostedBridgeIntegration !== -1 &&
    hostedBridgeOps > hostedBridgeIntegration
  ) {
    failures.push(
      ".github/workflows/release.yml: hosted Bridge ops guard must run before integration smoke",
    );
  }
  if (setupGo === -1) {
    failures.push(
      ".github/workflows/release.yml: missing setup-go before hosted Bridge integration smoke",
    );
  } else if (hostedBridgeIntegration !== -1 && setupGo > hostedBridgeIntegration) {
    failures.push(
      ".github/workflows/release.yml: setup-go must run before hosted Bridge integration smoke because it builds laf-bridge",
    );
  }
  if (setBridgePackageVersion === -1) {
    failures.push(
      ".github/workflows/release.yml: missing LAF Bridge npm package version injection before publish",
    );
  } else if (hostedBridgeIntegration !== -1 && setBridgePackageVersion > hostedBridgeIntegration) {
    failures.push(
      ".github/workflows/release.yml: LAF Bridge npm package version must be set before package/integration tests",
    );
  }
  if (setOfficePackageVersion === -1) {
    failures.push(
      ".github/workflows/release.yml: missing laf-office npm package version injection before publish",
    );
  }
  if (npmPublishDryRun === -1) {
    failures.push(
      ".github/workflows/release.yml: missing npm publish dry-run before goreleaser",
    );
  } else if (goreleaser !== -1 && npmPublishDryRun > goreleaser) {
    failures.push(
      ".github/workflows/release.yml: npm publish dry-run must run before goreleaser publishes assets",
    );
  } else if (
    setBridgePackageVersion !== -1 &&
    setOfficePackageVersion !== -1 &&
    (npmPublishDryRun < setBridgePackageVersion || npmPublishDryRun < setOfficePackageVersion)
  ) {
    failures.push(
      ".github/workflows/release.yml: npm publish dry-run must run after release version injection",
    );
  }
  if (
    npmPublishDryRun !== -1 &&
    (!release.includes('(cd npm-bridge && npm publish --dry-run --access public --tag "$NPM_TAG")') ||
      !release.includes('(cd npm && npm publish --dry-run --access public --tag "$NPM_TAG")'))
  ) {
    failures.push(
      ".github/workflows/release.yml: npm publish dry-run must validate both laf-bridge and laf-office packages",
    );
  }
  if (!release.includes("NPM_TAG=next") || !release.includes("NPM_TAG=latest")) {
    failures.push(
      ".github/workflows/release.yml: npm release must publish pre-release tags under next and stable tags under latest",
    );
  }
  if (!release.includes('tag_version="$(npm view "${package}@${NPM_TAG}" version 2>/dev/null || true)"')) {
    failures.push(
      ".github/workflows/release.yml: npm publish preflight must detect stale selected dist-tags",
    );
  }
  if (!release.includes('npm publish --access public --tag "$NPM_TAG"')) {
    failures.push(
      ".github/workflows/release.yml: npm publish must pass the resolved dist-tag",
    );
  }
  if (!release.includes('npm dist-tag add "${package}@${VERSION}" "$NPM_TAG"')) {
    failures.push(
      ".github/workflows/release.yml: npm publish retry must repair selected dist-tags for already-published versions",
    );
  }
  if (!release.includes("add_dist_tag_with_retry") || !release.includes("waiting for npm registry propagation")) {
    failures.push(
      ".github/workflows/release.yml: npm dist-tag repair must retry short registry propagation failures",
    );
  }
  if (!autoRelease.includes("grep -E '^v[0-9]+\\.[0-9]+\\.[0-9]+$'")) {
    failures.push(
      ".github/workflows/auto-release.yml: latest release tag lookup must ignore non-SemVer tags",
    );
  }
  if (release.includes("(\\s|$)")) {
    failures.push(
      ".github/workflows/release.yml: release smoke grep must use POSIX [[:space:]] instead of nonportable \\s",
    );
  }
  if (release.includes("\\b'") || release.includes("\\b\"")) {
    failures.push(
      ".github/workflows/release.yml: release smoke grep must avoid nonportable \\b word-boundary checks",
    );
  }
  const ci = readText(".github/workflows/ci.yml") || "";
  const deploySmoke = readText(".github/workflows/hosted-bridge-deploy-smoke.yml") || "";
  if (!deploySmoke.includes("Hosted Bridge Deploy Smoke")) {
    failures.push(
      ".github/workflows/hosted-bridge-deploy-smoke.yml: missing deployed hosted Bridge smoke workflow",
    );
  }
  if (!deploySmoke.includes("workflow_call:")) {
    failures.push(
      ".github/workflows/hosted-bridge-deploy-smoke.yml: deployed smoke must be reusable from production deployment workflows",
    );
  }
  if (!deploySmoke.includes("npm run hosted-bridge:release-gate")) {
    failures.push(
      ".github/workflows/hosted-bridge-deploy-smoke.yml: deployed smoke must run the public laf-bridge npm release gate",
    );
  }
  if (!deploySmoke.includes("npm run hosted-bridge:schema")) {
    failures.push(
      ".github/workflows/hosted-bridge-deploy-smoke.yml: deployed smoke must verify the hosted Bridge schema manifest before smoke",
    );
  }
  if (!deploySmoke.includes("npm run hosted-bridge:smoke")) {
    failures.push(
      ".github/workflows/hosted-bridge-deploy-smoke.yml: deployed smoke must run hosted Bridge smoke script",
    );
  }
  if (!deploySmoke.includes("bridge_package:")) {
    failures.push(
      ".github/workflows/hosted-bridge-deploy-smoke.yml: deployed smoke must allow exact laf-bridge npm package validation",
    );
  }
  if (!deploySmoke.includes("browser_origin:")) {
    failures.push(
      ".github/workflows/hosted-bridge-deploy-smoke.yml: deployed smoke must support browser origin CORS validation",
    );
  }
  if (!deploySmoke.includes("LAF_SMOKE_BROWSER_ORIGIN: ${{ inputs.browser_origin }}")) {
    failures.push(
      ".github/workflows/hosted-bridge-deploy-smoke.yml: deployed smoke must pass browser origin into hosted smoke",
    );
  }
  if (!deploySmoke.includes("LAF_BRIDGE_NPX_PACKAGE: ${{ inputs.bridge_package }}")) {
    failures.push(
      ".github/workflows/hosted-bridge-deploy-smoke.yml: deployed release gate must verify the selected laf-bridge package",
    );
  }
  if (!deploySmoke.includes("node scripts/hosted-bridge-deploy-inputs.cjs --github-env")) {
    failures.push(
      ".github/workflows/hosted-bridge-deploy-smoke.yml: deployed smoke must export normalized validator inputs through GITHUB_ENV",
    );
  }
  if (!deploySmoke.includes("Validate CLI host prerequisites")) {
    failures.push(
      ".github/workflows/hosted-bridge-deploy-smoke.yml: deployed CLI smoke must validate local CLI availability after normalized env export",
    );
  }
  if (!deploySmoke.includes("command -v git")) {
    failures.push(
      ".github/workflows/hosted-bridge-deploy-smoke.yml: deployed CLI smoke must require git on the selected Bridge host",
    );
  }
  const normalizedEnvExport = deploySmoke.indexOf("node scripts/hosted-bridge-deploy-inputs.cjs --github-env");
  const deployedSchemaGuard = deploySmoke.indexOf("npm run hosted-bridge:schema");
  const deployedReleaseGate = deploySmoke.indexOf("npm run hosted-bridge:release-gate");
  const deployedSmokeRun = deploySmoke.indexOf("npm run hosted-bridge:smoke");
  if (
    normalizedEnvExport !== -1 &&
    deployedSchemaGuard !== -1 &&
    deployedSchemaGuard < normalizedEnvExport
  ) {
    failures.push(
      ".github/workflows/hosted-bridge-deploy-smoke.yml: hosted schema guard must run after normalized smoke input export",
    );
  }
  if (
    deployedSchemaGuard !== -1 &&
    deployedReleaseGate !== -1 &&
    deployedSchemaGuard > deployedReleaseGate
  ) {
    failures.push(
      ".github/workflows/hosted-bridge-deploy-smoke.yml: hosted schema guard must run before the public laf-bridge release gate",
    );
  }
  const cliPrerequisites = deploySmoke.indexOf("Validate CLI host prerequisites");
  if (
    deployedReleaseGate !== -1 &&
    cliPrerequisites !== -1 &&
    deployedReleaseGate > cliPrerequisites
  ) {
    failures.push(
      ".github/workflows/hosted-bridge-deploy-smoke.yml: public laf-bridge release gate must run before CLI host prerequisites so npm publication blockers are not masked",
    );
  }
  if (
    deployedSchemaGuard !== -1 &&
    deployedSmokeRun !== -1 &&
    deployedSchemaGuard > deployedSmokeRun
  ) {
    failures.push(
      ".github/workflows/hosted-bridge-deploy-smoke.yml: hosted schema guard must run before deployed Bridge smoke",
    );
  }
  if (normalizedEnvExport !== -1 && cliPrerequisites !== -1 && cliPrerequisites < normalizedEnvExport) {
    failures.push(
      ".github/workflows/hosted-bridge-deploy-smoke.yml: CLI host prerequisites must run after normalized GITHUB_ENV export",
    );
  }
  if (!deploySmoke.includes("node scripts/hosted-bridge-deploy-inputs.cjs")) {
    failures.push(
      ".github/workflows/hosted-bridge-deploy-smoke.yml: deployed smoke must use the tested input validator",
    );
  }
  if (!deploySmoke.includes("bridge_expected_version") || !deploySmoke.includes("LAF_BRIDGE_EXPECT_VERSION")) {
    failures.push(
      ".github/workflows/hosted-bridge-deploy-smoke.yml: deployed smoke must expose optional latest expected-version pinning",
    );
  }
  const deployInputValidator = readText("scripts/hosted-bridge-deploy-inputs.cjs") || "";
  if (!deployInputValidator.includes("bridge_package must be laf-bridge@latest or an exact laf-bridge npm SemVer package without build metadata")) {
    failures.push(
      "scripts/hosted-bridge-deploy-inputs.cjs: deployed smoke must validate the selected npm package input",
    );
  }
  if (!deployInputValidator.includes("bridge_expected_version must be an npm-compatible SemVer without build metadata")) {
    failures.push(
      "scripts/hosted-bridge-deploy-inputs.cjs: deployed smoke must validate optional latest expected-version pinning",
    );
  }
  if (!deployInputValidator.includes("LAF_BRIDGE_EXPECT_VERSION")) {
    failures.push(
      "scripts/hosted-bridge-deploy-inputs.cjs: deployed smoke must export optional latest expected-version pinning",
    );
  }
  if (!deployInputValidator.includes("must not point at localhost or a private network address")) {
    failures.push(
      "scripts/hosted-bridge-deploy-inputs.cjs: deployed smoke must reject localhost/private API URLs",
    );
  }
  if (!deployInputValidator.includes("api_url must be the deployed hosted API URL ending in /api")) {
    failures.push(
      "scripts/hosted-bridge-deploy-inputs.cjs: deployed smoke must require the deployed /api URL",
    );
  }
  if (!deployInputValidator.includes("LAF_SMOKE_BRIDGE_CMD")) {
    failures.push(
      "scripts/hosted-bridge-deploy-inputs.cjs: deployed CLI smoke must export the selected noninteractive npx laf-bridge command",
    );
  }
  if (!deployInputValidator.includes("must not contain newlines")) {
    failures.push(
      "scripts/hosted-bridge-deploy-inputs.cjs: deployed smoke GITHUB_ENV export must reject newline injection",
    );
  }
  const deployInputValidatorTest = readText("scripts/hosted-bridge-deploy-inputs.test.cjs") || "";
  if (!deployInputValidatorTest.includes("emits normalized GitHub env without secrets")) {
    failures.push(
      "scripts/hosted-bridge-deploy-inputs.test.cjs: deployed smoke must test normalized GitHub env export",
    );
  }
  if (!deployInputValidatorTest.includes("refuses GitHub env newline injection")) {
    failures.push(
      "scripts/hosted-bridge-deploy-inputs.test.cjs: deployed smoke must test GITHUB_ENV newline injection rejection",
    );
  }
  if (!deployInputValidatorTest.includes("1.2.3+build.1")) {
    failures.push(
      "scripts/hosted-bridge-deploy-inputs.test.cjs: deployed smoke must reject npm build metadata package inputs",
    );
  }
  if (!deployInputValidatorTest.includes("1.2.3-alpha..1")) {
    failures.push(
      "scripts/hosted-bridge-deploy-inputs.test.cjs: deployed smoke must reject non-canonical npm SemVer package inputs",
    );
  }
  const hostedBridgeSmoke = readText("scripts/hosted-bridge-smoke.cjs") || "";
  if (!hostedBridgeSmoke.includes("assertHostedCommandRegistry")) {
    failures.push(
      "scripts/hosted-bridge-smoke.cjs: deployed smoke must verify the hosted-safe slash command registry",
    );
  }
  if (!hostedBridgeSmoke.includes('request("commands")')) {
    failures.push(
      "scripts/hosted-bridge-smoke.cjs: deployed smoke must call /commands on the hosted API",
    );
  }
  if (!hostedBridgeSmoke.includes("assertHostedCommandRunBoundary")) {
    failures.push(
      "scripts/hosted-bridge-smoke.cjs: deployed smoke must verify hosted slash command endpoint boundaries",
    );
  }
  if (!hostedBridgeSmoke.includes('request("commands/run"')) {
    failures.push(
      "scripts/hosted-bridge-smoke.cjs: deployed smoke must call /commands/run on the hosted API",
    );
  }
  if (!hostedBridgeSmoke.includes("assertLegacyRunnerRoutesRemoved")) {
    failures.push(
      "scripts/hosted-bridge-smoke.cjs: deployed smoke must verify legacy local execution routes are removed",
    );
  }
  if (!hostedBridgeSmoke.includes('route: "runner/status"')) {
    failures.push(
      "scripts/hosted-bridge-smoke.cjs: deployed smoke must probe legacy runner routes",
    );
  }
  const hostedBridgeSmokeTest = readText("scripts/hosted-bridge-smoke.test.cjs") || "";
  if (!hostedBridgeSmokeTest.includes("rejects non-hosted-safe slash command registries")) {
    failures.push(
      "scripts/hosted-bridge-smoke.test.cjs: hosted smoke must reject legacy slash command registries",
    );
  }
  if (!hostedBridgeSmokeTest.includes("rejects slash command endpoints that fake local workflow success")) {
    failures.push(
      "scripts/hosted-bridge-smoke.test.cjs: hosted smoke must reject fake slash command endpoint success",
    );
  }
  if (hostedBridgeSmokeTest.includes("slash command runners")) {
    failures.push(
      "scripts/hosted-bridge-smoke.test.cjs: hosted smoke should describe /commands/run as a slash command endpoint, not a runner",
    );
  }
  if (hostedBridgeSmokeTest.includes("Local deployment/simulation")) {
    failures.push(
      "scripts/hosted-bridge-smoke.test.cjs: hosted smoke fixtures must not keep legacy local deployment copy",
    );
  }
  if (!hostedBridgeSmokeTest.includes("rejects legacy local execution API routes")) {
    failures.push(
      "scripts/hosted-bridge-smoke.test.cjs: hosted smoke must reject deployed legacy local execution routes",
    );
  }
  const composerSource = readText("web/src/components/messages/Composer.tsx") || "";
  if (!composerSource.includes("slashCommandIsAvailable") || !composerSource.includes("availableCommands: commands")) {
    failures.push(
      "web/src/components/messages/Composer.tsx: hosted composer must gate direct slash execution by the visible hosted command registry",
    );
  }
  const composerTest = readText("web/src/components/messages/Composer.test.tsx") || "";
  if (!composerTest.includes("consumes unavailable known slash commands before local workflow handlers")) {
    failures.push(
      "web/src/components/messages/Composer.test.tsx: hosted composer must test typed hidden slash commands before local workflow handlers run",
    );
  }
  const autocompleteSource = readText("web/src/components/messages/Autocomplete.tsx") || "";
  if (!autocompleteSource.includes("HOSTED_FALLBACK_SLASH_COMMANDS")) {
    failures.push(
      "web/src/components/messages/Autocomplete.tsx: autocomplete must default to hosted-safe commands when a caller omits the visible registry",
    );
  }
  if (
    autocompleteSource.includes("export const SLASH_COMMANDS") ||
    autocompleteSource.includes("commands = SLASH_COMMANDS")
  ) {
    failures.push(
      "web/src/components/messages/Autocomplete.tsx: autocomplete must not export a full static local slash-command fallback",
    );
  }
  const autocompleteTest = readText("web/src/components/messages/Autocomplete.test.tsx") || "";
  if (!autocompleteTest.includes("hosted-safe slash fallback when commands are omitted")) {
    failures.push(
      "web/src/components/messages/Autocomplete.test.tsx: autocomplete must test that omitted commands do not expose local workflow commands",
    );
  }
  const useCommandsSource = readText("web/src/hooks/useCommands.ts") || "";
  if (
    !useCommandsSource.includes("HOSTED_COMMAND_NAMES") ||
    !useCommandsSource.includes("localhostRuntime || HOSTED_COMMAND_NAMES")
  ) {
    failures.push(
      "web/src/hooks/useCommands.ts: hosted command registry must client-filter local workflow commands outside localhost",
    );
  }
  const useCommandsTest = readText("web/src/hooks/useCommands.test.ts") || "";
  if (!useCommandsTest.includes("filters local workflow commands from non-localhost registries")) {
    failures.push(
      "web/src/hooks/useCommands.test.ts: hosted command registry must test client-side filtering of local workflow commands",
    );
  }
  const searchModalSource = readText("web/src/components/search/SearchModal.tsx") || "";
  if (!searchModalSource.includes("useCommands()") || searchModalSource.includes("SLASH_COMMANDS")) {
    failures.push(
      "web/src/components/search/SearchModal.tsx: command palette must use the hosted command registry instead of the static local fallback",
    );
  }
  const searchModalTest = readText("web/src/components/search/SearchModal.test.tsx") || "";
  if (!searchModalTest.includes("visible hosted command registry")) {
    failures.push(
      "web/src/components/search/SearchModal.test.tsx: command palette must test that hidden local workflow commands stay out of hosted search",
    );
  }
  const helpModalSource = readText("web/src/components/ui/HelpModal.tsx") || "";
  if (!helpModalSource.includes("useCommands()") || helpModalSource.includes("SLASH_COMMANDS")) {
    failures.push(
      "web/src/components/ui/HelpModal.tsx: help modal must use the visible hosted command registry instead of the static local fallback",
    );
  }
  const helpModalTest = readText("web/src/components/ui/HelpModal.test.tsx") || "";
  if (!helpModalTest.includes("visible command registry instead of the full local fallback")) {
    failures.push(
      "web/src/components/ui/HelpModal.test.tsx: help modal must test that hidden local workflow commands stay out of hosted help",
    );
  }
  const interviewBarSource = readText("web/src/components/messages/InterviewBar.tsx") || "";
  if (!interviewBarSource.includes("isLocalhostRuntime") || !interviewBarSource.includes("postPauseSignal")) {
    failures.push(
      "web/src/components/messages/InterviewBar.tsx: hosted interview dismissal must not rely on local pause/resume signal commands",
    );
  }
  const interviewBarTest = readText("web/src/components/messages/InterviewBar.test.tsx") || "";
  if (!interviewBarTest.includes("does not advertise hidden slash commands in skip notices")) {
    failures.push(
      "web/src/components/messages/InterviewBar.test.tsx: interview skip copy must not advertise hidden local slash commands",
    );
  }
  if (!deploySmoke.includes("LAF_SMOKE_MODE")) {
    failures.push(
      ".github/workflows/hosted-bridge-deploy-smoke.yml: deployed smoke must expose api/cli smoke mode",
    );
  }
  if (!deployInputValidator.includes("smoke_mode must be api or cli")) {
    failures.push(
      "scripts/hosted-bridge-deploy-inputs.cjs: deployed smoke must validate smoke_mode before running Bridge smoke",
    );
  }
  if (!deploySmoke.includes("github_actions_runs_on")) {
    failures.push(
      ".github/workflows/hosted-bridge-deploy-smoke.yml: deployed smoke must use a GitHub Actions runs-on input without LAF Runner wording",
    );
  }
  if (
    deploySmoke.includes("github_runner_label") ||
    /\n\s+runner_label:/.test(deploySmoke)
  ) {
    failures.push(
      ".github/workflows/hosted-bridge-deploy-smoke.yml: avoid Runner-labeled inputs in Bridge product smoke workflow",
    );
  }
  if (ci.includes("shellcheck scripts/*.sh packaging/macos/*.sh")) {
    failures.push(
      ".github/workflows/ci.yml: shellcheck must not reference deleted Runner packaging globs",
    );
  }
  const hostedBridgeJob = extractWorkflowJob(ci, "hosted-bridge");
  const ciSetupGo = hostedBridgeJob.indexOf("actions/setup-go");
  const ciHostedBridgeIntegration = hostedBridgeJob.indexOf("npm run hosted-bridge:smoke:integration");
  if (!hostedBridgeJob) {
    failures.push(".github/workflows/ci.yml: missing hosted-bridge job");
  }
  if (ciSetupGo === -1) {
    failures.push(
      ".github/workflows/ci.yml: hosted-bridge job must setup Go before integration smoke",
    );
  } else if (ciHostedBridgeIntegration !== -1 && ciSetupGo > ciHostedBridgeIntegration) {
    failures.push(
      ".github/workflows/ci.yml: hosted-bridge job must setup Go before integration smoke because it builds laf-bridge",
    );
  }
  if (ci.includes("\\b'") || ci.includes("\\b\"")) {
    failures.push(
      ".github/workflows/ci.yml: Bridge help smoke grep must avoid nonportable \\b word-boundary checks",
    );
  }
  if (!autoRelease.includes("latest release tag must be npm-compatible SemVer")) {
    failures.push(
      ".github/workflows/auto-release.yml: missing SemVer validation before bumping",
    );
  }
  if (
    !autoRelease.includes(
      "go.mod cmd/laf-office/main.go cmd/laf-bridge/main.go npm/package.json npm-bridge/package.json",
    )
  ) {
    failures.push(
      ".github/workflows/auto-release.yml: auto-release tree guard must require laf-bridge and npm-bridge",
    );
  }

  if (!release.includes("npm view \"${package}@${VERSION}\" version")) {
    failures.push(
      ".github/workflows/release.yml: npm publish must skip already-published versions for retry safety",
    );
  }

  const bridgePublish = release.indexOf("publish_and_tag laf-bridge npm-bridge");
  const officePublish = release.indexOf("publish_and_tag laf-office npm");
  if (bridgePublish === -1) {
    failures.push(".github/workflows/release.yml: missing laf-bridge npm publish command");
  }
  if (officePublish === -1) {
    failures.push(".github/workflows/release.yml: missing laf-office npm publish command");
  }
  if (bridgePublish !== -1 && officePublish !== -1 && bridgePublish > officePublish) {
    failures.push(
      ".github/workflows/release.yml: publish laf-bridge before laf-office so npx laf-bridge cannot be left behind",
    );
  }
  if (setBridgePackageVersion !== -1 && bridgePublish !== -1 && setBridgePackageVersion > bridgePublish) {
    failures.push(
      ".github/workflows/release.yml: LAF Bridge npm package version must be set before publish",
    );
  }
  if (setOfficePackageVersion !== -1 && officePublish !== -1 && setOfficePackageVersion > officePublish) {
    failures.push(
      ".github/workflows/release.yml: laf-office npm package version must be set before publish",
    );
  }
}

const failures = [];

assertHostedAPIRouting(failures);
assertHostedSlashCommandRegistry(failures);
assertBridgeOnlyMigrationOrder(failures);
assertNoRunnerProductArtifactsOnDisk(failures);
assertReleasePublishesBridgeSafely(failures);

for (const relPath of removedProductPaths) {
  if (fs.existsSync(path.join(root, relPath))) {
    failures.push(`${relPath}: removed Runner product artifact still exists`);
  }
}

for (const relPath of removedRunnerBoundaryPaths) {
  if (fs.existsSync(path.join(root, relPath))) {
    failures.push(`${relPath}: legacy Runner-named internal boundary still exists`);
  }
}

if (fs.existsSync(path.join(root, "docs/specs/LAF-DESKTOP-BRIDGE-ENGINEERING-PLAN.md"))) {
  failures.push("docs/specs/LAF-DESKTOP-BRIDGE-ENGINEERING-PLAN.md: legacy Desktop Bridge doc filename still exists");
}
if (!fs.existsSync(path.join(root, "docs/specs/LAF-BRIDGE-ENGINEERING-PLAN.md"))) {
  failures.push("docs/specs/LAF-BRIDGE-ENGINEERING-PLAN.md: missing LAF Bridge engineering plan");
}
if (fs.existsSync(path.join(root, "internal/team/desktop_bridge_phase_test.go"))) {
  failures.push("internal/team/desktop_bridge_phase_test.go: legacy Desktop Bridge test filename still exists");
}
if (!fs.existsSync(path.join(root, "internal/team/hosted_workspace_security_test.go"))) {
  failures.push("internal/team/hosted_workspace_security_test.go: missing hosted workspace security tests");
}

for (const relPath of gitFiles()) {
  if (!shouldScan(relPath)) continue;
  const text = readText(relPath);
  if (text === null) continue;
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    for (const rule of forbidden) {
      if (rule.pattern.test(line)) {
        failures.push(`${relPath}:${i + 1}: ${rule.label}: ${line.trim()}`);
      }
    }
  }
}

assertContains("README.md", "npx laf-bridge pair", "Bridge pairing entrypoint", failures);
assertContains(
  "README.md",
  "run `npx laf-bridge pair`",
  "README should name the public Bridge pairing command in the production flow",
  failures,
);
assertContains("README.md", "Production user flow", "hosted-first README quick start", failures);
assertNotContains(
  "README.md",
  ["single", "setup", "command"].join(" "),
  "README production flow should not imply a hidden command with embedded setup data",
  failures,
);
assertContains("README.md", "Production users do not start a separate local app server or second local", "README production/local development boundary", failures);
assertContains("README.md", "hosted workspace and Bridge architecture", "README architecture link describes hosted Bridge architecture", failures);
assertContains("README.md", "Backend and LAF Bridge tests", "README Bridge test wording", failures);
assertContains("README.md", "Codex CLI or Claude Code", "hosted Bridge CLI runtime boundary", failures);
assertContains("README.md", "Codex CLI 또는 Claude Code", "Korean hosted Bridge CLI runtime boundary", failures);
assertNotContains("README.md", "Runner", "README legacy Runner product wording", failures);
assertNotContains("README.md", "OpenCode", "unsupported hosted Bridge runtime", failures);
assertNotContains("README.md", "local workspace", "README should not position the product as a local workspace", failures);
assertNotContains("README.md", "로컬 워크스페이스", "Korean README should not position the product as a local workspace", failures);
assertNotContains("README.md", "local markdown", "README local-first memory wording", failures);
assertNotContains("README.md", "markdown/git", "README local-first memory storage wording", failures);
assertNotContains("README.md", "broker", "README product broker wording", failures);
assertNotContains("README.md", "브로커", "Korean README product broker wording", failures);
assertNotContains("README.md", "Mac/Linux machine", "Bridge setup OS restriction", failures);
assertContains("DESIGN.md", "LAF Bridge work location is managed checkout", "Bridge managed checkout design direction", failures);
assertContains("DESIGN.md", "Copy `npx laf-bridge pair`", "design docs fixed Bridge pair command flow", failures);
assertNotContains("DESIGN.md", "CLI/local execution", "design docs generic local execution color token wording", failures);
assertNotContains("DESIGN.md", "team Bridge", "design docs split Bridge wording", failures);
assertNotContains("DESIGN.md", "split-Bridge", "design docs split Bridge wording", failures);
assertNotContains("DESIGN.md", "old \"my bridge\"", "design docs internal Bridge mode wording", failures);
assertNotContains("DESIGN.md", "personal Bridge", "design docs separate personal Bridge wording", failures);
assertNotContains("DESIGN.md", "Personal local folder", "Design no longer exposes personal folder mode", failures);
assertNotContains("DESIGN.md", "use existing folder", "Design no longer exposes folder selection", failures);
assertNotContains(
  "internal/team/message_metadata_test.go",
  "PersonalBridge",
  "model availability test names should use my_bridge/LAF Bridge wording",
  failures,
);
assertContains("USER_GUIDE_KO.md", "npx laf-bridge pair", "Korean Bridge pairing entrypoint", failures);
assertNotContains("USER_GUIDE_KO.md", "OpenCode", "unsupported hosted Bridge runtime", failures);
assertNotContains(
  "USER_GUIDE_KO.md",
  "에이전트가 사용할 실행 환경",
  "Korean guide hosted onboarding runtime selection wording",
  failures,
);
assertNotContains(
  "USER_GUIDE_KO.md",
  "API Keys: 필요 시 제공자 키 입력",
  "Korean guide hosted Settings local keys section wording",
  failures,
);
assertContains(
  "web/src/components/onboarding/Wizard.tsx",
  'sessionLabel: "Browser session"',
  "hosted onboarding browser session readiness copy",
  failures,
);
assertNotContains(
  "web/src/components/onboarding/Wizard.tsx",
  'sessionLabel: "Session runtime"',
  "hosted onboarding runtime readiness copy",
  failures,
);
assertContains("npm/README.md", "Claude Code or Codex via LAF Bridge", "npm Bridge CLI runtime boundary", failures);
assertContains("npm/README.md", "Production users should start in the hosted web app", "npm hosted-first entrypoint", failures);
assertNotContains("npm/README.md", "OpenCode", "unsupported hosted Bridge runtime", failures);
assertNotContains("npm/README.md", "OpenClaw", "unsupported hosted Bridge runtime", failures);
assertNotContains("npm/README.md", "openclaw", "unsupported hosted Bridge runtime", failures);
assertNotContains("npm/README.md", "local web workspace", "npm package copy should not frame the product as a local web workspace", failures);
assertNotContains("npm/README.md", "local developer workspace", "npm package copy should not frame the product as a local developer workspace", failures);
assertNotContains("npm/README.md", "local markdown", "npm local-first memory wording", failures);
assertNotContains("npm/README.md", "shared markdown", "npm local markdown memory wording", failures);
assertNotContains("npm/README.md", "self-hosted, your API keys", "npm local-first pricing wording", failures);
assertContains(
  "scripts/install-latest-laf-office-cli.sh",
  'LAF_OFFICE_CLI_PACKAGE:-laf-office',
  "latest CLI installer defaults to the published laf-office package",
  failures,
);
assertContains(
  "scripts/install-latest-laf-office-cli.sh",
  "npx laf-bridge pair",
  "latest CLI installer points hosted production users to Bridge pairing",
  failures,
);
assertNotContains(
  "scripts/install-latest-laf-office-cli.sh",
  "@laf-office/laf-office",
  "latest CLI installer should not default to stale scoped package",
  failures,
);
assertContains(
  "packaging/README.md",
  "hosted onboarding should point only",
  "packaging docs keep native install script out of hosted onboarding",
  failures,
);
assertContains(
  "npm/package.json",
  "Hosted AI development workspace bootstrap with local Codex and Claude execution through LAF Bridge.",
  "npm package hosted Bridge positioning",
  failures,
);
assertContains("npm/package.json", '"laf-bridge"', "npm package Bridge keyword", failures);
assertContains("npm/package.json", '"hosted-workspace"', "npm package hosted workspace keyword", failures);
assertNotContains("npm/package.json", "Slack for AI employees", "legacy npm package positioning", failures);
assertNotContains("npm/package.json", "openclaw", "unsupported hosted Bridge runtime keyword", failures);
assertContains("website/index.html", "Hosted AI workspace + LAF Bridge", "website hosted Bridge positioning", failures);
assertContains("website/index.html", "OPEN APP", "website hosted-first CTA", failures);
assertContains("website/index.html", "PAIR BRIDGE", "website Bridge pairing CTA", failures);
assertContains("website/index.html", "npx laf-bridge pair", "website Bridge pairing entrypoint", failures);
assertContains("website/index.html", "create a Bridge setup code in Settings", "website Bridge setup code wording", failures);
assertContains("website/index.html", "One Bridge command for local execution", "website single Bridge command wording", failures);
assertNotContains("website/index.html", ">INSTALL<", "website should not present hosted entry as install-first", failures);
assertNotContains(
  "website/index.html",
  'href="#install" onclick="copyInstall()"',
  "website OPEN APP CTA should link to the hosted app instead of the old install block",
  failures,
);
assertContains(
  "website/index.html",
  'href="https://laf-office.team" target="_blank" rel="noopener">OPEN APP</a>',
  "website OPEN APP CTA points at the hosted app",
  failures,
);
assertNotContains("website/index.html", ["Bridge", "setup", "command", "from", "Settings"].join(" "), "website should not imply Settings provides a custom command", failures);
assertNotContains("website/index.html", ["One", "setup", "command", "for", "LAF", "Bridge", "execution"].join(" "), "website should describe setup code plus fixed Bridge pair command", failures);
assertNotContains("website/index.html", "local CLI execution through LAF Bridge", "website generic local CLI execution meta wording", failures);
assertNotContains("website/index.html", "OpenCode", "unsupported hosted Bridge runtime on website", failures);
assertNotContains("website/index.html", "Opencode", "unsupported hosted Bridge runtime on website", failures);
assertNotContains("website/index.html", "OpenClaw", "unsupported hosted Bridge runtime on website", failures);
assertNotContains("website/index.html", "openclaw", "unsupported hosted Bridge runtime on website", failures);
assertNotContains("website/index.html", "broker", "website product broker wording", failures);
assertNotContains("website/index.html", "shared markdown", "website local markdown memory wording", failures);
assertContains("docs/specs/GPT-OAUTH-MVP.md", "Contributor-only local dogfood setup", "GPT OAuth local dogfood boundary", failures);
assertContains(
  "docs/specs/GPT-OAUTH-MVP.md",
  "go run ./cmd/laf-office --no-open",
  "GPT OAuth dogfood uses source checkout local server command",
  failures,
);
assertNotContains(
  "docs/specs/GPT-OAUTH-MVP.md",
  "npx laf-office",
  "GPT OAuth dogfood should not promote npm local bootstrap",
  failures,
);
assertContains("docs/specs/AUTH-SESSIONS-MVP.md", "historical local dogfood spec", "auth sessions local dogfood boundary", failures);
assertNotContains("api/[...path].js", 'kind === "opencode"', "unsupported hosted Bridge runtime", failures);
assertNotContains("api/[...path].js", "action_provider", "hosted API external action config surface", failures);
assertNotContains("api/[...path].js", "api_key_set", "hosted API local API-key config surface", failures);
assertNotContains("api/[...path].js", "openai_key_set", "hosted API local API-key config surface", failures);
assertNotContains("api/[...path].js", "composio_key_set", "hosted API external action config surface", failures);
assertNotContains("api/[...path].js", "telegram_token_set", "hosted API local integration config surface", failures);
assertNotContains("api/[...path].js", "default_format", "hosted API local command format config surface", failures);
assertNotContains("api/[...path].js", "default_timeout", "hosted API local command timeout config surface", failures);
assertNotContains("api/[...path].js", "memory_backend", "hosted API local memory backend config surface", failures);
assertNotContains("api/[...path].js", "openclaw_gateway_url", "hosted API OpenClaw config surface", failures);
assertNotContains("api/[...path].js", "openclaw_token_set", "hosted API OpenClaw config surface", failures);
assertContains(
  "api/hosted-api.test.js",
  "initialConfig.body.openclaw_gateway_url, undefined",
  "hosted config hides OpenClaw gateway fields",
  failures,
);
assertContains(
  "api/hosted-api.test.js",
  "initialConfig.body.api_key_set, undefined",
  "hosted config hides local API-key fields",
  failures,
);
assertContains(
  "api/hosted-api.test.js",
  "initialConfig.body.default_format, undefined",
  "hosted config hides local command defaults",
  failures,
);
assertNotContains("internal/bridge/api.go", '"bridge_version": "dev"', "Bridge version placeholder", failures);
assertNotContains("internal/team/broker.go", "RunnerJobs", "legacy Runner state persistence", failures);
assertNotContains("internal/team/broker.go", "runner_jobs", "legacy Runner state persistence", failures);
assertNotContains(
  "cmd/bench-slice-1/main.go",
  "bench/slice-1/runner",
  "legacy Runner-named benchmark package path",
  failures,
);
assertNotContains("internal/team/pam.go", "PamRunner", "legacy Runner-named Pam executor boundary", failures);
assertNotContains(
  "internal/team/pam_test.go",
  "fakePamRunner",
  "legacy Runner-named Pam test seam",
  failures,
);
assertNotContains(
  "internal/teammcp/playbook_tools.go",
  "next runner",
  "agent-visible playbook tool runner wording",
  failures,
);
assertNotContains(
  "internal/team/playbook_compiler.go",
  "next runner",
  "compiled playbook runner wording",
  failures,
);
assertNotContains(
  "internal/team/wiki_lint.go",
  "archivist lint runner",
  "wiki lint report runner wording",
  failures,
);
assertNotContains(
  "internal/team/context_budget_test.go",
  "runner delivery state",
  "Bridge delivery receipt fixture wording",
  failures,
);
assertNotContains("web/src/lib/harness.ts", "opencode", "unsupported hosted Bridge runtime", failures);
assertNotContains("web/src/components/ui/HarnessBadge.tsx", "opencode", "unsupported hosted Bridge runtime", failures);
assertNotContains(
  "web/src/api/client.ts",
  "local markdown memory",
  "hosted web client comments should avoid local markdown memory positioning",
  failures,
);
assertContains(
  "web/src/api/client.ts",
  "workspace wiki memory",
  "hosted web client comments use workspace wiki memory wording",
  failures,
);
assertNotContains(
  "cmd/laf-office/main.go",
  "expected claude-code, codex, or opencode",
  "laf-office public provider flag unsupported Opencode copy",
  failures,
);
assertNotContains(
  "cmd/laf-office/main.go",
  "local markdown team wiki",
  "laf-office help should avoid local markdown memory positioning",
  failures,
);
assertNotContains(
  "cmd/laf-office/main.go",
  "local wiki memory",
  "laf-office destructive help should use workspace wiki wording",
  failures,
);
assertContains(
  "cmd/laf-office/main.go",
  "workspace wiki memory",
  "laf-office destructive help names workspace wiki memory",
  failures,
);
assertContains(
  "cmd/laf-office/memory.go",
  "git-native team wiki",
  "laf-office memory command uses team wiki wording",
  failures,
);
assertNotContains(
  "cmd/laf-office/memory.go",
  "local markdown team wiki",
  "laf-office memory command should avoid local markdown positioning",
  failures,
);
assertContains(
  "scripts/demo-entity-synthesis.sh",
  "workspace runtime invokes your local agent CLI",
  "entity synthesis demo uses workspace runtime wording",
  failures,
);
assertContains(
  "scripts/demo-entity-synthesis.sh",
  "Claude Code or Codex",
  "entity synthesis demo names supported hosted Bridge runtimes",
  failures,
);
assertNotContains(
  "scripts/demo-entity-synthesis.sh",
  "openclaw",
  "entity synthesis demo should not advertise unsupported hosted Bridge runtime",
  failures,
);
assertNotContains(
  "scripts/demo-entity-synthesis.sh",
  "broker shells out",
  "entity synthesis demo should avoid old broker-shells wording",
  failures,
);
assertNotContains(
  "scripts/demo-entity-synthesis.sh",
  "broker shelled out",
  "entity synthesis demo should avoid old broker-shells summary wording",
  failures,
);
assertNotContains(
  "internal/tui/init_flow.go",
  'Label: "Opencode CLI"',
  "local setup provider picker unsupported Opencode option",
  failures,
);
assertNotContains(
  "internal/commands/cmd_system.go",
  'Label: "Opencode CLI"',
  "slash provider picker unsupported Opencode option",
  failures,
);
assertNotContains(
  "cmd/laf-office/onboarding.go",
  'InstallURL: "https://opencode.ai"',
  "local onboarding unsupported Opencode prerequisite",
  failures,
);
assertContains(
  "internal/tui/init_flow_test.go",
  "TestProviderOptionsExcludeOpencode",
  "provider picker unsupported Opencode regression test",
  failures,
);
assertNotContains(
  "web/src/components/apps/SkillsApp.tsx",
  "from the broker",
  "Skills UI broker wording",
  failures,
);
assertNotContains(
  "web/src/components/apps/SkillsApp.tsx",
  "브로커가",
  "Korean Skills UI broker wording",
  failures,
);
assertNotContains(
  "web/src/components/messages/Composer.tsx",
  "stay on the broker",
  "Composer reset dialog broker wording",
  failures,
);
assertContains(
  "web/src/components/layout/StatusBar.tsx",
  "const showLocalConnectionState = supportsBrokerEvents();",
  "hosted UI hides localhost-only connection status",
  failures,
);
assertContains(
  "web/src/components/layout/StatusBar.test.tsx",
  "does not show localhost connection state in hosted runtime",
  "hosted StatusBar connection-state regression test",
  failures,
);
assertContains(
  "web/src/components/apps/SettingsApp.tsx",
  "function bridgeRuntimeLabels",
  "Settings UI displays detected Bridge CLI runtimes",
  failures,
);
assertContains(
  "web/src/components/apps/SettingsApp.test.tsx",
  "shows only supported Codex and Claude Bridge runtime checks",
  "Settings Bridge CLI runtime regression test",
  failures,
);
assertContains(
  "web/src/components/apps/SettingsApp.test.tsx",
  "renders detected Codex and Claude CLI checks in the Bridge section",
  "Settings Bridge CLI runtime render regression test",
  failures,
);
assertContains(
  "web/src/components/apps/SettingsApp.test.tsx",
  "renders hosted Bridge setup steps as direct ordered-list items before pairing",
  "Settings Bridge setup onboarding render regression test",
  failures,
);
assertContains(
  "web/src/components/apps/SettingsApp.tsx",
  "if (showLocalRuntimeSettings) {\n      patch.llm_provider",
  "hosted General settings do not save localhost runtime defaults",
  failures,
);
assertContains(
  "web/src/components/apps/SettingsApp.test.tsx",
  "hides local runtime defaults in hosted general settings",
  "hosted General settings local runtime defaults render regression test",
  failures,
);
assertContains(
  "web/src/components/apps/SettingsApp.test.tsx",
  "saves hosted general settings without local runtime defaults",
  "hosted General settings local runtime defaults payload regression test",
  failures,
);
assertContains(
  "web/src/components/ui/ProviderSwitcher.tsx",
  "Default Bridge provider",
  "hosted provider switcher Bridge provider copy",
  failures,
);
assertNotContains(
  "web/src/components/ui/ProviderSwitcher.tsx",
  "Switch runtime provider",
  "hosted provider switcher local runtime copy",
  failures,
);
assertContains(
  "web/src/hooks/useCommands.ts",
  "Switch default Bridge provider",
  "hosted provider slash command Bridge provider copy",
  failures,
);
assertContains(
  "web/src/hooks/useCommands.ts",
  "기본 Bridge 제공자 전환",
  "Korean hosted provider slash command Bridge provider copy",
  failures,
);
assertNotContains(
  "web/src/hooks/useCommands.ts",
  "런타임 제공자 전환",
  "Korean hosted provider slash command runtime provider copy",
  failures,
);
assertContains(
  "web/src/lib/i18n.ts",
  '"status.bridgeProvider": "Bridge provider"',
  "status bar Bridge provider tooltip copy",
  failures,
);
assertNotContains(
  "web/src/lib/i18n.ts",
  '"status.runtimeProvider"',
  "status bar runtime provider tooltip copy",
  failures,
);
assertContains(
  "api/[...path].js",
  'name: "provider", description: "Switch default Bridge provider"',
  "hosted API provider slash command Bridge provider copy",
  failures,
);
assertContains(
  "api/hosted-api.test.js",
  'providerCommand?.description, "Switch default Bridge provider"',
  "hosted API provider slash command copy regression test",
  failures,
);
assertNotContains(
  "api/hosted-api.test.js",
  "laf-runner",
  "hosted API tests must not keep legacy package literals",
  failures,
);
assertNotContains(
  "web/src/components/apps/SettingsApp.test.tsx",
  "laf-runner",
  "hosted Settings tests must not keep legacy package literals",
  failures,
);
assertNotContains(
  "scripts/hosted-bridge-smoke.cjs",
  "laf-runner",
  "hosted smoke must not keep legacy package literals",
  failures,
);
assertContains(
  "internal/commands/slash.go",
  "Switch default Bridge provider",
  "local slash registry Bridge provider copy",
  failures,
);
assertNotContains(
  "internal/commands/slash.go",
  "Switch runtime provider",
  "local slash registry runtime provider copy",
  failures,
);
assertNotContains(
  "internal/commands/cmd_superworkflow.go",
  "Start local runtime",
  "deploy simulation legacy local runtime wording",
  failures,
);
assertContains(
  "internal/commands/cmd_system.go",
  "Bridge providers:",
  "local provider command Bridge provider fallback copy",
  failures,
);
assertContains(
  "internal/tui/init_flow.go",
  "Choose default Bridge provider",
  "local setup provider picker Bridge provider copy",
  failures,
);
assertContains(
  "cmd/laf-office/channel.go",
  "Choose a default Bridge provider.",
  "local provider picker Bridge provider notice",
  failures,
);
assertContains(
  "web/src/components/ui/ProviderSwitcher.test.tsx",
  "presents provider choice as hosted Bridge execution configuration",
  "hosted provider switcher copy regression test",
  failures,
);
assertContains(
  "web/src/api/client.ts",
  "if (!isLocalhostRuntime()) {\n    useProxy = true;\n    token = null;\n    return;\n  }",
  "hosted API client skips localhost broker discovery",
  failures,
);
assertContains(
  "web/src/api/client.ts",
  "export function supportsBrokerEvents(): boolean {\n  return isLocalhostRuntime();\n}",
  "browser broker events are localhost-only",
  failures,
);
assertContains(
  "web/src/api/client.test.ts",
  "uses hosted /api directly and skips local broker discovery off localhost",
  "hosted API client localhost discovery regression test",
  failures,
);
assertContains(
  "api/[...path].js",
  'myBridgeAllowed\n      ? "my_bridge"',
  "hosted model availability prefers the paired LAF Bridge",
  failures,
);
assertContains(
  "api/[...path].js",
  'if (value === "team_bridge") return "my_bridge";',
  "hosted API treats team_bridge as a legacy LAF Bridge alias",
  failures,
);
assertNotContains(
  "api/[...path].js",
  "allowedModes.push(\"team_bridge\")",
  "hosted model availability exposing team Bridge as a browser-selectable mode",
  failures,
);
assertNotContains(
  "api/[...path].js",
  "teamBridgeAvailabilityFromDevices",
  "hosted Bridge availability exposing workspace Bridge execution state",
  failures,
);
for (const teamPermission of [
  "bridge:read_team",
  "bridge:execute_team",
  "bridge:manage_team",
]) {
  assertNotContains(
    "api/[...path].js",
    teamPermission,
    "hosted API workspace Bridge permission",
    failures,
  );
  assertNotContains(
    "web/src/api/client.ts",
    teamPermission,
    "web client workspace Bridge permission",
    failures,
  );
  assertNotContains(
    "internal/team/permissions.go",
    teamPermission,
    "local broker workspace Bridge permission",
    failures,
  );
}
assertNotContains(
  "internal/team/permissions.go",
  "team_bridge",
  "local broker workspace Bridge model mode",
  failures,
);
assertNotContains(
  "internal/team/permissions.go",
  "model:use_local_cli",
  "local broker direct local CLI permission",
  failures,
);
assertNotContains(
  "api/[...path].js",
  "model:use_local_cli",
  "hosted API direct local CLI permission",
  failures,
);
assertNotContains(
  "web/src/api/client.ts",
  "model:use_local_cli",
  "web client direct local CLI permission",
  failures,
);
assertNotContains(
  "api/[...path].js",
  "local_cli:",
  "hosted model availability direct local CLI field",
  failures,
);
assertNotContains(
  "web/src/api/client.ts",
  "local_cli",
  "web client direct local CLI availability field",
  failures,
);
assertContains(
  "web/src/api/client.ts",
  "LEGACY_PERSONAL_BRIDGE_MODEL_MODES",
  "web API client absorbs legacy model aliases at the response boundary",
  failures,
);
for (const relPath of [
  "web/src/components/ModelModeToggle.tsx",
  "web/src/components/apps/TasksApp.tsx",
]) {
  assertNotContains(
    relPath,
    "local_cli",
    "hosted web UI direct local CLI model mode",
    failures,
  );
  assertNotContains(
    relPath,
    "team_bridge",
    "hosted web UI workspace Bridge model mode",
    failures,
  );
}
assertNotContains(
  "internal/team/runtime_boundary_capsule.go",
  "team_bridge",
  "runtime boundary capsule workspace Bridge model mode",
  failures,
);
assertNotContains(
  "internal/team/runtime_boundary_capsule.go",
  "team bridge",
  "runtime boundary capsule workspace Bridge wording",
  failures,
);
assertNotContains(
  "internal/team/launcher.go",
  "team_bridge",
  "agent prompt workspace Bridge tool name",
  failures,
);
assertContains(
  "internal/team/launcher.go",
  "team_context_bridge",
  "agent prompt context bridge tool name",
  failures,
);
assertContains(
  "internal/teammcp/server.go",
  '"team_context_bridge"',
  "MCP context bridge tool name",
  failures,
);
assertContains(
  "api/hosted-api.test.js",
  "availability.body.team_bridge, undefined",
  "hosted Bridge availability hides workspace Bridge execution state",
  failures,
);
assertContains(
  "web/src/components/ModelModeToggle.tsx",
  'if (modeAvailable(availability, "my_bridge")) return "my_bridge";',
  "web model toggle prefers the paired LAF Bridge",
  failures,
);
assertNotContains(
  "web/src/components/ModelModeToggle.tsx",
  'modeAvailable(availability, "team_bridge")',
  "web model toggle selecting workspace Bridge as a CLI mode",
  failures,
);
assertContains(
  "web/src/api/client.ts",
  'export type ModelMode = "laf_model" | "my_bridge" | "record_only";',
  "browser-selectable model modes exclude team Bridge",
  failures,
);
assertContains(
  "web/src/api/client.ts",
  "function normalizeBridgePairingStartResponse",
  "hosted web client normalizes Bridge pairing responses",
  failures,
);
assertContains(
  "web/src/api/client.test.ts",
  "normalizes Bridge pairing responses to the public pair-only surface",
  "hosted web client pairing response normalization regression test",
  failures,
);
assertContains(
  "web/src/api/client.test.ts",
  'expect("code" in result.pairing).toBe(false)',
  "hosted web client strips raw pairing codes",
  failures,
);
assertNotContains(
  "web/src/components/apps/TasksApp.tsx",
  'mode: modelMode === "team_bridge"',
  "Tasks UI submitting team Bridge execution mode",
  failures,
);
assertContains(
  "web/src/components/apps/TasksApp.test.tsx",
  "prefers LAF Bridge execution when one paired Bridge can run without a project binding",
  "pair-only LAF Bridge task execution regression test",
  failures,
);
assertNotContains(
  "web/src/lib/i18n.ts",
  "broker",
  "user-facing broker wording",
  failures,
);
assertNotContains(
  "web/src/lib/i18n.ts",
  "브로커",
  "Korean user-facing broker wording",
  failures,
);
assertNotContains(
  "web/src/lib/i18n.ts",
  "Mac or Linux machine",
  "Bridge setup OS restriction",
  failures,
);
assertContains(
  "web/src/lib/i18n.ts",
  '"settings.team.localOffice": "Workspace"',
  "hosted Settings team fallback avoids local workspace wording",
  failures,
);
assertContains(
  "web/src/lib/i18n.ts",
  '"settings.team.localOffice": "워크스페이스"',
  "Korean hosted Settings team fallback avoids local workspace wording",
  failures,
);
assertNotContains(
  "web/src/lib/i18n.ts",
  '"settings.team.localOffice": "Local workspace"',
  "hosted Settings team fallback should not say local workspace",
  failures,
);
assertNotContains(
  "web/src/lib/i18n.ts",
  '"settings.team.localOffice": "로컬 워크스페이스"',
  "Korean hosted Settings team fallback should not say local workspace",
  failures,
);
assertNotContains(
  "web/src/lib/i18n.ts",
  "this local workspace",
  "Settings danger-zone copy should not make local workspace the product frame",
  failures,
);
assertNotContains(
  "web/src/lib/i18n.ts",
  "이 로컬 워크스페이스",
  "Korean Settings danger-zone copy should not make local workspace the product frame",
  failures,
);
assertNotContains(
  "web/src/lib/i18n.ts",
  "settings.bridge.installCommandLabel",
  "separate Bridge install step copy",
  failures,
);
assertNotContains(
  "web/src/lib/i18n.ts",
  "settings.bridge.installCommandHint",
  "separate Bridge install step copy",
  failures,
);
assertNotContains(
  "web/src/lib/i18n.ts",
  "Mac 또는 Linux",
  "Korean Bridge setup OS restriction",
  failures,
);
assertNotContains(
  "web/src/components/apps/SettingsApp.tsx",
  "broker-state.json",
  "local broker state path in Settings UI",
  failures,
);
assertContains(
  "docs/specs/HOSTED-DEPLOYMENT-RUNBOOK.md",
  "npm run hosted-bridge:smoke",
  "hosted Bridge smoke runbook",
  failures,
);
assertContains(
  "docs/specs/HOSTED-DEPLOYMENT-RUNBOOK.md",
  "Hosted Bridge Deploy Smoke",
  "hosted Bridge deployed-smoke workflow runbook",
  failures,
);
assertContains(
  "docs/specs/HOSTED-DEPLOYMENT-RUNBOOK.md",
  "bridge_expected_version=<version>",
  "hosted Bridge deployed-smoke runbook documents latest expected-version pinning",
  failures,
);
assertNotContains(
  "docs/specs/HOSTED-DEPLOYMENT-RUNBOOK.md",
  "Mac/Linux machine",
  "Bridge setup OS restriction",
  failures,
);
assertContains(
  "docs/specs/HOSTED-DEPLOYMENT-RUNBOOK.md",
  "npm view laf-bridge version",
  "hosted Bridge npm release gate",
  failures,
);
assertContains(
  "docs/specs/HOSTED-DEPLOYMENT-RUNBOOK.md",
  "npm run hosted-bridge:release-gate",
  "hosted Bridge release gate command",
  failures,
);
assertContains(
  "docs/specs/HOSTED-DEPLOYMENT-RUNBOOK.md",
  "`npx --yes laf-bridge@latest`; set `LAF_SMOKE_BRIDGE_CMD`",
  "hosted Bridge smoke runbook documents the noninteractive npx latest default",
  failures,
);
assertContains(
  "docs/specs/HOSTED-DEPLOYMENT-RUNBOOK.md",
  "base command; do not include `pair`, `start`, setup codes, or internal pairing",
  "hosted Bridge smoke command override guidance",
  failures,
);
assertContains(
  "docs/specs/HOSTED-DEPLOYMENT-RUNBOOK.md",
  "LAF_SMOKE_BRIDGE_TIMEOUT_MS",
  "hosted Bridge smoke timeout override runbook",
  failures,
);
assertContains(
  "docs/specs/HOSTED-DEPLOYMENT-RUNBOOK.md",
  "release gate intentionally runs before CLI host prerequisite checks",
  "hosted deploy runbook documents release-gate-before-host-prereq ordering",
  failures,
);
assertNotContains(
  "docs/specs/HOSTED-DEPLOYMENT-RUNBOOK.md",
  "smoke runner",
  "hosted deploy runbook should not use runner wording for smoke hosts",
  failures,
);
assertContains(
  "docs/specs/HOSTED-DEPLOYMENT-RUNBOOK.md",
  "under-provisioned smoke host",
  "hosted deploy runbook uses smoke host wording",
  failures,
);
assertContains(
  "docs/specs/HOSTED-DEPLOYMENT-RUNBOOK.md",
  "retries both the exact-version `laf-bridge@<version>`",
  "hosted deploy runbook documents exact-version release gate retry",
  failures,
);
assertContains(
  "docs/specs/HOSTED-DEPLOYMENT-RUNBOOK.md",
  "`laf-bridge@latest --expect-version <version>`",
  "hosted deploy runbook documents latest dist-tag release gate retry",
  failures,
);
assertContains(
  "docs/specs/HOSTED-DEPLOYMENT-RUNBOOK.md",
  "already has `git` and Codex or Claude CLI authenticated",
  "hosted deploy runbook documents CLI smoke host prerequisites",
  failures,
);
assertNotContains(
  "docs/specs/HOSTED-DEPLOYMENT-RUNBOOK.md",
  "laf-bridge start",
  "separate Bridge start command in hosted deployment runbook",
  failures,
);
assertNotContains(
  "scripts/hosted-bridge-smoke.cjs",
  "go run ./cmd/laf-bridge",
  "hosted smoke default local Go Bridge command",
  failures,
);
assertContains(
  "scripts/hosted-bridge-smoke.cjs",
  'process.env.LAF_SMOKE_BRIDGE_CMD || "npx --yes laf-bridge@latest"',
  "hosted smoke noninteractive npx Bridge default",
  failures,
);
assertContains(
  "scripts/hosted-bridge-smoke.cjs",
  "validateBridgeCommandBase(bridgeCommand)",
  "hosted smoke validates the Bridge base command override",
  failures,
);
assertNotContains(
  "scripts/hosted-bridge-smoke.cjs",
  ["legacy", ["laf", "runner"].join("-")].join(" "),
  "hosted smoke legacy package rejection message",
  failures,
);
assertContains(
  "scripts/hosted-bridge-smoke.test.cjs",
  "default noninteractive npx latest command",
  "hosted smoke tests the noninteractive npx latest default",
  failures,
);
assertContains(
  "scripts/hosted-bridge-smoke.test.cjs",
  "LAF_EXPECT_NPX_PACKAGE",
  "hosted smoke fake npx verifies the default package selector",
  failures,
);
assertContains(
  "scripts/hosted-bridge-smoke.test.cjs",
  "rejects command overrides that already include pair",
  "hosted smoke rejects duplicate pair command overrides",
  failures,
);
assertContains(
  "scripts/hosted-bridge-smoke.cjs",
  "internalBridgeCommandTokens",
  "hosted smoke rejects all internal Bridge command overrides",
  failures,
);
assertContains(
  "scripts/hosted-bridge-smoke.test.cjs",
  "rejects internal Bridge command overrides",
  "hosted smoke internal command override regression test",
  failures,
);
assertContains(
  "scripts/hosted-bridge-smoke.cjs",
  "looksLikeSetupCodeToken",
  "hosted smoke rejects setup code command overrides",
  failures,
);
assertContains(
  "scripts/hosted-bridge-smoke.test.cjs",
  "rejects setup code command overrides",
  "hosted smoke setup-code command override regression test",
  failures,
);
assertContains(
  "scripts/hosted-bridge-smoke.test.cjs",
  "allows lowercase hyphenated npx package commands",
  "hosted smoke must not confuse lowercase package names with setup codes",
  failures,
);
assertContains(
  "scripts/hosted-bridge-smoke.cjs",
  "bridgeCommandTimeoutMS",
  "hosted smoke uses a shared Bridge command timeout for cold npx starts",
  failures,
);
assertContains(
  "scripts/hosted-bridge-smoke.test.cjs",
  "tolerates malformed timeout overrides",
  "hosted smoke malformed timeout regression test",
  failures,
);
assertContains(
  "scripts/hosted-bridge-smoke.cjs",
  "hasShellControlSyntax",
  "hosted smoke rejects shell control syntax in command overrides",
  failures,
);
assertContains(
  "scripts/hosted-bridge-smoke.cjs",
  "shell: false",
  "hosted smoke runs Bridge command through argv instead of shell",
  failures,
);
assertContains(
  "scripts/hosted-bridge-smoke.test.cjs",
  "rejects shell syntax in command overrides",
  "hosted smoke shell syntax override regression test",
  failures,
);
assertContains(
  "scripts/hosted-bridge-smoke.cjs",
  "unterminated quote",
  "hosted smoke rejects malformed quoted Bridge command overrides",
  failures,
);
assertContains(
  "scripts/hosted-bridge-smoke.test.cjs",
  "rejects malformed quoted command overrides",
  "hosted smoke malformed quote command override regression test",
  failures,
);
assertContains(
  "scripts/hosted-bridge-smoke.cjs",
  "laf-hosted-api",
  "hosted smoke API health identity check",
  failures,
);
assertContains(
  "scripts/hosted-bridge-smoke.cjs",
  "assertBrowserOriginPreflight",
  "hosted smoke browser CORS preflight check",
  failures,
);
assertContains(
  "scripts/hosted-bridge-smoke.cjs",
  "access-control-allow-credentials",
  "hosted smoke verifies credentialed CORS preflight",
  failures,
);
assertContains(
  "scripts/hosted-bridge-smoke.cjs",
  "SameSite=None",
  "hosted smoke verifies split-origin auth cookies",
  failures,
);
assertContains(
  "scripts/hosted-bridge-smoke.cjs",
  'request("auth/session",',
  "hosted smoke verifies auth cookie session restore",
  failures,
);
assertContains(
  "scripts/hosted-bridge-smoke.cjs",
  "assertBrowserCredentialedResponse(session.headers)",
  "hosted smoke verifies auth session CORS credential headers",
  failures,
);
assertContains(
  "scripts/hosted-bridge-smoke.test.cjs",
  "GET auth/session",
  "hosted smoke auth session regression test",
  failures,
);
assertContains(
  "scripts/hosted-bridge-smoke.test.cjs",
  "req.headers.origin",
  "hosted smoke auth session origin regression test",
  failures,
);
assertContains(
  "scripts/hosted-bridge-smoke.test.cjs",
  "OPTIONS bridge/pairing/start",
  "hosted smoke browser CORS preflight regression test",
  failures,
);
assertContains(
  "scripts/hosted-bridge-smoke.test.cjs",
  "SameSite=None",
  "hosted smoke split-origin auth cookie regression test",
  failures,
);
assertContains(
  "scripts/hosted-bridge-smoke.cjs",
  'model_mode: "my_bridge"',
  "hosted smoke uses LAF Bridge task mode",
  failures,
);
assertContains(
  "scripts/hosted-bridge-smoke.cjs",
  'mode: "my_bridge"',
  "hosted smoke creates LAF Bridge execution plans",
  failures,
);
assertContains(
  "scripts/hosted-bridge-smoke.cjs",
  "exposed legacy team_bridge availability",
  "hosted smoke rejects legacy team Bridge availability",
  failures,
);
assertContains(
  "scripts/hosted-bridge-smoke.cjs",
  "pairing response exposed raw pairing code",
  "hosted smoke raw pairing code guard",
  failures,
);
assertContains(
  "scripts/hosted-bridge-smoke.cjs",
  "pairing response must expose only commands.pair",
  "hosted smoke exact pairing command object guard",
  failures,
);
assertContains(
  "scripts/hosted-bridge-smoke.cjs",
  'task.body?.task?.execution_mode === "managed_checkout"',
  "hosted smoke verifies managed checkout task payload",
  failures,
);
assertContains(
  "scripts/hosted-bridge-smoke.cjs",
  "task response exposed local worktree_path",
  "hosted smoke verifies task payload hides local paths",
  failures,
);
assertContains(
  "scripts/hosted-bridge-smoke.cjs",
  "execution plan did not include the hosted project slug",
  "hosted smoke verifies plan policy uses project_slug",
  failures,
);
assertContains(
  "scripts/hosted-bridge-smoke.cjs",
  "execution plan policy exposed legacy project_local_id",
  "hosted smoke verifies plan policy omits legacy project_local_id",
  failures,
);
assertNotContains(
  "scripts/hosted-bridge-smoke.test.cjs",
  "project_local_id",
  "hosted smoke mock should model current project_slug policy contract",
  failures,
);
assertContains(
  "scripts/hosted-bridge-smoke.cjs",
  "assertBridgeOnlyAvailability",
  "hosted smoke validates Bridge-only availability shape",
  failures,
);
assertContains(
  "scripts/hosted-bridge-smoke.test.cjs",
  "rejects legacy team_bridge availability",
  "hosted smoke legacy availability regression test",
  failures,
);
assertContains(
  "scripts/hosted-bridge-smoke.test.cjs",
  "rejects unavailable my_bridge without a reason",
  "hosted smoke unavailable Bridge reason regression test",
  failures,
);
assertContains(
  "scripts/hosted-bridge-smoke.cjs",
  "execution plan response exposed legacy binding_id",
  "hosted smoke rejects binding_id plan surface",
  failures,
);
assertContains(
  "scripts/hosted-bridge-smoke.cjs",
  "execution plan did not include the signed project GitHub repo URL",
  "hosted smoke verifies signed managed-checkout repo",
  failures,
);
assertContains(
  "scripts/hosted-bridge-smoke.cjs",
  "assertExecutionPlanSignature",
  "hosted smoke verifies Bridge execution plan signatures",
  failures,
);
assertContains(
  "scripts/hosted-bridge-smoke.cjs",
  "execution plan payload hash mismatch",
  "hosted smoke verifies Bridge execution plan payload hash",
  failures,
);
assertContains(
  "scripts/hosted-bridge-smoke.test.cjs",
  "signExecutionPlanForTest",
  "hosted smoke signature verification regression test",
  failures,
);
assertContains(
  "scripts/hosted-bridge-smoke.cjs",
  "execution logs were not visible through the browser API",
  "hosted smoke verifies browser-visible execution logs",
  failures,
);
assertContains(
  "scripts/hosted-bridge-smoke.test.cjs",
  "GET execution/plans/plan-1/events",
  "hosted smoke execution-event visibility regression test",
  failures,
);
assertContains(
  "scripts/hosted-bridge-smoke.cjs",
  "receipt did not expose changed file summary",
  "hosted smoke verifies changed file receipt",
  failures,
);
assertContains(
  "scripts/hosted-bridge-smoke.cjs",
  "receipt did not expose PR artifact",
  "hosted smoke verifies PR receipt artifact",
  failures,
);
assertContains(
  "scripts/hosted-bridge-smoke.test.cjs",
  "extraStatusCommand",
  "hosted smoke extra pairing command regression test",
  failures,
);
assertNotContains(
  "api/[...path].js",
  "setup: pairCommand",
  "duplicate Bridge pairing command alias",
  failures,
);
assertNotContains(
  "web/src/components/apps/SettingsApp.tsx",
  "commands.setup",
  "duplicate Bridge command alias UI fallback",
  failures,
);
assertContains(
  "web/src/components/apps/SettingsApp.tsx",
  "function visibleBridgePairCommand",
  "Settings UI Bridge pair command sanitizer",
  failures,
);
assertContains(
  "web/src/components/apps/SettingsApp.tsx",
  "return BRIDGE_PAIR_COMMAND_PREFIX;",
  "Settings UI only displays the pair-only Bridge command",
  failures,
);
assertContains(
  "web/src/components/apps/SettingsApp.test.tsx",
  "never displays server-provided pairing flags in the Bridge pair command",
  "Settings UI flagged pair command regression test",
  failures,
);
assertNotContains(
  "web/src/components/apps/SettingsApp.test.tsx",
  ["Bridge", "setup", "command"].join(" "),
  "Settings tests should describe fixed Bridge pair command plus setup code",
  failures,
);
assertContains(
  "web/src/components/apps/SettingsApp.test.tsx",
  "shows only the public npx command and setup code after creating Bridge pairing",
  "Settings UI public npx command render regression test",
  failures,
);
assertContains(
  "web/src/components/apps/SettingsApp.test.tsx",
  'const MALICIOUS_RAW_CODE = ["RAW", "CODE"].join("-")',
  "Settings UI ignores raw pairing codes and extra Bridge commands from the server",
  failures,
);
assertContains(
  "web/src/components/apps/SettingsApp.test.tsx",
  'const MALICIOUS_STATUS_COMMAND = ["laf-bridge", "status"].join(" ")',
  "Settings UI ignores internal Bridge status command from the server",
  failures,
);
assertContains(
  "web/src/components/apps/SettingsApp.test.tsx",
  "Node.DOCUMENT_POSITION_FOLLOWING",
  "Settings UI renders public Bridge command before setup code",
  failures,
);
assertNotContains(
  "web/src/components/apps/tasks/ProjectBridgeWorkspacePanel.tsx",
  "Use existing folder",
  "Tasks project workspace no longer exposes local folder commands",
  failures,
);
assertNotContains(
  "web/src/components/apps/tasks/ProjectBridgeWorkspacePanel.tsx",
  "laf-bridge link-project",
  "Tasks project workspace no longer exposes link-project commands",
  failures,
);
assertContains(
  "web/src/components/apps/TasksApp.test.tsx",
  "keeps the project workspace pair-only without folder commands",
  "project workspace pair-only command regression test",
  failures,
);
assertContains(
  "scripts/hosted-bridge-smoke.test.cjs",
  "npx --yes laf-bridge@latest",
  "hosted deploy smoke npx latest command coverage",
  failures,
);
assertNotContains(
  "scripts/hosted-bridge-smoke.cjs",
  "--start=false",
  "hosted smoke bypassing pair-start behavior",
  failures,
);
assertNotContains(
  "scripts/hosted-bridge-smoke.cjs",
  "--device-label",
  "hosted smoke should run the public no-flag pair command",
  failures,
);
assertNotContains(
  "scripts/hosted-bridge-smoke.cjs",
  'LAF_BRIDGE_ALLOW_INTERNAL_ARGS: "1"',
  "hosted smoke should not enable npx internal args",
  failures,
);
assertContains(
  "scripts/hosted-bridge-smoke.cjs",
  'spawnBridge(["pair"],',
  "hosted smoke runs only laf-bridge pair",
  failures,
);
assertNotContains(
  "scripts/hosted-bridge-smoke.cjs",
  'runBridge(["start"',
  "hosted smoke separate Bridge start command",
  failures,
);
assertContains(
  "scripts/hosted-bridge-smoke.cjs",
  'spawnBridge(["pair"],',
  "hosted smoke pair-started Bridge loop",
  failures,
);
assertContains(
  "docs/specs/HOSTED-DEPLOYMENT-RUNBOOK.md",
  "LAF_EXECUTION_PLAN_SIGNING_PUBLIC_KEY",
  "hosted execution plan signing key runbook",
  failures,
);
assertContains(
  "docs/specs/HOSTED-DEPLOYMENT-RUNBOOK.md",
  "Production pairing fails closed",
  "hosted production signing key requirement",
  failures,
);
assertContains(
  "docs/specs/HOSTED-DEPLOYMENT-RUNBOOK.md",
  "npm run hosted-bridge:keys -- --key-id",
  "hosted signing key generation runbook",
  failures,
);
assertContains(
  "docs/specs/HOSTED-DEPLOYMENT-RUNBOOK.md",
  "Use `.env.example` as the local/Vercel environment checklist",
  "hosted runbook points operators to env example",
  failures,
);
assertContains(
  ".env.example",
  "LAF_EXECUTION_PLAN_SIGNING_PRIVATE_KEY",
  "hosted env example includes execution plan private signing key",
  failures,
);
assertContains(
  ".env.example",
  "LAF_EXECUTION_PLAN_SIGNING_PUBLIC_KEY",
  "hosted env example includes execution plan public signing key",
  failures,
);
assertContains(
  ".env.example",
  "LAF_EXECUTION_PLAN_SIGNING_KEY_ID",
  "hosted env example includes execution plan signing key id",
  failures,
);
assertContains(
  ".env.example",
  "LAF_OFFICE_PUBLIC_API_BASE_URL",
  "hosted env example includes canonical server API base",
  failures,
);
assertContains(
  ".env.example",
  "VITE_LAF_API_BASE_URL",
  "hosted env example includes browser API base",
  failures,
);
assertContains(
  ".env.example",
  "docs/specs/HOSTED-DEPLOYMENT-RUNBOOK.md",
  "hosted env example links deployment runbook",
  failures,
);
assertContains(
  ".env.example",
  "npm run hosted-bridge:keys -- --key-id execution-plan-prod-YYYY-MM",
  "hosted env example points to signing key generator",
  failures,
);
assertNotContains(
  ".env.example",
  "laf-runner",
  "hosted env example should not mention legacy Runner package",
  failures,
);
assertContains(
  "docs/specs/HOSTED-DEPLOYMENT-RUNBOOK.md",
  "npm run hosted-bridge:preflight",
  "hosted deployment env preflight runbook",
  failures,
);
assertContains(
  "docs/specs/HOSTED-DEPLOYMENT-RUNBOOK.md",
  "npm run hosted-api:dev",
  "hosted API local rehearsal runbook",
  failures,
);
assertContains(
  "docs/specs/HOSTED-DEPLOYMENT-RUNBOOK.md",
  "npm run hosted-bridge:preflight -- --allow-localhost",
  "hosted API localhost rehearsal preflight runbook",
  failures,
);
assertContains(
  "docs/specs/HOSTED-DEPLOYMENT-RUNBOOK.md",
  "Production preflight must run without `--allow-localhost`",
  "hosted preflight production/local rehearsal boundary",
  failures,
);
assertContains(
  "docs/specs/HOSTED-DEPLOYMENT-RUNBOOK.md",
  "npm run hosted-bridge:schema",
  "hosted deployment final schema runbook",
  failures,
);
assertContains(
  "docs/specs/HOSTED-DEPLOYMENT-RUNBOOK.md",
  "unique 14-digit timestamp prefix",
  "hosted deployment migration version collision runbook",
  failures,
);
assertContains(
  "docs/specs/HOSTED-DEPLOYMENT-RUNBOOK.md",
  "supabase_migrations.schema_migrations",
  "hosted deployment Supabase migration version storage runbook",
  failures,
);
assertContains(
  "docs/specs/HOSTED-DEPLOYMENT-RUNBOOK.md",
  "github_actions_runs_on",
  "hosted deploy smoke GitHub Actions runs-on input runbook",
  failures,
);
assertContains(
  "docs/specs/HOSTED-DEPLOYMENT-RUNBOOK.md",
  "workflow_call",
  "hosted deploy smoke reusable workflow runbook",
  failures,
);
assertContains(
  "docs/specs/HOSTED-DEPLOYMENT-RUNBOOK.md",
  "VITE_LAF_API_BASE_URL",
  "split-origin hosted API web env runbook",
  failures,
);
assertContains(
  "docs/specs/HOSTED-DEPLOYMENT-RUNBOOK.md",
  "Bare\n  API hosts such as `api.example.com` normalize to `https://api.example.com/api`",
  "split-origin hosted API bare-host runbook",
  failures,
);
assertContains(
  "docs/specs/HOSTED-DEPLOYMENT-RUNBOOK.md",
  "LAF_OFFICE_PUBLIC_API_BASE_URL",
  "split-origin hosted API server env runbook",
  failures,
);
assertContains(
  "docs/specs/HOSTED-DEPLOYMENT-RUNBOOK.md",
  "canonical web origin",
  "split-origin hosted preflight CORS runbook",
  failures,
);
assertContains(
  "web/src/api/client.ts",
  "VITE_LAF_API_BASE_URL",
  "split-origin hosted API client env",
  failures,
);
assertContains(
  "web/src/api/client.ts",
  "looksLikeBareAPIHost(raw)",
  "split-origin hosted API client bare-host normalizer",
  failures,
);
assertContains(
  "web/src/api/client.test.ts",
  "normalizes a bare browser API host for split-origin deployments",
  "split-origin hosted API client bare-host regression test",
  failures,
);
assertContains(
  "scripts/hosted-env-preflight.cjs",
  "normalizeAPIBase",
  "split-origin hosted API preflight normalizer",
  failures,
);
assertContains(
  "scripts/hosted-env-preflight.test.cjs",
  "browser API base normalizer accepts bare hosts",
  "split-origin hosted API preflight bare-host regression test",
  failures,
);
assertContains(
  "scripts/hosted-env-preflight.cjs",
  "must include LAF_OFFICE_PUBLIC_HOST",
  "split-origin hosted API preflight allowed origin check",
  failures,
);
assertContains(
  "scripts/hosted-env-preflight.cjs",
  "LAF_OFFICE_PUBLIC_API_BASE_URL must match VITE_LAF_API_BASE_URL",
  "split-origin hosted API preflight public/browser base match",
  failures,
);
assertContains(
  "scripts/hosted-env-preflight.cjs",
  "bridge_setup_api_base",
  "hosted preflight reports effective Bridge setup API base",
  failures,
);
assertContains(
  "scripts/hosted-env-preflight.test.cjs",
  "preflight reports the effective Bridge setup API base",
  "hosted preflight effective Bridge setup API regression test",
  failures,
);
assertContains(
  "docs/specs/HOSTED-DEPLOYMENT-RUNBOOK.md",
  "effective Bridge setup API base",
  "hosted runbook documents Bridge setup API base preflight output",
  failures,
);
assertContains(
  "docs/specs/HOSTED-DEPLOYMENT-RUNBOOK.md",
  "`NEXT` hints",
  "hosted runbook documents actionable preflight remediation hints",
  failures,
);
assertContains(
  "scripts/hosted-env-preflight.cjs",
  "remediationHints",
  "hosted preflight emits actionable remediation hints",
  failures,
);
assertContains(
  "scripts/hosted-env-preflight.cjs",
  "npm run hosted-bridge:keys -- --dotenv --key-id execution-plan-prod-YYYY-MM",
  "hosted preflight signing key remediation hint",
  failures,
);
assertContains(
  "scripts/generate-execution-plan-keys.cjs",
  "function formatEnvFile",
  "hosted signing key generator supports dotenv output",
  failures,
);
assertContains(
  "scripts/generate-execution-plan-keys.test.cjs",
  "dotenv output is directly usable by hosted preflight",
  "hosted signing key dotenv output regression test",
  failures,
);
assertContains(
  "docs/specs/HOSTED-DEPLOYMENT-RUNBOOK.md",
  "hosted-bridge:keys -- --dotenv",
  "hosted runbook documents dotenv-compatible signing key output",
  failures,
);
assertContains(
  ".env.example",
  "hosted-bridge:keys -- --dotenv",
  "env example documents dotenv-compatible signing key output",
  failures,
);
assertContains(
  "scripts/hosted-env-preflight.test.cjs",
  "preflight failure output gives actionable setup hints without secrets",
  "hosted preflight remediation hint regression test",
  failures,
);
assertContains(
  "scripts/hosted-env-preflight.test.cjs",
  "preflight validates split-origin browser API base",
  "split-origin hosted API preflight regression test",
  failures,
);
assertContains(
  "scripts/hosted-env-preflight.cjs",
  "Use --allow-localhost only for local hosted-API rehearsals",
  "hosted preflight help scopes localhost allowance",
  failures,
);
assertContains(
  "scripts/hosted-env-preflight.cjs",
  "Loads .env and .env.local by default",
  "hosted preflight help documents dotenv loading",
  failures,
);
assertContains(
  "scripts/hosted-env-preflight.cjs",
  "function loadPreflightEnv",
  "hosted preflight loads local env files for readiness",
  failures,
);
assertContains(
  "scripts/hosted-env-preflight.cjs",
  "shellKeys.has(key)",
  "hosted preflight keeps shell env authoritative over env files",
  failures,
);
assertContains(
  "scripts/hosted-env-preflight.test.cjs",
  "preflight help keeps localhost allowance scoped to local rehearsal",
  "hosted preflight help localhost scope regression test",
  failures,
);
assertContains(
  "scripts/hosted-env-preflight.test.cjs",
  "preflight loads env files without leaking secret values",
  "hosted preflight dotenv loading regression test",
  failures,
);
assertContains(
  "docs/specs/HOSTED-DEPLOYMENT-RUNBOOK.md",
  "loads `.env` and",
  "hosted runbook documents preflight dotenv loading",
  failures,
);
assertContains(
  ".env.example",
  "reads .env and .env.local automatically",
  "env example documents preflight dotenv loading",
  failures,
);
assertContains(
  "scripts/hosted-env-preflight.test.cjs",
  "preflight rejects mismatched public and browser API bases",
  "split-origin hosted API mismatch regression test",
  failures,
);
assertContains(
  "web/src/api/client.test.ts",
  "configured cross-origin hosted API base",
  "split-origin hosted API client regression test",
  failures,
);
assertContains(
  "web/src/api/client.test.ts",
  "https://api.office.example/api/events",
  "split-origin hosted API SSE URL regression test",
  failures,
);
assertContains(
  "docs/specs/HOSTED-DEPLOYMENT-RUNBOOK.md",
  "SSE URL",
  "split-origin hosted API SSE runbook",
  failures,
);
assertContains(
  "docs/specs/HOSTED-DEPLOYMENT-RUNBOOK.md",
  "browser_origin",
  "hosted deploy smoke browser origin input runbook",
  failures,
);
assertContains(
  "docs/specs/HOSTED-DEPLOYMENT-RUNBOOK.md",
  "bridge_package",
  "hosted deploy smoke exact package input runbook",
  failures,
);
assertContains(
  "package.json",
  '"hosted-bridge:keys": "node scripts/generate-execution-plan-keys.cjs"',
  "hosted signing key generator script",
  failures,
);
assertContains(
  "package.json",
  '"hosted-bridge:preflight": "node scripts/hosted-env-preflight.cjs"',
  "hosted deployment env preflight script",
  failures,
);
assertContains(
  "package.json",
  '"hosted-bridge:readiness": "node scripts/hosted-bridge-readiness.cjs"',
  "hosted Bridge readiness script",
  failures,
);
assertContains(
  "scripts/hosted-bridge-readiness.cjs",
  "--expect-version",
  "hosted Bridge readiness forwards latest expected-version pinning to release gate",
  failures,
);
assertContains(
  "package.json",
  "scripts/hosted-bridge-readiness.test.cjs",
  "hosted Bridge readiness ops test",
  failures,
);
assertContains(
  "docs/specs/HOSTED-DEPLOYMENT-RUNBOOK.md",
  "npm run hosted-bridge:readiness",
  "hosted Bridge readiness runbook",
  failures,
);
assertContains(
  "docs/specs/HOSTED-DEPLOYMENT-RUNBOOK.md",
  "Go-Live Checklist",
  "hosted deployment runbook has ordered production checklist",
  failures,
);
assertContains(
  "docs/specs/HOSTED-DEPLOYMENT-RUNBOOK.md",
  "Hosted Bridge Deploy Smoke",
  "hosted deployment checklist includes deployed smoke gate",
  failures,
);
assertContains(
  "docs/specs/HOSTED-DEPLOYMENT-RUNBOOK.md",
  "readiness -- --bridge-package laf-bridge@<version>",
  "hosted deployment checklist validates exact Bridge package",
  failures,
);
assertContains(
  "scripts/hosted-bridge-readiness.cjs",
  "npm run hosted-bridge:schema",
  "hosted Bridge readiness schema gate",
  failures,
);
assertContains(
  "scripts/hosted-bridge-readiness.cjs",
  "npm run hosted-bridge:preflight",
  "hosted Bridge readiness preflight gate",
  failures,
);
assertContains(
  "scripts/hosted-bridge-readiness.cjs",
  "--bridge-package",
  "hosted Bridge readiness supports exact Bridge package validation",
  failures,
);
assertContains(
  "scripts/hosted-bridge-readiness.cjs",
  "--no-env-file",
  "hosted Bridge readiness can validate exported env without local env files",
  failures,
);
assertContains(
  "scripts/hosted-bridge-readiness.test.cjs",
  "readiness forwards dotenv and exact Bridge package options",
  "hosted Bridge readiness option forwarding regression test",
  failures,
);
assertContains(
  "docs/specs/HOSTED-DEPLOYMENT-RUNBOOK.md",
  "readiness -- --bridge-package",
  "hosted runbook documents exact Bridge package readiness",
  failures,
);
assertContains(
  "scripts/hosted-bridge-readiness.cjs",
  "npm run hosted-bridge:release-gate",
  "hosted Bridge readiness release gate",
  failures,
);
assertContains(
  "scripts/hosted-bridge-readiness.cjs",
  "readinessRemediationHints",
  "hosted Bridge readiness remediation hint",
  failures,
);
assertContains(
  "scripts/hosted-bridge-readiness.cjs",
  "set LAF_OFFICE_PUBLIC_HOST or VERCEL_URL plus the execution plan signing key envs",
  "hosted Bridge readiness names env blockers",
  failures,
);
assertContains(
  "scripts/hosted-bridge-readiness.cjs",
  "publish laf-bridge through the Release workflow",
  "hosted Bridge readiness names npm publish blocker",
  failures,
);
assertContains(
  "package.json",
  '"hosted-bridge:release-gate": "node scripts/hosted-bridge-release-gate.cjs"',
  "hosted Bridge release gate script",
  failures,
);
assertContains(
  "scripts/hosted-bridge-release-gate.cjs",
  "packageSpecPattern",
  "hosted Bridge release gate validates selected npm package",
  failures,
);
assertContains(
  "scripts/hosted-bridge-release-gate.cjs",
  "package spec must be laf-bridge@latest or an exact laf-bridge npm SemVer package without build metadata",
  "hosted Bridge release gate rejects non-Bridge npm packages",
  failures,
);
assertContains(
  "scripts/hosted-bridge-release-gate.cjs",
  "npm view laf-bridge version",
  "hosted Bridge release gate npm availability check",
  failures,
);
assertContains(
  "scripts/hosted-bridge-release-gate.cjs",
  "releaseGateRemediationHints",
  "hosted Bridge release gate emits actionable remediation hints",
  failures,
);
assertContains(
  "scripts/hosted-bridge-release-gate.cjs",
  "publish ${result.package_spec} through the Release workflow",
  "hosted Bridge release gate npm publish remediation hint",
  failures,
);
assertContains(
  "scripts/hosted-bridge-release-gate.cjs",
  "--expect-version",
  "hosted Bridge release gate can pin latest to the expected release version",
  failures,
);
assertContains(
  "scripts/hosted-bridge-release-gate.test.cjs",
  "latest dist-tag that does not match the expected release version",
  "hosted Bridge release gate tests latest dist-tag version pinning",
  failures,
);
assertContains(
  "scripts/hosted-bridge-release-gate.test.cjs",
  "release gate remediation hints are targeted and deduplicated",
  "hosted Bridge release gate remediation hint regression test",
  failures,
);
assertContains(
  "docs/specs/HOSTED-DEPLOYMENT-RUNBOOK.md",
  "release gate\nprints `NEXT` hints",
  "hosted runbook documents release gate remediation hints",
  failures,
);
assertContains(
  "scripts/hosted-bridge-release-gate.cjs",
  "npx --yes laf-bridge@latest pair --help",
  "hosted Bridge release gate pair help check",
  failures,
);
assertContains(
  "scripts/hosted-bridge-release-gate.cjs",
  "npx no-arg help",
  "hosted Bridge release gate no-arg help check",
  failures,
);
assertContains(
  "scripts/hosted-bridge-release-gate.cjs",
  "internalCommandProbes",
  "hosted Bridge release gate probes every internal command",
  failures,
);
assertContains(
  "scripts/hosted-bridge-release-gate.cjs",
  "function executableForCommand",
  "hosted Bridge release gate resolves platform command shims",
  failures,
);
assertContains(
  "scripts/hosted-bridge-release-gate.test.cjs",
  "release gate validates exact package specs against the selected version",
  "hosted Bridge release gate exact package regression test",
  failures,
);
assertContains(
  "scripts/hosted-bridge-release-gate.test.cjs",
  "release gate rejects package specs outside the public Bridge package",
  "hosted Bridge release gate package allowlist regression test",
  failures,
);
assertContains(
  "scripts/hosted-bridge-release-gate.test.cjs",
  "release gate help does not print internal command or pair flag examples",
  "hosted Bridge release gate public help regression test",
  failures,
);
assertContains(
  "scripts/hosted-bridge-release-gate.test.cjs",
  "release gate rejects package specs with build metadata",
  "hosted Bridge release gate rejects npm build metadata regression test",
  failures,
);
assertContains(
  "scripts/hosted-bridge-release-gate.test.cjs",
  "release gate rejects package specs that npm would normalize or reject",
  "hosted Bridge release gate rejects non-canonical npm SemVer regression test",
  failures,
);
assertContains(
  "scripts/hosted-bridge-release-gate.test.cjs",
  "PASS npx internal command rejection",
  "hosted Bridge release gate internal command regression test",
  failures,
);
assertContains(
  "scripts/hosted-bridge-release-gate.test.cjs",
  "release gate rejects no-arg help that exposes internal commands",
  "hosted Bridge release gate no-arg help regression test",
  failures,
);
assertContains(
  "scripts/hosted-bridge-release-gate.test.cjs",
  "release gate resolves npm and npx command shims on Windows",
  "hosted Bridge release gate Windows command shim regression test",
  failures,
);
assertContains(
  "package.json",
  "scripts/hosted-bridge-deploy-inputs.test.cjs",
  "hosted Bridge deploy input validator ops test",
  failures,
);
assertContains(
  "scripts/hosted-bridge-deploy-inputs.test.cjs",
  "deploy smoke input validator rejects local or non-api deployment URLs",
  "hosted Bridge deploy input localhost/API URL regression test",
  failures,
);
assertContains(
  ".github/workflows/ci.yml",
  "npm run hosted-bridge:ops:test",
  "hosted Bridge operations tooling CI",
  failures,
);
assertContains(
  ".github/workflows/ci.yml",
  "npm run hosted-bridge:schema",
  "hosted Bridge final schema CI",
  failures,
);
assertContains(
  "package.json",
  '"hosted-bridge:schema": "node scripts/check-hosted-bridge-schema.cjs"',
  "hosted Bridge final schema script",
  failures,
);
assertContains(
  "scripts/hosted-env-preflight.cjs",
  "execution plan signing PEM values must contain real newlines",
  "hosted signing key PEM newline guard",
  failures,
);
assertContains(
  "api/[...path].js",
  "execution plan signing keys are not configured",
  "production execution plan signing key guard",
  failures,
);
assertContains(
  "api/[...path].js",
  "execution plan signing key id is not configured",
  "production execution plan signing key id guard",
  failures,
);
assertContains(
  "api/[...path].js",
  "function looksLikeBridgeToken",
  "hosted API keeps Bridge tokens out of browser user sessions",
  failures,
);
assertContains(
  "api/hosted-api.test.js",
  "bridgeTokenOnUserRoute",
  "hosted API Bridge token/user token separation regression test",
  failures,
);
assertContains(
  "api/[...path].js",
  "function pairingCommandAPIURL",
  "production canonical Bridge pairing API URL guard",
  failures,
);
assertContains(
  "api/[...path].js",
  "canonical hosted API URL is not configured",
  "production canonical Bridge pairing API URL failure",
  failures,
);
assertContains(
  "api/[...path].js",
  "LAF_OFFICE_PUBLIC_API_BASE_URL",
  "production canonical Bridge API base env support",
  failures,
);
assertContains(
  "api/[...path].js",
  "function normalizeConfiguredPublicOrigin",
  "canonical public host origin normalization",
  failures,
);
assertContains(
  "api/[...path].js",
  "LAF_OFFICE_PUBLIC_HOST must be an origin without a path",
  "canonical public host path rejection",
  failures,
);
assertContains(
  "api/[...path].js",
  "LAF_OFFICE_PUBLIC_HOST must not point at localhost or a private network address",
  "canonical public host private network rejection",
  failures,
);
assertContains(
  "api/[...path].js",
  "function allowLocalHostedURLs",
  "development hosted API localhost rehearsal guard",
  failures,
);
assertContains(
  "api/[...path].js",
  "function normalizeAllowedOrigins",
  "hosted API normalizes configured browser CORS origins",
  failures,
);
assertContains(
  "api/hosted-api.test.js",
  "https://preview.laf.test/",
  "hosted API CORS origin normalization regression test",
  failures,
);
assertContains(
  "scripts/hosted-env-preflight.test.cjs",
  "office.example.com, https://app.example.com/",
  "hosted preflight allowed origin normalization regression test",
  failures,
);
assertContains(
  "api/[...path].js",
  "LAF_OFFICE_PUBLIC_HOST must use https",
  "production canonical public host https rejection",
  failures,
);
assertContains(
  "api/hosted-api.test.js",
  "https://127.0.0.1:3000",
  "production pairing private public host regression test",
  failures,
);
assertContains(
  "api/hosted-api.test.js",
  "https://api.example.com/api",
  "production pairing split-origin public API base regression test",
  failures,
);
assertContains(
  "api/hosted-api.test.js",
  'Object.keys(canonical.body.commands).sort(), ["pair"]',
  "hosted API pairing response exposes only commands.pair",
  failures,
);
assertContains(
  "api/hosted-api.test.js",
  'Object.keys(start.body.commands).sort(), ["pair"]',
  "hosted API development pairing response exposes only commands.pair",
  failures,
);
assertContains(
  "api/hosted-api.test.js",
  "development Bridge pairing allows localhost API rehearsal URLs",
  "development pairing localhost API rehearsal regression test",
  failures,
);
assertContains(
  "api/[...path].js",
  "function normalizeBridgePublicKey",
  "Bridge public key validation",
  failures,
);
assertContains(
  "api/[...path].js",
  "public_key must be an Ed25519 public key",
  "Bridge public key validation error",
  failures,
);
assertContains(
  "api/[...path].js",
  "provider must be codex or claude_code for LAF Bridge execution",
  "unsupported Bridge execution provider rejection",
  failures,
);
assertContains(
  "api/[...path].js",
  "selectBridgeExecutionDevice",
  "hosted Bridge execution uses shared device capability selection",
  failures,
);
assertContains(
  "api/hosted-api.test.js",
  "LAF Bridge has not detected Claude Code CLI",
  "hosted Bridge rejects requested providers missing on the paired device",
  failures,
);
assertContains(
  "docs/specs/HOSTED-BRIDGE-PROTOCOL.md",
  "Status: Bridge-only hosted execution contract",
  "hosted Bridge protocol declares Bridge-only contract",
  failures,
);
assertContains(
  "docs/specs/HOSTED-DEPLOYMENT-RUNBOOK.md",
  "Status: Bridge-only hosted execution runbook",
  "hosted deployment runbook declares Bridge-only operation",
  failures,
);
assertContains(
  "docs/specs/HOSTED-PRODUCT-BOUNDARY.md",
  "Status: Bridge-only hosted product boundary",
  "hosted product boundary declares Bridge-only operation",
  failures,
);
assertContains(
  "docs/specs/HOSTED-PRODUCT-BOUNDARY.md",
  "project-scoped LAF Bridge execution requires the repo URL",
  "hosted product boundary requires repo URL for Bridge managed checkout",
  failures,
);
assertContains(
  "docs/specs/HOSTED-BRIDGE-PROTOCOL.md",
  "GET /bridge/devices/{device_id}/pending-plans",
  "Bridge pending-plan API",
  failures,
);
assertContains(
  "docs/specs/HOSTED-BRIDGE-PROTOCOL.md",
  "plan_signing_public_key",
  "Bridge plan signing key pairing contract",
  failures,
);
assertNotContains(
  "docs/specs/HOSTED-BRIDGE-PROTOCOL.md",
  "laf-bridge start",
  "separate Bridge start command in hosted protocol",
  failures,
);
assertContains(
  "supabase/migrations/20260519000000_bridge_only_execution_surface.sql",
  "drop table if exists public.runner_jobs cascade",
  "Bridge-only cleanup migration",
  failures,
);
assertContains(
  "supabase/migrations/20260520000000_bridge_only_model_constraints.sql",
  "set mode = 'my_bridge'",
  "Bridge-only legacy workspace mode normalization",
  failures,
);
assertContains(
  "supabase/migrations/20260520000000_bridge_only_model_constraints.sql",
  "check (mode in ('laf_model', 'my_bridge', 'record_only'))",
  "Bridge-only execution plan mode constraint",
  failures,
);
assertContains(
  "supabase/migrations/20260520000000_bridge_only_model_constraints.sql",
  "check (device_kind in ('desktop'))",
  "Bridge-only device kind constraint",
  failures,
);
assertContains(
  ".github/workflows/ci.yml",
  "npm run hosted-bridge:smoke:test",
  "hosted Bridge CI smoke",
  failures,
);
assertContains(
  ".github/workflows/ci.yml",
  "GOOS=windows GOARCH=amd64 go build -o laf-bridge.exe ./cmd/laf-bridge",
  "Windows Bridge CI build",
  failures,
);
assertContains(
  "cmd/laf-bridge/main.go",
  'fmt.Fprintf(stdout, "laf-bridge v%s\\n", buildinfo.Current().Version)',
  "Bridge CLI version output for npx release smoke",
  failures,
);
assertContains(
  "cmd/laf-bridge/main.go",
  "usage: laf-bridge pair",
  "single-command Bridge root help",
  failures,
);
assertContains(
  "cmd/laf-bridge/main_test.go",
  "TestResolvePairInputsPrefersSetupCodeAPIURL",
  "Bridge CLI setup code API URL precedence regression test",
  failures,
);
assertContains(
  "cmd/laf-bridge/main_test.go",
  "TestRunPairStartsDaemonLoopByDefault",
  "Bridge CLI pair command starts the Bridge loop by default",
  failures,
);
assertContains(
  "cmd/laf-bridge/main_test.go",
  "TestRunPairStartsBridgeLoopWhenOnceRequested",
  "Bridge CLI pair command can smoke the loop without a separate start command",
  failures,
);
assertContains(
  "cmd/laf-bridge/main_test.go",
  "TestRunPairAutoApprovesWorkspaceWritePlan",
  "Bridge CLI pair-started loop can execute hosted plans",
  failures,
);
assertContains(
  "cmd/laf-bridge/main_test.go",
  '"status"',
  "Bridge CLI help hides internal status command regression test",
  failures,
);
assertContains(
  "cmd/laf-bridge/main_test.go",
  '"doctor"',
  "Bridge CLI help hides internal doctor command regression test",
  failures,
);
assertContains(
  "cmd/laf-bridge/main_test.go",
  '"providers"',
  "Bridge CLI help hides internal providers command regression test",
  failures,
);
assertContains(
  "cmd/laf-bridge/main_test.go",
  "https://stale.example.com/api",
  "Bridge CLI ignores stale env API URL when setup code embeds API URL",
  failures,
);
assertContains(
  "api/[...path].js",
  'const pairCommand = "npx laf-bridge pair";',
  "hosted Bridge no-arg pair command",
  failures,
);
assertContains(
  "api/[...path].js",
  "my_bridge requires a GitHub repo for managed checkout",
  "pair-only managed checkout requires hosted repo metadata",
  failures,
);
assertContains(
  "api/[...path].js",
  "my_bridge uses managed checkout; local binding execution is not supported",
  "hosted execution rejects legacy local binding requests",
  failures,
);
assertContains(
  "api/[...path].js",
  "function hostedTaskExecutionMode(project)",
  "hosted API owns task managed-checkout mode selection",
  failures,
);
assertContains(
  "api/[...path].js",
  'if (mode === "office") return "office";',
  "hosted task public execution mode allowlist",
  failures,
);
assertContains(
  "api/[...path].js",
  'delete task.worktree_path;',
  "hosted task responses omit local filesystem paths",
  failures,
);
assertNotContains(
  "supabase/migrations/20260509000000_hosted_control_plane.sql",
  "worktree_path text",
  "fresh hosted task schema should not store local filesystem paths",
  failures,
);
assertContains(
  "supabase/migrations/20260519000000_bridge_only_execution_surface.sql",
  "drop column if exists worktree_path",
  "Bridge-only cleanup drops legacy task local path column",
  failures,
);
assertContains(
  "scripts/check-hosted-bridge-schema.cjs",
  'tasks: ["worktree_path"]',
  "schema checker tracks removed task local path field",
  failures,
);
assertNotContains(
  "api/[...path].js",
  "body.execution_mode ||",
  "hosted task creation should not accept browser-owned execution mode",
  failures,
);
assertContains(
  "api/[...path].js",
  "project_slug: project.local_id || project.id",
  "hosted execution plan signs hosted project slug for managed checkout",
  failures,
);
assertNotContains(
  "api/[...path].js",
  "project_local_id: project.local_id",
  "hosted execution plan policy should not emit local-binding-like project id",
  failures,
);
assertContains(
  "internal/bridge/workspace.go",
  "ProjectSlug",
  "Bridge managed checkout policy uses hosted project slug",
  failures,
);
assertContains(
  "internal/bridge/workspace_test.go",
  "AcceptsLegacyProjectLocalID",
  "Bridge keeps compatibility with older signed project_local_id plans",
  failures,
);
assertContains(
  "docs/specs/HOSTED-BRIDGE-PROTOCOL.md",
  "hosted project slug",
  "hosted Bridge protocol documents project slug managed checkout key",
  failures,
);
assertContains(
  "api/[...path].js",
  "const capable = online.filter(bridgeDeviceHasSupportedLocalCLI);",
  "LAF Bridge availability requires a supported local CLI",
  failures,
);
assertContains(
  "api/[...path].js",
  'bridgeDeviceSupportsProvider(device, "codex")',
  "LAF Bridge availability default device matches preferred Codex runtime",
  failures,
);
assertContains(
  "api/hosted-api.test.js",
  'mixedBridgeCLIs.body.my_bridge.default_device_id, "bridge-codex"',
  "LAF Bridge availability default device/provider regression test",
  failures,
);
assertContains(
  "api/hosted-api.test.js",
  "defaults to a Codex-capable Bridge when providers are mixed",
  "LAF Bridge execution default device/provider regression test",
  failures,
);
assertContains(
  "api/hosted-api.test.js",
  "does not fall back from another user's requested Bridge",
  "LAF Bridge execution requested-device ownership regression test",
  failures,
);
assertContains(
  "api/hosted-api.test.js",
  "bridge-other-user",
  "LAF Bridge execution rejects another user's requested Bridge",
  failures,
);
assertContains(
  "api/hosted-api.test.js",
  "ownUnsupportedCLI.body.my_bridge.reason, \"no supported local CLI detected\"",
  "LAF Bridge unsupported CLI availability regression test",
  failures,
);
assertContains(
  "api/hosted-api.test.js",
  "permission required: bridge:execute_own",
  "LAF Bridge execute permission availability regression test",
  failures,
);
assertContains(
  "api/hosted-api.test.js",
  "hosted home bridge chat requires a supported local CLI before creating a plan",
  "home Bridge chat requires supported local CLI before plan creation",
  failures,
);
assertContains(
  "api/[...path].js",
  "homeBridgeFailureDetail",
  "home Bridge chat maps internal execution failures before display",
  failures,
);
assertContains(
  "api/hosted-api.test.js",
  "hosted home bridge chat explains missing Bridge execution permission",
  "home Bridge chat execute permission failure regression test",
  failures,
);
assertContains(
  "web/src/components/ModelModeToggle.tsx",
  '"no supported local CLI detected":',
  "LAF Bridge UI maps hosted unsupported CLI reason",
  failures,
);
assertContains(
  "web/src/components/ModelModeToggle.test.tsx",
  'reason: "no supported local CLI detected"',
  "LAF Bridge UI unsupported CLI reason regression test",
  failures,
);
assertContains(
  "web/src/components/ModelModeToggle.tsx",
  '"permission required: bridge:execute_own":',
  "LAF Bridge model toggle maps execute permission blocker",
  failures,
);
assertContains(
  "web/src/components/apps/TasksApp.tsx",
  "taskBridgeUnavailableReason",
  "Tasks UI maps hosted Bridge blocker reasons before display",
  failures,
);
assertContains(
  "web/src/components/apps/TasksApp.test.tsx",
  "shows a friendly Bridge blocker when execution permission is missing",
  "Tasks UI execute permission blocker regression test",
  failures,
);
assertContains(
  "web/src/components/apps/TasksApp.test.tsx",
  "shows a friendly Bridge blocker when no supported local CLI is detected",
  "Tasks UI unsupported CLI blocker regression test",
  failures,
);
assertNotContains(
  "api/[...path].js",
  "project local bindings are localhost-only",
  "hosted API should not keep project local binding route text",
  failures,
);
assertNotContains(
  "api/[...path].js",
  "requestHostIsLoopback(req)",
  "hosted API should not keep project local binding localhost gate",
  failures,
);
assertNotContains(
  "api/[...path].js",
  "before local execution",
  "hosted project readiness should describe Bridge managed checkout",
  failures,
);
assertContains(
  "web/src/lib/i18n.ts",
  "Bridge managed checkout are ready",
  "hosted Tasks repo readiness copy should describe Bridge managed checkout",
  failures,
);
assertContains(
  "web/src/lib/i18n.ts",
  "Bridge managed checkouts: uncommitted branch work stays on disk",
  "local shred copy should preserve Bridge managed checkouts wording",
  failures,
);
assertNotContains(
  "web/src/lib/i18n.ts",
  "local worktrees are ready",
  "hosted Tasks repo readiness copy must not expose local worktree wording",
  failures,
);
assertNotContains(
  "web/src/lib/i18n.ts",
  "Task worktrees",
  "settings copy should not expose task worktree wording",
  failures,
);
assertNotContains(
  "web/src/lib/i18n.ts",
  "태스크 worktree",
  "Korean settings copy should not expose task worktree wording",
  failures,
);
assertContains(
  "docs/specs/PROJECT-TASK-TRACKING-MVP.md",
  "Bridge-managed coding tasks",
  "project task MVP should describe Bridge-managed coding tasks",
  failures,
);
assertNotContains(
  "docs/specs/PROJECT-TASK-TRACKING-MVP.md",
  "local_worktree",
  "project task MVP should not expose internal execution mode",
  failures,
);
assertContains(
  "docs/specs/meta-ai-agent-company.md",
  "LAF Bridge managed checkouts",
  "meta agent company doc should route code work through Bridge managed checkouts",
  failures,
);
assertNotContains(
  "docs/specs/meta-ai-agent-company.md",
  "per-agent worktrees",
  "meta agent company doc should not describe per-agent worktrees as product surface",
  failures,
);
assertContains(
  "docs/specs/claude-codex-squad.md",
  "LAF Bridge managed checkout isolation",
  "Claude/Codex squad doc should use Bridge managed checkout isolation",
  failures,
);
assertNotContains(
  "docs/specs/claude-codex-squad.md",
  "agent worktrees",
  "Claude/Codex squad doc should not expose old agent worktree wording",
  failures,
);
assertContains(
  "docs/specs/AGENT-MEMORY-PACKETS.md",
  "managed checkout fields",
  "agent memory packet doc should describe managed checkout fields",
  failures,
);
assertContains(
  "docs/specs/HARNESS-RATCHET.md",
  "LAF Bridge managed checkout isolation",
  "harness ratchet should describe Bridge managed checkout isolation",
  failures,
);
assertNotContains(
  "docs/specs/HARNESS-RATCHET.md",
  "worktree isolation",
  "harness ratchet should not expose old worktree isolation wording",
  failures,
);
assertContains(
  "web/src/api/__fixtures__/notebook-mock.ts",
  "Link the managed checkout or artifact that changed.",
  "notebook fixture should use managed checkout language",
  failures,
);
assertNotContains(
  "web/src/api/__fixtures__/notebook-mock.ts",
  "Link the worktree",
  "notebook fixture should not expose worktree language",
  failures,
);
assertNotContains(
  "web/src/lib/uiText.ts",
  "your local workspace",
  "wiki footer should not frame content rights around a local workspace product",
  failures,
);
assertNotContains(
  "web/src/lib/uiText.ts",
  "로컬 워크스페이스 조건",
  "Korean wiki footer should not frame content rights around a local workspace product",
  failures,
);
assertNotContains(
  "docs/specs/AUTH-SESSIONS-MVP.md",
  "local workspace teams",
  "auth historical spec should not leak local workspace team wording",
  failures,
);
assertContains(
  "internal/commands/cmd_superworkflow.go",
  "LAF Bridge managed checkout isolation rules remain intact",
  "superworkflow review should use Bridge managed checkout wording",
  failures,
);
assertNotContains(
  "internal/commands/cmd_superworkflow.go",
  "per-agent worktree rules",
  "superworkflow review should not expose per-agent worktree wording",
  failures,
);
assertContains(
  "internal/teammcp/server.go",
  "Managed checkouts: %d",
  "team task status should summarize managed checkouts",
  failures,
);
assertContains(
  "internal/teammcp/server.go",
  "office.PublicExecutionMode(task.ExecutionMode)",
  "team task listings should render public managed_checkout execution labels",
  failures,
);
assertNotContains(
  "internal/teammcp/server.go",
  "Isolated worktrees",
  "team task status should not expose isolated worktree wording",
  failures,
);
assertContains(
  "internal/team/runtime_state.go",
  "Managed checkouts: %d",
  "runtime state should summarize managed checkouts",
  failures,
);
assertNotContains(
  "internal/team/runtime_state.go",
  "Isolated worktrees",
  "runtime state should not expose isolated worktree wording",
  failures,
);
assertContains(
  "CLAUDE.md",
  "LAF Bridge managed checkout isolation",
  "CLAUDE guidance should use Bridge managed checkout isolation",
  failures,
);
assertContains(
  "CLAUDE.md",
  "Each agent works in its own LAF Bridge managed checkout",
  "CLAUDE architecture guidance should avoid raw git worktree wording",
  failures,
);
assertNotContains(
  "CLAUDE.md",
  "git worktree isolation",
  "CLAUDE guidance should not expose old worktree isolation wording",
  failures,
);
assertNotContains(
  "CLAUDE.md",
  "own git worktree",
  "CLAUDE guidance should not expose raw git worktree wording",
  failures,
);
assertContains(
  "claude-code-plugin/commands/LAF-Specific-Rules.md",
  "LAF Bridge managed checkout isolation",
  "Claude plugin rules should use Bridge managed checkout isolation",
  failures,
);
assertNotContains(
  "claude-code-plugin/commands/LAF-Specific-Rules.md",
  "isolated git worktree",
  "Claude plugin rules should not expose old git worktree wording",
  failures,
);
assertContains(
  "claude-code-plugin/commands/TDD-Guard.md",
  "managed checkout, MCP, or memory behavior",
  "TDD guard should describe managed checkout behavior",
  failures,
);
assertNotContains(
  "claude-code-plugin/commands/TDD-Guard.md",
  "worktree, MCP, or memory behavior",
  "TDD guard should not expose old worktree category wording",
  failures,
);
assertContains(
  "internal/team/broker.go",
  "assigned managed checkout is writable",
  "false block guidance should use managed checkout wording",
  failures,
);
assertNotContains(
  "internal/team/broker.go",
  "assigned local worktree is writable",
  "false block guidance should not expose local worktree wording",
  failures,
);
assertContains(
  "FORKING.md",
  "LAF Bridge managed checkout isolation",
  "forking guide should use Bridge managed checkout isolation",
  failures,
);
assertNotContains(
  "FORKING.md",
  "Git worktree isolation",
  "forking guide should not expose old worktree isolation wording",
  failures,
);
assertNotContains(
  "internal/teammcp/server.go",
  "office or local_worktree",
  "MCP schema descriptions should not expose internal local_worktree mode",
  failures,
);
assertContains(
  "internal/office/constants.go",
  "ExecutionModeManagedCheckout",
  "shared execution mode helpers should define public managed_checkout mode",
  failures,
);
assertContains(
  "internal/office/constants.go",
  "func PublicExecutionMode",
  "shared execution mode helpers should expose a public label normalizer",
  failures,
);
assertContains(
  "internal/team/task_lifecycle_validation.go",
  "case executionModeManagedCheckout:",
  "local team task API should accept managed_checkout as the public Bridge execution alias",
  failures,
);
assertContains(
  "internal/team/task_lifecycle_validation.go",
  "return executionModeLocalWorktree, nil",
  "local team task API should preserve legacy storage while accepting managed_checkout",
  failures,
);
assertContains(
  "internal/team/launcher.go",
  "publicExecutionMode(task.ExecutionMode)",
  "agent task notifications should render public managed_checkout labels",
  failures,
);
assertNotContains(
  "internal/team/launcher.go",
  "local_worktree build task",
  "agent task packets should not expose internal local_worktree build-task wording",
  failures,
);
assertNotContains(
  "internal/team/launcher.go",
  "execution_mode=local_worktree",
  "agent sandbox notes should not expose internal local_worktree execution mode",
  failures,
);
assertContains(
  "cmd/laf-office/channel_render.go",
  "displayExecutionMode(task.ExecutionMode)",
  "local TUI task metadata should render public managed_checkout labels",
  failures,
);
assertContains(
  "web/src/components/apps/tasks/taskDisplay.ts",
  '["work", "tree"].join("")',
  "task display keeps legacy generated-detail compatibility without literal worktree copy",
  failures,
);
assertNotContains(
  "web/src/components/apps/tasks/taskDisplay.ts",
  "No isolated .* worktree",
  "task display should not expose old generated worktree copy",
  failures,
);
assertContains(
  "scripts/laf-superworkflow-check.sh",
  "broader workspace checks",
  "superworkflow help should use workspace wording",
  failures,
);
assertNotContains(
  "scripts/laf-superworkflow-check.sh",
  "broader worktree checks",
  "superworkflow help should not use worktree wording",
  failures,
);
assertNotContains(
  "internal/setup/install.go",
  "installer binary",
  "CLI installer helper comment should not suggest native installer product",
  failures,
);
assertContains(
  "internal/provider/oneshot.go",
  "one-shot generation",
  "one-shot provider error should avoid generic local execution wording",
  failures,
);
assertNotContains(
  "internal/provider/oneshot.go",
  "one-shot local execution",
  "one-shot provider error should not expose local execution product wording",
  failures,
);
assertContains(
  "scripts/hosted-bridge-release-gate.cjs",
  "internal command rejection probes",
  "release gate help should describe internal command rejection without command examples",
  failures,
);
assertNotContains(
  "scripts/hosted-bridge-release-gate.cjs",
  "npx --yes laf-bridge@latest start",
  "release gate help should not print separate Bridge start command",
  failures,
);
assertNotContains(
  "web/src/styles/layout.css",
  "project-bridge-binding",
  "hosted Tasks CSS should not keep local binding UI classes",
  failures,
);
assertContains(
  "api/hosted-api.test.js",
  "hosted API does not expose project local binding routes",
  "hosted API omits project local binding routes",
  failures,
);
assertContains(
  "api/hosted-api.test.js",
  "hosted my_bridge execution plan can use managed checkout without local binding",
  "hosted my_bridge pair-only managed checkout test",
  failures,
);
assertContains(
  "api/hosted-api.test.js",
  'Object.hasOwn(created.body.plan, "binding_id"), false',
  "hosted Bridge E2E omits local binding field",
  failures,
);
assertContains(
  "api/hosted-api.test.js",
  "hosted my_bridge rejects local binding execution and requires own bridge execute permission",
  "hosted API rejects legacy local binding execution",
  failures,
);
assertContains(
  "api/hosted-api.test.js",
  "hosted task API owns managed checkout mode and never returns local paths",
  "hosted task public payload strips local paths",
  failures,
);
assertContains(
  "api/hosted-api.test.js",
  "Browser tried to force managed checkout",
  "hosted task API ignores browser-owned managed checkout requests without repo metadata",
  failures,
);
assertContains(
  "api/hosted-api.test.js",
  "browserRequestedManagedCheckout.body.task.execution_mode",
  "hosted task API proves browser-owned execution mode cannot force managed checkout",
  failures,
);
assertContains(
  "supabase/migrations/20260519000000_bridge_only_execution_surface.sql",
  "drop table if exists public.project_local_bindings cascade",
  "Bridge-only cleanup drops project local binding table",
  failures,
);
assertContains(
  "scripts/check-hosted-bridge-schema.cjs",
  '"project_local_bindings"',
  "schema checker tracks removed project local binding table",
  failures,
);
assertContains(
  "scripts/check-hosted-bridge-schema.cjs",
  'execution_plans: ["binding_id"]',
  "schema checker tracks removed execution binding field",
  failures,
);
assertContains(
  "internal/bridge/plan_test.go",
  "managed checkout plan without binding should validate",
  "Bridge validator managed checkout without binding",
  failures,
);
assertContains(
  "web/src/components/apps/TasksApp.test.tsx",
  "creates a LAF Bridge plan after pairing only when the project has a GitHub repo",
  "Tasks UI pair-only my_bridge execution test",
  failures,
);
assertNotContains(
  "web/src/components/apps/TasksApp.tsx",
  "getProjectLocalBindings",
  "Tasks UI does not query local bindings for Bridge execution",
  failures,
);
assertContains(
  "web/src/api/client.test.ts",
  "does not expose project local binding helpers to the hosted web client",
  "hosted web client omits local-binding API helpers",
  failures,
);
assertContains(
  "web/src/api/client.test.ts",
  "without browser-owned execution context",
  "hosted web client does not send task execution mode",
  failures,
);
assertNotContains(
  "web/src/api/client.test.ts",
  'execution_mode: "local_worktree"',
  "hosted web client should not create tasks with legacy local execution mode",
  failures,
);
assertContains(
  "web/src/components/apps/TaskDetailModal.tsx",
  'mode === "managed_checkout" || mode === "local_worktree"',
  "Task detail supports public managed checkout mode while preserving legacy rows",
  failures,
);
assertContains(
  "web/src/components/apps/TaskDetailModal.test.tsx",
  'execution_mode: "managed_checkout"',
  "Task detail tests exercise public managed checkout mode",
  failures,
);
assertNotContains(
  "web/src/components/apps/TaskDetailModal.test.tsx",
  'execution_mode: "local_worktree"',
  "Task detail tests should not use legacy local worktree mode as the product fixture",
  failures,
);
assertContains(
  "web/src/lib/i18n.ts",
  "Connect a GitHub repo for Bridge managed checkout",
  "hosted Bridge no-binding message points to managed checkout",
  failures,
);
assertContains(
  "docs/specs/HOSTED-BRIDGE-PROTOCOL.md",
  "not part of the hosted product contract",
  "hosted Bridge protocol keeps personal folders out of product requirements",
  failures,
);
assertContains(
  "docs/specs/HOSTED-BRIDGE-PROTOCOL.md",
  "it still routes through LAF Bridge devices using this same",
  "hosted Bridge protocol keeps workspace execution on the single Bridge protocol",
  failures,
);
assertNotContains(
  "docs/specs/HOSTED-BRIDGE-PROTOCOL.md",
  "Team-scoped device selection",
  "hosted Bridge protocol separate team-scoped local product wording",
  failures,
);
assertContains(
  "docs/specs/HOSTED-BRIDGE-PROTOCOL.md",
  "must not expose project local-binding",
  "hosted Bridge protocol removes local-binding APIs from product contract",
  failures,
);
assertNotContains(
  "docs/specs/HOSTED-BRIDGE-PROTOCOL.md",
  "under its local runtime",
  "hosted Bridge protocol should name Bridge workspace storage",
  failures,
);
assertNotContains(
  "docs/specs/HOSTED-BRIDGE-PROTOCOL.md",
  "execution requires a trusted project local binding",
  "hosted Bridge protocol must not require local binding",
  failures,
);
assertNotContains(
  "cmd/laf-bridge/main.go",
  "usage: laf-bridge <pair|status|doctor|providers|bindings|link-project|unlink-project|start|mcp-context>",
  "internal Bridge command list in root help",
  failures,
);
assertNotContains(
  "cmd/laf-bridge/main.go",
  "case \"link-project\"",
  "Bridge CLI no longer exposes project local binding commands",
  failures,
);
assertNotContains(
  "cmd/laf-bridge/main.go",
  "case \"bindings\"",
  "Bridge CLI no longer exposes binding inspection command",
  failures,
);
assertNotContains(
  "cmd/laf-bridge/main.go",
  "binding_count",
  "Bridge status output no longer exposes binding state",
  failures,
);
assertNotContains(
  "internal/bridge/config.go",
  "ProjectBinding",
  "Bridge config no longer stores project local bindings",
  failures,
);
assertNotContains(
  "internal/bridge/plan.go",
  "BindingID",
  "Bridge execution plan model no longer carries binding ids",
  failures,
);
assertNotContains(
  "internal/bridge/plan.go",
  '"binding_id"',
  "Bridge signature payload no longer carries binding ids",
  failures,
);
assertContains(
  "internal/bridge/workspace.go",
  "Project plans with a signed GitHub repo URL use Bridge's managed",
  "Bridge workspace selection is managed-checkout first",
  failures,
);
assertNotContains(
  "internal/bridge/workspace.go",
  "Personal bindings",
  "Bridge workspace selection no longer prefers personal bindings",
  failures,
);
assertContains(
  ".github/workflows/ci.yml",
  "laf-bridge root help exposed internal commands",
  "Bridge CLI help product-surface smoke",
  failures,
);
assertContains(
  ".github/workflows/release.yml",
  "Verify published LAF Bridge release gate",
  "published Bridge release gate smoke",
  failures,
);
assertContains(
  ".github/workflows/release.yml",
  'verify_bridge_package "laf-bridge@$VERSION"',
  "published Bridge release gate exact-version package check",
  failures,
);
assertContains(
  ".github/workflows/release.yml",
  'verify_bridge_package "laf-bridge@latest" --expect-version "$VERSION"',
  "published Bridge release gate verifies latest dist-tag points at the release version",
  failures,
);
assertContains(
  ".github/workflows/release.yml",
  'if [ "$NPM_TAG" = "latest" ]; then',
  "published Bridge release gate only verifies latest dist-tag for stable releases",
  failures,
);
assertContains(
  ".github/workflows/release.yml",
  'latest_version="$(npm view laf-bridge@latest version 2>/dev/null || true)"',
  "published Bridge release gate checks pre-release did not move latest",
  failures,
);
assertContains(
  ".github/workflows/release.yml",
  'pre-release ${VERSION} is published on laf-bridge@latest',
  "published Bridge release gate fails if pre-release pollutes latest",
  failures,
);
assertContains(
  ".github/workflows/release.yml",
  'OUT=$(npx --yes "laf-office@$VERSION" --version)',
  "published developer wrapper smoke verifies exact package version for stable and pre-release tags",
  failures,
);
assertContains(
  ".github/workflows/release.yml",
  "LATEST_OUT=$(npx --yes laf-office@latest --version)",
  "published developer wrapper smoke verifies latest dist-tag for stable releases",
  failures,
);
assertContains(
  "docs/specs/HOSTED-DEPLOYMENT-RUNBOOK.md",
  "Stable release smoke verifies both exact-version `laf-office@<version>` and\n`laf-office@latest`",
  "hosted deploy runbook documents laf-office latest smoke",
  failures,
);
assertContains(
  "docs/specs/HOSTED-DEPLOYMENT-RUNBOOK.md",
  "pre-release tags publish\nwith npm dist-tag `next`",
  "hosted deploy runbook documents pre-release npm dist-tag isolation",
  failures,
);
assertContains(
  "docs/specs/HOSTED-DEPLOYMENT-RUNBOOK.md",
  "fails if `laf-bridge@latest` resolves to that\npre-release version",
  "hosted deploy runbook documents pre-release latest pollution guard",
  failures,
);
assertContains(
  "docs/specs/HOSTED-DEPLOYMENT-RUNBOOK.md",
  "Release retries also reapply the intended npm dist-tag",
  "hosted deploy runbook documents npm dist-tag repair on release retry",
  failures,
);
assertContains(
  "docs/specs/HOSTED-DEPLOYMENT-RUNBOOK.md",
  "Dist-tag\nupdates are retried",
  "hosted deploy runbook documents npm dist-tag retry behavior",
  failures,
);
assertContains(
  ".github/workflows/release.yml",
  "release gate attempt ${attempt} failed; waiting for npm registry propagation",
  "published Bridge release gate retries npm propagation",
  failures,
);
assertContains(
  ".github/workflows/release.yml",
  "actions/checkout@",
  "published Bridge release gate script checkout",
  failures,
);
assertContains(
  ".github/workflows/release.yml",
  "npm run hosted-bridge:smoke:integration",
  "hosted Bridge release smoke integration",
  failures,
);
assertContains(
  ".github/workflows/ci.yml",
  'LAF_OFFICE_INSTALL_BINARY=laf-bridge LAF_OFFICE_INSTALL_REPO_BASE_URL="http://127.0.0.1:7457" bash scripts/install.sh',
  "Bridge install.sh real resolver smoke",
  failures,
);
assertContains(
  ".github/workflows/ci.yml",
  "Assert snapshot archives contain Bridge binaries",
  "Bridge release archive content smoke",
  failures,
);
assertContains(
  ".github/workflows/ci.yml",
  'tar -tzf "$windows_tarball" | grep -E \'(^|/)laf-bridge\\.exe$\'',
  "Windows Bridge release archive content smoke",
  failures,
);
assertContains(
  ".github/workflows/ci.yml",
  'tar -xOf "$tarball" "$bridge_member" | wc -c',
  "Bridge release archive non-empty binary smoke",
  failures,
);
assertContains(
  ".github/workflows/ci.yml",
  'tar -xOf "$windows_tarball" "$windows_bridge_member" | wc -c',
  "Windows Bridge release archive non-empty binary smoke",
  failures,
);
assertContains(
  "scripts/install.sh",
  "contained an empty",
  "install.sh refuses empty release binaries",
  failures,
);
assertContains(
  ".github/workflows/release.yml",
  "windows-latest",
  "Windows npx Bridge release smoke",
  failures,
);
assertContains(
  ".goreleaser.yml",
  "- windows",
  "Windows Bridge release artifact",
  failures,
);
assertContains(
  "npm-bridge/package.json",
  '"win32"',
  "Windows npx Bridge package support",
  failures,
);
assertContains(
  "npm-bridge/package.json",
  '"access": "public"',
  "public laf-bridge npm publish config",
  failures,
);
assertContains(
  "npm-bridge/bin/laf-bridge.js",
  "npx exposes only `laf-bridge pair`",
  "npx laf-bridge wrapper rejects internal commands",
  failures,
);
assertContains(
  "npm-bridge/bin/laf-bridge.js",
  "function printPublicUsage",
  "npx laf-bridge wrapper owns public help output",
  failures,
);
assertContains(
  "npm-bridge/bin/laf-bridge.js",
  "without pairing flags",
  "npx laf-bridge wrapper rejects internal pair flags",
  failures,
);
assertContains(
  "npm-bridge/bin/laf-bridge.js",
  "function validateBinaryPath",
  "npx laf-bridge wrapper validates resolved binaries before launch",
  failures,
);
assertContains(
  "npm-bridge/scripts/prepublish-check.js",
  "forbiddenPackageSurface",
  "npx laf-bridge prepublish guard scans package contents for legacy commands",
  failures,
);
assertContains(
  "npm-bridge/scripts/prepublish-check.js",
  '"package.json"',
  "npx laf-bridge prepublish guard scans public npm metadata",
  failures,
);
assertContains(
  "npm-bridge/scripts/prepublish-check.js",
  "internal Bridge command",
  "npx laf-bridge prepublish guard rejects internal command copy",
  failures,
);
assertContains(
  "npm-bridge/laf-bridge-package.test.cjs",
  "prepublish guard rejects legacy or internal public package copy",
  "npx laf-bridge prepublish content regression test",
  failures,
);
assertContains(
  "npm-bridge/laf-bridge-package.test.cjs",
  "package\\.json exposes legacy local execution command",
  "npx laf-bridge prepublish metadata regression test",
  failures,
);
assertContains(
  "scripts/hosted-bridge-smoke.cjs",
  "delete env.LAF_BRIDGE_ALLOW_INTERNAL_ARGS",
  "hosted smoke clears internal Bridge args opt-in",
  failures,
);
assertNotContains(
  "npm-bridge/bin/laf-bridge.js",
  "LAF_BRIDGE_ALLOW_INTERNAL_ARGS",
  "npx laf-bridge wrapper must not expose an internal args opt-in",
  failures,
);
assertContains(
  "npm-bridge/laf-bridge-package.test.cjs",
  "rejects internal commands from the npx surface",
  "npx laf-bridge pair-only surface regression test",
  failures,
);
assertContains(
  "npm-bridge/laf-bridge-package.test.cjs",
  "serves public help without launching the binary",
  "npx laf-bridge public help wrapper regression test",
  failures,
);
assertContains(
  "npm-bridge/laf-bridge-package.test.cjs",
  "preserves setup-code stdin through npx pair",
  "packed npx laf-bridge setup-code stdin regression test",
  failures,
);
assertContains(
  "npm-bridge/laf-bridge-package.test.cjs",
  "PACKED-SETUP-CODE",
  "packed npx laf-bridge setup-code stdin payload check",
  failures,
);
assertContains(
  "npm-bridge/laf-bridge-package.test.cjs",
  '"mcp-context"',
  "npx laf-bridge package test rejects non-start internal commands",
  failures,
);
assertContains(
  "npm-bridge/laf-bridge-package.test.cjs",
  "rejects internal pair flags even when automation env is set",
  "npx laf-bridge pair flag regression test",
  failures,
);
assertContains(
  "npm-bridge/laf-bridge-package.test.cjs",
  '"--device-label"',
  "npx laf-bridge prepublish rejects all flagged pair command variants",
  failures,
);
assertContains(
  "npm-bridge/laf-bridge-package.test.cjs",
  "rejects invalid binary overrides before launch",
  "npx laf-bridge invalid binary override regression test",
  failures,
);
assertContains(
  "npm-bridge/scripts/download-binary.js",
  "async function findExtractedBinary",
  "npx laf-bridge downloader searches extracted release archive",
  failures,
);
assertContains(
  "npm-bridge/laf-bridge-package.test.cjs",
  "laf-bridge downloader finds Bridge binary inside nested release archives",
  "npx laf-bridge nested release archive regression test",
  failures,
);
assertContains(
  "npm-bridge/scripts/download-binary.js",
  "Downloaded archive contained an empty",
  "npx laf-bridge downloader rejects empty release binaries",
  failures,
);
assertContains(
  "npm-bridge/laf-bridge-package.test.cjs",
  "laf-bridge downloader refuses empty Bridge binaries in release archives",
  "npx laf-bridge empty release binary regression test",
  failures,
);
assertContains(
  "npm-bridge/scripts/postinstall.js",
  "function isIntegrityFailureMessage",
  "npx laf-bridge postinstall classifies hard integrity failures",
  failures,
);
assertContains(
  "npm-bridge/scripts/postinstall.js",
  "Downloaded archive contained an empty",
  "npx laf-bridge postinstall refuses to soft-fail empty release binaries",
  failures,
);
assertContains(
  "npm-bridge/laf-bridge-package.test.cjs",
  "laf-bridge postinstall refuses to soft-fail archive integrity failures",
  "npx laf-bridge postinstall integrity failure regression test",
  failures,
);
assertContains(
  "npm-bridge/laf-bridge-package.test.cjs",
  'pkg.version === "0.0.0"',
  "npx laf-bridge package test tolerates release-injected version",
  failures,
);
assertContains(
  "npm-bridge/laf-bridge-package.test.cjs",
  'validatePackage({ ...pkg, version: "1.2.3" })',
  "npx laf-bridge package test validates release SemVer",
  failures,
);
assertContains(
  "npm-bridge/laf-bridge-package.test.cjs",
  'version: "1.2.3+build.1"',
  "npx laf-bridge package test rejects npm build metadata",
  failures,
);
assertContains(
  "npm-bridge/laf-bridge-package.test.cjs",
  '"1.2.3-alpha..1"',
  "npx laf-bridge package test rejects non-canonical npm SemVer",
  failures,
);
assertContains(
  "docs/specs/HOSTED-DEPLOYMENT-RUNBOOK.md",
  "without build metadata",
  "hosted deploy runbook documents npm build metadata restriction",
  failures,
);
assertContains(
  "scripts/hosted-bridge-real-api-smoke.test.cjs",
  "assertPackedBridgeNpxSurface",
  "packed npx laf-bridge real-binary public surface smoke",
  failures,
);
assertContains(
  "scripts/hosted-bridge-real-api-smoke.test.cjs",
  "noArgsHelp",
  "packed npx laf-bridge no-arg help smoke",
  failures,
);
assertContains(
  "scripts/hosted-bridge-real-api-smoke.test.cjs",
  '"--version"',
  "packed npx laf-bridge real-binary version smoke",
  failures,
);
assertContains(
  "scripts/hosted-bridge-real-api-smoke.test.cjs",
  "without pairing flags",
  "packed npx laf-bridge real-binary pair flag rejection smoke",
  failures,
);
assertContains(
  "npm-bridge/package.json",
  '"prepublishOnly": "node scripts/prepublish-check.js"',
  "laf-bridge prepublish release-version guard",
  failures,
);
assertContains(
  "npm-bridge/scripts/prepublish-check.js",
  "release placeholder 0.0.0",
  "laf-bridge placeholder version publish guard",
  failures,
);
assertContains(
  "npm/package.json",
  '"access": "public"',
  "public laf-office npm publish config",
  failures,
);
assertContains(
  "npm-bridge/laf-bridge-package.test.cjs",
  '"--version"',
  "npx Bridge version package smoke",
  failures,
);

if (failures.length > 0) {
  process.stderr.write("Bridge-only surface check failed:\n");
  for (const failure of failures) {
    process.stderr.write(`- ${failure}\n`);
  }
  process.exit(1);
}

process.stdout.write("Bridge-only product surface check passed.\n");
