const {
  ASSUMPTION_SCHEMA,
  SOURCE_SCHEMA,
  clean,
  listAssumptions,
  listSources,
  listText,
} = require("./templateUtils");

const WEEKLY_REVIEW_SCHEMA = Object.freeze({
  additionalProperties: false,
  properties: {
    assumptions: { items: ASSUMPTION_SCHEMA, type: "array" },
    company_pulse: {
      additionalProperties: false,
      properties: {
        concerns: { items: { type: "string" }, type: "array" },
        status: { enum: ["on_track", "watch", "blocked"], type: "string" },
        wins: { items: { type: "string" }, type: "array" },
      },
      required: ["status", "wins", "concerns"],
      type: "object",
    },
    decisions: {
      items: {
        additionalProperties: false,
        properties: {
          decision: { type: "string" },
          needs_approval: { type: "boolean" },
          rationale: { type: "string" },
        },
        required: ["decision", "rationale", "needs_approval"],
        type: "object",
      },
      type: "array",
    },
    metrics_review: {
      items: {
        additionalProperties: false,
        properties: {
          current: { type: "string" },
          interpretation: { type: "string" },
          metric: { type: "string" },
          next_check: { type: "string" },
        },
        required: ["metric", "current", "interpretation", "next_check"],
        type: "object",
      },
      type: "array",
    },
    next_actions: { items: { type: "string" }, type: "array" },
    next_loops: {
      items: {
        additionalProperties: false,
        properties: {
          loop_slug: { type: "string" },
          objective: { type: "string" },
          reason: { type: "string" },
        },
        required: ["loop_slug", "objective", "reason"],
        type: "object",
      },
      type: "array",
    },
    receipt_takeaways: { items: { type: "string" }, type: "array" },
    risk_level: { enum: ["low", "medium", "high"], type: "string" },
    risks: { items: { type: "string" }, type: "array" },
    sources: { items: SOURCE_SCHEMA, type: "array" },
    summary: { type: "string" },
  },
  required: [
    "summary",
    "company_pulse",
    "metrics_review",
    "receipt_takeaways",
    "decisions",
    "risks",
    "risk_level",
    "next_loops",
    "next_actions",
    "assumptions",
    "sources",
  ],
  type: "object",
});

const weeklyReviewTemplate = Object.freeze({
  approvalGates: Object.freeze(["payment", "legal_sensitive", "public_claim"]),
  artifactKind: "report",
  artifactTitle: "Weekly Operator Review AI draft",
  instructions:
    "You are the Operations lead inside a founder-controlled AI Startup Office. Summarize company pulse, metrics, receipt takeaways, decisions, risks, and next loops. Do not claim work was executed; prepare an operating review for founder approval.",
  qualityRules: {
    requiredArrays: [
      "assumptions",
      "decisions",
      "metrics_review",
      "next_actions",
      "next_loops",
      "receipt_takeaways",
      "risks",
    ],
    requiredObjects: ["company_pulse"],
    requiredStrings: ["summary"],
  },
  schema: WEEKLY_REVIEW_SCHEMA,
  schemaDescription:
    "Weekly operator review output with company pulse, metrics, receipt takeaways, decisions, risks, next loops, sources, and next actions.",
  schemaName: "weekly_operator_review_output",
  slug: "weekly-operator-review",
  summary(output) {
    return output?.summary || "Weekly operator review is ready for founder review.";
  },
  toArtifact(output, context) {
    return [
      "# Weekly Operator Review AI Draft",
      "",
      "## Summary",
      clean(output.summary),
      "",
      "## Company Pulse",
      `Status: ${clean(output.company_pulse?.status)}`,
      "Wins:",
      ...listText(output.company_pulse?.wins),
      "Concerns:",
      ...listText(output.company_pulse?.concerns),
      "",
      "## Metrics Review",
      ...listMetrics(output.metrics_review),
      "",
      "## Receipt Takeaways",
      ...listText(output.receipt_takeaways),
      "",
      "## Decisions",
      ...listDecisions(output.decisions),
      "",
      "## Risks",
      ...listText(output.risks),
      "",
      "## Next Loops",
      ...listLoops(output.next_loops),
      "",
      "## Next Actions",
      ...listText(output.next_actions),
      "",
      "## Assumptions",
      ...listAssumptions(output.assumptions),
      "",
      "## Sources And Assumptions",
      ...listSources(output.sources),
      output.sources?.length
        ? ""
        : "- No external sources were used. Treat claims as assumptions until the founder supplies evidence.",
      "",
      "## Founder Control",
      "- No priorities, public commitments, or budget changes have been executed.",
      "- Founder approval is required before changing operating cadence.",
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
      "Operating context:",
      JSON.stringify(
        {
          browser_research: context.browser_research || [],
          citation_sources: context.citation_sources || [],
          metrics: context.metrics || [],
          previous_runs: context.previous_runs || [],
          prompt_version: context.prompt_version || {},
          receipts: context.recent_receipts || [],
          revision_request: context.revision_request || {},
          signals: context.relevant_signals || [],
          tool_policy: context.tool_policy || {},
          wiki_memory: context.wiki_memory || [],
        },
        null,
        2,
      ),
      "",
      "Return only JSON matching the schema. If citation_sources is non-empty, cite those URLs in sources for any externally informed claim. Base the review on supplied context and mark gaps as assumptions.",
    ].join("\n");
  },
});

function listMetrics(items = []) {
  return items.map(
    (item) =>
      `- ${clean(item.metric)}: ${clean(item.current)} - ${clean(item.interpretation)}; next check: ${clean(item.next_check)}`,
  );
}

function listDecisions(items = []) {
  return items.map(
    (item) =>
      `- ${clean(item.decision)} - ${clean(item.rationale)}${item.needs_approval ? " (approval needed)" : ""}`,
  );
}

function listLoops(items = []) {
  return items.map(
    (item) =>
      `- ${clean(item.loop_slug)}: ${clean(item.objective)} - ${clean(item.reason)}`,
  );
}

module.exports = {
  WEEKLY_REVIEW_SCHEMA,
  weeklyReviewTemplate,
};
