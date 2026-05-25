const { modelCostEstimate } = require("./modelCosts");

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
      (hasAnyOpenAIKey(env) ? "openai" : "disabled"),
  );
  const model =
    options.model ||
    env.LAF_OFFICE_STARTUP_OFFICE_MODEL ||
    env.STARTUP_OFFICE_MODEL ||
    "gpt-5-mini";

  async function generateStructured(input) {
    if (provider === "fake") return fakeStructuredResponse(input, model, env);
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
        cost: costMetadata({ env, model, provider, usage: fakeUsage() }),
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
    const [config] = openAIProviderConfigs(env, model);
    const embeddingModel =
      env.LAF_OFFICE_STARTUP_OFFICE_EMBEDDING_MODEL || "text-embedding-3-small";
    if (!config?.apiKey || !input?.text) return null;
    const response = await fetchImpl(
      `${config.baseURL.replace(/\/+$/, "")}/embeddings`,
      {
        body: JSON.stringify({ input: input.text, model: embeddingModel }),
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        method: "POST",
      },
    );
    const payload = await readJSONResponse(response);
    if (!response.ok) {
      throw new StartupOfficeModelError("embedding request failed", {
        provider: config.provider,
        status: response.status,
        upstream_error: payload?.error?.message || payload?.message || "",
      });
    }
    return {
      embedding: payload?.data?.[0]?.embedding || [],
      model: payload?.model || embeddingModel,
      provider: config.provider,
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
  const providerConfigs = openAIProviderConfigs(env, model);
  if (!providerConfigs.length) {
    throw new StartupOfficeModelError("OPENAI_API_KEY is required", {
      provider: "openai",
    });
  }
  if (typeof fetchImpl !== "function") {
    throw new StartupOfficeModelError("fetch is required for model calls", {
      provider: "openai",
    });
  }
  const errors = [];
  for (const config of providerConfigs) {
    try {
      return await singleOpenAIResponsesRequest({
        config,
        env,
        fetchImpl,
        input,
        structured,
        providerAttempts: providerConfigs.map(providerAttemptMetadata),
      });
    } catch (err) {
      errors.push(err);
      if (!isRetryableModelError(err) || config === providerConfigs.at(-1)) throw err;
    }
  }
  throw errors.at(-1);
}

async function singleOpenAIResponsesRequest({
  config,
  env,
  fetchImpl,
  input,
  structured,
  providerAttempts,
}) {
  const body = {
    input: input?.input || input?.prompt || "",
    instructions: input?.instructions || "",
    metadata: input?.metadata || {},
    model: config.model,
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
  let response;
  try {
    response = await fetchImpl(
      `${config.baseURL.replace(/\/+$/, "")}/responses`,
      {
        body: JSON.stringify(body),
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        method: "POST",
      },
    );
  } catch (err) {
    throw new StartupOfficeModelError("model request failed", {
      provider: config.provider,
      retryable: true,
      upstream_error: err?.message || "fetch failed",
    });
  }
  const payload = await readJSONResponse(response);
  if (!response.ok) {
    throw new StartupOfficeModelError("model request failed", {
      provider: config.provider,
      retryable: retryableHTTPStatus(response.status),
      status: response.status,
      upstream_error: payload?.error?.message || payload?.message || "",
    });
  }
  const text = extractResponseText(payload);
  const usage = normalizeUsage(payload?.usage);
  const metadata = {
    provider_attempts: providerAttempts,
    response_id: payload?.id || null,
    selected_provider: config.provider,
  };
  if (!structured) {
    return {
      cost: costMetadata({
        env,
        model: payload?.model || config.model,
        provider: config.provider,
        usage,
      }),
      metadata,
      provider: config.provider,
      text,
    };
  }
  return {
    cost: costMetadata({
      env,
      model: payload?.model || config.model,
      provider: config.provider,
      usage,
    }),
    data: parseStructuredText(text),
    metadata,
    provider: config.provider,
    text,
  };
}

function fakeStructuredResponse(input, model, env = process.env) {
  const data = fakeOutputFor(input);
  const usage = fakeUsage();
  return {
    cost: costMetadata({ env, model, provider: "fake", usage }),
    data,
    metadata: { fake: true },
    provider: "fake",
    text: JSON.stringify(data),
  };
}

function fakeOutputFor(input) {
  const schemaName = String(input?.schemaName || "").trim();
  const loopSlug = String(input?.metadata?.loop_slug || "").trim();
  if (schemaName === "offer_package_output" || loopSlug === "offer-package") {
    return fakeOfferPackageOutput(input);
  }
  if (schemaName === "customer_discovery_output" || loopSlug === "customer-discovery") {
    return fakeCustomerDiscoveryOutput(input);
  }
  if (schemaName === "launch_campaign_output" || loopSlug === "launch-campaign") {
    return fakeLaunchCampaignOutput(input);
  }
  if (schemaName === "weekly_operator_review_output" || loopSlug === "weekly-operator-review") {
    return fakeWeeklyReviewOutput(input);
  }
  return fakeIdeaValidationOutput(input);
}

function baseAssumptions() {
  return [
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
  ];
}

function fakeIdeaValidationOutput(input) {
  const title = input?.metadata?.loop_name || "Startup Office";
  return {
    assumptions: baseAssumptions(),
    customer_segment:
      "Solo founders and tiny B2B teams who need validation before hiring operators.",
    icp_hypothesis:
      "A solo B2B founder with a specific offer, no operator team, and a need to validate paid demand before building broadly.",
    next_actions: [
      "Interview five target founders this week.",
      "Ask for a paid beta commitment before building broad automation.",
      "Review every public claim before sending it outside the workspace.",
    ],
    next_evidence: [
      {
        experiment: "Five founder discovery calls",
        owner_action: "Ask each founder to commit to a paid beta or explain the blocker.",
        success_signal: "At least two paid deposits or signed letters of intent.",
      },
      {
        experiment: "Concierge validation offer",
        owner_action: "Present the AI Startup Office as a seven-day launch office.",
        success_signal: "One buyer agrees to a concrete onboarding date.",
      },
    ],
    risk_level: "medium",
    risks: [
      "The promise can sound too autonomous unless founder approval remains explicit.",
      "The first wedge may be too broad without a paid-beta deliverable.",
    ],
    sources: [],
    summary: `${title} found a controlled paid-beta validation wedge with founder approval gates.`,
  };
}

function fakeOfferPackageOutput() {
  return {
    assumptions: [
      {
        claim: "Founders will pay for a concrete launch-office outcome before they pay for a broad AI office.",
        confidence: "medium",
        evidence_needed: "Two paid beta deposits or written purchase commitments.",
      },
      {
        claim: "Founder-control and approval receipts reduce fear of autonomous AI mistakes.",
        confidence: "medium",
        evidence_needed: "Discovery calls where buyers compare trust concerns against Polsia-like tools.",
      },
    ],
    customer_promise:
      "In seven days, create a founder-approved validation package, outreach assets, and operating review without hiring a team.",
    objections: [
      {
        evidence_needed: "Show a sample approval receipt and exportable memory page.",
        objection: "I do not trust AI to operate my business.",
        response: "Position LAF as a controlled office where every external promise is drafted, reviewed, and receipted.",
      },
      {
        evidence_needed: "Ask buyers which deliverable they would pay for first.",
        objection: "This sounds too broad for a first product.",
        response: "Sell the narrow seven-day validation office, not the full company OS.",
      },
    ],
    offer_name: "Seven-Day Founder-Controlled Launch Office",
    package_components: [
      {
        delivery_notes: "Delivered as approved artifacts, memory updates, and receipts.",
        name: "Validation Brief",
        outcome: "A focused ICP, assumptions, risks, and evidence plan.",
      },
      {
        delivery_notes: "Draft only; founder approval required before use.",
        name: "Outreach And Offer Assets",
        outcome: "Sales copy, interview guide, and follow-up drafts.",
      },
    ],
    pricing_hypothesis: {
      model: "Paid beta package",
      price_anchor: "$500 to $1,500 for a concierge seven-day package",
      reason: "The deliverable replaces early operator, marketer, and strategist time.",
      validation_question: "Would you pay a deposit today if the first deliverable is reviewed by you before anything goes public?",
    },
    risk_level: "medium",
    risks: [
      "The offer can overpromise if it implies guaranteed customer acquisition.",
      "Pricing may be too low if the service requires heavy founder-specific customization.",
    ],
    sales_copy: {
      cta: "Start the seven-day validation office",
      headline: "Run your first startup office before you hire one.",
      subheadline:
        "LAF turns your idea into approved validation assets, outreach drafts, receipts, and next operating steps while you keep control.",
    },
    sources: [],
    summary: "The paid beta should sell a narrow seven-day launch office with explicit approval receipts.",
    next_actions: [
      "Pitch the package to five founders and ask for a deposit.",
      "Record objections and update the offer memory page after each call.",
      "Keep pricing, public claims, and customer promises approval-gated.",
    ],
  };
}

function fakeCustomerDiscoveryOutput() {
  return {
    assumptions: baseAssumptions(),
    follow_up_drafts: [
      {
        body: "Thanks for the call. The main thing I heard is that validation work is painful when it creates more tasks instead of decisions. If LAF prepared a reviewed validation packet this week, would you be open to a paid beta?",
        scenario: "After a qualified discovery call",
      },
      {
        body: "No pressure. I am narrowing the first paid beta to founders who need a concrete validation package now. What would need to be true for this to be worth revisiting?",
        scenario: "After no response",
      },
    ],
    interview_guide: [
      {
        learning_goal: "Confirm whether the pain is urgent and budgeted.",
        question: "What are you doing today to validate the offer before you build or hire?",
      },
      {
        learning_goal: "Find the trust threshold for AI operating work.",
        question: "Which actions would you allow AI to draft, and which must always require your approval?",
      },
    ],
    lead_criteria: [
      "Has an active B2B idea, service, or prototype.",
      "Needs customer discovery or launch assets this month.",
      "Has budget for a concierge paid beta.",
    ],
    next_actions: [
      "Build a list of 25 founder leads matching the criteria.",
      "Send only founder-approved outreach drafts.",
      "Log every interview learning as a customer signal.",
    ],
    outreach_drafts: [
      {
        approval_note: "Founder must verify the claim and approve before sending.",
        body: "I am testing a founder-controlled AI Startup Office that turns an idea into validation assets, outreach drafts, and receipts before anything goes public. Would it be useful to pressure-test your current offer this week?",
        channel: "email",
        subject: "Pressure-test your startup offer this week?",
      },
    ],
    risk_level: "medium",
    risks: [
      "Outreach can sound generic unless it references a real founder context.",
      "Interview notes can become biased if every question sells the product.",
    ],
    sources: [],
    summary: "Discovery should target founders with immediate validation pressure and keep all outreach approval-gated.",
    target_segments: [
      {
        qualification_signals: ["recent product idea", "manual validation work", "no operator team"],
        segment: "Solo B2B founders validating a paid beta",
        why_now: "They need proof before investing more time or hiring operators.",
      },
    ],
  };
}

function fakeLaunchCampaignOutput() {
  return {
    approval_gates: [
      "Founder approves all public claims before publishing.",
      "Founder approves any paid spend before campaign launch.",
      "Founder reviews customer-facing promises against the offer package.",
    ],
    assumptions: baseAssumptions(),
    campaign_goal:
      "Book five qualified discovery calls for the seven-day founder-controlled launch office.",
    channel_plan: [
      {
        angle: "Control and transparency instead of black-box autonomy.",
        audience: "Solo B2B founders",
        channel: "Founder-led LinkedIn post",
        effort: "Low",
        success_metric: "Three qualified replies",
      },
      {
        angle: "Get validation assets before hiring a growth operator.",
        audience: "Tiny teams preparing a launch",
        channel: "Warm email",
        effort: "Medium",
        success_metric: "Two booked calls",
      },
    ],
    copy_variants: [
      {
        body: "Most AI startup tools promise autonomy. LAF is a controlled Startup Office: drafts, approvals, receipts, and memory before anything touches customers.",
        channel: "LinkedIn",
        cta: "Reply beta if you want to pressure-test your offer.",
        headline: "AI operators, but the founder keeps the wheel.",
      },
      {
        body: "I am opening a small paid beta for founders who need a validation package, outreach drafts, and a weekly operating review without hiring a team.",
        channel: "Email",
        cta: "Want to see the seven-day package?",
        headline: "A seven-day launch office for your startup idea",
      },
    ],
    experiments: [
      {
        hypothesis: "Founder-control messaging gets more qualified replies than pure autonomy messaging.",
        metric: "Qualified reply rate",
        stop_condition: "Fewer than two qualified replies after 50 targeted impressions or emails.",
      },
    ],
    metrics_to_track: ["qualified_replies", "booked_calls", "deposit_requests"],
    next_actions: [
      "Approve or revise the two copy variants.",
      "Run the smallest no-spend channel test first.",
      "Record campaign learnings as market signals.",
    ],
    risk_level: "medium",
    risks: [
      "Copy can overclaim capability if it implies autonomous execution.",
      "Paid channels should wait until organic messaging shows a signal.",
    ],
    sources: [],
    summary: "The launch campaign should test founder-control positioning with no-spend channels before any public scale-up.",
  };
}

function fakeWeeklyReviewOutput() {
  return {
    assumptions: [
      {
        claim: "The workspace has enough recent activity to review directionally.",
        confidence: "low",
        evidence_needed: "A full week of run receipts, metrics, and customer signals.",
      },
    ],
    company_pulse: {
      concerns: ["The first wedge still needs paid demand evidence."],
      status: "watch",
      wins: ["The controlled Startup Office positioning is clear enough to test."],
    },
    decisions: [
      {
        decision: "Keep the first paid beta focused on the seven-day launch office.",
        needs_approval: true,
        rationale: "A narrow outcome is easier to sell and support than a broad company OS.",
      },
    ],
    metrics_review: [
      {
        current: "0 confirmed deposits in sample data",
        interpretation: "Demand is not yet proven.",
        metric: "paid_beta_deposits",
        next_check: "Review after five founder interviews.",
      },
    ],
    next_actions: [
      "Run the Idea Validation loop after every two interviews.",
      "Update the offer package with real objections.",
      "Approve one launch campaign variant for a no-spend test.",
    ],
    next_loops: [
      {
        loop_slug: "customer-discovery",
        objective: "Interview five founders and capture objections.",
        reason: "The largest current gap is willingness-to-pay evidence.",
      },
      {
        loop_slug: "offer-package",
        objective: "Revise pricing and customer promise from interview signals.",
        reason: "The offer should change only after evidence is captured.",
      },
    ],
    receipt_takeaways: [
      "Recent run receipts should be used as the operating ledger for the review.",
      "Any public or customer-facing follow-up still requires founder approval.",
    ],
    risk_level: "medium",
    risks: [
      "Weekly review can become generic without metrics and receipts.",
      "Next loops should stay focused on evidence, not more planning.",
    ],
    sources: [],
    summary: "This week should focus on paid-beta evidence: interviews, objections, offer revision, and one approved launch test.",
  };
}

function costMetadata({ env = process.env, model, provider, usage }) {
  const normalized = normalizeUsage(usage);
  const estimate = modelCostEstimate({ env, model, provider, usage: normalized });
  return {
    billing_reconciliation: estimate.billing_reconciliation,
    currency: "USD",
    estimated_cents: estimate.estimated_cents,
    estimated_raw_cents: estimate.estimated_raw_cents,
    estimated_usd: estimate.estimated_usd,
    input_cents_per_1m: estimate.input_cents_per_1m,
    input_tokens: normalized.input_tokens,
    model,
    output_cents_per_1m: estimate.output_cents_per_1m,
    output_tokens: normalized.output_tokens,
    pricing_error: estimate.pricing_error,
    pricing_key: estimate.pricing_key,
    pricing_units: estimate.pricing_units,
    provider,
    pricing_source: estimate.pricing_source,
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

function openAIProviderConfigs(env, model) {
  const primary = {
    apiKey: env.LAF_OFFICE_OPENAI_API_KEY || env.OPENAI_API_KEY || "",
    baseURL: openAIBaseURL(env),
    model,
    provider: "openai",
  };
  const fallback = {
    apiKey:
      env.LAF_OFFICE_OPENAI_FALLBACK_API_KEY ||
      env.OPENAI_FALLBACK_API_KEY ||
      primary.apiKey,
    baseURL:
      env.LAF_OFFICE_OPENAI_FALLBACK_BASE_URL ||
      env.OPENAI_FALLBACK_BASE_URL ||
      primary.baseURL,
    model:
      env.LAF_OFFICE_STARTUP_OFFICE_FALLBACK_MODEL ||
      env.STARTUP_OFFICE_FALLBACK_MODEL ||
      primary.model,
    provider: "openai_fallback",
  };
  const configs = [];
  if (primary.apiKey) configs.push(primary);
  const fallbackRequested = Boolean(
    env.LAF_OFFICE_OPENAI_FALLBACK_API_KEY ||
      env.OPENAI_FALLBACK_API_KEY ||
      env.LAF_OFFICE_OPENAI_FALLBACK_BASE_URL ||
      env.OPENAI_FALLBACK_BASE_URL ||
      env.LAF_OFFICE_STARTUP_OFFICE_FALLBACK_MODEL ||
      env.STARTUP_OFFICE_FALLBACK_MODEL,
  );
  if (
    fallbackRequested &&
    fallback.apiKey &&
    (fallback.apiKey !== primary.apiKey ||
      fallback.baseURL !== primary.baseURL ||
      fallback.model !== primary.model)
  ) {
    configs.push(fallback);
  }
  return configs;
}

function providerAttemptMetadata(config) {
  return {
    base_url_host: safeHost(config.baseURL),
    model: config.model,
    provider: config.provider,
  };
}

function safeHost(value) {
  try {
    return new URL(value).host;
  } catch {
    return "";
  }
}

function hasAnyOpenAIKey(env) {
  return Boolean(
    env.LAF_OFFICE_OPENAI_API_KEY ||
      env.OPENAI_API_KEY ||
      env.LAF_OFFICE_OPENAI_FALLBACK_API_KEY ||
      env.OPENAI_FALLBACK_API_KEY,
  );
}

function openAIBaseURL(env) {
  return env.LAF_OFFICE_OPENAI_BASE_URL || "https://api.openai.com/v1";
}

function isRetryableModelError(err) {
  if (!(err instanceof StartupOfficeModelError)) return false;
  if (err.details?.retryable === true) return true;
  return retryableHTTPStatus(err.details?.status);
}

function retryableHTTPStatus(status) {
  const value = Number(status);
  return value === 408 || value === 409 || value === 425 || value === 429 || value >= 500;
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
  openAIProviderConfigs,
};
