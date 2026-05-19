#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const npmSemVerPattern =
  "(?:0|[1-9][0-9]*)\\.(?:0|[1-9][0-9]*)\\.(?:0|[1-9][0-9]*)" +
  "(?:-(?:0|[1-9][0-9]*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)" +
  "(?:\\.(?:0|[1-9][0-9]*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*))*)?";
const semverPattern = new RegExp(`^${npmSemVerPattern}$`);
const expectedFiles = [
  "bin/laf-bridge.js",
  "scripts/download-binary.js",
  "scripts/prepublish-check.js",
  "scripts/postinstall.js",
  "README.md",
];
const packageSurfaceFiles = [...expectedFiles, "package.json"];
const forbiddenPackageSurface = [
  {
    label: "legacy local execution command",
    pattern: new RegExp("\\blaf-" + "runner\\b", "i"),
  },
  {
    label: "legacy local execution pairing command",
    pattern: new RegExp("\\b" + "runner" + "\\s+pair\\b", "i"),
  },
  {
    label: "separate Bridge start command",
    pattern: new RegExp("\\blaf-bridge(?:@[A-Za-z0-9._~+-]+)?\\s+start\\b", "i"),
  },
  {
    label: "internal Bridge command",
    pattern: new RegExp(
      "\\blaf-bridge(?:@[A-Za-z0-9._~+-]+)?\\s+(?:status|doctor|providers|bindings|link-project|unlink-project|mcp-context)\\b",
      "i",
    ),
  },
  {
    label: "flagged Bridge pair command",
    pattern: new RegExp(
      "\\blaf-bridge(?:@[A-Za-z0-9._~+-]+)?\\s+pair\\s+--(?!(?:help|h)(?:[=\\s]|$))[A-Za-z0-9][A-Za-z0-9-]*(?:[=\\s]|$)",
      "i",
    ),
  },
  {
    label: "internal args opt-in",
    pattern: new RegExp("\\b" + "LAF_BRIDGE_ALLOW" + "_INTERNAL_ARGS\\b"),
  },
];

function validatePackage(pkg) {
  const failures = [];
  if (pkg.name !== "laf-bridge") {
    failures.push(`package name must be laf-bridge, got ${pkg.name || "<missing>"}`);
  }
  if (!semverPattern.test(String(pkg.version || ""))) {
    failures.push(
      `package version must be npm-compatible SemVer without build metadata, got ${pkg.version || "<missing>"}`,
    );
  }
  if (pkg.version === "0.0.0") {
    failures.push("package version is still the release placeholder 0.0.0");
  }
  if (pkg.bin?.["laf-bridge"] !== "bin/laf-bridge.js") {
    failures.push("laf-bridge bin must point to bin/laf-bridge.js");
  }
  if (pkg.publishConfig?.access !== "public") {
    failures.push("laf-bridge must publish with public access");
  }
  const files = Array.isArray(pkg.files) ? [...pkg.files].sort() : [];
  if (JSON.stringify(files) !== JSON.stringify([...expectedFiles].sort())) {
    failures.push(`package files must be exactly: ${expectedFiles.join(", ")}`);
  }
  return failures;
}

function validatePackageFiles(packageRoot = path.join(__dirname, "..")) {
  const failures = [];
  for (const relPath of packageSurfaceFiles) {
    const absPath = path.join(packageRoot, relPath);
    if (!fs.existsSync(absPath)) {
      failures.push(`package file is missing: ${relPath}`);
      continue;
    }
    const text = fs.readFileSync(absPath, "utf8");
    for (const rule of forbiddenPackageSurface) {
      if (rule.pattern.test(text)) {
        failures.push(`${relPath} exposes ${rule.label}`);
      }
    }
  }
  return failures;
}

function main() {
  const pkgPath = path.join(__dirname, "..", "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  const failures = [
    ...validatePackage(pkg),
    ...validatePackageFiles(path.join(__dirname, "..")),
  ];
  if (failures.length > 0) {
    process.stderr.write("laf-bridge prepublish check failed:\n");
    for (const failure of failures) {
      process.stderr.write(`- ${failure}\n`);
    }
    process.stderr.write(
      "\nRelease workflow must set npm-bridge/package.json from the release tag before publishing.\n",
    );
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { validatePackage, validatePackageFiles };
