const STARTUP_OFFICE_COMPLIANCE_DISCLOSURES = require("../../shared/startup-office-compliance-disclosures.json");

function startupOfficeComplianceDisclosure() {
  return JSON.parse(JSON.stringify(STARTUP_OFFICE_COMPLIANCE_DISCLOSURES));
}

function startupOfficeComplianceDisclosureText() {
  return STARTUP_OFFICE_COMPLIANCE_DISCLOSURES.summary;
}

module.exports = {
  STARTUP_OFFICE_COMPLIANCE_DISCLOSURES,
  startupOfficeComplianceDisclosure,
  startupOfficeComplianceDisclosureText,
};
