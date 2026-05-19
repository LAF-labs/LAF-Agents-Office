"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");
const { generateExecutionPlanKeys } = require(path.join(
  repoRoot,
  "scripts",
  "generate-execution-plan-keys.cjs",
));
const {
  normalizeAPIBase,
  normalizeOrigin,
  normalizePublicAPIBase,
  loadPreflightEnv,
  parseArgs,
  parseEnvFileText,
  printText,
  remediationHints,
  runPreflight,
} = require(path.join(repoRoot, "scripts", "hosted-env-preflight.cjs"));

function validEnv(overrides = {}) {
  const keys = generateExecutionPlanKeys("execution-plan-prod-test");
  return {
    LAF_EXECUTION_PLAN_SIGNING_KEY_ID: keys.key_id,
    LAF_EXECUTION_PLAN_SIGNING_PRIVATE_KEY: keys.private_key_pem,
    LAF_EXECUTION_PLAN_SIGNING_PUBLIC_KEY: keys.public_key_pem,
    LAF_OFFICE_ALLOWED_ORIGINS: "https://office.example.com, https://app.example.com",
    LAF_OFFICE_PUBLIC_HOST: "office.example.com",
    SUPABASE_ANON_KEY: "anon",
    SUPABASE_SERVICE_ROLE_KEY: "service-role",
    SUPABASE_URL: "https://project.supabase.co",
    ...overrides,
  };
}

test("preflight passes a production hosted Bridge env", () => {
  const result = runPreflight(validEnv());
  assert.equal(result.ok, true, result.errors.join("\n"));
  assert.equal(result.normalized.public_host, "https://office.example.com");
  assert.equal(result.normalized.bridge_setup_api_base, "https://office.example.com/api");
  assert.equal(result.normalized.supabase_url, "https://project.supabase.co");
  assert.equal(result.normalized.signing_key_id, "execution-plan-prod-test");
  assert.equal(result.normalized.allowed_origins.length, 2);
  assert.match(result.normalized.signing_key_fingerprint, /^[A-Za-z0-9_-]+$/);

  const normalizedOrigins = runPreflight(
    validEnv({
      LAF_OFFICE_ALLOWED_ORIGINS: "office.example.com, https://app.example.com/",
    }),
  );
  assert.equal(normalizedOrigins.ok, true, normalizedOrigins.errors.join("\n"));
  assert.deepEqual(normalizedOrigins.normalized.allowed_origins, [
    "https://office.example.com",
    "https://app.example.com",
  ]);
});

test("preflight loads env files without leaking secret values", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "laf-preflight-env-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const keys = generateExecutionPlanKeys("execution-plan-prod-dotenv");
  const envFile = path.join(dir, ".env.local");
  await fs.writeFile(
    envFile,
    [
      "# local hosted Bridge deployment rehearsal",
      "SUPABASE_URL=https://project.supabase.co",
      "SUPABASE_SERVICE_ROLE_KEY=service-secret-from-file",
      "SUPABASE_ANON_KEY=anon-secret-from-file",
      "LAF_OFFICE_PUBLIC_HOST=office.example.com",
      "LAF_OFFICE_ALLOWED_ORIGINS=office.example.com",
      `LAF_EXECUTION_PLAN_SIGNING_KEY_ID=${keys.key_id}`,
      `LAF_EXECUTION_PLAN_SIGNING_PUBLIC_KEY="${keys.public_key_pem}"`,
      `LAF_EXECUTION_PLAN_SIGNING_PRIVATE_KEY="${keys.private_key_pem}"`,
      "",
    ].join("\n"),
  );

  const loaded = loadPreflightEnv({}, [envFile]);
  assert.deepEqual(loaded.loaded, [envFile]);
  const result = runPreflight(loaded.env);
  assert.equal(result.ok, true, result.errors.join("\n"));
  const rendered = printText(result);
  assert.match(rendered, /PASS hosted Bridge deployment env is ready/);
  assert.match(rendered, /Supabase URL: https:\/\/project\.supabase\.co/);
  assert.doesNotMatch(rendered, /service-secret-from-file/);
  assert.doesNotMatch(rendered, /anon-secret-from-file/);
  assert.doesNotMatch(rendered, /BEGIN PRIVATE KEY/);
});

