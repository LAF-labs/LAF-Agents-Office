"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");
const {
  executableForCommand,
  parseArgs,
  printText,
  readinessChecks,
  readinessChecksForOptions,
  readinessRemediationHints,
  runReadiness,
} = require(path.join(repoRoot, "scripts", "hosted-bridge-readiness.cjs"));

test("readiness runs schema, preflight, and release gate in order", () => {
  const observed = [];
  const result = runReadiness({
    commandProbe(command, args, check) {
      observed.push({ args, command, key: check.key });
      return { status: 0 };
    },
  });

  assert.equal(result.ok, true, printText(result));
  assert.deepEqual(observed.map((entry) => entry.key), [
    "schema",
    "preflight",
    "release-gate",
  ]);
  assert.deepEqual(observed.map((entry) => `${entry.command} ${entry.args.join(" ")}`), [
    "npm run hosted-bridge:schema",
    "npm run hosted-bridge:preflight",
    "npm run hosted-bridge:release-gate",
  ]);
  assert.match(printText(result), /PASS hosted Bridge readiness gates passed/);
});

test("readiness keeps running after failed gates and summarizes every blocker", () => {
  const observed = [];
  const result = runReadiness({
    commandProbe(command, args, check) {
      observed.push(check.key);
      if (check.key === "preflight") {
        return { status: 1, stderr: "missing SUPABASE_URL" };
      }
      if (check.key === "release-gate") {
        return { status: 1, stderr: "npm ERR! 404 Not Found" };
      }
      return { status: 0 };
    },
  });

  const rendered = printText(result);
  assert.deepEqual(observed, ["schema", "preflight", "release-gate"]);
  assert.equal(result.ok, false);
  assert.match(rendered, /FAIL preflight - Hosted deployment env preflight/);
  assert.match(rendered, /FAIL release-gate - Public laf-bridge npm release gate/);
  assert.match(rendered, /missing SUPABASE_URL/);
  assert.match(rendered, /404 Not Found/);
  assert.match(rendered, /NEXT set LAF_OFFICE_PUBLIC_HOST or VERCEL_URL plus the execution plan signing key envs/);
  assert.match(rendered, /NEXT generate signing key envs with `npm run hosted-bridge:keys -- --dotenv/);
  assert.match(rendered, /NEXT publish laf-bridge through the Release workflow/);
  assert.match(rendered, /NEXT rerun `npm run hosted-bridge:readiness`/);
});

test("readiness remediation hints are gate-specific and deduplicated", () => {
  const result = {
    ok: false,
    checks: [
      { key: "schema", ok: false },
      { key: "preflight", ok: false },
      { key: "preflight", ok: false },
      { key: "release-gate", ok: false },
    ],
  };

  assert.deepEqual(readinessRemediationHints(result), [
    "apply the hosted Bridge Supabase migrations, then rerun `npm run hosted-bridge:schema`",
    "set LAF_OFFICE_PUBLIC_HOST or VERCEL_URL plus the execution plan signing key envs in the deployment environment",
    "generate signing key envs with `npm run hosted-bridge:keys -- --dotenv --key-id execution-plan-prod-YYYY-MM`",
    "publish laf-bridge through the Release workflow, then verify `laf-bridge@latest` with `npm run hosted-bridge:release-gate`",
    "rerun `npm run hosted-bridge:readiness` before enabling hosted pairing for new users",
  ]);
  assert.deepEqual(readinessRemediationHints({ ok: true, checks: [] }), []);
});

test("readiness help lists all gates without executing them", () => {
  const result = spawnSync(
    process.execPath,
    [path.join(repoRoot, "scripts", "hosted-bridge-readiness.cjs"), "--help"],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /npm run hosted-bridge:schema/);
  assert.match(result.stdout, /npm run hosted-bridge:preflight/);
  assert.match(result.stdout, /npm run hosted-bridge:release-gate/);
  assert.match(result.stdout, /--no-env-file/);
  assert.match(result.stdout, /--bridge-package/);
});

test("readiness supports json output and platform npm shims", () => {
  assert.deepEqual(parseArgs(["--json"]), {
    bridgeExpectedVersion: "",
    bridgePackage: "",
    json: true,
    preflightArgs: [],
  });
  assert.equal(executableForCommand("npm", "win32"), "npm.cmd");
  assert.equal(executableForCommand("npm", "linux"), "npm");
  assert.equal(readinessChecks.length, 3);
});

test("readiness forwards dotenv and exact Bridge package options to focused gates", () => {
  const parsed = parseArgs([
    "--no-env-file",
    "--dotenv",
    "/tmp/hosted.env",
    "--bridge-package",
    "laf-bridge@latest",
    "--expect-version",
    "1.2.3",
  ]);
  assert.deepEqual(parsed, {
    bridgeExpectedVersion: "1.2.3",
    bridgePackage: "laf-bridge@latest",
    json: false,
    preflightArgs: ["--no-env-file", "--dotenv", "/tmp/hosted.env"],
  });

  const checks = readinessChecksForOptions(parsed);
  const preflight = checks.find((check) => check.key === "preflight");
  const releaseGate = checks.find((check) => check.key === "release-gate");
  assert.deepEqual(preflight.args, [
    "run",
    "hosted-bridge:preflight",
    "--",
    "--no-env-file",
    "--dotenv",
    "/tmp/hosted.env",
  ]);
  assert.deepEqual(releaseGate.args, [
    "run",
    "hosted-bridge:release-gate",
    "--",
    "--package",
    "laf-bridge@latest",
    "--expect-version",
    "1.2.3",
  ]);
});
