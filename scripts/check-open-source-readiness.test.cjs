"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");

test("readiness check covers the public collaboration surface", () => {
  const { runReadinessCheck } = require("./check-open-source-readiness.cjs");
  const result = runReadinessCheck(repoRoot);

  assert.equal(result.ok, true, result.errors.join("\n"));
  assert.deepEqual(result.checkedPaths, [
    "README.md",
    "LICENSE",
    "CONTRIBUTING.md",
    "SECURITY.md",
    ".env.example",
  ]);
});

test("readiness CLI prints a short actionable result", () => {
  const result = spawnSync(process.execPath, ["scripts/check-open-source-readiness.cjs"], {
    cwd: repoRoot,
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /open-source readiness check passed/);
  assert.equal(result.stderr, "");
});
