const LOOP_SKILL_MANIFEST = Object.freeze({
  "customer-discovery": [
    ["customer-discovery", "Define who to interview and what evidence to collect."],
    ["interview-guide", "Turn the loop objective into concrete discovery questions."],
    ["follow-up-drafts", "Prepare reusable follow-up assets from the same inputs."],
  ],
  "idea-validation": [
    ["market-research", "Ground the startup idea in falsifiable market evidence."],
    ["icp-definition", "Translate the company profile into a narrow buyer hypothesis."],
    ["assumption-mapping", "Expose assumptions, risks, and next evidence needed."],
  ],
  "launch-campaign": [
    ["channel-plan", "Select launch channels and experiments from the campaign inputs."],
    ["launch-copy", "Draft public-facing copy variants for founder review."],
    ["experiment-design", "Convert launch work into measurable growth tests."],
  ],
  "offer-package": [
    ["offer-design", "Shape the promise, package, and customer-facing value."],
    ["pricing-hypothesis", "Record the pricing assumption behind the offer."],
    ["objection-handling", "Prepare objections and sales responses for approval."],
  ],
  "weekly-operator-review": [
    ["operator-review", "Summarize the company pulse and current operating state."],
    ["risk-review", "Surface unresolved risks, blockers, and decisions."],
    ["next-priorities", "Translate the review into the next loop priorities."],
  ],
});

function startupOfficeLoopSkillInvocations({
  inputs = {},
  loop = {},
  objective = "",
  profile = {},
  truncateText = defaultTruncate,
} = {}) {
  const manifest = LOOP_SKILL_MANIFEST[loop.slug] || [
    ["startup-office-operator", "Run the requested operating loop with the available company context."],
  ];
  const inputSnapshot = {
    company_name: truncateText(profile?.name || "", 160),
    input_values: normalizeInputValue(inputs, truncateText, 0),
    objective: truncateText(objective || loop.objective || "", 1000),
    profile_priority: truncateText(profile?.priority || profile?.goals || "", 1000),
  };
  return manifest.map(([skillName, reason], index) => ({
    input_keys: Object.keys(objectValue(inputs)).sort(),
    input_snapshot: inputSnapshot,
    loop_slug: loop.slug || "",
    reason,
    selected_by: "startup_office_loop_manifest",
    sequence: index + 1,
    skill_name: skillName,
  }));
}

function normalizeInputValue(value, truncateText, depth) {
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === "string") return truncateText(value, 1000);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => normalizeInputValue(item, truncateText, depth + 1));
  }
  if (typeof value === "object") {
    if (depth >= 2) return truncateText(JSON.stringify(value), 1000);
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 20)
        .map(([key, item]) => [
          truncateText(key, 80),
          normalizeInputValue(item, truncateText, depth + 1),
        ]),
    );
  }
  return truncateText(String(value), 1000);
}

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function defaultTruncate(value, max) {
  return String(value || "").slice(0, max);
}

module.exports = {
  LOOP_SKILL_MANIFEST,
  startupOfficeLoopSkillInvocations,
};
