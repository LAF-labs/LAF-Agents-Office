#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const { isLocalHost } = require("./hosted-env-preflight.cjs");

const npmSemVerPattern =
  "(?:0|[1-9][0-9]*)\\.(?:0|[1-9][0-9]*)\\.(?:0|[1-9][0-9]*)" +
  "(?:-(?:0|[1-9][0-9]*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)" +
  "(?:\\.(?:0|[1-9][0-9]*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*))*)?";
const packageSpecPattern =
  new RegExp(`^laf-bridge@(latest|${npmSemVerPattern})$`);

function validateDeploySmokeInputs(env = process.env) {
  const errors = [];
  const normalized = {
    api_url: "",
    bridge_expected_version: "",
    bridge_package: "",
    browser_origin: "",
    repo_url: "",
    smoke_mode: "",
  };

  const mode = String(env.LAF_SMOKE_MODE || "").trim().toLowerCase();
  if (mode === "api" || mode === "cli") {
    normalized.smoke_mode = mode;
  } else {
    errors.push("smoke_mode must be api or cli");
  }

  const api = normalizeDeployedAPIURL(env.LAF_HOSTED_API_URL || "");
  if (api.error) errors.push(api.error);
  else normalized.api_url = api.value;

  const browserOrigin = String(env.LAF_SMOKE_BROWSER_ORIGIN || "").trim();
  if (browserOrigin) {
    const checked = normalizeDeployedOrigin(browserOrigin, "browser_origin");
    if (checked.error) errors.push(checked.error);
    else normalized.browser_origin = checked.value;
  }

  const packageSpec = String(env.LAF_BRIDGE_NPX_PACKAGE || "").trim();
  if (!packageSpecPattern.test(packageSpec)) {
    errors.push(
      "bridge_package must be laf-bridge@latest or an exact laf-bridge npm SemVer package without build metadata",
    );
  } else {
    normalized.bridge_package = packageSpec;
  }

  const expectedVersion = String(env.LAF_BRIDGE_EXPECT_VERSION || "").trim();
  if (expectedVersion) {
    if (/[\r\n]/.test(expectedVersion)) {
      errors.push("bridge_expected_version must not contain newlines");
    } else if (!new RegExp(`^${npmSemVerPattern}$`).test(expectedVersion)) {
      errors.push(
        "bridge_expected_version must be an npm-compatible SemVer without build metadata",
      );
    } else {
      normalized.bridge_expected_version = expectedVersion;
    }
  }

  const repo = normalizeGitHubRepoURL(env.LAF_SMOKE_REPO_URL || "");
  if (repo.error) errors.push(repo.error);
  else normalized.repo_url = repo.value;

  if (!String(env.LAF_SMOKE_EMAIL || "").trim()) {
    errors.push("missing LAF_SMOKE_EMAIL");
  }
  if (!String(env.LAF_SMOKE_PASSWORD || "").trim()) {
    errors.push("missing LAF_SMOKE_PASSWORD");
  }

  return {
    errors,
    normalized,
    ok: errors.length === 0,
  };
}

function normalizeDeployedAPIURL(raw) {
  const checked = normalizeDeployedURL(raw, "api_url");
  if (checked.error) return checked;
  const pathname = checked.url.pathname.replace(/\/+$/, "");
  if (!pathname.endsWith("/api")) {
    return { error: "api_url must be the deployed hosted API URL ending in /api" };
  }
  checked.url.pathname = pathname || "/api";
  return { value: checked.url.toString().replace(/\/+$/, "") };
}

function normalizeDeployedOrigin(raw, label) {
  const checked = normalizeDeployedURL(raw, label);
  if (checked.error) return checked;
  if (checked.url.pathname !== "/") {
    return { error: `${label} must be an origin without a path, query, or hash` };
  }
  return { value: `${checked.url.protocol}//${checked.url.host}` };
}

function normalizeDeployedURL(raw, label) {
  const value = String(raw || "").trim();
  if (!value) return { error: `${label} is required` };
  if (/[\r\n]/.test(value)) return { error: `${label} must not contain newlines` };
  if (!/^https?:\/\//i.test(value)) {
    return { error: `${label} must be an absolute https URL` };
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    return { error: `${label} must be a valid URL` };
  }
  if (url.protocol !== "https:") return { error: `${label} must use https` };
  if (!url.hostname || url.username || url.password) {
    return { error: `${label} must be a valid public URL` };
  }
  if (url.search || url.hash) {
    return { error: `${label} must not include a query string or hash` };
  }
  if (isLocalHost(url.hostname)) {
    return { error: `${label} must not point at localhost or a private network address` };
  }
  return { url };
}

