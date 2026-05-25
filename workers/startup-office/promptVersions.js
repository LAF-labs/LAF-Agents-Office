const crypto = require("node:crypto");

const { STARTUP_OFFICE_LOOP_TEMPLATES } = require("./loopTemplates");

const STARTUP_OFFICE_PROMPT_VERSION_MANIFEST_VERSION = "startup-office-prompt-manifest.v1";

const LOOP_PROMPT_VERSION_MANIFEST = deepFreeze({
  "customer-discovery": {
    reviewed_for: [
      "founder_control",
      "external_send_gates",
      "source_citations",
      "structured_json",
    ],
    version: "customer-discovery.prompt.v1",
  },
  "idea-validation": {
    reviewed_for: [
      "assumption_discipline",
      "customer_promise_gates",
      "source_citations",
      "structured_json",
    ],
    version: "idea-validation.prompt.v1",
  },
  "launch-campaign": {
    reviewed_for: [
      "external_send_gates",
      "paid_spend_gates",
      "publish_gates",
      "source_citations",
      "structured_json",
    ],
    version: "launch-campaign.prompt.v1",
  },
  "offer-package": {
    reviewed_for: [
      "customer_promise_gates",
      "pricing_change_gates",
      "source_citations",
      "structured_json",
    ],
    version: "offer-package.prompt.v1",
  },
  "weekly-operator-review": {
    reviewed_for: [
      "founder_control",
      "legal_sensitive_gates",
      "operating_cadence_gates",
      "structured_json",
    ],
    version: "weekly-operator-review.prompt.v1",
  },
});

function startupOfficePromptVersion({ loop = {}, template = null } = {}) {
  const loopSlug = String(template?.slug || loop?.slug || "").trim();
  const selectedTemplate =
    template ||
    STARTUP_OFFICE_LOOP_TEMPLATES[loopSlug] ||
    STARTUP_OFFICE_LOOP_TEMPLATES["idea-validation"];
  const manifest =
    LOOP_PROMPT_VERSION_MANIFEST[selectedTemplate.slug] ||
    LOOP_PROMPT_VERSION_MANIFEST["idea-validation"];

  return deepFreeze({
    artifact_kind: selectedTemplate.artifactKind || "",
    instructions_hash: sha256(selectedTemplate.instructions || ""),
    loop_slug: selectedTemplate.slug || loopSlug,
    manifest_version: STARTUP_OFFICE_PROMPT_VERSION_MANIFEST_VERSION,
    reviewed_for: [...manifest.reviewed_for],
    schema_hash: sha256(stableStringify(selectedTemplate.schema || {})),
    schema_name: selectedTemplate.schemaName || "",
    version: manifest.version,
  });
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function stableStringify(value) {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const item of Object.values(value)) deepFreeze(item);
  return value;
}

module.exports = {
  LOOP_PROMPT_VERSION_MANIFEST,
  STARTUP_OFFICE_PROMPT_VERSION_MANIFEST_VERSION,
  startupOfficePromptVersion,
  stableStringify,
};
