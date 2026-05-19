#!/usr/bin/env node
"use strict";

const { spawnSync } = require("node:child_process");

const defaultPackageSpec = "laf-bridge@latest";
const npmSemVerPattern =
  "(?:0|[1-9][0-9]*)\\.(?:0|[1-9][0-9]*)\\.(?:0|[1-9][0-9]*)" +
  "(?:-(?:0|[1-9][0-9]*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)" +
  "(?:\\.(?:0|[1-9][0-9]*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*))*)?";
const packageSpecPattern =
  new RegExp(`^laf-bridge@(latest|${npmSemVerPattern})$`);
const packageSpecError =
  "package spec must be laf-bridge@latest or an exact laf-bridge npm SemVer package without build metadata";
const forbiddenPairHelp = /-(api-url|code|start|once|public-key|identity-path)([=\s]|$)/i;
const internalCommandProbes = [
  "start",
  "status",
  "doctor",
  "providers",
  "bindings",
  "link-project",
  "unlink-project",
  "mcp-context",
];
const forbiddenRootHelp = new RegExp(
  `(^|[\\s|])(${internalCommandProbes.join("|")})([\\s|]|$)`,
  "i",
);
const probeTimeoutMS = 30_000;

function parseArgs(argv) {
  const args = {
    expectedVersion: process.env.LAF_BRIDGE_EXPECT_VERSION || "",
    json: false,
    packageSpec: process.env.LAF_BRIDGE_NPX_PACKAGE || defaultPackageSpec,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--json") {
      args.json = true;
    } else if (arg === "--package") {
      const value = argv[i + 1];
      if (!value) throw new Error("--package requires a package spec");
      args.packageSpec = value;
      i += 1;
    } else if (arg === "--expect-version") {
      const value = argv[i + 1];
      if (!value) throw new Error("--expect-version requires an npm SemVer version");
      args.expectedVersion = value;
      i += 1;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  args.packageSpec = args.packageSpec.trim();
  if (!args.packageSpec) throw new Error("package spec must not be empty");
  if (!packageSpecPattern.test(args.packageSpec)) {
    throw new Error(packageSpecError);
  }
  args.expectedVersion = args.expectedVersion.trim();
  if (args.expectedVersion && !new RegExp(`^${npmSemVerPattern}$`).test(args.expectedVersion)) {
    throw new Error("expected version must be an npm-compatible SemVer without build metadata");
  }
  return args;
}

function runReleaseGate(options = {}) {
  const packageSpec = String(options.packageSpec || defaultPackageSpec).trim();
  const expectedVersion = String(options.expectedVersion || "").trim();
  const commandProbe = options.commandProbe || runCommand;
  const checks = [];
  if (!packageSpecPattern.test(packageSpec)) {
    return {
      checks: [
        {
          error: packageSpecError,
          name: "package spec",
          ok: false,
        },
      ],
      expected_version: expectedVersion,
      ok: false,
      package_spec: packageSpec,
      version: "",
    };
  }
  if (expectedVersion && !new RegExp(`^${npmSemVerPattern}$`).test(expectedVersion)) {
    return {
      checks: [
        {
          error: "expected version must be an npm-compatible SemVer without build metadata",
          name: "expected version",
          ok: false,
        },
      ],
      expected_version: expectedVersion,
      ok: false,
      package_spec: packageSpec,
      version: "",
    };
  }

  const npmViewPackage = packageSpec.replace(/@latest$/, "");
  const view = commandProbe("npm", ["view", npmViewPackage, "version"]);
  let viewCheck = toCheck("npm view", view);

  let version = "";
  if (view.ok) {
    version = view.stdout.trim();
    if (!new RegExp(`^${npmSemVerPattern}$`).test(version)) {
      viewCheck = {
        ...viewCheck,
        error: `npm returned a non-npm-SemVer version: ${version || "<empty>"}`,
        ok: false,
      };
    } else if (version === "0.0.0") {
      viewCheck = {
        ...viewCheck,
        error: "npm returned the release placeholder version 0.0.0",
        ok: false,
      };
    }
  }
  checks.push(viewCheck);
  if (!viewCheck.ok) {
    return {
      checks,
      expected_version: expectedVersion,
      ok: false,
      package_spec: packageSpec,
      version,
    };
  }
  if (expectedVersion) {
    checks.push({
      error: version === expectedVersion ? "" : `npm version ${version} did not match expected ${expectedVersion}`,
      name: "expected npm version",
      ok: version === expectedVersion,
    });
  }

  const versionProbe = commandProbe("npx", ["--yes", packageSpec, "--version"]);
  let versionProbeCheck = toCheck("npx --version", versionProbe);
  if (versionProbe.ok && version) {
    const reported = versionProbe.stdout.trim();
    if (!new RegExp(`\\bv${escapeRegExp(version)}\\b`).test(reported)) {
      versionProbeCheck = {
        ...versionProbeCheck,
        error: `npx --version did not report npm version ${version}: ${reported || "<empty>"}`,
        ok: false,
      };
    }
  }
  checks.push(versionProbeCheck);

  const rootHelp = commandProbe("npx", ["--yes", packageSpec, "--help"]);
  let rootHelpCheck = toCheck("npx --help", rootHelp);
  if (rootHelp.ok) {
    const help = rootHelp.stdout;
    if (!/usage:\s+laf-bridge\s+pair/i.test(help)) {
      rootHelpCheck = {
        ...rootHelpCheck,
        error: "root help did not present `laf-bridge pair` as the public entrypoint",
        ok: false,
      };
    } else if (forbiddenRootHelp.test(help)) {
      rootHelpCheck = {
        ...rootHelpCheck,
        error: "root help exposed internal Bridge commands",
        ok: false,
      };
    }
  }
  checks.push(rootHelpCheck);

  const noArgsHelp = commandProbe("npx", ["--yes", packageSpec]);
  let noArgsHelpCheck = toCheck("npx no-arg help", noArgsHelp);
  if (noArgsHelp.ok) {
    const help = noArgsHelp.stdout;
    if (!/usage:\s+laf-bridge\s+pair/i.test(help)) {
      noArgsHelpCheck = {
        ...noArgsHelpCheck,
        error: "no-arg help did not present `laf-bridge pair` as the public entrypoint",
        ok: false,
      };
    } else if (forbiddenRootHelp.test(help)) {
      noArgsHelpCheck = {
        ...noArgsHelpCheck,
        error: "no-arg help exposed internal Bridge commands",
        ok: false,
      };
    }
  }
  checks.push(noArgsHelpCheck);

  const pairHelp = commandProbe("npx", ["--yes", packageSpec, "pair", "--help"]);
  let pairHelpCheck = toCheck("npx pair --help", pairHelp);
  if (pairHelp.ok) {
    const help = pairHelp.stdout;
    if (!/usage:\s+laf-bridge\s+pair/i.test(help)) {
      pairHelpCheck = {
        ...pairHelpCheck,
        error: "pair help did not include `usage: laf-bridge pair`",
        ok: false,
      };
    } else if (!/setup code/i.test(help)) {
      pairHelpCheck = {
        ...pairHelpCheck,
        error: "pair help did not mention setup code prompting",
        ok: false,
      };
    } else if (forbiddenPairHelp.test(help)) {
      pairHelpCheck = {
        ...pairHelpCheck,
        error: "pair help exposed internal pairing flags",
        ok: false,
      };
    }
  }
  checks.push(pairHelpCheck);

  for (const internalCommand of internalCommandProbes) {
    const internalProbe = commandProbe("npx", ["--yes", packageSpec, internalCommand]);
    const internalProbeCheck = {
      error: "",
      name: `npx internal command rejection: ${internalCommand}`,
      ok: false,
    };
    if (!internalProbe.ok) {
      const output = `${internalProbe.stdout}\n${internalProbe.stderr}`;
      if (/npx exposes only `laf-bridge pair`/i.test(output)) {
        internalProbeCheck.ok = true;
      } else {
        internalProbeCheck.error =
          `internal ${internalCommand} command was rejected without the expected public-surface message`;
      }
    } else {
      internalProbeCheck.error = `internal ${internalCommand} command succeeded through npx`;
    }
    checks.push(internalProbeCheck);
  }

  const pairFlagsProbe = commandProbe("npx", [
    "--yes",
    packageSpec,
    "pair",
    "--api-url",
    "https://office.example.com/api",
    "--code",
    "TEST-CODE",
  ]);
  let pairFlagsCheck = {
    error: "",
    name: "npx pair flags rejection",
    ok: false,
  };
  if (!pairFlagsProbe.ok) {
    const output = `${pairFlagsProbe.stdout}\n${pairFlagsProbe.stderr}`;
    if (/without pairing flags/i.test(output)) {
      pairFlagsCheck.ok = true;
    } else {
      pairFlagsCheck.error = "internal pair flags were rejected without the expected public-surface message";
    }
  } else {
    pairFlagsCheck.error = "internal pair flags succeeded through npx";
  }
  checks.push(pairFlagsCheck);

  return {
    checks,
    expected_version: expectedVersion,
    ok: checks.every((check) => check.ok),
    package_spec: packageSpec,
    version,
  };
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toCheck(name, result) {
  return {
    error: result.ok ? "" : result.stderr.trim() || result.error || `${name} failed`,
    name,
    ok: result.ok,
  };
}

function executableForCommand(command, platform = process.platform) {
  if (platform === "win32" && (command === "npm" || command === "npx")) {
    return `${command}.cmd`;
  }
  return command;
}

function runCommand(command, args) {
  const result = spawnSync(executableForCommand(command), args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: probeTimeoutMS,
  });
  return {
    error: commandError(result),
    ok: !result.error && result.status === 0,
    stderr: result.stderr || "",
    stdout: result.stdout || "",
  };
}

function commandError(result) {
  if (result.error) return result.error.message;
  if (result.signal) return `terminated by ${result.signal}`;
  if (typeof result.status === "number" && result.status !== 0) {
    return `exit status ${result.status}`;
  }
  return "";
}

function printText(result) {
  const lines = [];
  if (result.ok) {
    lines.push(
      `[hosted-bridge-release-gate] PASS ${result.package_spec} is ready for hosted Bridge pairing`,
    );
  } else {
    lines.push(
      `[hosted-bridge-release-gate] FAIL ${result.package_spec} is not ready for hosted Bridge pairing`,
    );
  }
  if (result.version) {
    lines.push(`[hosted-bridge-release-gate] npm version: ${result.version}`);
  }
  if (result.expected_version) {
    lines.push(`[hosted-bridge-release-gate] expected version: ${result.expected_version}`);
  }
  for (const check of result.checks) {
    lines.push(`[hosted-bridge-release-gate] ${check.ok ? "PASS" : "FAIL"} ${check.name}`);
    if (!check.ok && check.error) {
      lines.push(`[hosted-bridge-release-gate] ERROR ${check.error}`);
    }
  }
  for (const hint of releaseGateRemediationHints(result)) {
    lines.push(`[hosted-bridge-release-gate] NEXT ${hint}`);
  }
  return `${lines.join("\n")}\n`;
}

function releaseGateRemediationHints(result) {
  if (result.ok) return [];
  const text = result.checks
    .filter((check) => !check.ok)
    .map((check) => `${check.name}\n${check.error}`)
    .join("\n");
  const hints = [];
  if (/404|not found|could not be found/i.test(text)) {
    hints.push(
      `publish ${result.package_spec} through the Release workflow after verifying NPM_TOKEN and npm package ownership`,
    );
  }
  if (/release placeholder version 0\.0\.0/.test(text)) {
    hints.push("rerun the Release workflow so npm-bridge/package.json receives the tag version before publish");
  }
  if (/internal Bridge commands|internal .*command succeeded|internal pairing flags|pair flags succeeded/i.test(text)) {
    hints.push("publish the npm-bridge wrapper package, not the raw cmd/laf-bridge binary surface");
  }
  if (/did not report npm version/.test(text)) {
    hints.push("wait for npm propagation, clear npx cache if needed, then rerun the exact-version release gate");
  }
  if (/did not match expected/.test(text)) {
    hints.push("wait for npm dist-tag propagation or rerun npm publish/dist-tag correction so latest points to the release version");
  }
  if (/package spec must be laf-bridge@latest/.test(text)) {
    hints.push("set the package spec to laf-bridge@latest or laf-bridge@<exact npm SemVer>");
  }
  hints.push("rerun `npm run hosted-bridge:release-gate` before enabling hosted pairing for new users");
  return [...new Set(hints)];
}

function usage(message = "", exitCode = 0) {
  const out = message ? process.stderr : process.stdout;
  if (message) out.write(`${message}\n\n`);
  out.write(
    [
      "usage: node scripts/hosted-bridge-release-gate.cjs [--json] [--package <npm-spec>] [--expect-version <version>]",
      "",
      "Verifies the public LAF Bridge npm package required by hosted pairing.",
      "Use --package laf-bridge@<version> to verify a just-published release tag.",
      "Use --expect-version <version> to require the selected npm dist-tag/package to resolve to that release.",
      "The package spec must be laf-bridge@latest or an exact laf-bridge npm SemVer package without build metadata.",
      "",
      "Checks:",
      "  npm view laf-bridge version",
      "  npx --yes laf-bridge@latest --version",
      "  npx --yes laf-bridge@latest",
      "  npx --yes laf-bridge@latest --help",
      "  npx --yes laf-bridge@latest pair --help",
      "  internal command rejection probes",
      "  internal pair-flag rejection probe",
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

  const result = runReleaseGate({
    expectedVersion: args.expectedVersion,
    packageSpec: args.packageSpec,
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
  executableForCommand,
  parseArgs,
  printText,
  releaseGateRemediationHints,
  runReleaseGate,
  internalCommandProbes,
};
