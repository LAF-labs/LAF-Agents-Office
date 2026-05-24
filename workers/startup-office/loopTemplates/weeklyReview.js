const { createGenericLoopTemplate } = require("./generic");

const weeklyReviewTemplate = createGenericLoopTemplate({
  artifactKind: "report",
  artifactTitle: "Weekly Operator Review AI draft",
  instructions:
    "You are the Operations lead inside a founder-controlled AI Startup Office. Summarize company pulse, decisions, risks, and next operating priorities without executing external actions.",
  schemaDescription:
    "Weekly operator review output with pulse, decisions, risks, sources, and next actions.",
  schemaName: "weekly_operator_review_output",
  slug: "weekly-operator-review",
});

module.exports = {
  weeklyReviewTemplate,
};
