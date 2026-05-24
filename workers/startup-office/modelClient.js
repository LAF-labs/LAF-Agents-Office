class StartupOfficeModelError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "StartupOfficeModelError";
    this.details = details;
  }
}

function createStartupOfficeModelClient(options = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const provider = normalizeProvider(
    options.provider ||
      env.LAF_OFFICE_STARTUP_OFFICE_AI_PROVIDER ||
      env.STARTUP_OFFICE_AI_PROVIDER ||
      (env.OPENAI_API_KEY || env.LAF_OFFICE_OPENAI_API_KEY ? "openai" : "disabled"),
  );
  const model =
    options.model ||
    env.LAF_OFFICE_STARTUP_OFFICE_MODEL ||
    env.STARTUP_OFFICE_MODEL ||
    "gpt-5-mini";

  async function generateStructured(input) {
    if (provider === "fake") return fakeStructuredResponse(input, model);
    if (provider !== "openai") {
      throw new StartupOfficeModelError(
        "startup office model provider is not configured",
        { provider },
      );
    }
    return openAIResponsesRequest({
      env,
      fetchImpl,
      input,
      model,
      structured: true,
    });
  }

  async function generateText(input) {
    if (provider === "fake") {
      return {
        cost: costMetadata({ model, provider, usage: fakeUsage() }),
        metadata: { fake: true },
        provider,
        text: `Fake ${input?.purpose || "Startup Office"} response`,
      };
    }
    if (provider !== "openai") {
      throw new StartupOfficeModelError(
        "startup office model provider is not configured",
        { provider },
      );
    }
    return openAIResponsesRequest({
      env,
      fetchImpl,
      input,
      model,
      structured: false,
    });
  }

  async function embed(input) {
    if (provider === "fake") return { embedding: [], provider, model: "fake" };
    if (provider !== "openai") return null;
    const apiKey = env.LAF_OFFICE_OPENAI_API_KEY || env.OPENAI_API_KEY;
    const embeddingModel =
      env.LAF_OFFICE_STARTUP_OFFICE_EMBEDDING_MODEL || "text-embedding-3-small";
    if (!apiKey || !input?.text) return null;
    const response = await fetchImpl(
      `${openAIBaseURL(env).replace(/\/+$/, "")}/embeddings`,
      {
        body: JSON.stringify({ input: input.text, model: embeddingModel }),
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        method: "POST",
      },
    );
    const payload = await readJSONResponse(response);
    if (!response.ok) {
      throw new StartupOfficeModelError("embedding request failed", {
        provider,
        status: response.status,
        upstream_error: payload?.error?.message || payload?.message || "",
      });
    }
    return {
      embedding: payload?.data?.[0]?.embedding || [],
      model: payload?.model || embeddingModel,
      provider,
      usage: payload?.usage || {},
    };
  }

  return {
    embed,
    generateStructured,
    generateText,
    model,
    provider,
  };
}

async function openAIResponsesRequest({ env, fetchImpl, input, model, structured }) {
  const apiKey = env.LAF_OFFICE_OPENAI_API_KEY || env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new StartupOfficeModelError("OPENAI_API_KEY is required", {
      provider: "openai",
    });
  }
  if (typeof fetchImpl !== "function") {
    throw new StartupOfficeModelError("fetch is required for model calls", {
      provider: "openai",
    });
  }
  const body = {
    input: input?.input || input?.prompt || "",
    instructions: input?.instructions || "",
    metadata: input?.metadata || {},
    model,
  };
  if (structured) {
    body.text = {
      format: {
        description: input?.schemaDescription || "Structured Startup Office output",
        name: input?.schemaName || "startup_office_output",
        schema: input?.schema,
        strict: true,
        type: "json_schema",
      },
    };
  }
  const response = await fetchImpl(
    `${openAIBaseURL(env).replace(/\/+$/, "")}/responses`,
    {
      body: JSON.stringify(body),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      method: "POST",
    },
  );
  const payload = await readJSONResponse(response);
  if (!response.ok) {
    throw new StartupOfficeModelError("model request failed", {
      provider: "openai",
      status: response.status,
      upstream_error: payload?.error?.message || payload?.message || "",
    });
  }
  const text = extractResponseText(payload);
  const usage = normalizeUsage(payload?.usage);
  if (!structured) {
    return {
      cost: costMetadata({ model: payload?.model || model, provider: "openai", usage }),
      metadata: { response_id: payload?.id || null },
      provider: "openai",
      text,
    };
  }
  return {
    cost: costMetadata({ model: payload?.model || model, provider: "openai", usage }),
    data: parseStructuredText(text),
    metadata: { response_id: payload?.id || null },
    provider: "openai",
    text,
  };
}

