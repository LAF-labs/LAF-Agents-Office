const assert = require("node:assert/strict");
const test = require("node:test");

const {
  StartupOfficeModelError,
  costMetadata,
  createStartupOfficeModelClient,
  normalizeUsage,
  openAIProviderConfigs,
} = require("./modelClient");

test("OpenAI provider sends structured Responses API requests and records usage", async () => {
  const calls = [];
  const client = createStartupOfficeModelClient({
    env: {
      LAF_OFFICE_OPENAI_API_KEY: "test-openai-key",
      LAF_OFFICE_STARTUP_OFFICE_MODEL: "gpt-test",
    },
    fetchImpl: async (url, options) => {
      calls.push({
        body: JSON.parse(options.body),
        headers: options.headers,
        method: options.method,
        url,
      });
      return jsonResponse({
        id: "resp_1",
        model: "gpt-test",
        output: [
          {
            content: [
              {
                text: JSON.stringify({
                  next_actions: ["Interview five founders."],
                  summary: "A narrow beta wedge is ready for review.",
                }),
              },
            ],
          },
        ],
        usage: { input_tokens: 11, output_tokens: 7, total_tokens: 18 },
      });
    },
  });

  const result = await client.generateStructured({
    input: "Validate the wedge.",
    instructions: "Return only valid JSON.",
    metadata: { loop_slug: "idea-validation", run_id: "run-1" },
    schema: {
      additionalProperties: false,
      properties: {
        next_actions: { items: { type: "string" }, type: "array" },
        summary: { type: "string" },
      },
      required: ["summary", "next_actions"],
      type: "object",
    },
    schemaDescription: "Startup Office validation output",
    schemaName: "idea_validation_output",
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.openai.com/v1/responses");
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[0].headers.Authorization, "Bearer test-openai-key");
  assert.equal(calls[0].body.model, "gpt-test");
  assert.equal(calls[0].body.text.format.type, "json_schema");
  assert.equal(calls[0].body.text.format.strict, true);
  assert.deepEqual(calls[0].body.metadata, {
    loop_slug: "idea-validation",
    run_id: "run-1",
  });
  assert.equal(result.provider, "openai");
  assert.equal(result.metadata.response_id, "resp_1");
  assert.equal(result.data.summary, "A narrow beta wedge is ready for review.");
  assert.equal(result.cost.total_tokens, 18);
  assert.equal(result.cost.pricing_source, "usage_tokens_only");
});

test("OpenAI provider supports text and embedding calls without local tools", async () => {
  const calls = [];
  const client = createStartupOfficeModelClient({
    env: {
      LAF_OFFICE_OPENAI_API_KEY: "test-openai-key",
      LAF_OFFICE_OPENAI_BASE_URL: "https://models.example.test/v1",
      LAF_OFFICE_STARTUP_OFFICE_EMBEDDING_MODEL: "embed-test",
    },
    fetchImpl: async (url, options) => {
      calls.push({ body: JSON.parse(options.body), url });
      if (url.endsWith("/embeddings")) {
        return jsonResponse({
          data: [{ embedding: [0.1, 0.2, 0.3] }],
          model: "embed-test",
          usage: { prompt_tokens: 3, total_tokens: 3 },
        });
      }
      return jsonResponse({
        id: "resp_2",
        model: "gpt-5-mini",
        output_text: "Draft approval copy.",
        usage: { prompt_tokens: 5, completion_tokens: 9 },
      });
    },
  });

  const text = await client.generateText({
    input: "Write approval copy.",
    instructions: "Be concise.",
    metadata: { run_id: "run-2" },
  });
  const embedding = await client.embed({ text: "Company memory" });

  assert.equal(calls[0].url, "https://models.example.test/v1/responses");
  assert.equal(calls[1].url, "https://models.example.test/v1/embeddings");
  assert.equal(calls[1].body.model, "embed-test");
  assert.equal(text.text, "Draft approval copy.");
  assert.equal(text.cost.total_tokens, 14);
  assert.deepEqual(embedding.embedding, [0.1, 0.2, 0.3]);
  assert.equal(embedding.provider, "openai");
});

test("OpenAI provider falls back to an OpenAI-compatible model route on transient failures", async () => {
  const calls = [];
  const client = createStartupOfficeModelClient({
    env: {
      LAF_OFFICE_OPENAI_API_KEY: "primary-key",
      LAF_OFFICE_OPENAI_FALLBACK_API_KEY: "fallback-key",
      LAF_OFFICE_OPENAI_FALLBACK_BASE_URL: "https://fallback-models.example.test/v1",
      LAF_OFFICE_STARTUP_OFFICE_FALLBACK_MODEL: "fallback-model",
      LAF_OFFICE_STARTUP_OFFICE_MODEL: "primary-model",
    },
    fetchImpl: async (url, options) => {
      calls.push({
        body: JSON.parse(options.body),
        headers: options.headers,
        url,
      });
      if (calls.length === 1) {
        return jsonResponse({ error: { message: "rate limited" } }, 429);
      }
      return jsonResponse({
        id: "resp_fallback",
        model: "fallback-model",
        output_text: JSON.stringify({
          next_actions: ["Use the fallback route."],
          summary: "Fallback generated the draft.",
        }),
        usage: { input_tokens: 4, output_tokens: 6, total_tokens: 10 },
      });
    },
  });

  const result = await client.generateStructured({
    input: "Validate fallback.",
    metadata: { loop_slug: "idea-validation" },
    schema: {
      additionalProperties: false,
      properties: {
        next_actions: { items: { type: "string" }, type: "array" },
        summary: { type: "string" },
      },
      required: ["summary", "next_actions"],
      type: "object",
    },
  });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, "https://api.openai.com/v1/responses");
  assert.equal(calls[0].headers.Authorization, "Bearer primary-key");
  assert.equal(calls[0].body.model, "primary-model");
  assert.equal(calls[1].url, "https://fallback-models.example.test/v1/responses");
  assert.equal(calls[1].headers.Authorization, "Bearer fallback-key");
  assert.equal(calls[1].body.model, "fallback-model");
  assert.equal(result.provider, "openai_fallback");
  assert.equal(result.metadata.selected_provider, "openai_fallback");
  assert.deepEqual(
    result.metadata.provider_attempts.map((attempt) => attempt.provider),
    ["openai", "openai_fallback"],
  );
  assert.equal(JSON.stringify(result.metadata.provider_attempts).includes("fallback-key"), false);
  assert.equal(JSON.stringify(result.metadata.provider_attempts).includes("primary-key"), false);
  assert.equal(result.data.summary, "Fallback generated the draft.");
  assert.equal(result.cost.provider, "openai_fallback");
});

