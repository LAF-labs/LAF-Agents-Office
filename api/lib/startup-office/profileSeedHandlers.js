const {
  createStartupOfficeDemoSeedHandlers,
} = require("./demoSeedHandlers");
const {
  createStartupOfficeProfileHandlers,
} = require("./profileHandlers");

function createStartupOfficeProfileSeedHandlers(deps) {
  const {
    createDemoSeedHandlers = createStartupOfficeDemoSeedHandlers,
    createHTTPError,
    createProfileHandlers = createStartupOfficeProfileHandlers,
    createStartupOfficeReceipt,
    nowISO,
    objectValue,
    publicCompanyProfile,
    publicStartupOfficeApproval,
    publicStartupOfficeArtifact,
    publicStartupOfficeLoop,
    publicStartupOfficeReceipt,
    publicStartupOfficeRun,
    readBody,
    requireAdminRole,
    requirePermission,
    requireUser,
    safeStartupOfficeRest,
    startupOfficeRepository,
    startupOfficeServices,
    truncateText,
    truthy,
    upsertWorkspaceSettings,
    workspaceSettings,
    workspaceSettingsPatch,
    writeAuditEvent,
    writeJSON,
  } = deps;

  const profileHandlers = createProfileHandlers({
    companyProfileRowPayload: (profile) => startupOfficeServices().companyProfileRowPayload(profile),
    createHTTPError,
    nowISO,
    objectValue,
    publicCompanyProfile,
    readBody,
    requirePermission,
    requireUser,
    safeStartupOfficeRest,
    startupOfficeCompanyProfilePatch: (body) =>
      startupOfficeServices().startupOfficeCompanyProfilePatch(body),
    startupOfficeRepository,
    upsertWorkspaceSettings,
    workspaceSettings,
    workspaceSettingsPatch,
    writeAuditEvent,
    writeJSON,
  });

  const demoSeedHandlers = createDemoSeedHandlers({
    createHTTPError,
    createStartupOfficeReceipt,
    nowISO,
    publicCompanyProfile,
    publicStartupOfficeApproval,
    publicStartupOfficeArtifact,
    publicStartupOfficeLoop,
    publicStartupOfficeReceipt,
    publicStartupOfficeRun,
    readBody,
    requireAdminRole,
    requireUser,
    safeStartupOfficeRest,
    truncateText,
    truthy,
    workspaceSettings,
    writeAuditEvent,
    writeJSON,
  });

  return Object.freeze({
    demoSeedHandlers,
    profileHandlers,
  });
}

module.exports = {
  createStartupOfficeProfileSeedHandlers,
};
