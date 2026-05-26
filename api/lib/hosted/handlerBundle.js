const {
  createHostedActivityHandlers,
} = require("./activityHandlers");
const {
  createHostedAgentLogHandlers,
} = require("./agentLogHandlers");
const {
  createHostedAuditHandlers,
} = require("./auditHandlers");
const {
  createHostedClientTelemetryHandlers,
} = require("./clientTelemetryHandlers");
const {
  createHostedCommandHandlers,
} = require("./commandHandlers");
const {
  createHostedConversationHandlers,
} = require("./conversationHandlers");
const {
  createHostedHealthHandlers,
} = require("./healthHandlers");
const {
  createHostedIdentityHandlerBundle,
} = require("./identityHandlerBundle");
const {
  createHostedMemoryHandlers,
} = require("./memoryHandlers");
const {
  createHostedModelAccess,
  normalizeModelMode,
} = require("./modelAccess");
const {
  createHostedOrchestrationHandlers,
} = require("./orchestrationHandlers");
const {
  createHostedRequestHandlers,
} = require("./requestHandlers");
const {
  createHostedRosterHandlers,
} = require("./rosterHandlers");
const {
  createHostedSchedulerHandlers,
} = require("./schedulerHandlers");
const {
  createHostedSkillHandlers,
} = require("./skillHandlers");
const {
  createHostedUsageHandlers,
} = require("./usageHandlers");
const {
  publicTeam,
} = require("./teamPresentation");

function createHostedHandlerBundle(deps) {
  const {
    authFetch,
    clamp,
    createActivityHandlers = createHostedActivityHandlers,
    createAgentLogHandlers = createHostedAgentLogHandlers,
    createAuditHandlers = createHostedAuditHandlers,
    createClientTelemetryHandlers = createHostedClientTelemetryHandlers,
    createCommandHandlers = createHostedCommandHandlers,
    createConversationHandlers = createHostedConversationHandlers,
    createHTTPError,
    createHealthHandlers = createHostedHealthHandlers,
    createIdentityHandlerBundle = createHostedIdentityHandlerBundle,
    createMemoryHandlers = createHostedMemoryHandlers,
    createModelAccess = createHostedModelAccess,
    createOrchestrationHandlers = createHostedOrchestrationHandlers,
    createRequestHandlers = createHostedRequestHandlers,
    createRosterHandlers = createHostedRosterHandlers,
    createSchedulerHandlers = createHostedSchedulerHandlers,
    createSkillHandlers = createHostedSkillHandlers,
    createUsageHandlers = createHostedUsageHandlers,
    env = process.env,
    hasPermission,
    isHuman,
    nowISO,
    objectValue,
    randomID,
    readBody,
    requirePermission,
    requireUser,
    rest,
    rpc,
    safeStartupOfficeRest,
    shortID,
    slugify,
    startupOfficeApprovals,
    startupOfficeBetaOpsSnapshot,
    startupOfficeReceipts,
    startupOfficeRepository,
    truthy,
    truncateText,
    writeAuditEvent,
    writeJSON,
  } = deps;

  const identityHandlers = createIdentityHandlerBundle(deps);

  return Object.freeze({
    activityHandlers: createActivityHandlers({
      createHTTPError,
      nowISO,
      readBody,
      requirePermission,
      requireUser,
      safeStartupOfficeRest,
      truncateText,
      writeAuditEvent,
      writeJSON,
    }),
    agentLogHandlers: createAgentLogHandlers({
      requirePermission,
      requireUser,
      startupOfficeReceipts,
      writeJSON,
    }),
    auditHandlers: createAuditHandlers({
      clamp,
      createHTTPError,
      requirePermission,
      requireUser,
      rest,
      writeJSON,
    }),
    authHandlers: identityHandlers.authHandlers,
    clientTelemetryHandlers: createClientTelemetryHandlers({
      createHTTPError,
      readBody,
      requireUser,
      writeAuditEvent,
      writeJSON,
    }),
    commandHandlers: createCommandHandlers({
      createHTTPError,
      readBody,
      requireUser,
      writeJSON,
    }),
    conversationHandlers: createConversationHandlers({
      clamp,
      createHTTPError,
      isHuman,
      normalizeModelMode,
      nowISO,
      objectValue,
      readBody,
      requireUser,
      rest,
      rpc,
      shortID,
      slugify,
      truncateText,
      writeJSON,
    }),
    healthHandlers: createHealthHandlers({
      authFetch,
      env,
      nowISO,
      rest,
      writeJSON,
    }),
    inviteHandlers: identityHandlers.inviteHandlers,
    memberHandlers: identityHandlers.memberHandlers,
    memoryHandlers: createMemoryHandlers({
      createHTTPError,
      objectValue,
      readBody,
      requirePermission,
      requireUser,
      shortID,
      slugify,
      startupOfficeRepository,
      truncateText,
      writeAuditEvent,
      writeJSON,
    }),
    modelAccess: createModelAccess({
      createHTTPError,
      hasPermission,
      managedModelEnabled: () =>
        truthy(env.LAF_OFFICE_WORKSPACE_PAID) ||
        truthy(env.LAF_OFFICE_MANAGED_MODEL_ENABLED),
      requireUser,
      rest,
      writeJSON,
    }),
    orchestrationHandlers: createOrchestrationHandlers({
      createHTTPError,
      nowISO,
      randomID,
      readBody,
      requirePermission,
      requireUser,
      rest,
      writeAuditEvent,
      writeJSON,
    }),
    requestHandlers: createRequestHandlers({
      approvalAction: deps.approvalAction,
      createHTTPError,
      readBody,
      requirePermission,
      requireUser,
      startupOfficeApprovals,
      writeJSON,
    }),
    rosterHandlers: createRosterHandlers({
      createHTTPError,
      publicTeam,
      readBody,
      requireUser,
      shortID,
      slugify,
      truncateText,
      writeJSON,
    }),
    schedulerHandlers: createSchedulerHandlers({
      nowISO,
      requirePermission,
      requireUser,
      safeStartupOfficeRest,
      writeJSON,
    }),
    signupHandlers: identityHandlers.signupHandlers,
    skillHandlers: createSkillHandlers({
      createHTTPError,
      nowISO,
      readBody,
      requirePermission,
      requireUser,
      rest,
      writeAuditEvent,
      writeJSON,
    }),
    usageHandlers: createUsageHandlers({
      requirePermission,
      requireUser,
      startupOfficeBetaOpsSnapshot,
      writeJSON,
    }),
  });
}

module.exports = {
  createHostedHandlerBundle,
};
