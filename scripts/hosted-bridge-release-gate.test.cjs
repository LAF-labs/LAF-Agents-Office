"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const { spawnSync } = require("node:child_process");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");
const {
  commandInvocationFor,
  executableForCommand,
  internalCommandProbes,
  parseArgs,
  printText,
  releaseGateRemediationHints,
  runReleaseGate,
  shellForCommand,
} = require(path.join(repoRoot, "scripts", "hosted-bridge-release-gate.cjs"));

function fakeCommandProbe(fixtures) {
  return (command, args) => {
    const key = `${command} ${args.join(" ")}`;
    const fixture = fixtures[key];
    if (!fixture) {
      return { ok: false, stderr: `unexpected command: ${key}`, stdout: "" };
    }
    return { stderr: "", stdout: "", ...fixture };
  };
}

function publicPairOnlyFixtures(overrides = {}) {
  const fixtures = {
    "npm view laf-bridge version": { ok: true, stdout: "1.2.3\n" },
    "npx --yes laf-bridge@latest --version": { ok: true, stdout: "laf-bridge v1.2.3\n" },
    "npx --yes laf-bridge@latest --help": {
      ok: true,
      stdout: "usage: laf-bridge pair\n\nPair this computer with LAF Office.\n",
    },
    "npx --yes laf-bridge@latest": {
      ok: true,
      stdout: "usage: laf-bridge pair\n\nPair this computer with LAF Office.\n",
    },
    "npx --yes laf-bridge@latest pair --help": {
      ok: true,
      stdout: "usage: laf-bridge pair\n\nPaste the setup code when prompted.\n",
    },
    "npx --yes laf-bridge@latest pair --api-url https://office.example.com/api --code TEST-CODE": {
      ok: false,
      stderr: "laf-bridge: npx exposes only `laf-bridge pair` without pairing flags.\n",
    },
  };
  for (const command of internalCommandProbes) {
    fixtures[`npx --yes laf-bridge@latest ${command}`] = {
      ok: false,
      stderr: "laf-bridge: npx exposes only `laf-bridge pair` for hosted workspace pairing.\n",
    };
  }
  return { ...fixtures, ...overrides };
}

test("release gate passes when public laf-bridge exposes only pair help", () => {
  const result = runReleaseGate({
    expectedVersion: "1.2.3",
    packageSpec: "laf-bridge@latest",
    commandProbe: fakeCommandProbe(publicPairOnlyFixtures()),
  });

  assert.equal(result.ok, true, printText(result));
  assert.equal(result.expected_version, "1.2.3");
  assert.equal(result.version, "1.2.3");
  for (const command of internalCommandProbes) {
    assert.match(printText(result), new RegExp(`PASS npx internal command rejection: ${command}`));
  }
});

test("release gate resolves npm and npx command shims on Windows", () => {
  assert.equal(executableForCommand("npm", "win32", { PATH: "" }), "npm.cmd");
  assert.equal(executableForCommand("npx", "win32", { PATH: "" }), "npx.cmd");
  assert.equal(executableForCommand("git", "win32"), "git");
  assert.equal(executableForCommand("npx", "linux"), "npx");
  assert.equal(shellForCommand("npm", "win32", { PATH: "" }), true);
  assert.equal(shellForCommand("npx", "win32", { PATH: "" }), true);
  assert.equal(shellForCommand("git", "win32"), false);
  assert.equal(shellForCommand("npx", "linux"), false);
});

