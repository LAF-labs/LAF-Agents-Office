const IDEA_VALIDATION_SCHEMA = Object.freeze({
  additionalProperties: false,
  properties: {
    assumptions: {
      items: {
        additionalProperties: false,
        properties: {
          claim: { type: "string" },
          confidence: { enum: ["low", "medium", "high"], type: "string" },
          evidence_needed: { type: "string" },
        },
        required: ["claim", "confidence", "evidence_needed"],
        type: "object",
      },
      type: "array",
    },
    customer_segment: { type: "string" },
    next_actions: {
      items: { type: "string" },
      type: "array",
    },
    risk_level: { enum: ["low", "medium", "high"], type: "string" },
    risks: {
      items: { type: "string" },
      type: "array",
    },
    sources: {
      items: {
        additionalProperties: false,
        properties: {
          label: { type: "string" },
          url: { type: "string" },
        },
        required: ["label", "url"],
        type: "object",
      },
      type: "array",
    },
    summary: { type: "string" },
  },
  required: [
    "summary",
    "customer_segment",
    "assumptions",
    "risks",
    "risk_level",
    "next_actions",
    "sources",
  ],
  type: "object",
});

const ideaValidationTemplate = Object.freeze({
  artifactKind: "plan",
  artifactTitle: "Idea Validation AI draft",
  instructions:
    "You are the Strategy lead inside a founder-controlled AI Startup Office. Produce useful work, but do not claim external research was performed unless sources are supplied in context. Public, customer-facing, financial, or irreversible actions must remain approval-gated.",
  schema: IDEA_VALIDATION_SCHEMA,
  schemaDescription:
    "Idea validation output with explicit assumptions, risks, sources, and next founder-controlled actions.",
  schemaName: "idea_validation_output",
  slug: "idea-validation",
  summary(output) {
    return output?.summary || "Idea validation draft is ready for founder review.";
  },
  toArtifact(output, context) {
    return [
      "# Idea Validation AI Draft",
      "",
      `## Summary`,
      clean(output.summary),
      "",
      "## Customer Segment",
      clean(output.customer_segment),
      "",
      "## Falsifiable Assumptions",
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
      "- No public, customer-facing, financial, or irreversible action has been taken.",
      "- This draft must be approved before it becomes company memory or outbound material.",
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
      "Loop:",
      JSON.stringify(context.loop || {}, null, 2),
      "",
      "Founder inputs:",
      JSON.stringify(inputs || {}, null, 2),
      "",
      "Recent receipts:",
      JSON.stringify(context.recent_receipts || [], null, 2),
      "",
      "Previous run summaries:",
      JSON.stringify(context.previous_runs || [], null, 2),
      "",
      "Relevant signals and assets:",
      JSON.stringify(
        {
          assets: context.relevant_assets || [],
          signals: context.relevant_signals || [],
          wiki_memory: context.wiki_memory || [],
        },
        null,
        2,
      ),
      "",
      "Return only JSON matching the schema. Mark unsourced claims as assumptions.",
    ].join("\n");
  },
});

function listAssumptions(items) {
  return array(items).map(
    (item) =>
      `- ${clean(item.claim)} (${clean(item.confidence || "medium")} confidence) - evidence needed: ${clean(item.evidence_needed)}`,
  );
}

function listText(items) {
  return array(items).map((item) => `- ${clean(item)}`);
}

function listSources(items) {
  return array(items).map((item) => `- ${clean(item.label)}: ${clean(item.url)}`);
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function clean(value) {
  return String(value || "").trim();
}

module.exports = {
  IDEA_VALIDATION_SCHEMA,
  ideaValidationTemplate,
};
