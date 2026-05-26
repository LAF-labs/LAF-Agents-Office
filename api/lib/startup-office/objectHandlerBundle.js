const {
  createStartupOfficeAssetUploadHandlers,
} = require("./assetUploadHandlers");
const {
  createStartupOfficeCustomerCsvHandlers,
} = require("./customerCsvHandlers");
const {
  createStartupOfficeImportHandlers,
} = require("./importHandlers");
const {
  createStartupOfficeObjectHandlers,
} = require("./objectHandlers");

function createStartupOfficeObjectHandlerBundle(deps) {
  const {
    createAssetUploadHandlers = createStartupOfficeAssetUploadHandlers,
    createCustomerCsvHandlers = createStartupOfficeCustomerCsvHandlers,
    createHTTPError,
    createImportHandlers = createStartupOfficeImportHandlers,
    createObjectHandlers = createStartupOfficeObjectHandlers,
    nowISO,
    objectValue,
    publicStartupOfficeAsset,
    publicStartupOfficeCustomer,
    publicStartupOfficeSignal,
    readBody,
    requirePermission,
    requireUser,
    safeStartupOfficeRest,
    startupOfficeBetaOpsSnapshot,
    startupOfficeObjectDefinition,
    startupOfficeObjectPatch,
    startupOfficeObjectPayload,
    startupOfficeObjectRows,
    startupOfficeRepository,
    truncateText,
    writeAuditEvent,
    writeJSON,
  } = deps;

  return Object.freeze({
    assetUploadHandlers: createAssetUploadHandlers({
      createHTTPError,
      nowISO,
      publicStartupOfficeAsset,
      readBody,
      requirePermission,
      requireUser,
      safeStartupOfficeRest,
      startupOfficeBetaOpsSnapshot,
      truncateText,
      writeAuditEvent,
      writeJSON,
    }),
    customerCsvHandlers: createCustomerCsvHandlers({
      createHTTPError,
      nowISO,
      publicStartupOfficeCustomer,
      readBody,
      requirePermission,
      requireUser,
      safeStartupOfficeRest,
      startupOfficeBetaOpsSnapshot,
      startupOfficeObjectPayload,
      startupOfficeObjectRows,
      truncateText,
      writeAuditEvent,
      writeJSON,
    }),
    importHandlers: createImportHandlers({
      createHTTPError,
      nowISO,
      objectValue,
      readBody,
      requirePermission,
      requireUser,
      startupOfficeRepository,
      truncateText,
      writeAuditEvent,
      writeJSON,
    }),
    objectHandlers: createObjectHandlers({
      createHTTPError,
      nowISO,
      publicStartupOfficeAsset,
      publicStartupOfficeSignal,
      readBody,
      requirePermission,
      requireUser,
      safeStartupOfficeRest,
      startupOfficeObjectDefinition,
      startupOfficeObjectPatch,
      startupOfficeObjectPayload,
      startupOfficeObjectRows,
      startupOfficeRepository,
      startupOfficeBetaOpsSnapshot,
      truncateText,
      writeAuditEvent,
      writeJSON,
    }),
  });
}

module.exports = {
  createStartupOfficeObjectHandlerBundle,
};
