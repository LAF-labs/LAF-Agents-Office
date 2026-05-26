const {
  createHostedAuthHandlers,
} = require("./authHandlers");
const {
  createHostedInviteHandlers,
} = require("./inviteHandlers");
const {
  createHostedMemberHandlers,
} = require("./memberHandlers");
const {
  createHostedSignupHandlers,
} = require("./signupHandlers");
const {
  DEFAULT_PROFILE_AVATAR_ID,
  normalizeProfileAvatarID,
  publicUser,
} = require("./userPresentation");
const {
  publicTeam,
} = require("./teamPresentation");

function createHostedIdentityHandlerBundle(deps) {
  const {
    WORKSPACE_PERMISSIONS,
    WORKSPACE_ROLES,
    activeMembership,
    authAdminFetch,
    authFetch,
    clientRateLimitKey,
    createAuthHandlers = createHostedAuthHandlers,
    createHTTPError,
    createInviteHandlers = createHostedInviteHandlers,
    createMemberHandlers = createHostedMemberHandlers,
    createSignupHandlers = createHostedSignupHandlers,
    effectivePermissions,
    enforceRateLimit,
    getTeam,
    nowISO,
    originFor,
    RATE_LIMITS,
    readBody,
    requirePermission,
    requireUser,
    rest,
    sendInviteEmail,
    setAuthCookies,
    shortID,
    slugify,
    startupOfficeBetaOpsSnapshot,
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
  });
}

module.exports = {
  createHostedIdentityHandlerBundle,
};