test("release gate prefers npm and npx JS CLIs on Windows when setup-node exposes them", (t) => {
  const npmRoot = fs.mkdtempSync(path.join(os.tmpdir(), "laf-npm-cli-"));
  t.after(() => fs.rmSync(npmRoot, { force: true, recursive: true }));
  const npmBin = path.join(npmRoot, "node_modules", "npm", "bin");
  fs.mkdirSync(npmBin, { recursive: true });
  fs.writeFileSync(path.join(npmBin, "npm-cli.js"), "// npm fixture\n");
  fs.writeFileSync(path.join(npmBin, "npx-cli.js"), "// npx fixture\n");
  const fakeEnv = { PATH: npmRoot };
  const npmInvocation = commandInvocationFor("npm", ["view", "laf-bridge", "version"], "win32", fakeEnv);
  const npxInvocation = commandInvocationFor("npx", ["--yes", "laf-bridge@latest"], "win32", fakeEnv);

  assert.equal(npmInvocation.command, process.execPath);
  assert.equal(npmInvocation.shell, false);
  assert.deepEqual(npmInvocation.args.slice(1), ["view", "laf-bridge", "version"]);
  assert.match(npmInvocation.args[0], /npm-cli\.js$/);
  assert.equal(npxInvocation.command, process.execPath);
  assert.equal(npxInvocation.shell, false);
  assert.deepEqual(npxInvocation.args.slice(1), ["--yes", "laf-bridge@latest"]);
  assert.match(npxInvocation.args[0], /npx-cli\.js$/);
});

