#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");

function generateExecutionPlanKeys(keyID = defaultKeyID()) {
  validateKeyID(keyID);
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
  const privateKeyPEM = privateKey.export({ format: "pem", type: "pkcs8" }).trim();
  const publicKeyPEM = publicKey.export({ format: "pem", type: "spki" }).trim();
  const probe = Buffer.from("laf execution plan signing self-test");
  const signature = crypto.sign(null, probe, privateKey);
  if (!crypto.verify(null, probe, publicKey, signature)) {
    throw new Error("generated execution plan signing key pair failed self-test");
  }
  return {
    key_id: keyID,
    private_key_pem: privateKeyPEM,
    public_key_fingerprint: fingerprintPublicKey(publicKey),
    public_key_pem: publicKeyPEM,
  };
}

function defaultKeyID(now = new Date()) {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `execution-plan-prod-${year}-${month}`;
}

function validateKeyID(value) {
  const keyID = String(value || "").trim();
  if (!/^[A-Za-z0-9._:-]{3,128}$/.test(keyID)) {
    throw new Error(
      "key id must be 3-128 characters using letters, numbers, dot, underscore, colon, or dash",
    );
  }
  return keyID;
}

function fingerprintPublicKey(publicKey) {
  const der = publicKey.export({ format: "der", type: "spki" });
  return crypto.createHash("sha256").update(der).digest("base64url");
}

function formatText(keys) {
  return [
    "# LAF execution plan signing key pair",
    "# Store the private key as a production Vercel secret. The public key and key id",
    "# are returned to LAF Bridge during pairing so it can verify signed plans.",
    "",
    "LAF_EXECUTION_PLAN_SIGNING_KEY_ID",
    keys.key_id,
    "",
    "LAF_EXECUTION_PLAN_SIGNING_PUBLIC_KEY",
    keys.public_key_pem,
    "",
    "LAF_EXECUTION_PLAN_SIGNING_PRIVATE_KEY",
    keys.private_key_pem,
    "",
    `# public key sha256 fingerprint: ${keys.public_key_fingerprint}`,
    "# After setting the environment variables, run:",
    "# npm run hosted-bridge:preflight",
    "",
  ].join("\n");
}

function formatEnvFile(keys) {
  return [
    "# LAF execution plan signing key pair",
    "# Paste this block into .env.local for local preflight, and mirror the",
    "# values into production Vercel environment variables before deployment.",
    `LAF_EXECUTION_PLAN_SIGNING_KEY_ID=${keys.key_id}`,
    `LAF_EXECUTION_PLAN_SIGNING_PUBLIC_KEY="${keys.public_key_pem}"`,
    `LAF_EXECUTION_PLAN_SIGNING_PRIVATE_KEY="${keys.private_key_pem}"`,
    `# public key sha256 fingerprint: ${keys.public_key_fingerprint}`,
    "# After setting the environment variables, run:",
    "# npm run hosted-bridge:preflight",
    "",
  ].join("\n");
}

function parseArgs(argv) {
  const args = {
    format: "text",
    keyID: defaultKeyID(),
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--json") {
      args.format = "json";
    } else if (arg === "--dotenv") {
      args.format = "dotenv";
    } else if (arg === "--key-id") {
      i += 1;
      if (i >= argv.length) throw new Error("--key-id requires a value");
      args.keyID = argv[i];
    } else if (arg.startsWith("--key-id=")) {
      args.keyID = arg.slice("--key-id=".length);
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  args.keyID = validateKeyID(args.keyID);
  return args;
}

function usage(message = "", exitCode = 0) {
  const out = message ? process.stderr : process.stdout;
  if (message) out.write(`${message}\n\n`);
  out.write(
    [
      "usage: node scripts/generate-execution-plan-keys.cjs [--key-id <id>] [--json] [--dotenv]",
      "",
      "Generates a PEM-encoded Ed25519 key pair for hosted LAF Bridge execution plan signing.",
      "",
      "Examples:",
      "  npm run hosted-bridge:keys",
      "  npm run hosted-bridge:keys -- --dotenv --key-id execution-plan-prod-2026-05",
      "  node scripts/generate-execution-plan-keys.cjs --key-id execution-plan-prod-2026-05 --json",
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
  const keys = generateExecutionPlanKeys(args.keyID);
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(keys, null, 2)}\n`);
    return;
  }
  if (args.format === "dotenv") {
    process.stdout.write(formatEnvFile(keys));
    return;
  }
  process.stdout.write(formatText(keys));
}

if (require.main === module) {
  main();
}

module.exports = {
  defaultKeyID,
  fingerprintPublicKey,
  formatEnvFile,
  formatText,
  generateExecutionPlanKeys,
  parseArgs,
  validateKeyID,
};