test("env file loading keeps shell env authoritative and allows local override files", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "laf-preflight-override-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const envPath = path.join(dir, ".env");
  const localPath = path.join(dir, ".env.local");
  await fs.writeFile(
    envPath,
    [
      "SUPABASE_URL=https://file.supabase.co",
      "LAF_OFFICE_PUBLIC_HOST=https://file.example.com",
      "",
    ].join("\n"),
  );
  await fs.writeFile(localPath, "LAF_OFFICE_PUBLIC_HOST=https://local.example.com\n");

  const loaded = loadPreflightEnv({ SUPABASE_URL: "https://shell.supabase.co" }, [
    envPath,
    localPath,
  ]);
  assert.equal(loaded.env.SUPABASE_URL, "https://shell.supabase.co");
  assert.equal(loaded.env.LAF_OFFICE_PUBLIC_HOST, "https://local.example.com");
});

test("env file parser preserves literal escaped newlines for PEM validation", () => {
  const parsed = parseEnvFileText(
    [
      'LAF_EXECUTION_PLAN_SIGNING_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----"',
      "export LAF_OFFICE_PUBLIC_HOST=office.example.com # comment",
      "",
    ].join("\n"),
  );
  assert.equal(
    parsed.LAF_EXECUTION_PLAN_SIGNING_PRIVATE_KEY,
    "-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----",
  );
  assert.equal(parsed.LAF_OFFICE_PUBLIC_HOST, "office.example.com");
});

test("preflight args load default dotenv files unless explicitly disabled", () => {
  const defaults = parseArgs([]);
  assert(defaults.envFiles.some((file) => file.endsWith(".env.local")));
  const disabled = parseArgs(["--no-env-file"]);
  assert.deepEqual(disabled.envFiles, []);
  const custom = parseArgs(["--dotenv", "/tmp/laf-hosted.env"]);
  assert(custom.envFiles.includes(path.resolve("/tmp/laf-hosted.env")));
});

test("preflight validates split-origin browser API base and required CORS origin", () => {
  const split = runPreflight(
    validEnv({
      LAF_OFFICE_PUBLIC_API_BASE_URL: "https://api.example.com/api/",
      VITE_LAF_API_BASE_URL: "https://api.example.com/api/",
    }),
  );
  assert.equal(split.ok, true, split.errors.join("\n"));
  assert.equal(split.normalized.public_api_base, "https://api.example.com/api");
  assert.equal(split.normalized.browser_api_base, "https://api.example.com/api");
  assert.equal(split.normalized.bridge_setup_api_base, "https://api.example.com/api");

  const splitBareHost = runPreflight(
    validEnv({
      LAF_OFFICE_PUBLIC_API_BASE_URL: "api.example.com",
      VITE_LAF_API_BASE_URL: "api.example.com",
    }),
  );
  assert.equal(splitBareHost.ok, true, splitBareHost.errors.join("\n"));
  assert.equal(splitBareHost.normalized.public_api_base, "https://api.example.com/api");
  assert.equal(splitBareHost.normalized.browser_api_base, "https://api.example.com/api");

  const missingAllowedOrigin = runPreflight(
    validEnv({
      LAF_OFFICE_ALLOWED_ORIGINS: "https://app.example.com",
      LAF_OFFICE_PUBLIC_API_BASE_URL: "https://api.example.com/api",
      VITE_LAF_API_BASE_URL: "https://api.example.com/api",
    }),
  );
  assert.equal(missingAllowedOrigin.ok, false);
  assert.match(missingAllowedOrigin.errors.join("\n"), /must include LAF_OFFICE_PUBLIC_HOST/);

  const sameOrigin = runPreflight(
    validEnv({
      LAF_OFFICE_ALLOWED_ORIGINS: "",
      LAF_OFFICE_PUBLIC_API_BASE_URL: "/api",
      VITE_LAF_API_BASE_URL: "https://office.example.com/api",
    }),
  );
  assert.equal(sameOrigin.ok, true, sameOrigin.errors.join("\n"));
  assert.match(sameOrigin.warnings.join("\n"), /same-origin/);
  assert.equal(sameOrigin.normalized.public_api_base, "https://office.example.com/api");
  assert.equal(sameOrigin.normalized.bridge_setup_api_base, "https://office.example.com/api");
});

test("preflight reports the effective Bridge setup API base when public API env is omitted", () => {
  const browserOnly = runPreflight(
    validEnv({
      VITE_LAF_API_BASE_URL: "https://api.example.com/api",
    }),
  );
  assert.equal(browserOnly.ok, true, browserOnly.errors.join("\n"));
  assert.equal(browserOnly.normalized.public_api_base, "");
  assert.equal(browserOnly.normalized.browser_api_base, "https://api.example.com/api");
  assert.equal(browserOnly.normalized.bridge_setup_api_base, "https://api.example.com/api");

  const rendered = printText(browserOnly);
  assert.match(rendered, /Bridge setup API base: https:\/\/api\.example\.com\/api/);
});

