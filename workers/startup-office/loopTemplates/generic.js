const GENERIC_LOOP_SCHEMA = Object.freeze({
  additionalProperties: false,
  properties: {
    draft_sections: {
      items: {
        additionalProperties: false,
        properties: {
          body: { type: "string" },
          title: { type: "string" },
        },
        required: ["title", "body"],
        type: "object",
      },
      type: "array",
    },
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
    "draft_sections",
    "risks",
    "risk_level",
    "next_actions",
    "sources",
  ],
  type: "object",
});

function createGenericLoopTemplate(config) {
  return Object.freeze({
    artifactKind: config.artifactKind || "draft",
    artifactTitle: config.artifactTitle,
    instructions:
      config.instructions ||
      "You are an operator inside a founder-controlled AI Startup Office. Produce useful work, label assumptions, and never execute external actions.",
    schema: GENERIC_LOOP_SCHEMA,
    schemaDescription: config.schemaDescription,
    schemaName: config.schemaName,
    slug: config.slug,
    summary(output) {
      return output?.summary || `${config.artifactTitle} is ready for founder review.`;
    },
    toArtifact(output, context) {
      return [
        `# ${config.artifactTitle}`,
        "",
        "## Summary",
        clean(output.summary),
        "",
        ...sections(output.draft_sections),
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
        "- Founder approval is required before promotion or external use.",
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
        "Recent context:",
        JSON.stringify(
          {
            assets: context.relevant_assets || [],
            previous_runs: context.previous_runs || [],
            receipts: context.recent_receipts || [],
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
}

function sections(items) {
  return array(items).flatMap((item) => [
    `## ${clean(item.title)}`,
    clean(item.body),
    "",
  ]);
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
  GENERIC_LOOP_SCHEMA,
  createGenericLoopTemplate,
};
