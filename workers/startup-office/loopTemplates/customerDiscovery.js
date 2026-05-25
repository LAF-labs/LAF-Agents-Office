const {
  ASSUMPTION_SCHEMA,
  SOURCE_SCHEMA,
  clean,
  listAssumptions,
  listSources,
  listText,
} = require("./templateUtils");

const CUSTOMER_DISCOVERY_SCHEMA = Object.freeze({
  additionalProperties: false,
  properties: {
    assumptions: { items: ASSUMPTION_SCHEMA, type: "array" },
    follow_up_drafts: {
      items: {
        additionalProperties: false,
        properties: {
          body: { type: "string" },
          scenario: { type: "string" },
        },
        required: ["scenario", "body"],
        type: "object",
      },
      type: "array",
    },
    interview_guide: {
      items: {
        additionalProperties: false,
        properties: {
          learning_goal: { type: "string" },
          question: { type: "string" },
        },
        required: ["question", "learning_goal"],
        type: "object",
      },
      type: "array",
    },
    lead_criteria: {
      items: { type: "string" },
      type: "array",
    },
    next_actions: { items: { type: "string" }, type: "array" },
    outreach_drafts: {
      items: {
        additionalProperties: false,
        properties: {
          approval_note: { type: "string" },
          body: { type: "string" },
          channel: { type: "string" },
          subject: { type: "string" },
        },
        required: ["channel", "subject", "body", "approval_note"],
        type: "object",
      },
      type: "array",
    },
    risk_level: { enum: ["low", "medium", "high"], type: "string" },
    risks: { items: { type: "string" }, type: "array" },
    sources: { items: SOURCE_SCHEMA, type: "array" },
    summary: { type: "string" },
    target_segments: {
      items: {
        additionalProperties: false,
        properties: {
          qualification_signals: { items: { type: "string" }, type: "array" },
          segment: { type: "string" },
          why_now: { type: "string" },
        },
        required: ["segment", "why_now", "qualification_signals"],
        type: "object",
      },
      type: "array",
    },
  },
  required: [
    "summary",
    "target_segments",
    "lead_criteria",
    "interview_guide",
    "outreach_drafts",
    "follow_up_drafts",
    "assumptions",
    "risks",
    "risk_level",
    "next_actions",
    "sources",
  ],
  type: "object",
});

const customerDiscoveryTemplate = Object.freeze({
  approvalGates: Object.freeze(["external_send", "customer_promise", "public_claim"]),
  artifactKind: "message",
  artifactTitle: "Customer Discovery AI draft",
  instructions:
    "You are the Sales lead inside a founder-controlled AI Startup Office. Prepare target criteria, interview questions, outreach drafts, and follow-up drafts. Do not send messages or imply anyone was contacted.",
  qualityRules: {
    requiredArrays: [
      "assumptions",
      "follow_up_drafts",
      "interview_guide",
      "lead_criteria",
      "outreach_drafts",
      "risks",
      "target_segments",
      "next_actions",
    ],
    requiredStrings: ["summary"],
  },
  schema: CUSTOMER_DISCOVERY_SCHEMA,
  schemaDescription:
    "Customer discovery output with target segments, lead criteria, interview guide, outreach drafts, follow-up drafts, risks, sources, and next actions.",
  schemaName: "customer_discovery_output",
  slug: "customer-discovery",
  summary(output) {
    return output?.summary || "Customer discovery draft is ready for founder review.";
  },
  toArtifact(output, context) {
    return [
      "# Customer Discovery AI Draft",
      "",
      "## Summary",
      clean(output.summary),
      "",
      "## Target Segments",
      ...listSegments(output.target_segments),
      "",
      "## Lead Criteria",
      ...listText(output.lead_criteria),
      "",
      "## Interview Guide",
      ...listInterviewGuide(output.interview_guide),
      "",
      "## Outreach Drafts",
      ...listOutreach(output.outreach_drafts),
      "",
      "## Follow-Up Drafts",
      ...listFollowUps(output.follow_up_drafts),
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
      "- No outreach has been sent and no customer record has been changed.",
      "- Founder approval is required before sending any message.",
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
      "Existing customers, signals, memory, receipts, and previous runs:",
      JSON.stringify(
        {
          customers: context.relevant_customers || [],
          browser_research: context.browser_research || [],
          citation_sources: context.citation_sources || [],
          previous_runs: context.previous_runs || [],
          receipts: context.recent_receipts || [],
          signals: context.relevant_signals || [],
          wiki_memory: context.wiki_memory || [],
        },
        null,
        2,
      ),
      "",
      "Return only JSON matching the schema. If citation_sources is non-empty, cite those URLs in sources for any externally informed claim. Draft messages for founder approval only.",
    ].join("\n");
  },
});

function listSegments(items = []) {
  return items.map(
    (item) =>
      `- ${clean(item.segment)} - why now: ${clean(item.why_now)}; signals: ${item.qualification_signals?.map(clean).join(", ") || ""}`,
  );
}

function listInterviewGuide(items = []) {
  return items.map(
    (item) => `- ${clean(item.question)} (learn: ${clean(item.learning_goal)})`,
  );
}

function listOutreach(items = []) {
  return items.flatMap((item) => [
    `### ${clean(item.channel)} - ${clean(item.subject)}`,
    clean(item.body),
    `Approval note: ${clean(item.approval_note)}`,
    "",
  ]);
}

function listFollowUps(items = []) {
  return items.flatMap((item) => [
    `### ${clean(item.scenario)}`,
    clean(item.body),
    "",
  ]);
}

module.exports = {
  CUSTOMER_DISCOVERY_SCHEMA,
  customerDiscoveryTemplate,
};
