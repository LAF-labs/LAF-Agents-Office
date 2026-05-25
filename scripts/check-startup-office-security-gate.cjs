#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const highSeverity = new Set(["high", "critical"]);

function fail(message) {
  console.error(`[startup-office security] ${message}`);
  process.exitCode = 1;
}

function run(label, command, args, options = {}) {
  console.log(`\n[startup-office security] ${label}`);
  const result = spawnSync(command, args, {
    cwd: options.cwd || root,
    encoding: "utf8",
    stdio: "inherit",
  });
  if (result.status !== 0) {
    fail(`${label} failed`);
  }
}

function runCapture(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: options.cwd || root,
    encoding: "utf8",
  });
}

function stripAnsi(value) {
  return value.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "");
}

function trackedFiles() {
  const result = runCapture("git", ["ls-files", "-z"]);
  if (result.status !== 0) {
    fail("could not list tracked files");
    return [];
  }
  return result.stdout
    .split("\0")
    .filter(Boolean)
    .filter((file) => fs.existsSync(path.join(root, file)));
}

function secretlintFiles() {
  const binaryExtensions = new Set([
    ".avif",
    ".eot",
    ".gif",
    ".ico",
    ".jpeg",
    ".jpg",
    ".mp4",
    ".pdf",
    ".png",
    ".ttf",
    ".webm",
    ".woff",
    ".woff2",
  ]);
  const skippedLockfiles = new Set(["bun.lock", "package-lock.json"]);
  return trackedFiles().filter((file) => {
    if (skippedLockfiles.has(path.basename(file))) return false;
    return !binaryExtensions.has(path.extname(file).toLowerCase());
  });
}

function runSecretlint() {
  console.log("\n[startup-office security] full tracked-file secret scan");
  const bin = path.join(
    root,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "secretlint.cmd" : "secretlint",
  );
  if (!fs.existsSync(bin)) {
    fail("secretlint is not installed; run bun install or npm install first");
    return;
  }
  const files = secretlintFiles();
  for (let index = 0; index < files.length; index += 100) {
    const chunk = files.slice(index, index + 100);
    const result = spawnSync(bin, chunk, {
      cwd: root,
      encoding: "utf8",
      stdio: "inherit",
    });
    if (result.status !== 0) {
      fail("secretlint found a secret or scan error");
      return;
    }
  }
  console.log(`[startup-office security] secret scan passed (${files.length} tracked text files)`);
}

function extractAuditJson(output) {
  const clean = stripAnsi(output);
  for (const line of clean.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    try {
      return JSON.parse(trimmed);
    } catch {
      continue;
    }
  }
  return null;
}

function auditFindings(report) {
  if (!report || typeof report !== "object") return [];
  if (Array.isArray(report.vulnerabilities)) return report.vulnerabilities;
  if (Array.isArray(report.advisories)) return report.advisories;
  return Object.entries(report).flatMap(([packageName, entries]) => {
    if (!Array.isArray(entries)) return [];
    return entries.map((entry) => ({ packageName, ...entry }));
  });
}

function runDependencyAudit(label, cwd) {
  console.log(`\n[startup-office security] dependency audit: ${label}`);
  const result = runCapture("bun", ["audit", "--json", "--audit-level=high"], { cwd });
  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  const report = extractAuditJson(output);
  if (!report) {
    process.stdout.write(output);
    fail(`${label} audit did not produce parseable JSON`);
    return;
  }

  const findings = auditFindings(report);
  const severe = findings.filter((finding) =>
    highSeverity.has(String(finding.severity || "").toLowerCase()),
  );
  if (severe.length > 0) {
    for (const finding of severe) {
      const name = finding.packageName || finding.module_name || finding.name || "unknown";
      const title = finding.title || finding.url || "dependency advisory";
      console.error(`- ${name}: ${finding.severity} ${title}`);
    }
    fail(`${label} has high or critical dependency advisories`);
    return;
  }
  if (result.status !== 0) {
    process.stdout.write(output);
    fail(`${label} audit command failed`);
    return;
  }
  console.log(`[startup-office security] ${label} dependency audit passed`);
}

runSecretlint();
runDependencyAudit("root", root);
runDependencyAudit("web", path.join(root, "web"));
run("pure-cloud boundary", "npm", ["run", "startup-office:pure-cloud-boundary"]);
run("Supabase schema boundary", "npm", ["run", "startup-office:schema"]);
run("service-role access tests", "node", [
  "--test",
  "api/lib/hosted/serviceRoleAccess.test.js",
]);

if (!process.exitCode) {
  console.log("\n[startup-office security] passed");
}
