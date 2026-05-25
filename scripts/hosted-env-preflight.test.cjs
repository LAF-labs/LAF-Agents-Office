"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");
const {
  loadPreflightEnv,
  normalizeAPIBase,
  normalizeOrigin,
  normalizePublicAPIBase,
  parseArgs,
  parseEnvFileText,
  printText,
  remediationHints,
  runPreflight,
} = require(path.join(repoRoot, "scripts", "hosted-env-preflight.cjs"));

function validEnv(overrides = {}) {
  return {
    LAF_OFFICE_ALLOWED_ORIGINS:
      "https://office.example.com, https://app.example.com",
    LAF_OFFICE_PUBLIC_HOST: "office.example.com",
    SUPABASE_ANON_KEY: "anon",
    SUPABASE_SERVICE_ROLE_KEY: "service-role",
    SUPABASE_URL: "https://project.supabase.co",
    ...overrides,
  };
}

test("preflight passes a production cloud office env", () => {
  const result = runPreflight(validEnv());
  assert.equal(result.ok, true, result.errors.join("\n"));
  assert.equal(result.normalized.public_host, "https://office.example.com");
  assert.equal(result.normalized.effective_api_base, "https://office.example.com/api");
  assert.equal(result.normalized.supabase_url, "https://project.supabase.co");
  assert.equal(result.normalized.allowed_origins.length, 2);

  const rendered = printText(result);
  assert.match(rendered, /PASS hosted Startup Office env is ready/);
  assert.match(rendered, /effective API base: https:\/\/office\.example\.com\/api/);
});

test("preflight supports split-origin API deployments", () => {
  const result = runPreflight(
    validEnv({
      LAF_OFFICE_ALLOWED_ORIGINS: "https://office.example.com",
      LAF_OFFICE_PUBLIC_API_BASE_URL: "https://api.example.com/api",
      VITE_LAF_API_BASE_URL: "https://api.example.com/api/",
    }),
  );

  assert.equal(result.ok, true, result.errors.join("\n"));
  assert.equal(result.normalized.public_api_base, "https://api.example.com/api");
  assert.equal(result.normalized.browser_api_base, "https://api.example.com/api");
  assert.equal(result.normalized.effective_api_base, "https://api.example.com/api");
});

test("preflight loads env files without leaking secret values", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "laf-preflight-env-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const envFile = path.join(dir, ".env.local");
  await fs.writeFile(
    envFile,
    [
      "# local cloud deployment rehearsal",
      "SUPABASE_URL=https://project.supabase.co",
      "SUPABASE_SERVICE_ROLE_KEY=service-secret-from-file",
      "SUPABASE_ANON_KEY=anon-secret-from-file",
      "LAF_OFFICE_PUBLIC_HOST=office.example.com",
      "LAF_OFFICE_ALLOWED_ORIGINS=office.example.com",
    ].join("\n"),
  );

  const { env, loaded } = loadPreflightEnv({}, [envFile]);
  assert.deepEqual(loaded, [envFile]);
  const result = runPreflight(env);
  assert.equal(result.ok, true, result.errors.join("\n"));
  const rendered = printText(result);
  assert.doesNotMatch(rendered, /service-secret-from-file|anon-secret-from-file/);
});

test("preflight reports missing required cloud env with actionable hints", () => {
  const result = runPreflight({});
  assert.equal(result.ok, false);
  assert(result.errors.includes("missing SUPABASE_URL"));
  assert(result.errors.includes("missing SUPABASE_SERVICE_ROLE_KEY"));
  assert(result.errors.includes("missing SUPABASE_ANON_KEY"));
  assert(result.errors.includes("missing LAF_OFFICE_PUBLIC_HOST or VERCEL_URL"));

  const hints = remediationHints(result.errors);
  assert(hints.some((hint) => hint.includes("SUPABASE_URL")));
  assert.equal(
    hints.at(-1),
    "rerun `npm run hosted-env:preflight` before deploying or smoke testing",
  );
});

test("env parsing and API base normalization remain strict", () => {
  assert.deepEqual(parseArgs(["--json", "--allow-localhost"]), {
    allowLocalhost: true,
    envFiles: [path.join(repoRoot, ".env"), path.join(repoRoot, ".env.local")],
    json: true,
  });
  assert.equal(
    parseEnvFileText('export FOO="bar\\nbaz"\nPLAIN=value # comment').FOO,
    "bar\\nbaz",
  );
  assert.equal(normalizeAPIBase("api.example.com").value, "https://api.example.com/api");
  assert.equal(
    normalizePublicAPIBase("https://api.example.com/custom/", "PUBLIC").value,
    "https://api.example.com/custom",
  );
  assert.equal(
    normalizeOrigin("office.example.com", "HOST", { forceHTTPS: true }).value,
    "https://office.example.com",
  );
});
