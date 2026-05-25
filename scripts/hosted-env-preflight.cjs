#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const defaultEnvFiles = [path.join(repoRoot, ".env"), path.join(repoRoot, ".env.local")];

function runPreflight(env = process.env, options = {}) {
  const allowLocalhost = Boolean(options.allowLocalhost);
  const errors = [];
  const warnings = [];
  const normalized = {
    allowed_origins: [],
    browser_api_base: "",
    billing_mode: "",
    effective_api_base: "",
    managed_model_fallback_enabled: false,
    outbox_batch_size: 25,
    outbox_email_provider: "in_app",
    outbox_lock_ms: 300000,
    public_api_base: "",
    public_host: "",
    startup_office_ai_provider: "",
    startup_office_model: "",
    supabase_url: "",
  };

  const supabaseURL = requireEnv(env, "SUPABASE_URL", errors);
  if (supabaseURL) {
    const checked = normalizeOrigin(supabaseURL, "SUPABASE_URL", {
      allowLocalhost,
      requireHTTPS: !allowLocalhost,
    });
    pushValidation(checked, errors);
    normalized.supabase_url = checked.value || "";
  }
  requireEnv(env, "SUPABASE_SERVICE_ROLE_KEY", errors);
  requireEnv(env, "SUPABASE_ANON_KEY", errors);

  const publicHostSource = String(env.LAF_OFFICE_PUBLIC_HOST || env.VERCEL_URL || "").trim();
  if (!publicHostSource) {
    errors.push("missing LAF_OFFICE_PUBLIC_HOST or VERCEL_URL");
  } else {
    const checked = normalizeOrigin(publicHostSource, "LAF_OFFICE_PUBLIC_HOST", {
      allowLocalhost,
      forceHTTPS: !allowLocalhost,
      requireHTTPS: !allowLocalhost,
    });
    pushValidation(checked, errors);
    normalized.public_host = checked.value || "";
  }

  const allowedOrigins = String(env.LAF_OFFICE_ALLOWED_ORIGINS || "").trim();
  if (allowedOrigins) {
    for (const origin of allowedOrigins.split(",").map((entry) => entry.trim()).filter(Boolean)) {
      const checked = normalizeOrigin(origin, "LAF_OFFICE_ALLOWED_ORIGINS", {
        allowLocalhost,
        requireHTTPS: !allowLocalhost,
      });
      pushValidation(checked, errors);
      if (checked.value) normalized.allowed_origins.push(checked.value);
    }
  } else {
    warnings.push("LAF_OFFICE_ALLOWED_ORIGINS is not set; same-origin /api deployments are fine");
  }

  const publicAPIBase = String(env.LAF_OFFICE_PUBLIC_API_BASE_URL || "").trim();
  let publicAPIOrigin = "";
  let publicAPIBaseAbsolute = "";
  if (publicAPIBase) {
    const checked = normalizePublicAPIBase(
      publicAPIBase,
      "LAF_OFFICE_PUBLIC_API_BASE_URL",
      {
        allowLocalhost,
        baseOrigin: normalized.public_host,
        requireHTTPS: !allowLocalhost,
      },
    );
    pushValidation(checked, errors);
    normalized.public_api_base = checked.value || "";
    publicAPIOrigin = checked.origin || "";
    publicAPIBaseAbsolute = checked.absolute_value || checked.value || "";
  }

  const browserAPIBase = String(env.VITE_LAF_API_BASE_URL || "").trim();
  let browserAPIOrigin = "";
  let browserAPIBaseAbsolute = "";
  if (browserAPIBase) {
    const checked = normalizeAPIBase(browserAPIBase, "VITE_LAF_API_BASE_URL", {
      allowLocalhost,
      requireHTTPS: !allowLocalhost,
    });
    pushValidation(checked, errors);
    normalized.browser_api_base = checked.value || "";
    browserAPIOrigin = checked.origin || "";
    browserAPIBaseAbsolute = absoluteAPIBase(checked.value, normalized.public_host);
  }

  if (
    publicAPIBase &&
    browserAPIBase &&
    publicAPIBaseAbsolute &&
    browserAPIBaseAbsolute &&
    publicAPIBaseAbsolute !== browserAPIBaseAbsolute
  ) {
    errors.push(
      "LAF_OFFICE_PUBLIC_API_BASE_URL must match VITE_LAF_API_BASE_URL after normalization",
    );
  }

  normalized.effective_api_base =
    publicAPIBaseAbsolute ||
    browserAPIBaseAbsolute ||
    (normalized.public_host ? `${normalized.public_host}/api` : "");

  const effectiveAPIOrigin = publicAPIOrigin || browserAPIOrigin;
  if (
    effectiveAPIOrigin &&
    normalized.public_host &&
    effectiveAPIOrigin !== normalized.public_host &&
    !normalized.allowed_origins.includes(normalized.public_host)
  ) {
    errors.push(
      "LAF_OFFICE_ALLOWED_ORIGINS must include LAF_OFFICE_PUBLIC_HOST when LAF_OFFICE_PUBLIC_API_BASE_URL or VITE_LAF_API_BASE_URL points at a different origin",
    );
  }

  validateOutboxEnv(env, { errors, normalized });
  validateBillingEnv(env, {
    allowLocalhost,
    errors,
    normalized,
  });
  validateStartupOfficeAIEnv(env, {
    allowTestProvider: allowLocalhost,
    errors,
    normalized,
  });

  return {
    errors,
    normalized,
    ok: errors.length === 0,
    warnings,
  };
}