test("preflight rejects mismatched public and browser API bases", () => {
  const result = runPreflight(
    validEnv({
      LAF_OFFICE_PUBLIC_API_BASE_URL: "https://api.example.com/api",
      VITE_LAF_API_BASE_URL: "https://api-other.example.com/api",
    }),
  );
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /must match VITE_LAF_API_BASE_URL/);
});

test("preflight fails closed for missing signing keys and canonical host", () => {
  const result = runPreflight({
    SUPABASE_ANON_KEY: "anon",
    SUPABASE_SERVICE_ROLE_KEY: "service-role",
    SUPABASE_URL: "https://project.supabase.co",
  });
  assert.equal(result.ok, false);
  assert(result.errors.includes("missing LAF_OFFICE_PUBLIC_HOST or VERCEL_URL"));
  assert(result.errors.includes("missing LAF_EXECUTION_PLAN_SIGNING_PRIVATE_KEY"));
  assert(result.errors.includes("missing LAF_EXECUTION_PLAN_SIGNING_PUBLIC_KEY"));
  assert(result.errors.includes("missing LAF_EXECUTION_PLAN_SIGNING_KEY_ID"));
  const rendered = printText(result);
  assert.match(rendered, /NEXT generate signing keys with `npm run hosted-bridge:keys -- --dotenv/);
  assert.match(rendered, /NEXT set LAF_OFFICE_PUBLIC_HOST to the production web origin/);
  assert.match(rendered, /NEXT rerun `npm run hosted-bridge:preflight`/);
});

test("preflight failure output gives actionable setup hints without secrets", () => {
  const result = runPreflight({});
  const rendered = printText(result);
  assert.match(rendered, /NEXT set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and SUPABASE_ANON_KEY/);
  assert.match(rendered, /NEXT generate signing keys with `npm run hosted-bridge:keys -- --dotenv/);
  assert.match(rendered, /NEXT set LAF_OFFICE_PUBLIC_HOST to the production web origin/);
  assert.match(rendered, /NEXT rerun `npm run hosted-bridge:preflight`/);
  assert.doesNotMatch(rendered, /service-role/);
  assert.doesNotMatch(rendered, /BEGIN PRIVATE KEY/);
});

test("preflight remediation hints stay deduplicated and targeted", () => {
  const hints = remediationHints([
    "missing SUPABASE_URL",
    "missing SUPABASE_ANON_KEY",
    "LAF_OFFICE_PUBLIC_API_BASE_URL must match VITE_LAF_API_BASE_URL after normalization",
    "LAF_OFFICE_PUBLIC_API_BASE_URL must not point at localhost or a private network address",
  ]);
  assert.equal(hints.filter((hint) => hint.includes("SUPABASE_URL")).length, 1);
  assert(hints.some((hint) => hint.includes("normalize to the same deployed /api base")));
  assert(hints.some((hint) => hint.includes("public HTTPS deployment URLs")));
  assert.equal(hints.at(-1), "rerun `npm run hosted-bridge:preflight` before deploying or smoke testing");
});

test("preflight rejects hosts with paths and private localhost deployment URLs", () => {
  const withPath = runPreflight(validEnv({ LAF_OFFICE_PUBLIC_HOST: "https://office.example.com/api" }));
  assert.equal(withPath.ok, false);
  assert.match(withPath.errors.join("\n"), /origin without a path/);

  const local = runPreflight(validEnv({ LAF_OFFICE_PUBLIC_HOST: "https://127.0.0.1:3000" }));
  assert.equal(local.ok, false);
  assert.match(local.errors.join("\n"), /localhost or a private network address/);

  for (const privateHost of [
    "https://0.0.0.0:3000",
    "https://10.0.0.5",
    "https://172.16.0.5",
    "https://192.168.1.5",
    "https://169.254.1.5",
    "https://100.64.1.5",
    "https://[fd00::1]",
    "https://[fe80::1]",
  ]) {
    const result = runPreflight(validEnv({ LAF_OFFICE_PUBLIC_HOST: privateHost }));
    assert.equal(result.ok, false, `${privateHost} should be rejected`);
    assert.match(result.errors.join("\n"), /localhost or a private network address/);
  }
});