test("release gate help does not print internal command or pair flag examples", () => {
  const result = spawnSync(
    process.execPath,
    [path.join(repoRoot, "scripts", "hosted-bridge-release-gate.cjs"), "--help"],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  const output = `${result.stdout}\n${result.stderr}`;
  assert.match(
    output,
    /usage: node scripts\/hosted-bridge-release-gate\.cjs \[--json\] \[--package <npm-spec>\] \[--expect-version <version>\]/,
  );
  assert.match(output, /internal command rejection probes/);
  assert.match(output, /internal pair-flag rejection probe/);
  assert.doesNotMatch(
    output,
    /\blaf-bridge(?:@[A-Za-z0-9._~+-]+)?\s+(?:start|status|doctor|providers|bindings|link-project|unlink-project|mcp-context)\b/i,
  );
  assert.doesNotMatch(
    output,
    /\blaf-bridge(?:@[A-Za-z0-9._~+-]+)?\s+pair\s+--(?:api-url|code)\b/i,
  );
  assert.doesNotMatch(output, /--api-url[\s\S]*--code/i);
});

test("release gate fails when npm has not published laf-bridge", () => {
  const result = runReleaseGate({
    packageSpec: "laf-bridge@latest",
    commandProbe: fakeCommandProbe({
      "npm view laf-bridge version": { ok: false, stderr: "npm ERR! 404 Not Found" },
      "npx --yes laf-bridge@latest --version": { ok: false, stderr: "npm ERR! 404 Not Found" },
      "npx --yes laf-bridge@latest": { ok: false, stderr: "npm ERR! 404 Not Found" },
      "npx --yes laf-bridge@latest --help": { ok: false, stderr: "npm ERR! 404 Not Found" },
      "npx --yes laf-bridge@latest pair --help": { ok: false, stderr: "npm ERR! 404 Not Found" },
      "npx --yes laf-bridge@latest start": { ok: false, stderr: "npm ERR! 404 Not Found" },
      "npx --yes laf-bridge@latest pair --api-url https://office.example.com/api --code TEST-CODE": {
        ok: false,
        stderr: "npm ERR! 404 Not Found",
      },
    }),
  });

  assert.equal(result.ok, false);
  assert.match(printText(result), /FAIL laf-bridge@latest is not ready/);
  assert.match(printText(result), /404 Not Found/);
  assert.match(printText(result), /NEXT publish laf-bridge@latest through the Release workflow/);
  assert.match(printText(result), /NEXT rerun `npm run hosted-bridge:release-gate`/);
});

test("release gate rejects pair help that exposes internal flags", () => {
  const internalPairHelp = [
    "usage: laf-bridge pair",
    "--api-url URL --code CODE",
    "setup code",
  ].join(" ");
  const result = runReleaseGate({
    packageSpec: "laf-bridge@latest",
    commandProbe: fakeCommandProbe(publicPairOnlyFixtures({
      "npx --yes laf-bridge@latest pair --help": {
        ok: true,
        stdout: internalPairHelp,
      },
    })),
  });

  assert.equal(result.ok, false);
  assert.match(printText(result), /internal pairing flags/);
});

test("release gate rejects root help that exposes internal commands", () => {
  const result = runReleaseGate({
    packageSpec: "laf-bridge@latest",
    commandProbe: fakeCommandProbe(publicPairOnlyFixtures({
      "npx --yes laf-bridge@latest --help": {
        ok: true,
        stdout: "usage: laf-bridge pair\n\ncommands:\n  status\n",
      },
    })),
  });

  assert.equal(result.ok, false);
  assert.match(printText(result), /internal Bridge commands/);
});

test("release gate rejects no-arg help that exposes internal commands", () => {
  const result = runReleaseGate({
    packageSpec: "laf-bridge@latest",
    commandProbe: fakeCommandProbe(publicPairOnlyFixtures({
      "npx --yes laf-bridge@latest": {
        ok: true,
        stdout: "usage: laf-bridge pair\n\ncommands:\n  start\n",
      },
    })),
  });

  assert.equal(result.ok, false);
  assert.match(printText(result), /no-arg help exposed internal Bridge commands/);
});

test("release gate rejects npx versions that do not match npm latest", () => {
  const result = runReleaseGate({
    packageSpec: "laf-bridge@latest",
    commandProbe: fakeCommandProbe(publicPairOnlyFixtures({
      "npx --yes laf-bridge@latest --version": { ok: true, stdout: "laf-bridge v1.2.2\n" },
    })),
  });

  assert.equal(result.ok, false);
  assert.match(printText(result), /did not report npm version 1\.2\.3/);
});

test("release gate rejects latest dist-tag that does not match the expected release version", () => {
  const result = runReleaseGate({
    expectedVersion: "1.2.3",
    packageSpec: "laf-bridge@latest",
    commandProbe: fakeCommandProbe(publicPairOnlyFixtures({
      "npm view laf-bridge version": { ok: true, stdout: "1.2.2\n" },
      "npx --yes laf-bridge@latest --version": { ok: true, stdout: "laf-bridge v1.2.2\n" },
    })),
  });

  assert.equal(result.ok, false);
  assert.match(printText(result), /expected version: 1\.2\.3/);
  assert.match(printText(result), /npm version 1\.2\.2 did not match expected 1\.2\.3/);
  assert.match(printText(result), /dist-tag propagation/);
});

test("release gate rejects the release placeholder package version", () => {
  const result = runReleaseGate({
    packageSpec: "laf-bridge@latest",
    commandProbe: fakeCommandProbe({
      "npm view laf-bridge version": { ok: true, stdout: "0.0.0\n" },
    }),
  });

  assert.equal(result.ok, false);
  assert.match(printText(result), /release placeholder version 0\.0\.0/);
});

test("release gate accepts explicit package specs for published release validation", () => {
  const parsed = parseArgs([
    "--json",
    "--package",
    "laf-bridge@1.2.3-beta.1",
    "--expect-version",
    "1.2.3-beta.1",
  ]);
  assert.deepEqual(parsed, {
    expectedVersion: "1.2.3-beta.1",
    json: true,
    packageSpec: "laf-bridge@1.2.3-beta.1",
  });
});

test("release gate rejects invalid expected versions", () => {
  assert.throws(
    () => parseArgs(["--expect-version", "1.2.3+build.1"]),
    /expected version must be an npm-compatible SemVer/,
  );

  const result = runReleaseGate({
    expectedVersion: "1.2.3+build.1",
    packageSpec: "laf-bridge@latest",
  });
  assert.equal(result.ok, false);
  assert.match(printText(result), /expected version must be an npm-compatible SemVer/);
});

test("release gate rejects package specs with build metadata", () => {
  assert.throws(
    () => parseArgs(["--package", "laf-bridge@1.2.3+build.1"]),
    /without build metadata/,
  );

  const result = runReleaseGate({ packageSpec: "laf-bridge@1.2.3+build.1" });
  assert.equal(result.ok, false);
  assert.match(printText(result), /without build metadata/);
});

test("release gate rejects package specs that npm would normalize or reject", () => {
  for (const packageSpec of [
    "laf-bridge@01.2.3",
    "laf-bridge@1.02.3",
    "laf-bridge@1.2.03",
    "laf-bridge@1.2.3-",
    "laf-bridge@1.2.3-alpha..1",
    "laf-bridge@1.2.3-01",
  ]) {
    assert.throws(
      () => parseArgs(["--package", packageSpec]),
      /npm SemVer package/,
      `${packageSpec} should be rejected`,
    );
  }
});

test("release gate validates exact package specs against the selected version", () => {
  const fixtures = {
    "npm view laf-bridge@1.2.3 version": { ok: true, stdout: "1.2.3\n" },
    "npx --yes laf-bridge@1.2.3 --version": { ok: true, stdout: "laf-bridge v1.2.3\n" },
    "npx --yes laf-bridge@1.2.3 --help": {
      ok: true,
      stdout: "usage: laf-bridge pair\n",
    },
    "npx --yes laf-bridge@1.2.3": {
      ok: true,
      stdout: "usage: laf-bridge pair\n",
    },
    "npx --yes laf-bridge@1.2.3 pair --help": {
      ok: true,
      stdout: "usage: laf-bridge pair\n\nPaste the setup code when prompted.\n",
    },
    "npx --yes laf-bridge@1.2.3 pair --api-url https://office.example.com/api --code TEST-CODE": {
      ok: false,
      stderr: "laf-bridge: npx exposes only `laf-bridge pair` without pairing flags.\n",
    },
  };
  for (const command of internalCommandProbes) {
    fixtures[`npx --yes laf-bridge@1.2.3 ${command}`] = {
      ok: false,
      stderr: "laf-bridge: npx exposes only `laf-bridge pair` for hosted workspace pairing.\n",
    };
  }

  const result = runReleaseGate({
    packageSpec: "laf-bridge@1.2.3",
    commandProbe: fakeCommandProbe(fixtures),
  });

  assert.equal(result.ok, true, printText(result));
  assert.equal(result.version, "1.2.3");
  assert.match(printText(result), /PASS laf-bridge@1\.2\.3 is ready/);
});

test("release gate rejects package specs outside the public Bridge package", () => {
  assert.throws(
    () => parseArgs(["--package", "left-pad@latest"]),
    /package spec must be laf-bridge@latest/,
  );

  const result = runReleaseGate({ packageSpec: "left-pad@latest" });
  assert.equal(result.ok, false);
  assert.match(printText(result), /FAIL left-pad@latest is not ready/);
  assert.match(printText(result), /package spec must be laf-bridge@latest/);
});

test("release gate remediation hints are targeted and deduplicated", () => {
  const hints = releaseGateRemediationHints({
    checks: [
      { error: "npm ERR! 404 Not Found", name: "npm view", ok: false },
      { error: "root help exposed internal Bridge commands", name: "npx --help", ok: false },
      { error: "internal start command succeeded through npx", name: "npx internal command rejection: start", ok: false },
    ],
    ok: false,
    package_spec: "laf-bridge@1.2.3",
    version: "",
  });
  assert.equal(hints.filter((hint) => hint.includes("publish laf-bridge@1.2.3")).length, 1);
  assert.equal(hints.filter((hint) => hint.includes("npm-bridge wrapper")).length, 1);
  assert.equal(hints.at(-1), "rerun `npm run hosted-bridge:release-gate` before enabling hosted pairing for new users");
});

test("release gate accepts package spec from deploy-smoke environment", (t) => {
  const previous = process.env.LAF_BRIDGE_NPX_PACKAGE;
  const previousExpected = process.env.LAF_BRIDGE_EXPECT_VERSION;
  t.after(() => {
    if (previous === undefined) delete process.env.LAF_BRIDGE_NPX_PACKAGE;
    else process.env.LAF_BRIDGE_NPX_PACKAGE = previous;
    if (previousExpected === undefined) delete process.env.LAF_BRIDGE_EXPECT_VERSION;
    else process.env.LAF_BRIDGE_EXPECT_VERSION = previousExpected;
  });
  process.env.LAF_BRIDGE_NPX_PACKAGE = "laf-bridge@1.2.3";
  process.env.LAF_BRIDGE_EXPECT_VERSION = "1.2.3";

  const parsed = parseArgs([]);
  assert.deepEqual(parsed, {
    expectedVersion: "1.2.3",
    json: false,
    packageSpec: "laf-bridge@1.2.3",
  });
});
