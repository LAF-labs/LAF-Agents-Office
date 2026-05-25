"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { runLiveModelSmoke } = require("./startup-office-live-model-smoke.cjs");

test("live model smoke is skipped unless explicitly enabled", async () => {
  let called = false;
  const result = await runLiveModelSmoke({
    env: {},
    fetchImpl: async () => {
      called = true;
    },
    log() {},
  });

  assert.equal(result.ok, true);
  assert.equal(result.skipped, true);
  assert.equal(called, false);
});

test("live model smoke rejects fake provider even when enabled", async () => {
  const result = await runLiveModelSmoke({
    env: {
      LAF_RUN_LIVE_MODEL_SMOKE: "1",
      LAF_OFFICE_STARTUP_OFFICE_AI_PROVIDER: "fake",
    },
    log() {},
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /requires .*openai/);
});

test("live model smoke verifies one OpenAI structured model path", async () => {
  const calls = [];
  const result = await runLiveModelSmoke({
    env: {
      LAF_RUN_LIVE_MODEL_SMOKE: "1",
      LAF_OFFICE_MODEL_PRICING_JSON: JSON.stringify({
        "openai:gpt-smoke": {
          input_cents_per_1m: 100,
          output_cents_per_1m: 200,
          source: "unit-test-pricing",
        },
      }),
      LAF_OFFICE_OPENAI_API_KEY: "test-key",
      LAF_OFFICE_STARTUP_OFFICE_MODEL: "gpt-smoke",
    },
    fetchImpl: async (url, options) => {
      calls.push({ body: JSON.parse(options.body), headers: options.headers, url });
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            id: "resp_smoke",
            model: "gpt-smoke",
            output_text: JSON.stringify(validIdeaValidationOutput()),
            usage: { input_tokens: 100, output_tokens: 80, total_tokens: 180 },
          }),
      };
    },
    log() {},
  });

  assert.equal(result.ok, true);
  assert.equal(result.skipped, false);
  assert.equal(result.provider, "openai");
  assert.equal(result.model, "gpt-smoke");
  assert.equal(result.total_tokens, 180);
  assert.equal(result.pricing_source, "unit-test-pricing");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.openai.com/v1/responses");
  assert.equal(calls[0].headers.Authorization, "Bearer test-key");
  assert.equal(calls[0].body.model, "gpt-smoke");
  assert.equal(calls[0].body.metadata.smoke, "live_model");
});

function validIdeaValidationOutput() {
  return {
    assumptions: [
      {
        claim: "Founder-control messaging can reduce buyer trust concerns.",
        confidence: "medium",
        evidence_needed: "Interview five founders and ask which actions need approval.",
      },
    ],
    customer_segment: "Solo B2B founders preparing a paid beta.",
    icp_hypothesis:
      "Founders with an urgent validation deadline and no operator team will value a controlled AI office.",
    next_actions: [
      "Ask the founder to review the validation plan before any public claim is used.",
    ],
    next_evidence: [
      {
        experiment: "Five founder interviews",
        owner_action: "Ask for a paid-beta commitment or a clear objection.",
        success_signal: "Two paid deposits or signed beta agreements.",
      },
    ],
    risk_level: "medium",
    risks: ["The offer may sound too broad unless the beta is scoped to validation."],
    sources: [],
    summary: "A cautious closed-beta validation plan is ready for founder review.",
  };
}
