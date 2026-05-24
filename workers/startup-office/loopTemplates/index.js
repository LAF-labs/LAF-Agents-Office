const { customerDiscoveryTemplate } = require("./customerDiscovery");
const { ideaValidationTemplate } = require("./ideaValidation");
const { launchCampaignTemplate } = require("./launchCampaign");
const { offerPackageTemplate } = require("./offerPackage");
const { weeklyReviewTemplate } = require("./weeklyReview");

const STARTUP_OFFICE_LOOP_TEMPLATES = Object.freeze({
  "customer-discovery": customerDiscoveryTemplate,
  "idea-validation": ideaValidationTemplate,
  "launch-campaign": launchCampaignTemplate,
  "offer-package": offerPackageTemplate,
  "weekly-operator-review": weeklyReviewTemplate,
});

function startupOfficeLoopTemplate(slug) {
  return (
    STARTUP_OFFICE_LOOP_TEMPLATES[String(slug || "").trim()] ||
    STARTUP_OFFICE_LOOP_TEMPLATES["idea-validation"]
  );
}

module.exports = {
  STARTUP_OFFICE_LOOP_TEMPLATES,
  startupOfficeLoopTemplate,
};