function validateBillingEnv(env, { allowLocalhost = false, errors, normalized }) {
  const billingMode = String(env.LAF_OFFICE_BILLING_MODE || "").trim().toLowerCase();
  if (!billingMode && !allowLocalhost) {
    errors.push("missing LAF_OFFICE_BILLING_MODE (set manual for closed beta billing)");
  }
  if (billingMode && billingMode !== "manual") {
    errors.push("LAF_OFFICE_BILLING_MODE must be manual for closed beta production");
  }
  normalized.billing_mode = billingMode;

  const workspacePaid = optionalBooleanEnv(env, "LAF_OFFICE_WORKSPACE_PAID", errors);
  const managedModel = optionalBooleanEnv(env, "LAF_OFFICE_MANAGED_MODEL_ENABLED", errors);
  normalized.managed_model_fallback_enabled = Boolean(workspacePaid || managedModel);
}

function validateStartupOfficeAIEnv(env, { allowTestProvider = false, errors, normalized }) {
  const explicitProvider = String(
    env.LAF_OFFICE_STARTUP_OFFICE_AI_PROVIDER || env.STARTUP_OFFICE_AI_PROVIDER || "",
  ).trim().toLowerCase();
  const hasOpenAIKey = Boolean(env.LAF_OFFICE_OPENAI_API_KEY || env.OPENAI_API_KEY);
  const hasFallbackOpenAIKey = Boolean(
    env.LAF_OFFICE_OPENAI_FALLBACK_API_KEY || env.OPENAI_FALLBACK_API_KEY,
  );
  const provider = explicitProvider || (hasOpenAIKey || hasFallbackOpenAIKey ? "openai" : "");
  if (!provider) {
    if (!allowTestProvider) {
      errors.push("missing LAF_OFFICE_OPENAI_API_KEY or OPENAI_API_KEY for Startup Office AI worker");
    }
    return;
  }
  if (!["openai", "fake", "disabled"].includes(provider)) {
    errors.push("LAF_OFFICE_STARTUP_OFFICE_AI_PROVIDER must be one of openai, fake, or disabled");
    normalized.startup_office_ai_provider = provider;
    return;
  }
  normalized.startup_office_ai_provider = provider;
  normalized.startup_office_model = String(
    env.LAF_OFFICE_STARTUP_OFFICE_MODEL || env.STARTUP_OFFICE_MODEL || "gpt-5-mini",
  ).trim();
  normalized.startup_office_ai_fallback_enabled = Boolean(
    hasFallbackOpenAIKey ||
      env.LAF_OFFICE_OPENAI_FALLBACK_BASE_URL ||
      env.OPENAI_FALLBACK_BASE_URL ||
      env.LAF_OFFICE_STARTUP_OFFICE_FALLBACK_MODEL ||
      env.STARTUP_OFFICE_FALLBACK_MODEL,
  );
  normalized.startup_office_fallback_model = String(
    env.LAF_OFFICE_STARTUP_OFFICE_FALLBACK_MODEL ||
      env.STARTUP_OFFICE_FALLBACK_MODEL ||
      "",
  ).trim();
  if (provider === "openai" && !hasOpenAIKey && !hasFallbackOpenAIKey) {
    errors.push("missing LAF_OFFICE_OPENAI_API_KEY or OPENAI_API_KEY for Startup Office AI worker");
  }
  if (
    provider === "openai" &&
    normalized.startup_office_ai_fallback_enabled &&
    !hasOpenAIKey &&
    !hasFallbackOpenAIKey
  ) {
    errors.push("OpenAI fallback is configured but no primary or fallback API key is available");
  }
  if ((provider === "fake" || provider === "disabled") && !allowTestProvider) {
    errors.push(
      "LAF_OFFICE_STARTUP_OFFICE_AI_PROVIDER must be openai for production preflight; fake and disabled are local/test only",
    );
  }
}

