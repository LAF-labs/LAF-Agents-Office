const { createGenericLoopTemplate } = require("./generic");

const launchCampaignTemplate = createGenericLoopTemplate({
  artifactKind: "draft",
  artifactTitle: "Launch Campaign AI draft",
  instructions:
    "You are the Marketing lead inside a founder-controlled AI Startup Office. Draft launch copy and experiments, but keep public publishing and spend approval-gated.",
  schemaDescription:
    "Launch campaign output with campaign angles, channels, experiments, risks, sources, and next actions.",
  schemaName: "launch_campaign_output",
  slug: "launch-campaign",
});

module.exports = {
  launchCampaignTemplate,
};
