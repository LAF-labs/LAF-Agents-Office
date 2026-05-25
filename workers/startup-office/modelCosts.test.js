const assert = require("node:assert/strict");
const test = require("node:test");

const {
  modelCostEstimate,
  parseModelPricingCatalog,
  validateModelPricingCatalog,
} = require("./modelCosts");

test("estimates model costs from provider usage and pricing catalog", () => {
  const env = {
    LAF_OFFICE_MODEL_PRICING_JSON: JSON.stringify({
      "openai:gpt-test": {
        input_cents_per_1m: 100,
        output_cents_per_1m: 200,
        source: "unit-test-pricing",
      },
    }),
  };

  const cost = modelCostEstimate({
    env,
    model: "gpt-test",
    provider: "openai",
    usage: { input_tokens: 10000, output_tokens: 20000, total_tokens: 30000 },
  });

  assert.equal(cost.billing_reconciliation, "estimated_from_provider_usage");
  assert.equal(cost.estimated_cents, 5);
  assert.equal(cost.estimated_raw_cents, 5);
  assert.equal(cost.estimated_usd, 0.05);
  assert.equal(cost.pricing_key, "openai:gpt-test");
  assert.equal(cost.pricing_source, "unit-test-pricing");
  assert.equal(cost.pricing_units, "cents_per_1m_tokens");
});

test("model pricing can match by model name for compatible fallback routes", () => {
  const env = {
    LAF_OFFICE_MODEL_PRICING_JSON: JSON.stringify({
      "fallback-model": {
        input_usd_per_1m: 0.5,
        output_usd_per_1m: 1.5,
      },
    }),
  };

  const cost = modelCostEstimate({
    env,
    model: "fallback-model",
    provider: "openai_fallback",
    usage: { input_tokens: 100000, output_tokens: 100000 },
  });

  assert.equal(cost.billing_reconciliation, "estimated_from_provider_usage");
  assert.equal(cost.estimated_cents, 20);
  assert.equal(cost.pricing_key, "fallback-model");
  assert.equal(cost.pricing_source, "operator_configured_pricing");
});

test("missing or invalid model pricing leaves usage visible but unbilled", () => {
  const missing = modelCostEstimate({
    env: {},
    model: "gpt-test",
    provider: "openai",
    usage: { input_tokens: 1000, output_tokens: 2000 },
  });
  assert.equal(missing.billing_reconciliation, "provider_usage_without_pricing");
  assert.equal(missing.estimated_cents, 0);
  assert.equal(missing.estimated_usd, null);
  assert.equal(missing.pricing_source, "usage_tokens_only");

  const invalid = modelCostEstimate({
    env: { LAF_OFFICE_MODEL_PRICING_JSON: "{" },
    model: "gpt-test",
    provider: "openai",
    usage: { input_tokens: 1000, output_tokens: 2000 },
  });
  assert.equal(invalid.billing_reconciliation, "invalid_pricing_config");
  assert.match(invalid.pricing_error, /valid JSON/);
});

test("pricing catalog validation requires every configured model route", () => {
  const env = {
    LAF_OFFICE_MODEL_PRICING_JSON: JSON.stringify({
      "openai:gpt-test": {
        input_cents_per_1m: 100,
        output_cents_per_1m: 200,
      },
    }),
  };

  assert.deepEqual(validateModelPricingCatalog(env, [
    { model: "gpt-test", provider: "openai" },
  ]), {
    configured: true,
    errors: [],
    ok: true,
  });

  const invalid = validateModelPricingCatalog(env, [
    { model: "fallback-model", provider: "openai_fallback" },
  ]);
  assert.equal(invalid.ok, false);
  assert.match(invalid.errors[0], /openai_fallback:fallback-model/);

  assert.equal(parseModelPricingCatalog(env).configured, true);
});