function normalizeGitHubRepoURL(raw) {
  const value = String(raw || "").trim();
  if (!value) return { error: "repo_url is required" };
  if (/[\r\n]/.test(value)) return { error: "repo_url must not contain newlines" };
  let url;
  try {
    url = new URL(value);
  } catch {
    return { error: "repo_url must be a valid GitHub repository URL" };
  }
  if (url.protocol !== "https:" || url.hostname !== "github.com" || url.username || url.password) {
    return { error: "repo_url must be an https://github.com/<owner>/<repo> URL" };
  }
  if (url.search || url.hash) {
    return { error: "repo_url must not include a query string or hash" };
  }
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length < 2 || parts[0].startsWith(".") || parts[1].startsWith(".")) {
    return { error: "repo_url must include a GitHub owner and repository" };
  }
  url.pathname = `/${parts[0]}/${parts[1].replace(/\.git$/i, "")}`;
  return { value: url.toString().replace(/\/+$/, "") };
}

function printText(result) {
  const lines = [];
  if (result.ok) {
    lines.push("[hosted-bridge-deploy-inputs] PASS deployed smoke inputs are ready");
    lines.push(`[hosted-bridge-deploy-inputs] api_url: ${result.normalized.api_url}`);
    lines.push(`[hosted-bridge-deploy-inputs] smoke_mode: ${result.normalized.smoke_mode}`);
    lines.push(`[hosted-bridge-deploy-inputs] bridge_package: ${result.normalized.bridge_package}`);
    if (result.normalized.bridge_expected_version) {
      lines.push(`[hosted-bridge-deploy-inputs] bridge_expected_version: ${result.normalized.bridge_expected_version}`);
    }
    if (result.normalized.browser_origin) {
      lines.push(`[hosted-bridge-deploy-inputs] browser_origin: ${result.normalized.browser_origin}`);
    }
    lines.push(`[hosted-bridge-deploy-inputs] repo_url: ${result.normalized.repo_url}`);
  } else {
    lines.push("[hosted-bridge-deploy-inputs] FAIL deployed smoke inputs are not ready");
    for (const error of result.errors) {
      lines.push(`[hosted-bridge-deploy-inputs] ERROR ${error}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

function githubEnvAssignments(normalized) {
  return [
    ["LAF_BRIDGE_EXPECT_VERSION", normalized.bridge_expected_version],
    ["LAF_BRIDGE_NPX_PACKAGE", normalized.bridge_package],
    ["LAF_HOSTED_API_URL", normalized.api_url],
    ["LAF_SMOKE_BROWSER_ORIGIN", normalized.browser_origin],
    ["LAF_SMOKE_BRIDGE_CMD", `npx --yes ${normalized.bridge_package}`],
    ["LAF_SMOKE_MODE", normalized.smoke_mode],
    ["LAF_SMOKE_REPO_URL", normalized.repo_url],
  ];
}

function appendGitHubEnv(normalized, env = process.env) {
  const githubEnv = String(env.GITHUB_ENV || "").trim();
  if (!githubEnv) {
    throw new Error("GITHUB_ENV is required when using --github-env");
  }
  const lines = githubEnvAssignments(normalized)
    .map(([key, value]) => {
      if (/[\r\n]/.test(String(value))) {
        throw new Error(`${key} contains a newline and cannot be written to GITHUB_ENV`);
      }
      return `${key}=${value}`;
    })
    .join("\n");
  fs.appendFileSync(githubEnv, `${lines}\n`, "utf8");
}

function parseArgs(argv) {
  const args = { githubEnv: false, help: false };
  for (const arg of argv) {
    if (arg === "--github-env") {
      args.githubEnv = true;
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return args;
}

function usage(message = "", exitCode = 0) {
  const out = message ? process.stderr : process.stdout;
  if (message) out.write(`${message}\n\n`);
  out.write(
    [
      "usage: node scripts/hosted-bridge-deploy-inputs.cjs [--github-env]",
      "",
      "Validates deployed hosted Bridge smoke inputs.",
      "Use --github-env in GitHub Actions to export normalized non-secret inputs",
      "and the public npx Bridge smoke command for later workflow steps.",
      "",
    ].join("\n"),
  );
  process.exit(exitCode);
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    usage(err.message, 1);
  }
  if (args.help) usage("", 0);

  const result = validateDeploySmokeInputs(process.env);
  process.stdout.write(printText(result));
  if (result.ok && args.githubEnv) {
    try {
      appendGitHubEnv(result.normalized);
    } catch (err) {
      process.stderr.write(`[hosted-bridge-deploy-inputs] ERROR ${err.message}\n`);
      process.exit(1);
    }
  }
  process.exit(result.ok ? 0 : 1);
}

if (require.main === module) {
  main();
}

module.exports = {
  appendGitHubEnv,
  githubEnvAssignments,
  normalizeDeployedAPIURL,
  normalizeDeployedOrigin,
  normalizeGitHubRepoURL,
  parseArgs,
  printText,
  validateDeploySmokeInputs,
};
