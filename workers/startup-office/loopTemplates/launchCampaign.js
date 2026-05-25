const {
  ASSUMPTION_SCHEMA,
  SOURCE_SCHEMA,
  clean,
  listAssumptions,
  listSources,
  listText,
} = require("./templateUtils");

const LAUNCH_CAMPAIGN_SCHEMA = Object.freeze({
  additionalProperties: false,
  properties: {
    approval_gates: { items: { type: "string" }, type: "array" },
    assumptions: { items: ASSUMPTION_SCHEMA, type: "array" },
    campaign_goal: { type: "string" },
    channel_plan: {
      items: {
        additionalProperties: false,
        properties: {
          angle: { type: "string" },
          audience: { type: "string" },
          channel: { type: "string" },
          effort: { type: "string" },
          success_metric: { type: "string" },
        },
        required: ["channel", "audience", "angle", "effort", "success_metric"],
        type: "object",
      },
      type: "array",
    },
    copy_variants: {
      items: {
        additionalProperties: false,
        properties: {
          body: { type: "string" },
          channel: { type: "string" },
          cta: { type: "string" },
          headline: { type: "string" },
        },
        required: ["channel", "headline", "body", "cta"],
        type: "object",
      },
      type: "array",
    },
    experiments: {
      items: {
        additionalProperties: false,
        properties: {
          hypothesis: { type: "string" },
          metric: { type: "string" },
          stop_condition: { type: "string" },
        },
        required: ["hypothesis", "metric", "stop_condition"],
        type: "object",
      },
      type: "array",
    },
    metrics_to_track: { items: { type: "string" }, type: "array" },
    next_actions: { items: { type: "string" }, type: "array" },
    risk_level: { enum: ["low", "medium", "high"], type: "string" },
    risks: { items: { type: "string" }, type: "array" },
    sources: { items: SOURCE_SCHEMA, type: "array" },
    summary: { type: "string" },
  },
  required: [
    "summary",
    "campaign_goal",
    "channel_plan",
    "copy_variants",
    "experiments",
    "metrics_to_track",
    "approval_gates",
    "assumptions",
    "risks",
    "risk_level",
    "next_actions",
    "sources",
  ],
  type: "object",
});

const launchCampaignTemplate = Object.freeze({
  artifactKind: "draft",
  artifactTitle: "Launch Campaign AI draft",
  instructions:
    "You are the Marketing lead inside a founder-controlled AI Startup Office. Draft campaign channels, copy variants, experiments, approval gates, and metrics. Do not publish, buy ads, email users, or imply public launch work already happened.",
  qualityRules: {
    requiredArrays: [
      "approval_gates",
      "assumptions",
      "channel_plan",
      "copy_variants",
      "experiments",
      "metrics_to_track",
      "risks",
      "next_actions",
    ],
    requiredStrings: ["campaign_goal", "summary"],
  },
  schema: LAUNCH_CAMPAIGN_SCHEMA,
  schemaDescription:
    "Launch campaign output with channel plan, copy variants, experiments, approval gates, metrics, risks, sources, and next actions.",
  schemaName: "launch_campaign_output",
  slug: "launch-campaign",
  summary(output) {
    return output?.summary || "Launch campaign draft is ready for founder review.";
  },
  toArtifact(output, context) {
    return [
      "# Launch Campaign AI Draft",
      "",
      "## Summary",
      clean(output.summary),
      "",
      "## Campaign Goal",
      clean(output.campaign_goal),
      "",
      "## Channel Plan",
      ...listChannels(output.channel_plan),
      "",
      "## Copy Variants",
      ...listCopy(output.copy_variants),
      "",
      "## Experiments",
      ...listExperiments(output.experiments),
      "",
      "## Metrics To Track",
      ...listText(output.metrics_to_track),
      "",
      "## Approval Gates",
      ...listText(output.approval_gates),
      "",
      "## Assumptions",
      ...listAssumptions(output.assumptions),
      "",
      "## Risks",
      ...listText(output.risks),
      "",
      "## Next Actions",
      ...listText(output.next_actions),
      "",
      "## Sources And Assumptions",
      ...listSources(output.sources),
      output.sources?.length
        ? ""
        : "- No external sources were used. Treat claims as assumptions until the founder supplies evidence.",
      "",
      "## Founder Control",
      "- Nothing has been published, sent, boosted, or paid for.",
      "- Founder approval is required before any public or paid launch action.",
      "",
      `Context run: ${context.run?.id || "new run"}`,
    ].join("\n");
  },
  userPrompt({ context, inputs, objective }) {
    return [
      `Objective: ${objective}`,
      "",
      "Company profile:",
      JSON.stringify(context.profile || {}, null, 2),
      "",
      "Founder inputs:",
      JSON.stringify(inputs || {}, null, 2),
      "",
      "Assets, signals, metrics, receipts, and previous runs:",
      JSON.stringify(
        {
          assets: context.relevant_assets || [],
          citation_sources: context.citation_sources || [],
          metrics: context.metrics || [],
          previous_runs: context.previous_runs || [],
          receipts: context.recent_receipts || [],
          signals: context.relevant_signals || [],
          wiki_memory: context.wiki_memory || [],
        },
        null,
        2,
      ),
      "",
      "Return only JSON matching the schema. If citation_sources is non-empty, cite those URLs in sources for any externally informed claim. Draft campaign work for approval only.",
    ].join("\n");
  },
});

function listChannels(items = []) {
  return items.map(
    (item) =>
      `- ${clean(item.channel)} for ${clean(item.audience)} - angle: ${clean(item.angle)}; effort: ${clean(item.effort)}; metric: ${clean(item.success_metric)}`,
  );
}

function listCopy(items = []) {
  return items.flatMap((item) => [
    `### ${clean(item.channel)} - ${clean(item.headline)}`,
    clean(item.body),
    `CTA: ${clean(item.cta)}`,
    "",
  ]);
}

function listExperiments(items = []) {
  return items.map(
    (item) =>
      `- ${clean(item.hypothesis)} - metric: ${clean(item.metric)}; stop: ${clean(item.stop_condition)}`,
  );
}

module.exports = {
  LAUNCH_CAMPAIGN_SCHEMA,
  launchCampaignTemplate,
};