test("OpenAI fallback config is explicit", () => {
  const configs = openAIProviderConfigs({
    LAF_OFFICE_OPENAI_API_KEY: "primary-key",
    LAF_OFFICE_OPENAI_FALLBACK_API_KEY: "fallback-key",
    LAF_OFFICE_OPENAI_FALLBACK_BASE_URL: "https://fallback.example.test/v1",
    LAF_OFFICE_STARTUP_OFFICE_FALLBACK_MODEL: "fallback-model",
  }, "primary-model");

  assert.deepEqual(
    configs.map((config) => [config.provider, config.model, new URL(config.baseURL).host]),
    [
      ["openai", "primary-model", "api.openai.com"],
      ["openai_fallback", "fallback-model", "fallback.example.test"],
    ],
  );
  assert.equal(JSON.stringify(configs).includes("fallback-key"), true);
});

test("fake and disabled providers are explicit cloud execution states", async () => {
  const fake = createStartupOfficeModelClient({ provider: "fake" });
  const fakeResult = await fake.generateStructured({
    metadata: { loop_name: "Idea Validation" },
  });
  assert.equal(fake.provider, "fake");
  assert.equal(fakeResult.metadata.fake, true);
  assert.equal(fakeResult.cost.provider, "fake");

  const disabled = createStartupOfficeModelClient({
    env: { LAF_OFFICE_STARTUP_OFFICE_AI_PROVIDER: "disabled" },
  });
  await assert.rejects(
    () => disabled.generateStructured({ input: "Run loop." }),
    (err) =>
      err instanceof StartupOfficeModelError &&
      err.message === "startup office model provider is not configured" &&
      err.details.provider === "disabled",
  );
});

test("OpenAI provider fails closed without an API key", async () => {
  const client = createStartupOfficeModelClient({
    env: { LAF_OFFICE_STARTUP_OFFICE_AI_PROVIDER: "openai" },
    fetchImpl: async () => {
      throw new Error("should not call fetch without credentials");
    },
  });

  await assert.rejects(
    () => client.generateText({ input: "Hello" }),
    (err) =>
      err instanceof StartupOfficeModelError &&
      err.message === "OPENAI_API_KEY is required" &&
      err.details.provider === "openai",
  );
});

test("usage normalization accepts provider token aliases", () => {
  assert.deepEqual(
    normalizeUsage({ completion_tokens: 2, prompt_tokens: 3 }),
    { input_tokens: 3, output_tokens: 2, total_tokens: 5 },
  );
  assert.deepEqual(
    normalizeUsage({ input_tokens: Number.NaN, output_tokens: 4, total_tokens: 9 }),
    { input_tokens: 0, output_tokens: 4, total_tokens: 9 },
  );
});

test("cost metadata carries pricing provenance when a catalog is configured", () => {
  const cost = costMetadata({
    env: {
      LAF_OFFICE_MODEL_PRICING_JSON: JSON.stringify({
        "openai:gpt-test": {
          input_cents_per_1m: 100,
          output_cents_per_1m: 200,
          source: "unit-test-pricing",
        },
      }),
    },
    model: "gpt-test",
    provider: "openai",
    usage: { input_tokens: 10000, output_tokens: 20000, total_tokens: 30000 },
  });

  assert.equal(cost.billing_reconciliation, "estimated_from_provider_usage");
  assert.equal(cost.estimated_cents, 5);
  assert.equal(cost.estimated_usd, 0.05);
  assert.equal(cost.pricing_key, "openai:gpt-test");
  assert.equal(cost.pricing_source, "unit-test-pricing");
});

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(payload),
  };
}
