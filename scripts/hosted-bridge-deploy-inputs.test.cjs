"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");
const {
  appendGitHubEnv,
  githubEnvAssignments,
  normalizeDeployedAPIURL,
  normalizeGitHubRepoURL,
  parseArgs,
  printText,
  validateDeploySmokeInputs,
} = require(path.join(repoRoot, "scripts", "hosted-bridge-deploy-inputs.cjs"));

function validEnv(overrides = {}) {
  return {
    LAF_BRIDGE_NPX_PACKAGE: "laf-bridge@latest",
    LAF_HOSTED_API_URL: "https://office.example.com/api",
    LAF_SMOKE_BROWSER_ORIGIN: "https://app.example.com",
    LAF_SMOKE_EMAIL: "smoke@example.com",
    LAF_SMOKE_MODE: "api",
    LAF_SMOKE_PASSWORD: "secret-password",
    LAF_SMOKE_REPO_URL: "https://github.com/LAF-labs/LAF-Agents-Office",
    ...overrides,
  };
}

test("deploy smoke input validator accepts production hosted Bridge inputs", () => {
  const result = validateDeploySmokeInputs(validEnv({
    LAF_BRIDGE_NPX_PACKAGE: "laf-bridge@1.2.3",
    LAF_BRIDGE_EXPECT_VERSION: "1.2.3",
    LAF_SMOKE_MODE: "cli",
  }));
  assert.equal(result.ok, true, result.errors.join("\n"));
  assert.equal(result.normalized.api_url, "https://office.example.com/api");
  assert.equal(result.normalized.browser_origin, "https://app.example.com");
  assert.equal(result.normalized.bridge_package, "laf-bridge@1.2.3");
  assert.equal(result.normalized.bridge_expected_version, "1.2.3");
  assert.equal(result.normalized.smoke_mode, "cli");
  assert.match(printText(result), /PASS deployed smoke inputs/);
  assert.doesNotMatch(printText(result), /secret-password/);
});

test("deploy smoke input validator emits normalized GitHub env without secrets", async (t) => {
  const result = validateDeploySmokeInputs(validEnv({
    LAF_BRIDGE_NPX_PACKAGE: " laf-bridge@1.2.3 ",
    LAF_BRIDGE_EXPECT_VERSION: " 1.2.3 ",
    LAF_HOSTED_API_URL: "https://office.example.com/api/",
    LAF_SMOKE_BROWSER_ORIGIN: "",
    LAF_SMOKE_REPO_URL: "https://github.com/LAF-labs/LAF-Agents-Office.git",
  }));
  assert.equal(result.ok, true, result.errors.join("\n"));

  const assignments = githubEnvAssignments(result.normalized);
  assert.deepEqual(assignments, [
    ["LAF_BRIDGE_EXPECT_VERSION", "1.2.3"],
    ["LAF_BRIDGE_NPX_PACKAGE", "laf-bridge@1.2.3"],
    ["LAF_HOSTED_API_URL", "https://office.example.com/api"],
    ["LAF_SMOKE_BROWSER_ORIGIN", ""],
    ["LAF_SMOKE_BRIDGE_CMD", "npx --yes laf-bridge@1.2.3"],
    ["LAF_SMOKE_MODE", "api"],
    ["LAF_SMOKE_REPO_URL", "https://github.com/LAF-labs/LAF-Agents-Office"],
  ]);

  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "laf-bridge-deploy-env-"));
  t.after(() => fs.promises.rm(dir, { recursive: true, force: true }));
  const envPath = path.join(dir, "github-env");
  appendGitHubEnv(result.normalized, { GITHUB_ENV: envPath });
  const envFile = await fs.promises.readFile(envPath, "utf8");
  assert.match(envFile, /^LAF_BRIDGE_EXPECT_VERSION=1\.2\.3$/m);
  assert.match(envFile, /^LAF_SMOKE_BRIDGE_CMD=npx --yes laf-bridge@1\.2\.3$/m);
  assert.doesNotMatch(envFile, /secret-password|smoke@example\.com/);
});

