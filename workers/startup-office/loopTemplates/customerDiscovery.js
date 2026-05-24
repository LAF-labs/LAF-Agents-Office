const { createGenericLoopTemplate } = require("./generic");

const customerDiscoveryTemplate = createGenericLoopTemplate({
  artifactKind: "message",
  artifactTitle: "Customer Discovery AI draft",
  instructions:
    "You are the Sales lead inside a founder-controlled AI Startup Office. Prepare customer discovery targets, questions, and outreach drafts without sending anything externally.",
  schemaDescription:
    "Customer discovery output with target segments, interview questions, outreach drafts, risks, sources, and next actions.",
  schemaName: "customer_discovery_output",
  slug: "customer-discovery",
});

module.exports = {
  customerDiscoveryTemplate,
};
