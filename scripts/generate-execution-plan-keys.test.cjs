"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");
const script = path.join(repoRoot, "scripts", "generate-execution-plan-keys.cjs");
const {
  defaultKeyID,
  formatEnvFile,
  formatText,
  generateExecutionPlanKeys,
  parseArgs,
} = require(script);
const {
  parseEnvFileText,
  runPreflight,
} = require(path.join(repoRoot, "scripts", "hosted-env-preflight.cjs"));

test("generates an Ed25519 execution plan signing key pair", () => {
  const keys = generateExecutionPlanKeys("execution-plan-test");
  assert.equal(keys.key_id, "execution-plan-test");
  assert.match(keys.private_key_pem, /BEGIN PRIVATE KEY/);
  assert.match(keys.public_key_pem, /BEGIN PUBLIC KEY/);
  assert.match(keys.public_key_fingerprint, /^[A-Za-z0-9_-]+$/);

  const privateKey = crypto.createPrivateKey(keys.private_key_pem);
  const publicKey = crypto.createPublicKey(keys.public_key_pem);
  assert.equal(privateKey.asymmetricKeyType, "ed25519");
  assert.equal(publicKey.asymmetricKeyType, "ed25519");
  const payload = Buffer.from("execution plan");
  const signature = crypto.sign(null, payload, privateKey);
  assert.equal(crypto.verify(null, payload, publicKey, signature), true);
});

test("JSON output is valid and uses the requested key id", () => {
  const output = execFileSync(process.execPath, [
    script,
    "--json",
    "--key-id",
    "execution-plan-ci",
  ]).toString("utf8");
  const parsed = JSON.parse(output);
  assert.equal(parsed.key_id, "execution-plan-ci");
  assert.match(parsed.private_key_pem, /BEGIN PRIVATE KEY/);
  assert.match(parsed.public_key_pem, /BEGIN PUBLIC KEY/);
});

test("text output names the required hosted env vars without legacy commands", () => {
  const rendered = formatText(generateExecutionPlanKeys("execution-plan-doc"));
  assert.match(rendered, /LAF_EXECUTION_PLAN_SIGNING_PRIVATE_KEY/);
  assert.match(rendered, /LAF_EXECUTION_PLAN_SIGNING_PUBLIC_KEY/);
  assert.match(rendered, /npm run hosted-bridge:preflight/);
});

test("dotenv output is directly usable by hosted preflight", () => {
  const keys = generateExecutionPlanKeys("execution-plan-dotenv");
  const rendered = formatEnvFile(keys);
  assert.match(rendered, /LAF_EXECUTION_PLAN_SIGNING_PRIVATE_KEY="/);
  assert.match(rendered, /BEGIN PRIVATE KEY/);
  assert.match(rendered, /npm run hosted-bridge:preflight/);

  const parsed = parseEnvFileText(rendered);
  assert.equal(parsed.LAF_EXECUTION_PLAN_SIGNING_KEY_ID, "execution-plan-dotenv");
  assert.equal(parsed.LAF_EXECUTION_PLAN_SIGNING_PUBLIC_KEY, keys.public_key_pem);
  assert.equal(parsed.LAF_EXECUTION_PLAN_SIGNING_PRIVATE_KEY, keys.private_key_pem);

  const result = runPreflight({
    ...parsed,
    LAF_OFFICE_PUBLIC_HOST: "office.example.com",
    SUPABASE_ANON_KEY: "anon",
    SUPABASE_SERVICE_ROLE_KEY: "service-role",
    SUPABASE_URL: "https://project.supabase.co",
  });
  assert.equal(result.ok, true, result.errors.join("\n"));
});

test("dotenv CLI output can be parsed as dotenv-style assignments", () => {
  const output = execFileSync(process.execPath, [
    script,
    "--dotenv",
    "--key-id",
    "execution-plan-cli-env",
  ]).toString("utf8");
  const parsed = parseEnvFileText(output);
  assert.equal(parsed.LAF_EXECUTION_PLAN_SIGNING_KEY_ID, "execution-plan-cli-env");
  assert.match(parsed.LAF_EXECUTION_PLAN_SIGNING_PRIVATE_KEY, /BEGIN PRIVATE KEY/);
  assert.match(parsed.LAF_EXECUTION_PLAN_SIGNING_PUBLIC_KEY, /BEGIN PUBLIC KEY/);
});

test("key generator args support dotenv output", () => {
  assert.deepEqual(parseArgs(["--dotenv", "--key-id", "execution-plan-args"]), {
    format: "dotenv",
    keyID: "execution-plan-args",
  });
});

test("default key id is production-month scoped", () => {
  assert.equal(defaultKeyID(new Date("2026-05-19T00:00:00Z")), "execution-plan-prod-2026-05");
});