function optionalBooleanEnv(env, name, errors) {
  const raw = String(env[name] || "").trim().toLowerCase();
  if (!raw) return null;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  errors.push(`${name} must be a boolean value`);
  return null;
}

function validateOutboxEnv(env, { errors, normalized }) {
  const provider = String(env.LAF_OUTBOX_EMAIL_PROVIDER || "in_app").trim().toLowerCase();
  if (!["in_app", "none", "resend"].includes(provider)) {
    errors.push("LAF_OUTBOX_EMAIL_PROVIDER must be one of in_app, none, or resend");
  }
  normalized.outbox_email_provider = provider || "in_app";

  if (provider === "resend") {
    requireEnv(env, "RESEND_API_KEY", errors);
    const from = requireEnv(env, "LAF_EMAIL_FROM", errors);
    if (from && !emailHeaderValue(from)) {
      errors.push("LAF_EMAIL_FROM must be an email address or Name <email@example.com>");
    }
  }
  const replyTo = String(env.LAF_EMAIL_REPLY_TO || "").trim();
  if (replyTo && !emailAddress(replyTo)) {
    errors.push("LAF_EMAIL_REPLY_TO must be an email address");
  }

  normalized.outbox_batch_size = boundedIntegerEnv(
    env,
    "LAF_OUTBOX_BATCH_SIZE",
    25,
    1,
    100,
    errors,
  );
  normalized.outbox_lock_ms = boundedIntegerEnv(
    env,
    "LAF_OUTBOX_LOCK_MS",
    300000,
    1000,
    3600000,
    errors,
  );
}

function requireEnv(env, name, errors) {
  const value = String(env[name] || "").trim();
  if (!value) errors.push(`missing ${name}`);
  return value;
}

function normalizeAPIBase(raw, name, options = {}) {
  const value = String(raw || "").trim();
  if (!value) return { value: "/api" };
  if (/^https?:\/\//i.test(value)) {
    return normalizeAbsoluteAPIBase(value, name, options);
  }
  if (value.startsWith("//")) {
    return { error: `${name} must not be a protocol-relative URL` };
  }
  if (/[?#]/.test(value)) {
    return { error: `${name} must be a path without a query string or hash` };
  }
  if (!value.startsWith("/") && looksLikeBareAPIHost(value)) {
    return normalizeAbsoluteAPIBase(`https://${value}`, name, options);
  }
  const withSlash = value.startsWith("/") ? value : `/${value}`;
  return { value: withSlash.replace(/\/+$/, "") || "/api" };
}

function boundedIntegerEnv(env, name, defaultValue, min, max, errors) {
  const raw = String(env[name] || "").trim();
  if (!raw) return defaultValue;
  if (!/^\d+$/.test(raw)) {
    errors.push(`${name} must be an integer between ${min} and ${max}`);
    return defaultValue;
  }
  const value = Number(raw);
  if (value < min || value > max) {
    errors.push(`${name} must be an integer between ${min} and ${max}`);
    return defaultValue;
  }
  return value;
}

function emailHeaderValue(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/<([^<>]+)>$/);
  return emailAddress(match ? match[1] : raw);
}

function emailAddress(value) {
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(String(value || "").trim());
}

function normalizePublicAPIBase(raw, name, options = {}) {
  const value = String(raw || "").trim();
  if (!value) return { value: "" };
  if (value.startsWith("//")) {
    return { error: `${name} must not be a protocol-relative URL` };
  }
  if (value.startsWith("/")) {
    return normalizeRelativePublicAPIBase(value, name, options);
  }
  if (/^https?:\/\//i.test(value)) {
    return normalizeAbsoluteAPIBase(value, name, options);
  }
  if (!looksLikeBareAPIHost(value)) {
    return { error: `${name} must be an absolute URL, bare host, or /api path` };
  }
  return normalizeAbsoluteAPIBase(`https://${value}`, name, options);
}

