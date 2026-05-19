#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { binaryName, downloadBinary } = require("../scripts/download-binary");

const installedBinary = path.join(__dirname, binaryName());
const publicArgs = process.argv.slice(2);

function printPublicUsage(stream = process.stdout) {
  stream.write(
    [
      "usage: laf-bridge pair",
      "",
      "Pair this computer with a hosted LAF Office workspace.",
      "Create a setup code in Settings -> LAF Bridge, run this command, then paste the setup code when prompted.",
      "",
    ].join("\n"),
  );
}

function validatePublicArgs(args) {
  const command = args[0] || "";
  if (
    command === "" ||
    command === "help" ||
    command === "-h" ||
    command === "--help"
  ) {
    printPublicUsage();
    return false;
  }
  if (
    command === "version" ||
    command === "-version" ||
    command === "--version"
  ) {
    return true;
  }
  if (command === "pair") {
    if (args.length === 1 || (args.length === 2 && (args[1] === "-h" || args[1] === "--help"))) {
      if (args.length === 2) {
        printPublicUsage();
        return false;
      }
      return true;
    }
    process.stderr.write(
      "laf-bridge: npx exposes only `laf-bridge pair` without pairing flags.\n",
    );
    process.stderr.write("usage: laf-bridge pair\n");
    return false;
  }
  process.stderr.write(
    "laf-bridge: npx exposes only `laf-bridge pair` for hosted workspace pairing.\n",
  );
  process.stderr.write("usage: laf-bridge pair\n");
  return false;
}

async function ensureBinary() {
  const overrideBinary = String(process.env.LAF_BRIDGE_BINARY || "").trim();
  if (overrideBinary) {
    if (!fs.existsSync(overrideBinary)) {
      throw new Error(`LAF_BRIDGE_BINARY does not exist: ${overrideBinary}`);
    }
    return validateBinaryPath(overrideBinary, "LAF_BRIDGE_BINARY");
  }
  if (fs.existsSync(installedBinary)) {
    return validateBinaryPath(installedBinary, "installed laf-bridge binary");
  }
  return validateBinaryPath(await downloadBinary(), "downloaded laf-bridge binary");
}

function validateBinaryPath(binaryPath, label) {
  const stat = fs.statSync(binaryPath);
  if (!stat.isFile()) {
    throw new Error(`${label} must be a file: ${binaryPath}`);
  }
  if (stat.size <= 0) {
    throw new Error(`${label} is empty: ${binaryPath}`);
  }
  return binaryPath;
}

function run(resolvedPath) {
  const child = spawn(resolvedPath, publicArgs, {
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
    process.stderr.write(`laf-bridge: failed to launch binary: ${err.message}\n`);
    process.exit(1);
  });
}

if (!validatePublicArgs(publicArgs)) {
  if (
    publicArgs.length === 0 ||
    publicArgs[0] === "help" ||
    publicArgs[0] === "-h" ||
    publicArgs[0] === "--help" ||
    (publicArgs[0] === "pair" && (publicArgs[1] === "-h" || publicArgs[1] === "--help"))
  ) {
    process.exit(0);
  }
  process.exit(2);
}

ensureBinary()
  .then(run)
  .catch((err) => {
    process.stderr.write(`laf-bridge: ${err.message}\n`);
    process.exit(1);
  });
