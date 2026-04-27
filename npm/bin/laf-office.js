#!/usr/bin/env node
"use strict";

// Thin shim that spawns the native laf-office binary.
//
// Two responsibilities beyond a plain `spawn`:
//
//   1. Lazy download if postinstall was skipped (common with
//      `npm install --ignore-scripts` and with some `npx` cache behaviors).
//
//   2. Self-heal when npm's published `latest` has moved past the installed
//      version. `npm install -g` does NOT auto-upgrade, so a user who
//      installed weeks ago runs their old binary forever without this
//      check. We consult the npm registry (24h cache), and if a newer
//      release exists, we transparently serve it from an out-of-tree
//      version-keyed cache. The cached binary is verified against the
//      release's checksums.txt via the same path postinstall uses — there
//      is no path that runs an unverified binary.
//
// Escape hatches:
//   LAF_OFFICE_BINARY=/path/to/laf-office         — use a specific binary.
//   LAF_OFFICE_SKIP_VERSION_CHECK=1          — never query npm, always run the
//                                         locally-installed binary.

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawn } = require("node:child_process");
const { downloadBinary, packageVersion } = require("../scripts/download-binary");
const { getLatestVersion, compareVersions } = require("../scripts/version-check");

const installedBinary = path.join(__dirname, "laf-office");

function cachedBinaryPath(version) {
  return path.join(
    os.homedir(),
    ".laf-office",
    "cache",
    "binaries",
    `laf-office-${version}`,
  );
}

async function resolveInstalledBinary() {
  if (fs.existsSync(installedBinary)) return installedBinary;
  return downloadBinary();
}

async function ensureBinary() {
  if (process.env.LAF_OFFICE_BINARY && fs.existsSync(process.env.LAF_OFFICE_BINARY)) {
    return process.env.LAF_OFFICE_BINARY;
  }

  const installed = await resolveInstalledBinary();
  if (process.env.LAF_OFFICE_SKIP_VERSION_CHECK === "1") return installed;

  const installedVersion = packageVersion();
  const latestVersion = await getLatestVersion();
  if (!latestVersion) return installed;
  if (compareVersions(latestVersion, installedVersion) <= 0) return installed;

  // npm has a newer release than what's installed. Serve the cached newer
  // binary, downloading it once if absent. Integrity-verified via the same
  // checksums.txt path as postinstall — a failure anywhere in that chain
  // falls back to the installed binary rather than running something
  // unverified or crashing the command.
  const cachedPath = cachedBinaryPath(latestVersion);
  if (!fs.existsSync(cachedPath)) {
    try {
      await downloadBinary({
        version: latestVersion,
        targetPath: cachedPath,
      });
    } catch (err) {
      process.stderr.write(
        `laf-office: self-heal download of v${latestVersion} failed: ${err.message}\n` +
          `laf-office: running installed v${installedVersion}. ` +
          `Run \`npm install -g laf-office@latest\` to upgrade.\n`,
      );
      return installed;
    }
  }

  process.stderr.write(
    `laf-office: serving cached v${latestVersion} (installed is v${installedVersion}). ` +
      `Run \`npm install -g laf-office@latest\` to upgrade permanently, ` +
      `or set LAF_OFFICE_SKIP_VERSION_CHECK=1 to disable this check.\n`,
  );
  return cachedPath;
}

function run(resolvedPath) {
  const child = spawn(resolvedPath, process.argv.slice(2), {
    stdio: "inherit",
  });
  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
    } else {
      process.exit(code ?? 0);
    }
  });
  child.on("error", (err) => {
    process.stderr.write(`laf-office: failed to launch binary: ${err.message}\n`);
    process.exit(1);
  });
}

ensureBinary()
  .then(run)
  .catch((err) => {
    process.stderr.write(`laf-office: ${err.message}\n`);
    process.exit(1);
  });