function normalizeAbsoluteAPIBase(raw, name, options = {}) {
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return { error: `${name} must be a valid URL or path` };
  }
  if (!parsed.hostname || parsed.username || parsed.password) {
    return { error: `${name} must be a valid URL or path` };
  }
  if (parsed.search || parsed.hash) {
    return { error: `${name} must not include a query string or hash` };
  }
  if (options.requireHTTPS && parsed.protocol !== "https:") {
    return { error: `${name} must use https` };
  }
  if (!options.allowLocalhost && isLocalHost(parsed.hostname)) {
    return { error: `${name} must not point at localhost or a private network address` };
  }
  const pathname = parsed.pathname.replace(/\/+$/, "");
  parsed.pathname = pathname && pathname !== "/" ? pathname : "/api";
  const origin = `${parsed.protocol}//${parsed.host}`;
  const value = parsed.toString().replace(/\/+$/, "");
  return {
    absolute_value: value,
    origin,
    value,
  };
}

function normalizeRelativePublicAPIBase(raw, name, options = {}) {
  const checked = normalizeAPIBase(raw, name, options);
  if (checked.error) return checked;
  if (!options.baseOrigin) {
    return { error: `${name} /api path requires LAF_OFFICE_PUBLIC_HOST or VERCEL_URL` };
  }
  return {
    absolute_value: absoluteAPIBase(checked.value, options.baseOrigin),
    origin: options.baseOrigin,
    value: absoluteAPIBase(checked.value, options.baseOrigin),
  };
}

function absoluteAPIBase(value, baseOrigin) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw.replace(/\/+$/, "");
  if (!baseOrigin) return raw.replace(/\/+$/, "");
  try {
    return new URL(raw, `${baseOrigin}/`).toString().replace(/\/+$/, "");
  } catch {
    return raw.replace(/\/+$/, "");
  }
}

