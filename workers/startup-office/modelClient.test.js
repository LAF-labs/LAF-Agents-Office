const assert = require("node:assert/strict");
const test = require("node:test");

const {
  StartupOfficeModelError,
  createStartupOfficeModelClient,
  normalizeUsage,
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

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(payload),
  };
}
