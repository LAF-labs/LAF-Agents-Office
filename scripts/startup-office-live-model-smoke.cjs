#!/usr/bin/env node
"use strict";

const { STARTUP_OFFICE_LOOP_TEMPLATES } = require("../workers/startup-office/loopTemplates");
const { createStartupOfficeModelClient } = require("../workers/startup-office/modelClient");
const { evaluateStartupOfficeOutput } = require("../workers/startup-office/qualityChecks");

const RUN_FLAG = "LAF_RUN_LIVE_MODEL_SMOKE";

async function main() {
  const result = await runLiveModelSmoke();
  if (!result.ok) {
    console.error(`[startup-office-live-model-smoke] FAIL ${result.error}`);
    process.exit(1);
  }
}

async function runLiveModelSmoke({
  env = process.env,
  fetchImpl = globalThis.fetch,
  log = console.log,
} = {}) {
  if (String(env[RUN_FLAG] || "").trim() !== "1") {
    log(
      `[startup-office-live-model-smoke] SKIP set ${RUN_FLAG}=1 to run one live model call`,
    );
    return { ok: true, skipped: true };
  }

  const provider = configuredProvider(env);
  if (provider && provider !== "openai") {
    return {
      error: "live smoke requires LAF_OFFICE_STARTUP_OFFICE_AI_PROVIDER=openai",
      ok: false,
      skipped: false,
    };
  }
  if (!hasAnyOpenAIKey(env)) {
    return {
      error: "missing LAF_OFFICE_OPENAI_API_KEY, OPENAI_API_KEY, or fallback OpenAI-compatible key",
      ok: false,
      skipped: false,
    };
  }
  if (typeof fetchImpl !== "function") {
    return { error: "fetch is required for live model smoke", ok: false, skipped: false };
  }

  const template = STARTUP_OFFICE_LOOP_TEMPLATES["idea-validation"];
  const modelClient = createStartupOfficeModelClient({
    env: {
      ...env,
      LAF_OFFICE_STARTUP_OFFICE_AI_PROVIDER: "openai",
    },
    fetchImpl,
  });
  const context = smokeContext(template);
  const result = await modelClient.generateStructured({
    input: template.userPrompt({
      context,
      inputs: { market: "founder-controlled AI startup operations" },
      objective: "Create a cautious founder-controlled validation plan for a closed beta.",
    }),
    instructions: template.instructions,
    metadata: {
      loop_name: template.artifactTitle,
      loop_slug: template.slug,
      smoke: "live_model",
    },
    schema: template.schema,
    schemaDescription: template.schemaDescription,
    schemaName: template.schemaName,
  });
  if (result.provider === "fake") {
    return { error: "live smoke must not use the fake provider", ok: false, skipped: false };
  }
  const quality = evaluateStartupOfficeOutput({
    output: result.data,
    template,
  });
  if (!quality.passed) {
    return {
      error: `live model output failed quality checks: ${quality.issues.join("; ")}`,
      ok: false,
      skipped: false,
    };
  }
  if (!Number(result.cost?.total_tokens || 0)) {
    return {
      error: "live model response did not include provider usage tokens",
      ok: false,
      skipped: false,
    };
  }

  log(
    [
      "[startup-office-live-model-smoke] PASS live model path generated a quality-checked draft",
      `provider=${result.provider}`,
      `model=${result.cost.model}`,
      `tokens=${result.cost.total_tokens}`,
      `pricing=${result.cost.pricing_source}`,
    ].join(" "),
  );
  return {
    model: result.cost.model,
    ok: true,
    pricing_source: result.cost.pricing_source,
    provider: result.provider,
    skipped: false,
    total_tokens: result.cost.total_tokens,
  };
}

function smokeContext(template) {
  return {
    loop: { name: template.artifactTitle, slug: template.slug },
    previous_runs: [],
    profile: {
      icp: "Solo founders and tiny B2B teams",
      name: "LAF Live Model Smoke",
      offer: "Founder-controlled AI Startup Office",
      positioning: "Transparent Startup Office where founders approve external actions.",
      stage: "closed-beta",
    },
    recent_receipts: [],
    relevant_assets: [],
    relevant_signals: [],
    run: { id: "live-model-smoke" },
    wiki_memory: [],
  };
}

function configuredProvider(env) {
  return String(
    env.LAF_OFFICE_STARTUP_OFFICE_AI_PROVIDER || env.STARTUP_OFFICE_AI_PROVIDER || "",
  )
    .trim()
    .toLowerCase();
}

function hasAnyOpenAIKey(env) {
  return Boolean(
    env.LAF_OFFICE_OPENAI_API_KEY ||
      env.OPENAI_API_KEY ||
      env.LAF_OFFICE_OPENAI_FALLBACK_API_KEY ||
      env.OPENAI_FALLBACK_API_KEY,
  );
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`[startup-office-live-model-smoke] FAIL ${err.message}`);
    process.exit(1);
  });
}

module.exports = {
  runLiveModelSmoke,
  smokeContext,
};
