#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const checkedPaths = [
  "README.md",
  "LICENSE",
  "CONTRIBUTING.md",
  "SECURITY.md",
  ".env.example",
];

function read(root, relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function runReadinessCheck(root = path.resolve(__dirname, "..")) {
  const errors = [];

  for (const relativePath of checkedPaths) {
    if (!fs.existsSync(path.join(root, relativePath))) {
      errors.push(`${relativePath} is missing`);
    }
  }

  if (errors.length === 0) {
    requireIncludes(errors, read(root, "README.md"), "README.md", [
      "## Open Source",
      "[MIT License](LICENSE)",
      "[CONTRIBUTING.md](CONTRIBUTING.md)",
      "[SECURITY.md](SECURITY.md)",
      "npm run oss:readiness",
    ]);
    requireIncludes(errors, read(root, "LICENSE"), "LICENSE", ["MIT License"]);
    requireIncludes(errors, read(root, "CONTRIBUTING.md"), "CONTRIBUTING.md", [
      "## Local Setup",
      "## Useful Checks",
      "npm run oss:readiness",
      "SECURITY.md",
    ]);
    requireIncludes(errors, read(root, "SECURITY.md"), "SECURITY.md", [
      "## Reporting a Vulnerability",
      "tenant isolation",
      "secret handling",
    ]);
    assertNoExampleSecrets(errors, read(root, ".env.example"));
  }

  return { ok: errors.length === 0, errors, checkedPaths };
}

function requireIncludes(errors, body, label, needles) {
  for (const needle of needles) {
    if (!body.includes(needle)) {
      errors.push(`${label} must include ${JSON.stringify(needle)}`);
    }
  }
}

function assertNoExampleSecrets(errors, body) {
  const obviousSecret = /(sk-[A-Za-z0-9_-]{12,}|gh[opsu]_[A-Za-z0-9_]{20,})/;
  if (obviousSecret.test(body)) {
    errors.push(".env.example appears to contain a real token");
  }
}

function printResult(result) {
  if (result.ok) {
    return `open-source readiness check passed (${result.checkedPaths.length} files checked)`;
  }
  return [
    "open-source readiness check failed",
    ...result.errors.map((error) => `- ${error}`),
  ].join("\n");
}

if (require.main === module) {
  const result = runReadinessCheck();
  console.log(printResult(result));
  if (!result.ok) process.exitCode = 1;
}

module.exports = { printResult, runReadinessCheck };
