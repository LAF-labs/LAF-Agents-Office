#!/usr/bin/env node
"use strict";

const path = require("node:path");
const { spawnSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");

const readinessChecks = [
  {
    args: ["run", "hosted-bridge:schema"],
    command: "npm",
    key: "schema",
    label: "Hosted Bridge schema manifest",
  },
  {
    args: ["run", "hosted-bridge:preflight"],
    command: "npm",
    key: "preflight",
    label: "Hosted deployment env preflight",
  },
  {
    args: ["run", "hosted-bridge:release-gate"],
    command: "npm",
    key: "release-gate",
    label: "Public laf-bridge npm release gate",
  },
];

function parseArgs(argv) {
  const args = { bridgeExpectedVersion: "", bridgePackage: "", json: false, preflightArgs: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--json") {
      args.json = true;
    } else if (arg === "--bridge-package") {
      i += 1;
      if (i >= argv.length) throw new Error("--bridge-package requires a package spec");
      args.bridgePackage = argv[i];
    } else if (arg.startsWith("--bridge-package=")) {
      args.bridgePackage = arg.slice("--bridge-package=".length);
    } else if (arg === "--expect-version") {
      i += 1;
      if (i >= argv.length) throw new Error("--expect-version requires an npm SemVer version");
      args.bridgeExpectedVersion = argv[i];
    } else if (arg.startsWith("--expect-version=")) {
      args.bridgeExpectedVersion = arg.slice("--expect-version=".length);
    } else if (arg === "--dotenv") {
      i += 1;
      if (i >= argv.length) throw new Error("--dotenv requires a path");
      args.preflightArgs.push("--dotenv", argv[i]);
    } else if (arg.startsWith("--dotenv=")) {
      args.preflightArgs.push("--dotenv", arg.slice("--dotenv=".length));
    } else if (arg === "--no-env-file") {
      args.preflightArgs.push("--no-env-file");
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  args.bridgeExpectedVersion = args.bridgeExpectedVersion.trim();
  args.bridgePackage = args.bridgePackage.trim();
  return args;
}

function runReadiness(options = {}) {
  const checks = options.checks || readinessChecksForOptions(options);
  const commandProbe =
    options.commandProbe || ((command, args, check) => runCommand(command, args, check, options));
  const log = options.log || (() => {});
  const results = [];

  for (const check of checks) {
    log(`[hosted-bridge-readiness] RUN ${check.key}: ${check.command} ${check.args.join(" ")}`);
    const result = commandProbe(check.command, check.args, check);
    const status = commandStatus(result);
    results.push({
      args: check.args,
      command: check.command,
      error: commandError(result, status),
      key: check.key,
      label: check.label,
      ok: status === 0,
      status,
    });
  }

  return {
    checks: results,
    ok: results.every((check) => check.ok),
  };
}

function readinessChecksForOptions(options = {}) {
  const preflightArgs = options.preflightArgs || [];
  const bridgeExpectedVersion = String(options.bridgeExpectedVersion || "").trim();
  const bridgePackage = String(options.bridgePackage || "").trim();
  return readinessChecks.map((check) => {
    if (check.key === "preflight" && preflightArgs.length > 0) {
      return { ...check, args: [...check.args, "--", ...preflightArgs] };
    }
    if (check.key === "release-gate" && bridgePackage) {
      const args = [...check.args, "--", "--package", bridgePackage];
      if (bridgeExpectedVersion) args.push("--expect-version", bridgeExpectedVersion);
      return { ...check, args };
    }
    if (check.key === "release-gate" && bridgeExpectedVersion) {
      return { ...check, args: [...check.args, "--", "--expect-version", bridgeExpectedVersion] };
    }
    return check;
  });
}

function runCommand(command, args, _check, options = {}) {
  return spawnSync(executableForCommand(command), args, {
    cwd: options.cwd || repoRoot,
    encoding: "utf8",
    env: options.env || process.env,
    shell: shellForCommand(command),
    stdio: options.stdio || "inherit",
    windowsHide: true,
  });
}

function executableForCommand(command, platform = process.platform) {
  if (platform === "win32" && command === "npm") {
    return "npm.cmd";
  }
  return command;
}

function shellForCommand(command, platform = process.platform) {
  return platform === "win32" && command === "npm";
}

function commandStatus(result = {}) {
  if (typeof result.status === "number") return result.status;
  if (typeof result.ok === "boolean") return result.ok ? 0 : 1;
  if (result.error || result.signal) return 1;
  return 1;
}

function commandError(result = {}, status = commandStatus(result)) {
  if (result.error) {
    return typeof result.error === "string" ? result.error : result.error.message;
  }
  if (result.signal) return `terminated by ${result.signal}`;
  const stderr = String(result.stderr || "").trim();
  if (stderr) return stderr;
  if (status !== 0) return `exit status ${status}`;
  return "";
}

function printText(result) {
  const lines = [];
  if (result.ok) {
    lines.push("[hosted-bridge-readiness] PASS hosted Bridge readiness gates passed");
  } else {
    lines.push("[hosted-bridge-readiness] FAIL hosted Bridge readiness gates blocked");
  }

  for (const check of result.checks) {
    lines.push(
      `[hosted-bridge-readiness] ${check.ok ? "PASS" : "FAIL"} ${check.key} - ${check.label}`,
    );
    if (!check.ok && check.error) {
      lines.push(`[hosted-bridge-readiness] ERROR ${check.error}`);
    }
  }

  for (const hint of readinessRemediationHints(result)) {
    lines.push(`[hosted-bridge-readiness] NEXT ${hint}`);
  }

  return `${lines.join("\n")}\n`;
}

function readinessRemediationHints(result) {
  if (result.ok) return [];
  const failedKeys = new Set(result.checks.filter((check) => !check.ok).map((check) => check.key));
  const hints = [];
  if (failedKeys.has("schema")) {
    hints.push("apply the hosted Bridge Supabase migrations, then rerun `npm run hosted-bridge:schema`");
  }
  if (failedKeys.has("preflight")) {
    hints.push(
      "set LAF_OFFICE_PUBLIC_HOST or VERCEL_URL plus the execution plan signing key envs in the deployment environment",
    );
    hints.push(
      "generate signing key envs with `npm run hosted-bridge:keys -- --dotenv --key-id execution-plan-prod-YYYY-MM`",
    );
  }
  if (failedKeys.has("release-gate")) {
    hints.push(
      "publish laf-bridge through the Release workflow, then verify `laf-bridge@latest` with `npm run hosted-bridge:release-gate`",
    );
  }
  hints.push(
    "rerun `npm run hosted-bridge:readiness` before enabling hosted pairing for new users",
  );
  return [...new Set(hints)];
}

function usage(message = "", exitCode = 0) {
  const out = message ? process.stderr : process.stdout;
  if (message) out.write(`${message}\n\n`);
  out.write(
    [
      "usage: node scripts/hosted-bridge-readiness.cjs [--json]",
      "       node scripts/hosted-bridge-readiness.cjs [--dotenv <path>] [--no-env-file] [--bridge-package <laf-bridge@version>] [--expect-version <version>]",
      "",
      "Runs the hosted Bridge deployment readiness gates and reports every blocker.",
      "Pass --no-env-file to make the preflight ignore local .env/.env.local files.",
      "Pass --bridge-package to validate an exact laf-bridge release before promoting latest.",
      "Pass --expect-version to require the selected laf-bridge package or latest dist-tag to resolve to that version.",
      "",
      "Checks:",
      "  npm run hosted-bridge:schema",
      "  npm run hosted-bridge:preflight",
      "  npm run hosted-bridge:release-gate",
      "",
    ].join("\n"),
  );
  process.exit(exitCode);
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    usage(error.message, 1);
  }
  if (args.help) usage("", 0);

  const result = runReadiness({
    bridgeExpectedVersion: args.bridgeExpectedVersion,
    bridgePackage: args.bridgePackage,
    log: args.json ? () => {} : (message) => process.stdout.write(`${message}\n`),
    preflightArgs: args.preflightArgs,
    stdio: args.json ? ["ignore", "pipe", "pipe"] : "inherit",
  });
  if (args.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    process.stdout.write(printText(result));
  }
  process.exit(result.ok ? 0 : 1);
}

if (require.main === module) {
  main();
}

module.exports = {
  commandError,
  commandStatus,
  executableForCommand,
  parseArgs,
  printText,
  readinessChecks,
  readinessChecksForOptions,
  readinessRemediationHints,
  runReadiness,
  shellForCommand,
};