function fakeStructuredResponse(input, model) {
  const title = input?.metadata?.loop_name || "Startup Office";
  const data = {
    assumptions: [
      {
        claim: "The buyer segment has an urgent, expensive problem.",
        confidence: "medium",
        evidence_needed: "Five founder interviews with clear willingness-to-pay signals.",
      },
      {
        claim: "A narrow paid beta is easier to sell than a broad AI office.",
        confidence: "medium",
        evidence_needed: "Two signed letters of intent or paid deposits.",
      },
    ],
    customer_segment:
      "Solo founders and tiny B2B teams who need validation before hiring operators.",
    next_actions: [
      "Interview five target founders this week.",
      "Ask for a paid beta commitment before building broad automation.",
      "Review every public claim before sending it outside the workspace.",
    ],
    risk_level: "medium",
    risks: [
      "The promise can sound too autonomous unless founder approval remains explicit.",
      "The first wedge may be too broad without a paid-beta deliverable.",
    ],
    sources: [],
    summary: `${title} found a controlled paid-beta validation wedge with founder approval gates.`,
  };
  const usage = fakeUsage();
  return {
    cost: costMetadata({ model, provider: "fake", usage }),
    data,
    metadata: { fake: true },
    provider: "fake",
    text: JSON.stringify(data),
  };
}

function costMetadata({ model, provider, usage }) {
  const normalized = normalizeUsage(usage);
  return {
    currency: "USD",
    estimated_usd: null,
    input_tokens: normalized.input_tokens,
    model,
    output_tokens: normalized.output_tokens,
    provider,
    pricing_source: "usage_tokens_only",
    total_tokens: normalized.total_tokens,
  };
}

function normalizeUsage(usage = {}) {
  const input = Number(usage.input_tokens || usage.prompt_tokens || 0);
  const output = Number(usage.output_tokens || usage.completion_tokens || 0);
  const total = Number(usage.total_tokens || input + output || 0);
  return {
    input_tokens: Number.isFinite(input) ? input : 0,
    output_tokens: Number.isFinite(output) ? output : 0,
    total_tokens: Number.isFinite(total) ? total : 0,
  };
}

function fakeUsage() {
  return { input_tokens: 1200, output_tokens: 700, total_tokens: 1900 };
}

function openAIBaseURL(env) {
  return env.LAF_OFFICE_OPENAI_BASE_URL || "https://api.openai.com/v1";
}

async function readJSONResponse(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

function extractResponseText(payload) {
  if (typeof payload?.output_text === "string") return payload.output_text;
  for (const item of payload?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === "string") return content.text;
      if (typeof content?.output_text === "string") return content.output_text;
    }
  }
  return "";
}

function parseStructuredText(text) {
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new StartupOfficeModelError("model returned invalid structured JSON", {
      cause: err.message,
    });
  }
}

function normalizeProvider(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (["openai", "fake", "disabled"].includes(raw)) return raw;
  return "disabled";
}

module.exports = {
  StartupOfficeModelError,
  costMetadata,
  createStartupOfficeModelClient,
  normalizeUsage,
};
