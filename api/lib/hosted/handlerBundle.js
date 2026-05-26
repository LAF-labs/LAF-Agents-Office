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
  createHostedAuthHandlers,
} = require("./authHandlers");
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
  createHostedInviteHandlers,
} = require("./inviteHandlers");
const {
  createHostedMemberHandlers,
} = require("./memberHandlers");
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
  createHostedSignupHandlers,
} = require("./signupHandlers");
const {
  createHostedSkillHandlers,
} = require("./skillHandlers");
const {
  createHostedUsageHandlers,
} = require("./usageHandlers");
const {
  DEFAULT_PROFILE_AVATAR_ID,
  normalizeProfileAvatarID,
  publicUser,
} = require("./userPresentation");
const {
  publicTeam,
} = require("./teamPresentation");

function createHostedHandlerBundle(deps) {
  const {
    WORKSPACE_PERMISSIONS,
    WORKSPACE_ROLES,
    activeMembership,
    authAdminFetch,
    authFetch,
    clamp,
    clientRateLimitKey,
    createActivityHandlers = createHostedActivityHandlers,
    createAgentLogHandlers = createHostedAgentLogHandlers,
    createAuditHandlers = createHostedAuditHandlers,
    createAuthHandlers = createHostedAuthHandlers,
    createClientTelemetryHandlers = createHostedClientTelemetryHandlers,
    createCommandHandlers = createHostedCommandHandlers,
    createConversationHandlers = createHostedConversationHandlers,
    createHTTPError,
    createHealthHandlers = createHostedHealthHandlers,
    createInviteHandlers = createHostedInviteHandlers,
    createMemberHandlers = createHostedMemberHandlers,
    createMemoryHandlers = createHostedMemoryHandlers,
    createModelAccess = createHostedModelAccess,
    createOrchestrationHandlers = createHostedOrchestrationHandlers,
    createRequestHandlers = createHostedRequestHandlers,
    createRosterHandlers = createHostedRosterHandlers,
    createSchedulerHandlers = createHostedSchedulerHandlers,
    createSignupHandlers = createHostedSignupHandlers,
    createSkillHandlers = createHostedSkillHandlers,
    createUsageHandlers = createHostedUsageHandlers,
    effectivePermissions,
    enforceRateLimit,
    env = process.env,
    getTeam,
    hasPermission,
    isHuman,
    nowISO,
    objectValue,
    originFor,
    RATE_LIMITS,
    randomID,
    readBody,
    requirePermission,
    requireUser,
    rest,
    rpc,
    safeStartupOfficeRest,
    sendInviteEmail,
    setAuthCookies,
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

  const inviteHandlers = createInviteHandlers({
    createHTTPError,
    normalizeRole: deps.normalizeRole,
    nowISO,
    originFor,
    readBody,
    requirePermission,
    requireUser,
    rest,
    sendInviteEmail,
    writeAuditEvent,
    writeJSON,
  });

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
    authHandlers: createAuthHandlers({
      activeMembership,
      authFetch,
      createHTTPError,
      getTeam,
      normalizeProfileAvatarID,
      publicTeam,
      publicUser,
      readBody,
      requireUser,
      setAuthCookies,
      writeAuditEvent,
      writeJSON,
    }),
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
    inviteHandlers,
    memberHandlers: createMemberHandlers({
      WORKSPACE_PERMISSIONS,
      WORKSPACE_ROLES,
      authAdminFetch,
      createHTTPError,
      effectivePermissions,
      normalizePermissionOverride: deps.normalizePermissionOverride,
      normalizeRole: deps.normalizeRole,
      nowISO,
      publicUser,
      readBody,
      requirePermission,
      requireUser,
      rest,
      startupOfficeBetaOpsSnapshot,
      writeAuditEvent,
      writeJSON,
    }),
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
    signupHandlers: createSignupHandlers({
      authAdminFetch,
      authFetch,
      createHTTPError,
      defaultProfileAvatarID: DEFAULT_PROFILE_AVATAR_ID,
      enforceSignupRateLimit: (req) =>
        enforceRateLimit("auth_signup", clientRateLimitKey(req), RATE_LIMITS.authSignup),
      getTeam,
      inviteByToken: inviteHandlers.inviteByToken,
      nowISO,
      publicTeam,
      publicUser,
      readBody,
      rest,
      setAuthCookies,
      shortID,
      slugify,
      writeJSON,
    }),
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
