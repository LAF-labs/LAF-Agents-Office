const SOURCE_SCHEMA = Object.freeze({
  additionalProperties: false,
  properties: {
    label: { type: "string" },
    url: { type: "string" },
  },
  required: ["label", "url"],
  type: "object",
});

const ASSUMPTION_SCHEMA = Object.freeze({
  additionalProperties: false,
  properties: {
    claim: { type: "string" },
    confidence: { enum: ["low", "medium", "high"], type: "string" },
    evidence_needed: { type: "string" },
  },
  required: ["claim", "confidence", "evidence_needed"],
  type: "object",
});

function listText(items) {
  return array(items).map((item) => `- ${clean(item)}`);
}

function listAssumptions(items) {
  return array(items).map(
    (item) =>
      `- ${clean(item.claim)} (${clean(item.confidence || "medium")} confidence) - evidence needed: ${clean(item.evidence_needed)}`,
  );
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
  ASSUMPTION_SCHEMA,
  SOURCE_SCHEMA,
  array,
  clean,
  listAssumptions,
  listSources,
  listText,
};
