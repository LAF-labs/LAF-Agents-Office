const {
  ASSUMPTION_SCHEMA,
  SOURCE_SCHEMA,
  clean,
  listAssumptions,
  listSources,
  listText,
} = require("./templateUtils");

const OFFER_PACKAGE_SCHEMA = Object.freeze({
  additionalProperties: false,
  properties: {
    assumptions: { items: ASSUMPTION_SCHEMA, type: "array" },
    customer_promise: { type: "string" },
    objections: {
      items: {
        additionalProperties: false,
        properties: {
          evidence_needed: { type: "string" },
          objection: { type: "string" },
          response: { type: "string" },
        },
        required: ["objection", "response", "evidence_needed"],
        type: "object",
      },
      type: "array",
    },
    offer_name: { type: "string" },
    package_components: {
      items: {
        additionalProperties: false,
        properties: {
          delivery_notes: { type: "string" },
          name: { type: "string" },
          outcome: { type: "string" },
        },
        required: ["name", "outcome", "delivery_notes"],
        type: "object",
      },
      type: "array",
    },
    pricing_hypothesis: {
      additionalProperties: false,
      properties: {
        model: { type: "string" },
        price_anchor: { type: "string" },
        reason: { type: "string" },
        validation_question: { type: "string" },
      },
      required: ["model", "price_anchor", "reason", "validation_question"],
      type: "object",
    },
    risk_level: { enum: ["low", "medium", "high"], type: "string" },
    risks: { items: { type: "string" }, type: "array" },
    sales_copy: {
      additionalProperties: false,
      properties: {
        cta: { type: "string" },
        headline: { type: "string" },
        subheadline: { type: "string" },
      },
      required: ["headline", "subheadline", "cta"],
      type: "object",
    },
    sources: { items: SOURCE_SCHEMA, type: "array" },
    summary: { type: "string" },
    next_actions: { items: { type: "string" }, type: "array" },
  },
  required: [
    "summary",
    "offer_name",
    "customer_promise",
    "package_components",
    "pricing_hypothesis",
    "objections",
    "sales_copy",
    "assumptions",
    "risks",
    "risk_level",
    "next_actions",
    "sources",
  ],
  type: "object",
});

const offerPackageTemplate = Object.freeze({
  approvalGates: Object.freeze([
    "customer_promise",
    "payment",
    "pricing_change",
    "public_claim",
    "publish",
  ]),
  artifactKind: "draft",
  artifactTitle: "Offer Package AI draft",
  instructions:
    "You are the Growth lead inside a founder-controlled AI Startup Office. Draft a paid-beta offer package with a concrete promise, packaging, pricing hypothesis, objections, sales copy, assumptions, risks, and approval gates. Do not claim external validation unless sources are supplied in context.",
  qualityRules: {
    requiredArrays: ["assumptions", "objections", "package_components", "risks", "next_actions"],
    requiredObjects: ["pricing_hypothesis", "sales_copy"],
    requiredStrings: ["customer_promise", "offer_name", "summary"],
  },
  schema: OFFER_PACKAGE_SCHEMA,
  schemaDescription:
    "Offer package output with promise, package, objections, pricing hypothesis, sales copy, risks, sources, and next actions.",
  schemaName: "offer_package_output",
  slug: "offer-package",
  summary(output) {
    return output?.summary || "Offer package draft is ready for founder review.";
  },
  toArtifact(output, context) {
    return [
      "# Offer Package AI Draft",
      "",
      "## Summary",
      clean(output.summary),
      "",
      "## Offer",
      `Name: ${clean(output.offer_name)}`,
      `Promise: ${clean(output.customer_promise)}`,
      "",
      "## Package Components",
      ...listComponents(output.package_components),
      "",
      "## Pricing Hypothesis",
      `Model: ${clean(output.pricing_hypothesis?.model)}`,
      `Anchor: ${clean(output.pricing_hypothesis?.price_anchor)}`,
      `Reason: ${clean(output.pricing_hypothesis?.reason)}`,
      `Validation question: ${clean(output.pricing_hypothesis?.validation_question)}`,
      "",
      "## Objections",
      ...listObjections(output.objections),
      "",
      "## Sales Copy",
      `Headline: ${clean(output.sales_copy?.headline)}`,
      `Subheadline: ${clean(output.sales_copy?.subheadline)}`,
      `CTA: ${clean(output.sales_copy?.cta)}`,
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
      "- No customer promise, pricing change, payment request, or public page has been published.",
      "- Founder approval is required before external use.",
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
      "Relevant company memory, assets, signals, receipts, and previous runs:",
      JSON.stringify(contextPacket(context), null, 2),
      "",
      "Return only JSON matching the schema. If citation_sources is non-empty, cite those URLs in sources for any externally informed customer or pricing claim. Mark remaining unsourced claims as assumptions.",
    ].join("\n");
  },
});

function contextPacket(context) {
  return {
    assets: context.relevant_assets || [],
    browser_research: context.browser_research || [],
    citation_sources: context.citation_sources || [],
    previous_runs: context.previous_runs || [],
    receipts: context.recent_receipts || [],
    revision_request: context.revision_request || {},
    signals: context.relevant_signals || [],
    wiki_memory: context.wiki_memory || [],
  };
}

function listComponents(items = []) {
  return items.map(
    (item) =>
      `- ${clean(item.name)} - outcome: ${clean(item.outcome)}; delivery: ${clean(item.delivery_notes)}`,
  );
}

function listObjections(items = []) {
  return items.map(
    (item) =>
      `- ${clean(item.objection)} -> ${clean(item.response)} (evidence needed: ${clean(item.evidence_needed)})`,
  );
}

module.exports = {
  OFFER_PACKAGE_SCHEMA,
  offerPackageTemplate,
};
