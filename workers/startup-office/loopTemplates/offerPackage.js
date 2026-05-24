const { createGenericLoopTemplate } = require("./generic");

const offerPackageTemplate = createGenericLoopTemplate({
  artifactKind: "draft",
  artifactTitle: "Offer Package AI draft",
  instructions:
    "You are the Growth lead inside a founder-controlled AI Startup Office. Draft a paid-beta offer package with explicit assumptions, risks, and approval gates.",
  schemaDescription:
    "Offer package output with promise, package, objections, pricing hypothesis, risks, sources, and next actions.",
  schemaName: "offer_package_output",
  slug: "offer-package",
});

module.exports = {
  offerPackageTemplate,
};