test("preflight rejects escaped PEM newlines that the hosted API cannot import", () => {
  const env = validEnv();
  const result = runPreflight({
    ...env,
    LAF_EXECUTION_PLAN_SIGNING_PRIVATE_KEY: env.LAF_EXECUTION_PLAN_SIGNING_PRIVATE_KEY.replace(/\n/g, "\\n"),
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /real newlines/);
});

test("allow-localhost mode supports local API rehearsal", () => {
  const result = runPreflight(
    validEnv({
      LAF_OFFICE_ALLOWED_ORIGINS: "http://localhost:5173",
      LAF_OFFICE_PUBLIC_HOST: "http://127.0.0.1:3000",
      SUPABASE_URL: "http://127.0.0.1:54321",
    }),
    { allowLocalhost: true },
  );
  assert.equal(result.ok, true, result.errors.join("\n"));
  assert.equal(result.normalized.public_host, "http://127.0.0.1:3000");
});

test("preflight help keeps localhost allowance scoped to local rehearsal", () => {
  const result = spawnSync(
    process.execPath,
    [path.join(repoRoot, "scripts", "hosted-env-preflight.cjs"), "--help"],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /--allow-localhost/);
  assert.match(result.stdout, /--dotenv <path>/);
  assert.match(result.stdout, /\.env\.local/);
  assert.match(result.stdout, /local hosted-API rehearsals/);
  assert.match(result.stdout, /never as a production gate/);
});

test("normalizer accepts Vercel-style bare hostnames", () => {
  const checked = normalizeOrigin("laf-office.vercel.app", "LAF_OFFICE_PUBLIC_HOST", {
    forceHTTPS: true,
    requireHTTPS: true,
  });
  assert.equal(checked.value, "https://laf-office.vercel.app");
});

test("browser API base normalizer accepts bare hosts and rejects unsafe production URLs", () => {
  assert.equal(
    normalizeAPIBase("https://api.example.com", "VITE_LAF_API_BASE_URL", {
      requireHTTPS: true,
    }).value,
    "https://api.example.com/api",
  );
  assert.equal(
    normalizeAPIBase("api.example.com", "VITE_LAF_API_BASE_URL", {
      requireHTTPS: true,
    }).value,
    "https://api.example.com/api",
  );
  assert.equal(
    normalizeAPIBase("api.example.com/custom-api/", "VITE_LAF_API_BASE_URL", {
      requireHTTPS: true,
    }).value,
    "https://api.example.com/custom-api",
  );
  assert.equal(
    normalizeAPIBase("api/", "VITE_LAF_API_BASE_URL", {
      requireHTTPS: true,
    }).value,
    "/api",
  );
  assert.match(
    normalizeAPIBase("http://api.example.com/api", "VITE_LAF_API_BASE_URL", {
      requireHTTPS: true,
    }).error || "",
    /must use https/,
  );
  assert.match(
    normalizeAPIBase("https://127.0.0.1:3000/api", "VITE_LAF_API_BASE_URL", {
      requireHTTPS: true,
    }).error || "",
    /localhost or a private network address/,
  );
  assert.match(
    normalizeAPIBase("localhost:3000/api", "VITE_LAF_API_BASE_URL", {
      requireHTTPS: true,
    }).error || "",
    /localhost or a private network address/,
  );
  assert.match(
    normalizeAPIBase("//api.example.com/api", "VITE_LAF_API_BASE_URL", {
      requireHTTPS: true,
    }).error || "",
    /protocol-relative/,
  );
});

test("public API base normalizer accepts bare hosts and rejects unsafe production URLs", () => {
  assert.equal(
    normalizePublicAPIBase("api.example.com", "LAF_OFFICE_PUBLIC_API_BASE_URL", {
      baseOrigin: "https://office.example.com",
      requireHTTPS: true,
    }).value,
    "https://api.example.com/api",
  );
  assert.equal(
    normalizePublicAPIBase("/api/", "LAF_OFFICE_PUBLIC_API_BASE_URL", {
      baseOrigin: "https://office.example.com",
      requireHTTPS: true,
    }).value,
    "https://office.example.com/api",
  );
  assert.match(
    normalizePublicAPIBase("api/", "LAF_OFFICE_PUBLIC_API_BASE_URL", {
      baseOrigin: "https://office.example.com",
      requireHTTPS: true,
    }).error || "",
    /absolute URL, bare host, or \/api path/,
  );
  assert.match(
    normalizePublicAPIBase("https://127.0.0.1:3000/api", "LAF_OFFICE_PUBLIC_API_BASE_URL", {
      baseOrigin: "https://office.example.com",
      requireHTTPS: true,
    }).error || "",
    /localhost or a private network address/,
  );
});

test("text output does not print secret key material", () => {
  const env = validEnv();
  const result = runPreflight(env);
  const rendered = printText(result);
  assert.match(rendered, /PASS hosted Bridge deployment env is ready/);
  assert.match(rendered, /Bridge setup API base: https:\/\/office\.example\.com\/api/);
  assert.doesNotMatch(rendered, /BEGIN PRIVATE KEY/);
  assert.doesNotMatch(rendered, /service-role/);
});