test("deploy smoke input validator refuses GitHub env newline injection", () => {
  const apiURL = validateDeploySmokeInputs(validEnv({
    LAF_HOSTED_API_URL: "https://office.example.com/api\nLAF_SMOKE_BRIDGE_CMD=evil",
  }));
  assert.equal(apiURL.ok, false);
  assert.match(apiURL.errors.join("\n"), /api_url must not contain newlines/);

  const repoURL = validateDeploySmokeInputs(validEnv({
    LAF_SMOKE_REPO_URL: "https://github.com/LAF-labs/LAF-Agents-Office\nLAF_SMOKE_MODE=cli",
  }));
  assert.equal(repoURL.ok, false);
  assert.match(repoURL.errors.join("\n"), /repo_url must not contain newlines/);

  assert.throws(
    () => appendGitHubEnv(
      {
        api_url: "https://office.example.com/api",
        bridge_expected_version: "",
        bridge_package: "laf-bridge@latest",
        browser_origin: "",
        repo_url: "https://github.com/LAF-labs/LAF-Agents-Office\nX=1",
        smoke_mode: "api",
      },
      { GITHUB_ENV: "/tmp/laf-bridge-env-test" },
    ),
    /cannot be written to GITHUB_ENV/,
  );
});

test("deploy smoke input validator parses GitHub env export mode", () => {
  assert.deepEqual(parseArgs(["--github-env"]), { githubEnv: true, help: false });
  assert.throws(() => parseArgs(["--raw-code"]), /unknown argument/);
});

test("deploy smoke input validator rejects local or non-api deployment URLs", () => {
  for (const apiURL of [
    "http://office.example.com/api",
    "https://127.0.0.1:3000/api",
    "https://localhost:3000/api",
    "https://office.example.com",
    "https://office.example.com/api?token=secret",
  ]) {
    const result = validateDeploySmokeInputs(validEnv({ LAF_HOSTED_API_URL: apiURL }));
    assert.equal(result.ok, false, `${apiURL} should fail`);
  }

  assert.match(
    normalizeDeployedAPIURL("https://office.example.com").error || "",
    /ending in \/api/,
  );
  assert.match(
    normalizeDeployedAPIURL("https://127.0.0.1:3000/api").error || "",
    /localhost or a private network address/,
  );
});

test("deploy smoke input validator rejects unsafe browser origins and packages", () => {
  const result = validateDeploySmokeInputs(validEnv({
    LAF_BRIDGE_NPX_PACKAGE: `${["laf", "runner"].join("-")}@latest`,
    LAF_SMOKE_BROWSER_ORIGIN: "https://app.example.com/path",
  }));
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /bridge_package must be laf-bridge/);
  assert.match(result.errors.join("\n"), /browser_origin must be an origin/);

  const buildMetadata = validateDeploySmokeInputs(validEnv({
    LAF_BRIDGE_NPX_PACKAGE: "laf-bridge@1.2.3+build.1",
  }));
  assert.equal(buildMetadata.ok, false);
  assert.match(buildMetadata.errors.join("\n"), /without build metadata/);

  const expectedBuildMetadata = validateDeploySmokeInputs(validEnv({
    LAF_BRIDGE_EXPECT_VERSION: "1.2.3+build.1",
  }));
  assert.equal(expectedBuildMetadata.ok, false);
  assert.match(expectedBuildMetadata.errors.join("\n"), /bridge_expected_version.*without build metadata/);

  for (const packageSpec of [
    "laf-bridge@01.2.3",
    "laf-bridge@1.2.3-",
    "laf-bridge@1.2.3-alpha..1",
    "laf-bridge@1.2.3-01",
  ]) {
    const invalidNpmPackage = validateDeploySmokeInputs(validEnv({
      LAF_BRIDGE_NPX_PACKAGE: packageSpec,
    }));
    assert.equal(invalidNpmPackage.ok, false, `${packageSpec} should fail`);
    assert.match(invalidNpmPackage.errors.join("\n"), /npm SemVer package/);
  }
});

test("deploy smoke input validator rejects missing secrets and unsafe repo URLs", () => {
  const result = validateDeploySmokeInputs(validEnv({
    LAF_SMOKE_EMAIL: "",
    LAF_SMOKE_PASSWORD: "",
    LAF_SMOKE_REPO_URL: "https://gitlab.com/LAF-labs/LAF-Agents-Office",
  }));
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /missing LAF_SMOKE_EMAIL/);
  assert.match(result.errors.join("\n"), /missing LAF_SMOKE_PASSWORD/);
  assert.match(result.errors.join("\n"), /repo_url must be an https:\/\/github\.com/);
});

test("GitHub repo URL normalizer trims .git and rejects missing owner or repo", () => {
  assert.equal(
    normalizeGitHubRepoURL("https://github.com/LAF-labs/LAF-Agents-Office.git").value,
    "https://github.com/LAF-labs/LAF-Agents-Office",
  );
  assert.match(
    normalizeGitHubRepoURL("https://github.com/LAF-labs").error || "",
    /owner and repository/,
  );
});