function looksLikeBareAPIHost(value) {
  const hostPart = String(value || "").split(/[/?#]/)[0];
  return hostPart.includes(".") || hostPart.includes(":") || hostPart.startsWith("[");
}

function normalizeOrigin(raw, name, options = {}) {
  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    return { error: `${name} must be a valid origin` };
  }
  if (!parsed.hostname || parsed.username || parsed.password) {
    return { error: `${name} must be a valid origin` };
  }
  if (parsed.pathname !== "/" || parsed.search || parsed.hash) {
    return { error: `${name} must be an origin without a path, query, or hash` };
  }
  if (options.requireHTTPS && parsed.protocol !== "https:") {
    return { error: `${name} must use https` };
  }
  if (!options.allowLocalhost && isLocalHost(parsed.hostname)) {
    return { error: `${name} must not point at localhost or a private network address` };
  }
  const protocol = options.forceHTTPS ? "https:" : parsed.protocol;
  return { value: `${protocol}//${parsed.host}` };
}

function isLocalHost(hostname) {
  const host = String(hostname || "").toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
  if (
    host === "localhost" ||
    host === "0.0.0.0" ||
    host === "127.0.0.1" ||
    host === "::" ||
    host === "::1"
  ) {
    return true;
  }
  if (/^127\./.test(host)) return true;
  if (/^10\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  if (/^169\.254\./.test(host)) return true;
  const private172 = host.match(/^172\.(\d+)\./);
  if (private172 && Number(private172[1]) >= 16 && Number(private172[1]) <= 31) {
    return true;
  }
  const carrierGradeNAT = host.match(/^100\.(\d+)\./);
  if (carrierGradeNAT && Number(carrierGradeNAT[1]) >= 64 && Number(carrierGradeNAT[1]) <= 127) {
    return true;
  }
  return host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:");
}

function pushValidation(result, errors) {
  if (result.error) errors.push(result.error);
}

function parseArgs(argv) {
  const args = {
    allowLocalhost: false,
    envFiles: [...defaultEnvFiles],
    json: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--allow-localhost") {
      args.allowLocalhost = true;
    } else if (arg === "--dotenv") {
      i += 1;
      if (i >= argv.length) throw new Error("--dotenv requires a path");
      args.envFiles.push(path.resolve(argv[i]));
    } else if (arg.startsWith("--dotenv=")) {
      args.envFiles.push(path.resolve(arg.slice("--dotenv=".length)));
    } else if (arg === "--no-env-file") {
      args.envFiles = [];
    } else if (arg === "--json") {
      args.json = true;
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
      "usage: node scripts/hosted-env-preflight.cjs [--json] [--allow-localhost] [--dotenv <path>] [--no-env-file]",
      "",
      "Validates hosted Startup Office deployment environment variables before Vercel deploys.",
      "Loads .env and .env.local by default when present; shell environment variables still win.",
      "Use --allow-localhost only for local hosted-API rehearsals, never as a production gate.",
      "",
      "Required:",
      "  SUPABASE_URL",
      "  SUPABASE_SERVICE_ROLE_KEY",
      "  SUPABASE_ANON_KEY",
      "  LAF_OFFICE_PUBLIC_HOST or VERCEL_URL",
      "  LAF_OFFICE_BILLING_MODE=manual",
      "  LAF_OFFICE_OPENAI_API_KEY or OPENAI_API_KEY",
      "",
    ].join("\n"),
  );
  process.exit(exitCode);
}

function loadPreflightEnv(baseEnv = process.env, envFiles = defaultEnvFiles) {
  const env = { ...baseEnv };
  const shellKeys = new Set(Object.keys(baseEnv));
  const loaded = [];
  for (const filePath of envFiles) {
    const resolved = path.resolve(filePath);
    if (!fs.existsSync(resolved)) continue;
    const entries = parseEnvFileText(fs.readFileSync(resolved, "utf8"), resolved);
    for (const [key, value] of Object.entries(entries)) {
      if (shellKeys.has(key)) continue;
      env[key] = value;
    }
    loaded.push(resolved);
  }
  return { env, loaded };
}

function parseEnvFileText(text, filePath = "<env>") {
  const entries = {};
  const lines = String(text || "").replace(/\r\n/g, "\n").split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    const key = match[1];
    let raw = match[2].trimStart();
    if (!raw.startsWith('"') && !raw.startsWith("'")) {
      entries[key] = raw.replace(/\s+#.*$/, "").trim();
      continue;
    }

    const quote = raw[0];
    raw = raw.slice(1);
    const parts = [];
    while (true) {
      const closing = findClosingQuote(raw, quote);
      if (closing !== -1) {
        parts.push(raw.slice(0, closing));
        break;
      }
      parts.push(raw);
      i += 1;
      if (i >= lines.length) {
        throw new Error(`${filePath}: unterminated quoted value for ${key}`);
      }
      raw = lines[i];
    }
    entries[key] = parts.join("\n");
  }
  return entries;
}

function findClosingQuote(value, quote) {
  for (let i = 0; i < value.length; i += 1) {
    if (value[i] !== quote) continue;
    if (quote === '"' && i > 0 && value[i - 1] === "\\") continue;
    return i;
  }
  return -1;
}

function printText(result) {
  const lines = [];
  if (result.ok) {
    lines.push("[hosted-env-preflight] PASS hosted Startup Office env is ready");
  } else {
    lines.push("[hosted-env-preflight] FAIL hosted Startup Office env is not ready");
  }
  if (result.normalized.public_host) {
    lines.push(`[hosted-env-preflight] public host: ${result.normalized.public_host}`);
  }
  if (result.normalized.public_api_base) {
    lines.push(`[hosted-env-preflight] public API base: ${result.normalized.public_api_base}`);
  }
  if (result.normalized.effective_api_base) {
    lines.push(`[hosted-env-preflight] effective API base: ${result.normalized.effective_api_base}`);
  }
  if (result.normalized.supabase_url) {
    lines.push(`[hosted-env-preflight] Supabase URL: ${result.normalized.supabase_url}`);
  }
  if (result.normalized.browser_api_base) {
    lines.push(`[hosted-env-preflight] browser API base: ${result.normalized.browser_api_base}`);
  }
  if (result.normalized.outbox_email_provider) {
    lines.push(`[hosted-env-preflight] outbox email provider: ${result.normalized.outbox_email_provider}`);
  }
  if (result.normalized.billing_mode) {
    lines.push(`[hosted-env-preflight] billing mode: ${result.normalized.billing_mode}`);
  }
  if (result.normalized.managed_model_fallback_enabled) {
    lines.push("[hosted-env-preflight] managed model fallback: enabled");
  }
  if (result.normalized.startup_office_ai_provider) {
    lines.push(
      `[hosted-env-preflight] Startup Office AI provider: ${result.normalized.startup_office_ai_provider}`,
    );
  }
  if (result.normalized.startup_office_ai_fallback_enabled) {
    lines.push("[hosted-env-preflight] Startup Office AI fallback: enabled");
  }
  if (result.normalized.allowed_origins.length) {
    lines.push(
      `[hosted-env-preflight] allowed browser origins: ${result.normalized.allowed_origins.join(", ")}`,
    );
  }
  for (const warning of result.warnings) {
    lines.push(`[hosted-env-preflight] WARN ${warning}`);
  }
  for (const error of result.errors) {
    lines.push(`[hosted-env-preflight] ERROR ${error}`);
  }
  for (const hint of remediationHints(result.errors)) {
    lines.push(`[hosted-env-preflight] NEXT ${hint}`);
  }
  return `${lines.join("\n")}\n`;
}

function remediationHints(errors) {
  if (!errors.length) return [];
  const joined = errors.join("\n");
  const hints = [];
  if (/missing SUPABASE_(?:URL|SERVICE_ROLE_KEY|ANON_KEY)/.test(joined)) {
    hints.push(
      "set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and SUPABASE_ANON_KEY from the Supabase project settings",
    );
  }
  if (/missing LAF_OFFICE_PUBLIC_HOST or VERCEL_URL/.test(joined)) {
    hints.push(
      "set LAF_OFFICE_PUBLIC_HOST to the production web origin, for example https://office.example.com",
    );
  }
  if (/LAF_OFFICE_ALLOWED_ORIGINS must include/.test(joined)) {
    hints.push(
      "add the web origin to LAF_OFFICE_ALLOWED_ORIGINS for split-origin browser API calls",
    );
  }
  if (/LAF_OFFICE_PUBLIC_API_BASE_URL must match VITE_LAF_API_BASE_URL/.test(joined)) {
    hints.push(
      "make LAF_OFFICE_PUBLIC_API_BASE_URL and VITE_LAF_API_BASE_URL normalize to the same deployed /api base",
    );
  }
  if (/RESEND_API_KEY|LAF_EMAIL_FROM|LAF_OUTBOX_EMAIL_PROVIDER/.test(joined)) {
    hints.push(
      "set LAF_OUTBOX_EMAIL_PROVIDER=resend with RESEND_API_KEY and LAF_EMAIL_FROM, or use in_app until email sending is configured",
    );
  }
  if (/LAF_OUTBOX_(?:BATCH_SIZE|LOCK_MS)/.test(joined)) {
    hints.push(
      "set LAF_OUTBOX_BATCH_SIZE between 1 and 100 and LAF_OUTBOX_LOCK_MS between 1000 and 3600000",
    );
  }
  if (/LAF_OFFICE_BILLING_MODE|LAF_OFFICE_WORKSPACE_PAID|LAF_OFFICE_MANAGED_MODEL_ENABLED/.test(joined)) {
    hints.push(
      "set LAF_OFFICE_BILLING_MODE=manual for closed beta billing and use boolean values for managed-model fallback flags",
    );
  }
  if (/STARTUP_OFFICE_AI_PROVIDER|OPENAI_API_KEY|Startup Office AI worker/.test(joined)) {
    hints.push(
      "set LAF_OFFICE_STARTUP_OFFICE_AI_PROVIDER=openai with LAF_OFFICE_OPENAI_API_KEY or OPENAI_API_KEY for scheduled loop execution",
    );
  }
  if (/localhost or a private network address/.test(joined)) {
    hints.push(
      "use public HTTPS deployment URLs for production; reserve --allow-localhost for local hosted-API rehearsals",
    );
  }
  hints.push("rerun `npm run hosted-env:preflight` before deploying or smoke testing");
  return [...new Set(hints)];
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    usage(err.message, 1);
  }
  if (args.help) usage("", 0);
  let loaded;
  try {
    loaded = loadPreflightEnv(process.env, args.envFiles);
  } catch (err) {
    process.stderr.write(`[hosted-env-preflight] ERROR ${err.message}\n`);
    process.exit(1);
  }
  const result = runPreflight(loaded.env, args);
  if (args.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    process.stdout.write(printText(result));
  }
  process.exit(result.ok ? 0 : 1);
}

if (require.main === module) {
  main();
}

module.exports = {
  defaultEnvFiles,
  isLocalHost,
  loadPreflightEnv,
  normalizeAPIBase,
  normalizeOrigin,
  normalizePublicAPIBase,
  parseArgs,
  parseEnvFileText,
  printText,
  remediationHints,
  runPreflight,
};
