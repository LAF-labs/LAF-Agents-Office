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
  assert.equal(result.normalized.outbox_email_provider, "in_app");
  assert.equal(result.normalized.outbox_batch_size, 25);
  assert.equal(result.normalized.outbox_lock_ms, 300000);

  const rendered = printText(result);
  assert.match(rendered, /PASS hosted Startup Office env is ready/);
  assert.match(rendered, /effective API base: https:\/\/office\.example\.com\/api/);
  assert.match(rendered, /outbox email provider: in_app/);
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

test("preflight validates Resend outbox email deployment env", () => {
  const result = runPreflight(
    validEnv({
      LAF_EMAIL_FROM: "LAF Startup Office <founder@example.com>",
      LAF_EMAIL_REPLY_TO: "support@example.com",
      LAF_OUTBOX_BATCH_SIZE: "50",
      LAF_OUTBOX_EMAIL_PROVIDER: "resend",
      LAF_OUTBOX_LOCK_MS: "120000",
      RESEND_API_KEY: "resend-key",
    }),
  );

  assert.equal(result.ok, true, result.errors.join("\n"));
  assert.equal(result.normalized.outbox_email_provider, "resend");
  assert.equal(result.normalized.outbox_batch_size, 50);
  assert.equal(result.normalized.outbox_lock_ms, 120000);
});

test("preflight validates Startup Office AI worker env when provider is configured", () => {
  const result = runPreflight(
    validEnv({
      LAF_OFFICE_OPENAI_API_KEY: "openai-key",
      LAF_OFFICE_STARTUP_OFFICE_AI_PROVIDER: "openai",
      LAF_OFFICE_STARTUP_OFFICE_MODEL: "gpt-5-mini",
    }),
  );

  assert.equal(result.ok, true, result.errors.join("\n"));
  assert.equal(result.normalized.startup_office_ai_provider, "openai");
  assert.equal(result.normalized.startup_office_model, "gpt-5-mini");
  assert.match(printText(result), /Startup Office AI provider: openai/);
});

test("preflight rejects broken Startup Office AI worker env", () => {
  const missingKey = runPreflight(
    validEnv({
      LAF_OFFICE_STARTUP_OFFICE_AI_PROVIDER: "openai",
    }),
  );
  assert.equal(missingKey.ok, false);
  assert(
    missingKey.errors.includes(
      "missing LAF_OFFICE_OPENAI_API_KEY or OPENAI_API_KEY for Startup Office AI worker",
    ),
  );

  const unsupported = runPreflight(
    validEnv({
      LAF_OFFICE_STARTUP_OFFICE_AI_PROVIDER: "anthropic",
    }),
  );
  assert.equal(unsupported.ok, false);
  assert(
    unsupported.errors.includes(
      "LAF_OFFICE_STARTUP_OFFICE_AI_PROVIDER must be one of openai, fake, or disabled",
    ),
  );
});

test("preflight rejects broken outbox email env", () => {
  const result = runPreflight(
    validEnv({
      LAF_EMAIL_FROM: "not-an-email",
      LAF_EMAIL_REPLY_TO: "support",
      LAF_OUTBOX_BATCH_SIZE: "0",
      LAF_OUTBOX_EMAIL_PROVIDER: "resend",
      LAF_OUTBOX_LOCK_MS: "999",
    }),
  );

  assert.equal(result.ok, false);
  assert(result.errors.includes("missing RESEND_API_KEY"));
  assert(result.errors.includes("LAF_EMAIL_FROM must be an email address or Name <email@example.com>"));
  assert(result.errors.includes("LAF_EMAIL_REPLY_TO must be an email address"));
  assert(result.errors.includes("LAF_OUTBOX_BATCH_SIZE must be an integer between 1 and 100"));
  assert(result.errors.includes("LAF_OUTBOX_LOCK_MS must be an integer between 1000 and 3600000"));

  const hints = remediationHints(result.errors);
  assert(hints.some((hint) => hint.includes("LAF_OUTBOX_EMAIL_PROVIDER=resend")));
  assert(hints.some((hint) => hint.includes("LAF_OUTBOX_BATCH_SIZE")));
});

test("preflight rejects unsupported outbox email providers", () => {
  const result = runPreflight(
    validEnv({
      LAF_OUTBOX_EMAIL_PROVIDER: "smtp",
    }),
  );

  assert.equal(result.ok, false);
  assert(result.errors.includes("LAF_OUTBOX_EMAIL_PROVIDER must be one of in_app, none, or resend"));
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
