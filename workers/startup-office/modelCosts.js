"use strict";

const MODEL_PRICING_ENV_NAMES = [
  "LAF_OFFICE_MODEL_PRICING_JSON",
  "STARTUP_OFFICE_MODEL_PRICING_JSON",
];
const PRICING_UNITS = "cents_per_1m_tokens";

function modelCostEstimate({ env = process.env, model, provider, usage = {} }) {
  const parsed = parseModelPricingCatalog(env);
  const normalizedUsage = normalizeCostUsage(usage);
  if (parsed.error) {
    return unpricedCost(normalizedUsage, {
      billing_reconciliation: "invalid_pricing_config",
      pricing_error: parsed.error,
      pricing_source: "invalid_pricing_config",
    });
  }

  const resolved = resolveModelPricing(parsed.catalog, { model, provider });
  if (!resolved) {
    return unpricedCost(normalizedUsage, {
      billing_reconciliation: "provider_usage_without_pricing",
      pricing_source: "usage_tokens_only",
    });
  }

  const rawCents =
    (normalizedUsage.input_tokens * resolved.input_cents_per_1m +
      normalizedUsage.output_tokens * resolved.output_cents_per_1m) /
    1_000_000;
  const estimatedCents = rawCents > 0 ? Math.ceil(rawCents) : 0;
  return {
    billing_reconciliation: "estimated_from_provider_usage",
    estimated_cents: estimatedCents,
    estimated_raw_cents: roundMoney(rawCents, 6),
    estimated_usd: roundMoney(estimatedCents / 100, 6),
    input_cents_per_1m: resolved.input_cents_per_1m,
    output_cents_per_1m: resolved.output_cents_per_1m,
    pricing_key: resolved.key,
    pricing_source: resolved.source,
    pricing_units: PRICING_UNITS,
    ...normalizedUsage,
  };
}

function validateModelPricingCatalog(env = process.env, routes = []) {
  const parsed = parseModelPricingCatalog(env);
  const errors = [];
  if (parsed.error) errors.push(parsed.error);
  if (!parsed.configured) {
    errors.push("missing LAF_OFFICE_MODEL_PRICING_JSON for Startup Office model cost reconciliation");
  }
  if (parsed.catalog) {
    for (const route of routes) {
      if (!resolveModelPricing(parsed.catalog, route)) {
        errors.push(
          `LAF_OFFICE_MODEL_PRICING_JSON must include pricing for ${route.provider}:${route.model} or ${route.model}`,
        );
      }
    }
  }
  return {
    configured: parsed.configured,
    errors,
    ok: errors.length === 0,
  };
}

function parseModelPricingCatalog(env = process.env) {
  const raw = MODEL_PRICING_ENV_NAMES.map((name) => env[name]).find((value) =>
    String(value || "").trim(),
  );
  if (!raw) return { catalog: null, configured: false };
  if (typeof raw === "object" && !Array.isArray(raw)) {
    return { catalog: raw, configured: true };
  }
  try {
    const catalog = JSON.parse(String(raw));
    if (!catalog || typeof catalog !== "object" || Array.isArray(catalog)) {
      return {
        catalog: null,
        configured: true,
        error: "LAF_OFFICE_MODEL_PRICING_JSON must be a JSON object",
      };
    }
    return { catalog, configured: true };
  } catch (err) {
    return {
      catalog: null,
      configured: true,
      error: `LAF_OFFICE_MODEL_PRICING_JSON must be valid JSON: ${err.message}`,
    };
  }
}

function resolveModelPricing(catalog, { model, provider }) {
  if (!catalog || typeof catalog !== "object") return null;
  const keys = [`${provider}:${model}`, model, provider, "*"].filter(Boolean);
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(catalog, key)) continue;
    const entry = normalizePricingEntry(catalog[key], key);
    if (entry) return entry;
  }
  return null;
}

function normalizePricingEntry(entry, key) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
  const input = centsPerMillion(entry.input_cents_per_1m, entry.input_usd_per_1m);
  const output = centsPerMillion(entry.output_cents_per_1m, entry.output_usd_per_1m);
  if (input === null || output === null) return null;
  return {
    input_cents_per_1m: input,
    key,
    output_cents_per_1m: output,
    source: String(entry.source || "operator_configured_pricing").trim(),
  };
}

function centsPerMillion(cents, usd) {
  const direct = nonnegativeNumber(cents);
  if (direct !== null) return direct;
  const dollars = nonnegativeNumber(usd);
  if (dollars !== null) return dollars * 100;
  return null;
}

function normalizeCostUsage(usage = {}) {
  const input = nonnegativeNumber(usage.input_tokens ?? usage.prompt_tokens) || 0;
  const output = nonnegativeNumber(usage.output_tokens ?? usage.completion_tokens) || 0;
  const total = nonnegativeNumber(usage.total_tokens) || input + output;
  return {
    input_tokens: input,
    output_tokens: output,
    total_tokens: total,
  };
}

function unpricedCost(usage, extra) {
  return {
    estimated_cents: 0,
    estimated_raw_cents: null,
    estimated_usd: null,
    pricing_units: PRICING_UNITS,
    ...usage,
    ...extra,
  };
}

function nonnegativeNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return null;
  return number;
}

function roundMoney(value, digits) {
  return Number(Number(value).toFixed(digits));
}

module.exports = {
  MODEL_PRICING_ENV_NAMES,
  modelCostEstimate,
  parseModelPricingCatalog,
  validateModelPricingCatalog,
};
