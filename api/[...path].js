const {
  createHostedAuditHandlers,
} = require("./lib/hosted/auditHandlers");
const {
  createHostedAuditWriter,
} = require("./lib/hosted/auditWriter");
const {
  createHostedAgentLogHandlers,
} = require("./lib/hosted/agentLogHandlers");
const {
  createHostedActivityHandlers,
} = require("./lib/hosted/activityHandlers");
const {
  HTTPError,
  objectValue,
  requestIDFor,
  startupOfficeHTTPError,
} = require("./lib/hosted/apiPrimitives");
const {
  createHostedAPIRouteDispatcher,
} = require("./lib/hosted/apiRouteDispatcher");
const {
  createHostedAPIEntrypoint,
} = require("./lib/hosted/apiEntrypoint");
const {
  createHostedAuthHandlers,
} = require("./lib/hosted/authHandlers");
const {
  createHostedClientTelemetryHandlers,
} = require("./lib/hosted/clientTelemetryHandlers");
const {
  createHostedCommandHandlers,
} = require("./lib/hosted/commandHandlers");
const {
  createHostedConversationHandlers,
} = require("./lib/hosted/conversationHandlers");
const {
  defaultHostedAPIErrorMessage,
  hostedAPIErrorPayload,
} = require("./lib/hosted/errorEnvelope");
const {
  createHostedHealthHandlers,
} = require("./lib/hosted/healthHandlers");
const {
  createHostedInviteHandlers,
} = require("./lib/hosted/inviteHandlers");
const {
  createHostedInviteEmailDelivery,
} = require("./lib/hosted/inviteEmailDelivery");
const {
  createHostedIngressRateLimits,
} = require("./lib/hosted/ingressRateLimits");
const {
  createHostedMemberHandlers,
} = require("./lib/hosted/memberHandlers");
const {
  createHostedMemoryHandlers,
} = require("./lib/hosted/memoryHandlers");
const {
  createHostedOrchestrationHandlers,
} = require("./lib/hosted/orchestrationHandlers");
const {
  createHostedModelAccess,
  normalizeModelMode,
} = require("./lib/hosted/modelAccess");
const {
  createHostedUsageHandlers,
} = require("./lib/hosted/usageHandlers");
const {
  DEFAULT_PROFILE_AVATAR_ID,
  normalizeProfileAvatarID,
  publicUser,
} = require("./lib/hosted/userPresentation");
const {
  createHostedURLTrust,
} = require("./lib/hosted/urlTrust");
const {
  arrayOrEmpty,
  clamp,
  compactObject,
  isHuman,
  isUUID,
  nowISO,
  randomID,
  shortID,
  slugify,
  truncateText,
  truthy,
} = require("./lib/hosted/valueUtils");
const {
  createHostedSignupHandlers,
} = require("./lib/hosted/signupHandlers");
const { createServiceRoleAccessGuards } = require("./lib/hosted/serviceRoleAccess");
const {
  createHostedActionRateLimiter,
} = require("./lib/hosted/rateLimits");
const {
  createStartupOfficeRateLimiter,
} = require("./lib/startup-office/rateLimits");
const {
  createHostedRosterHandlers,
} = require("./lib/hosted/rosterHandlers");
const {
  createHostedRequestHandlers,
} = require("./lib/hosted/requestHandlers");
const {
  createHostedRequestIO,
} = require("./lib/hosted/requestIO");
const {
  redactSensitiveValue,
} = require("./lib/hosted/redaction");
const {
  createHostedSchedulerHandlers,
} = require("./lib/hosted/schedulerHandlers");
const {
  createHostedSecurityHeaders,
} = require("./lib/hosted/securityHeaders");
const {
  createHostedSessionCookies,
} = require("./lib/hosted/sessionCookies");
const {
  createHostedSkillHandlers,
} = require("./lib/hosted/skillHandlers");
const {
  createHostedSupabaseAccess,
} = require("./lib/hosted/supabaseAccess");
const {
  publicTeam,
} = require("./lib/hosted/teamPresentation");
const {
  createHostedUserContext,
} = require("./lib/hosted/userContext");
const {
  WORKSPACE_PERMISSIONS,
  WORKSPACE_ROLES,
  createHostedPermissionGuards,
  effectivePermissions,
  hasPermission,
  normalizePermissionOverride,
  normalizeRole,
} = require("./lib/hosted/permissions");
const {
  createStartupOfficeDemoSeedHandlers,
} = require("./lib/startup-office/demoSeedHandlers");
const {
  startupOfficeBillingBlockReason,
} = require("./lib/startup-office/billingState");
const {
  startupOfficeEntitlementBlock,
} = require("./lib/startup-office/commercialBilling");
const {
  recordStartupOfficeApprovalActivation,
  recordStartupOfficeExportActivation,
  recordStartupOfficeRunActivation,
} = require("./lib/startup-office/activationAnalytics");
const {
  createStartupOfficeProfileHandlers,
} = require("./lib/startup-office/profileHandlers");
const {
  createStartupOfficeRepository,
} = require("./lib/startup-office/repositories");
const {
  createStartupOfficeRepositoryDelegates,
} = require("./lib/startup-office/repositoryDelegates");
const {
  createStartupOfficeRuntimeFactories,
} = require("./lib/startup-office/runtimeFactories");
const {
  applyStartupOfficeCursor,
} = require("./lib/startup-office/pagination");
const {
  applyStartupOfficeObjectListQuery,
} = require("./lib/startup-office/objectQueries");
const {
  createStartupOfficeObjectStore,
} = require("./lib/startup-office/objectStore");
const {
  startupOfficeAssetStatus,
  startupOfficeCustomerStatus,
  startupOfficeSignalStatus,
  startupOfficeSignalType,
} = require("./lib/startup-office/objectInvariants");
const { authorizeStartupOfficeAccess } = require("./lib/startup-office/authorization");
const {
  dispatchStartupOfficeRoute,
} = require("./lib/startup-office/dispatcher");
const {
  createStartupOfficeRouteHandlerMap,
} = require("./lib/startup-office/routeHandlerMap");
const {
  createStartupOfficeOperationsHandlers,
} = require("./lib/startup-office/operationsHandlers");
const {
  createStartupOfficeOperationsStore,
} = require("./lib/startup-office/operationsStore");
const {
  createStartupOfficeTermsHandlers,
} = require("./lib/startup-office/termsHandlers");
const {
  createStartupOfficeObjectHandlers,
} = require("./lib/startup-office/objectHandlers");
const {
  createStartupOfficeAssetUploadHandlers,
} = require("./lib/startup-office/assetUploadHandlers");
const {
  createStartupOfficeCustomerCsvHandlers,
} = require("./lib/startup-office/customerCsvHandlers");
const {
  createStartupOfficeImportHandlers,
} = require("./lib/startup-office/importHandlers");
const {
  createStartupOfficeQueryHandlers,
} = require("./lib/startup-office/queryHandlers");
const {
  createStartupOfficeLifecycleHandlers,
} = require("./lib/startup-office/lifecycleHandlers");
const {
  createStartupOfficeWorkflowHandlers,
} = require("./lib/startup-office/workflowHandlers");
const {
  createStartupOfficeWorkspaceConfigHandlers,
} = require("./lib/startup-office/workspaceConfigHandlers");
const {
  normalizeStartupOfficeCadence,
  normalizeStartupOfficeLoopStatus,
  publicCompanyProfile,
  publicStartupOfficeApproval,
  publicStartupOfficeArtifact,
  publicStartupOfficeAsset,
  publicStartupOfficeCustomer,
  publicStartupOfficeLoop,
  publicStartupOfficeMetric,
  publicStartupOfficeReceipt,
  publicStartupOfficeRun,
  publicStartupOfficeSignal,
} = require("./lib/startup-office/serializers");
const {
  createStartupOfficeServices,
} = require("./lib/startup-office/services");
const {
  startupOfficeLoopSkillInvocations,
} = require("./lib/startup-office/skillInvocations");
const {
  createStartupOfficeModelClient,
} = require("../workers/startup-office/modelClient");
const {
  runStartupOfficeLoop,
} = require("../workers/startup-office/loopEngine");
const {
  applyStartupOfficeMemoryPromotion,
} = require("../workers/startup-office/wikiWriter");
const {
  STARTUP_OFFICE_RECEIPT_MEMORY_PAGE_SLUGS,
  materializeStartupOfficeReceiptMemory,
} = require("./lib/startup-office/receiptMemory");

const MAX_REQUEST_BODY_BYTES = 512 * 1024;
const RATE_LIMITS = {
  authSignup: 12,
};
const HOSTED_PERMISSION_GUARDS = createHostedPermissionGuards({
  createHTTPError: startupOfficeHTTPError,
});
const requireAdminRole = HOSTED_PERMISSION_GUARDS.requireAdminRole;
const requirePermission = HOSTED_PERMISSION_GUARDS.requirePermission;
const SERVICE_ROLE_ACCESS_GUARDS = createServiceRoleAccessGuards({ createHTTPError: startupOfficeHTTPError });
const HOSTED_SUPABASE_ACCESS = createHostedSupabaseAccess({
  createHTTPError: startupOfficeHTTPError,
  env: process.env,
  serviceRoleAccessGuards: SERVICE_ROLE_ACCESS_GUARDS,
});
const {
  assertSupabaseEnv,
  authAdminFetch,
  authFetch,
  rest,
  rpc,
} = HOSTED_SUPABASE_ACCESS;
const HOSTED_URL_TRUST = createHostedURLTrust({
  createHTTPError: startupOfficeHTTPError,
  env: process.env,
});
const HOSTED_SECURITY_HEADERS = createHostedSecurityHeaders({
  allowedOrigins: HOSTED_URL_TRUST.normalizeAllowedOrigins(
    process.env.LAF_OFFICE_ALLOWED_ORIGINS || "",
  ),
});
const HOSTED_SESSION_COOKIES = createHostedSessionCookies({
  env: process.env,
  trustedBrowserOrigin: HOSTED_SECURITY_HEADERS.trustedBrowserOrigin,
});
const {
  authToken,
  clearAuthCookies,
  setAuthCookies,
} = HOSTED_SESSION_COOKIES;
const HOSTED_USER_CONTEXT = createHostedUserContext({
  authFetch,
  authToken,
  createHTTPError: startupOfficeHTTPError,
  rest,
});
const {
  activeMembership,
  getTeam,
  requireUser,
} = HOSTED_USER_CONTEXT;
const HOSTED_AUDIT_WRITER = createHostedAuditWriter({
  createHTTPError: startupOfficeHTTPError,
  redactSensitiveValue,
  rest,
});
const {
  writeAuditEvent,
  writeTeamAuditEvent,
} = HOSTED_AUDIT_WRITER;
const HOSTED_INVITE_EMAIL_DELIVERY = createHostedInviteEmailDelivery({
  createHTTPError: startupOfficeHTTPError,
  env: process.env,
});
const {
  sendInviteEmail,
} = HOSTED_INVITE_EMAIL_DELIVERY;
const HOSTED_REQUEST_IO = createHostedRequestIO({
  createHTTPError: startupOfficeHTTPError,
  maxRequestBodyBytes: MAX_REQUEST_BODY_BYTES,
});
const {
  assertJSONByteSize,
  jsonByteSize,
  readBody,
  requestPath,
  writeJSON,
} = HOSTED_REQUEST_IO;
const HOSTED_INGRESS_RATE_LIMITS = createHostedIngressRateLimits({
  createHTTPError: startupOfficeHTTPError,
  env: process.env,
  rpc,
});
const {
  claimHostedRateLimit,
  clientRateLimitKey,
  enforceRateLimit,
  persistentRateLimitsEnabled,
  resetRateLimits,
} = HOSTED_INGRESS_RATE_LIMITS;
const enforceHostedActionRateLimit = createHostedActionRateLimiter({
  claimPersistentRateLimit: persistentRateLimitsEnabled() ? claimHostedRateLimit : null,
  createRateLimitError: () => startupOfficeHTTPError(429, "rate limit exceeded"),
  enforceRateLimit,
  keyForRequest: clientRateLimitKey,
});
const enforceStartupOfficeRateLimit = createStartupOfficeRateLimiter({
  claimPersistentRateLimit: persistentRateLimitsEnabled() ? claimHostedRateLimit : null,
  createRateLimitError: () => startupOfficeHTTPError(429, "rate limit exceeded"),
  enforceRateLimit,
});
const STARTUP_OFFICE_RUNTIME = createStartupOfficeRuntimeFactories({
  createModelClient: createStartupOfficeModelClient,
  createRepository: createStartupOfficeRepository,
  createServices: createStartupOfficeServices,
  modelClientDeps: () => ({
    env: process.env,
    fetchImpl: fetch,
  }),
  repositoryDeps: () => ({
    HTTPError,
    clamp,
    nowISO,
    rest,
    shortID,
    slugify,
    truncateText,
  }),
  servicesDeps: () => ({
    objectValue,
    truncateText,
  }),
});
const {
  startupOfficeModelClient,
  startupOfficeRepository,
  startupOfficeServices,
} = STARTUP_OFFICE_RUNTIME;
const STARTUP_OFFICE_REPOSITORY_DELEGATES = createStartupOfficeRepositoryDelegates({
  startupOfficeRepository,
});
const {
  createStartupOfficeReceipt,
  ensureStartupOfficeLoop,
  findStartupOfficeApproval,
  isMissingStartupOfficeTableError,
  safeStartupOfficeRest,
  startupOfficeApprovals,
  startupOfficeArtifacts,
  startupOfficeLoops,
  startupOfficeReceipts,
  startupOfficeRuns,
} = STARTUP_OFFICE_REPOSITORY_DELEGATES;
const STARTUP_OFFICE_OBJECT_STORE = createStartupOfficeObjectStore({
  applyStartupOfficeCursor,
  applyStartupOfficeObjectListQuery,
  clamp,
  createHTTPError: startupOfficeHTTPError,
  nowISO,
  objectValue,
  publicStartupOfficeAsset,
  publicStartupOfficeCustomer,
  publicStartupOfficeMetric,
  publicStartupOfficeSignal,
  safeStartupOfficeRest,
  startupOfficeAssetStatus,
  startupOfficeCustomerStatus,
  startupOfficeSignalStatus,
  startupOfficeSignalType,
  truncateText,
});
const {
  startupOfficeObjectDefinition,
  startupOfficeObjectPatch,
  startupOfficeObjectPayload,
  startupOfficeObjectRows,
} = STARTUP_OFFICE_OBJECT_STORE;
const STARTUP_OFFICE_OPERATIONS_STORE = createStartupOfficeOperationsStore({
  clamp,
  nowISO,
  safeStartupOfficeRest,
  shortID,
});
const {
  startupOfficeBetaOpsSnapshot,
  startupOfficeStuckJobs,
  upsertStartupOfficeBilling,
  upsertStartupOfficeBillingDocument,
  upsertStartupOfficeTermsAcceptance,
} = STARTUP_OFFICE_OPERATIONS_STORE;
let STARTUP_OFFICE_PROFILE_HANDLERS;
let STARTUP_OFFICE_DEMO_SEED_HANDLERS;
const HOSTED_HEALTH_HANDLERS = createHostedHealthHandlers({
  authFetch,
  env: process.env,
  nowISO,
  rest,
  writeJSON,
});

const HOSTED_AGENT_LOG_HANDLERS = createHostedAgentLogHandlers({
  requirePermission,
  requireUser,
  startupOfficeReceipts,
  writeJSON,
});

const HOSTED_AUDIT_HANDLERS = createHostedAuditHandlers({
  clamp,
  createHTTPError: startupOfficeHTTPError,
  requirePermission,
  requireUser,
  rest,
  writeJSON,
});

const HOSTED_CLIENT_TELEMETRY_HANDLERS = createHostedClientTelemetryHandlers({
  createHTTPError: startupOfficeHTTPError,
  readBody,
  requireUser,
  writeAuditEvent,
  writeJSON,
});

const HOSTED_MODEL_ACCESS = createHostedModelAccess({
  createHTTPError: startupOfficeHTTPError,
  hasPermission,
  managedModelEnabled: () =>
    truthy(process.env.LAF_OFFICE_WORKSPACE_PAID) ||
    truthy(process.env.LAF_OFFICE_MANAGED_MODEL_ENABLED),
  requireUser,
  rest,
  writeJSON,
});

const STARTUP_OFFICE_WORKSPACE_CONFIG_HANDLERS =
  createStartupOfficeWorkspaceConfigHandlers({
    clamp,
    createHTTPError: startupOfficeHTTPError,
    nowISO,
    objectValue,
    readBody,
    requirePermission,
    requireUser,
    rest,
    safeStartupOfficeRest,
    seedStartupOfficeWorkspace: (membership, team, body) =>
      STARTUP_OFFICE_DEMO_SEED_HANDLERS.seedStartupOfficeWorkspace(membership, team, body),
    truncateText,
    writeAuditEvent,
    writeJSON,
  });
const {
  hostedConfigSnapshot,
  startupOfficeApprovalPolicy,
  upsertWorkspaceSettings,
  workspaceSettings,
  workspaceSettingsPatch,
} = STARTUP_OFFICE_WORKSPACE_CONFIG_HANDLERS;

const HOSTED_AUTH_HANDLERS = createHostedAuthHandlers({
  activeMembership,
  authFetch,
  createHTTPError: startupOfficeHTTPError,
  getTeam,
  normalizeProfileAvatarID,
  publicTeam,
  publicUser,
  readBody,
  requireUser,
  setAuthCookies,
  writeAuditEvent,
  writeJSON,
});

const HOSTED_COMMAND_HANDLERS = createHostedCommandHandlers({
  createHTTPError: startupOfficeHTTPError,
  readBody,
  requireUser,
  writeJSON,
});

const HOSTED_MEMBER_HANDLERS = createHostedMemberHandlers({
  WORKSPACE_PERMISSIONS,
  WORKSPACE_ROLES,
  authAdminFetch,
  createHTTPError: startupOfficeHTTPError,
  effectivePermissions,
  normalizePermissionOverride,
  normalizeRole,
  nowISO,
  publicUser,
  readBody,
  requirePermission,
  requireUser,
  rest,
  startupOfficeBetaOpsSnapshot,
  writeAuditEvent,
  writeJSON,
});

const HOSTED_INVITE_HANDLERS = createHostedInviteHandlers({
  createHTTPError: startupOfficeHTTPError,
  normalizeRole,
  nowISO,
  originFor: HOSTED_URL_TRUST.trustedPublicOrigin,
  readBody,
  requirePermission,
  requireUser,
  rest,
  sendInviteEmail,
  writeAuditEvent,
  writeJSON,
});

const HOSTED_SIGNUP_HANDLERS = createHostedSignupHandlers({
  authAdminFetch,
  authFetch,
  createHTTPError: startupOfficeHTTPError,
  defaultProfileAvatarID: DEFAULT_PROFILE_AVATAR_ID,
  enforceSignupRateLimit: (req) =>
    enforceRateLimit("auth_signup", clientRateLimitKey(req), RATE_LIMITS.authSignup),
  getTeam,
  inviteByToken: HOSTED_INVITE_HANDLERS.inviteByToken,
  nowISO,
  publicTeam,
  publicUser,
  readBody,
  rest,
  setAuthCookies,
  shortID,
  slugify,
  writeJSON,
});

const HOSTED_CONVERSATION_HANDLERS = createHostedConversationHandlers({
  clamp,
  createHTTPError: startupOfficeHTTPError,
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
});

const HOSTED_ROSTER_HANDLERS = createHostedRosterHandlers({
  createHTTPError: startupOfficeHTTPError,
  publicTeam,
  readBody,
  requireUser,
  shortID,
  slugify,
  truncateText,
  writeJSON,
});

const HOSTED_MEMORY_HANDLERS = createHostedMemoryHandlers({
  createHTTPError: startupOfficeHTTPError,
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
});

const HOSTED_USAGE_HANDLERS = createHostedUsageHandlers({
  requirePermission,
  requireUser,
  startupOfficeBetaOpsSnapshot,
  writeJSON,
});

const HOSTED_ORCHESTRATION_HANDLERS = createHostedOrchestrationHandlers({
  createHTTPError: startupOfficeHTTPError,
  nowISO,
  randomID,
  readBody,
  requirePermission,
  requireUser,
  rest,
  writeAuditEvent,
  writeJSON,
});

const STARTUP_OFFICE_OPERATIONS_HANDLERS = createStartupOfficeOperationsHandlers({
  clamp,
  createHTTPError: startupOfficeHTTPError,
  nowISO,
  objectValue,
  readBody,
  requireAdminRole,
  requirePermission,
  requireUser,
  safeStartupOfficeRest,
  startupOfficeApprovalPolicy,
  startupOfficeApprovals,
  startupOfficeBetaOpsSnapshot,
  startupOfficeRuns,
  startupOfficeStuckJobs,
  truncateText,
  upsertStartupOfficeBilling,
  upsertStartupOfficeBillingDocument,
  upsertWorkspaceSettings,
  workspaceSettings,
  writeAuditEvent,
  writeJSON,
});

const STARTUP_OFFICE_TERMS_HANDLERS = createStartupOfficeTermsHandlers({
  createHTTPError: startupOfficeHTTPError,
  nowISO,
  objectValue,
  readBody,
  requirePermission,
  requireUser,
  startupOfficeBetaOpsSnapshot,
  truncateText,
  upsertStartupOfficeTermsAcceptance,
  writeAuditEvent,
  writeJSON,
});

const STARTUP_OFFICE_OBJECT_HANDLERS = createStartupOfficeObjectHandlers({
  createHTTPError: startupOfficeHTTPError,
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
});

const STARTUP_OFFICE_ASSET_UPLOAD_HANDLERS = createStartupOfficeAssetUploadHandlers({
  createHTTPError: startupOfficeHTTPError,
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
});

const STARTUP_OFFICE_CUSTOMER_CSV_HANDLERS = createStartupOfficeCustomerCsvHandlers({
  createHTTPError: startupOfficeHTTPError,
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
});

const STARTUP_OFFICE_IMPORT_HANDLERS = createStartupOfficeImportHandlers({
  createHTTPError: startupOfficeHTTPError,
  nowISO,
  objectValue,
  readBody,
  requirePermission,
  requireUser,
  startupOfficeRepository,
  truncateText,
  writeAuditEvent,
  writeJSON,
});

const STARTUP_OFFICE_QUERY_HANDLERS = createStartupOfficeQueryHandlers({
  createHTTPError: startupOfficeHTTPError,
  companyProfileSnapshot: (teamID, team, user) =>
    STARTUP_OFFICE_PROFILE_HANDLERS.companyProfileSnapshot(teamID, team, user),
  normalizeStartupOfficeCadence,
  normalizeStartupOfficeLoopStatus,
  nowISO,
  objectValue,
  publicStartupOfficeLoop,
  recordStartupOfficeExportActivation: (args) =>
    recordStartupOfficeExportActivation({ ...args, nowISO, safeStartupOfficeRest }),
  readBody,
  requirePermission,
  requireUser,
  safeStartupOfficeRest,
  startupOfficeApprovals,
  startupOfficeArtifacts,
  startupOfficeBetaOpsSnapshot,
  startupOfficeLoops,
  startupOfficeObjectRows,
  startupOfficeReceipts,
  startupOfficeRepository,
  startupOfficeRuns,
  truncateText,
  writeAuditEvent,
  writeJSON,
});

const STARTUP_OFFICE_LIFECYCLE_HANDLERS = createStartupOfficeLifecycleHandlers({
  createHTTPError: startupOfficeHTTPError,
  nowISO,
  readBody,
  requireAdminRole,
  requireUser,
  rpc,
  safeStartupOfficeRest,
  truncateText,
  writeAuditEvent,
  writeJSON,
});

const STARTUP_OFFICE_WORKFLOW_HANDLERS = createStartupOfficeWorkflowHandlers({
  applyStartupOfficeMemoryPromotion,
  companyProfileSnapshot: (teamID, team, user) =>
    STARTUP_OFFICE_PROFILE_HANDLERS.companyProfileSnapshot(teamID, team, user),
  createHTTPError: startupOfficeHTTPError,
  createStartupOfficeReceipt,
  enforceStartupOfficeRateLimit,
  ensureStartupOfficeLoop,
  findStartupOfficeApproval,
  materializeStartupOfficeReceiptMemory,
  nowISO,
  objectValue,
  publicStartupOfficeApproval,
  publicStartupOfficeArtifact,
  publicStartupOfficeRun,
  recordStartupOfficeApprovalActivation: (args) =>
    recordStartupOfficeApprovalActivation({ ...args, safeStartupOfficeRest }),
  recordStartupOfficeRunActivation: (args) =>
    recordStartupOfficeRunActivation({ ...args, safeStartupOfficeRest }),
  readBody,
  requirePermission,
  requireUser,
  runStartupOfficeLoop,
  safeStartupOfficeRest,
  shortID,
  startupOfficeApprovalPolicy,
  startupOfficeApprovals,
  startupOfficeArtifacts,
  startupOfficeBetaOpsSnapshot,
  startupOfficeBillingBlockReason,
  startupOfficeEntitlementBlock,
  startupOfficeModelClient,
  startupOfficeReceiptMemoryPageSlugs: STARTUP_OFFICE_RECEIPT_MEMORY_PAGE_SLUGS,
  startupOfficeLoopSkillInvocations,
  startupOfficeReceipts,
  startupOfficeRepository,
  truncateText,
  workspaceSettings,
  writeAuditEvent,
  writeJSON,
});

const HOSTED_REQUEST_HANDLERS = createHostedRequestHandlers({
  approvalAction: STARTUP_OFFICE_WORKFLOW_HANDLERS.approvalAction,
  createHTTPError: startupOfficeHTTPError,
  readBody,
  requirePermission,
  requireUser,
  startupOfficeApprovals,
  writeJSON,
});

const HOSTED_ACTIVITY_HANDLERS = createHostedActivityHandlers({
  createHTTPError: startupOfficeHTTPError,
  nowISO,
  readBody,
  requirePermission,
  requireUser,
  safeStartupOfficeRest,
  truncateText,
  writeAuditEvent,
  writeJSON,
});

const HOSTED_SCHEDULER_HANDLERS = createHostedSchedulerHandlers({
  nowISO,
  requirePermission,
  requireUser,
  safeStartupOfficeRest,
  writeJSON,
});

const HOSTED_SKILL_HANDLERS = createHostedSkillHandlers({
  createHTTPError: startupOfficeHTTPError,
  nowISO,
  readBody,
  requirePermission,
  requireUser,
  rest,
  writeAuditEvent,
  writeJSON,
});

STARTUP_OFFICE_PROFILE_HANDLERS = createStartupOfficeProfileHandlers({
  companyProfileRowPayload: (profile) => startupOfficeServices().companyProfileRowPayload(profile),
  createHTTPError: startupOfficeHTTPError,
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

STARTUP_OFFICE_DEMO_SEED_HANDLERS = createStartupOfficeDemoSeedHandlers({
  createHTTPError: startupOfficeHTTPError,
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

const STARTUP_OFFICE_ROUTE_HANDLERS = createStartupOfficeRouteHandlerMap({
  assetUploadHandlers: STARTUP_OFFICE_ASSET_UPLOAD_HANDLERS,
  customerCsvHandlers: STARTUP_OFFICE_CUSTOMER_CSV_HANDLERS,
  demoSeedHandlers: () => STARTUP_OFFICE_DEMO_SEED_HANDLERS,
  importHandlers: STARTUP_OFFICE_IMPORT_HANDLERS,
  lifecycleHandlers: STARTUP_OFFICE_LIFECYCLE_HANDLERS,
  objectHandlers: STARTUP_OFFICE_OBJECT_HANDLERS,
  operationsHandlers: STARTUP_OFFICE_OPERATIONS_HANDLERS,
  profileHandlers: () => STARTUP_OFFICE_PROFILE_HANDLERS,
  queryHandlers: STARTUP_OFFICE_QUERY_HANDLERS,
  termsHandlers: STARTUP_OFFICE_TERMS_HANDLERS,
  workflowHandlers: STARTUP_OFFICE_WORKFLOW_HANDLERS,
});

const HOSTED_API_ROUTE_DISPATCHER = createHostedAPIRouteDispatcher({
  activityHandlers: HOSTED_ACTIVITY_HANDLERS,
  agentLogHandlers: HOSTED_AGENT_LOG_HANDLERS,
  auditHandlers: HOSTED_AUDIT_HANDLERS,
  authHandlers: HOSTED_AUTH_HANDLERS,
  authorizeStartupOfficeAccess,
  clearAuthCookies,
  clientTelemetryHandlers: HOSTED_CLIENT_TELEMETRY_HANDLERS,
  commandHandlers: HOSTED_COMMAND_HANDLERS,
  conversationHandlers: HOSTED_CONVERSATION_HANDLERS,
  dispatchStartupOfficeRoute,
  healthHandlers: HOSTED_HEALTH_HANDLERS,
  inviteHandlers: HOSTED_INVITE_HANDLERS,
  memberHandlers: HOSTED_MEMBER_HANDLERS,
  memoryHandlers: HOSTED_MEMORY_HANDLERS,
  modelAccess: HOSTED_MODEL_ACCESS,
  orchestrationHandlers: HOSTED_ORCHESTRATION_HANDLERS,
  requireAdminRole,
  requirePermission,
  requireUser,
  requestHandlers: HOSTED_REQUEST_HANDLERS,
  rosterHandlers: HOSTED_ROSTER_HANDLERS,
  schedulerHandlers: HOSTED_SCHEDULER_HANDLERS,
  signupHandlers: HOSTED_SIGNUP_HANDLERS,
  skillHandlers: HOSTED_SKILL_HANDLERS,
  startupOfficeRouteHandlers: STARTUP_OFFICE_ROUTE_HANDLERS,
  usageHandlers: HOSTED_USAGE_HANDLERS,
  workspaceConfigHandlers: STARTUP_OFFICE_WORKSPACE_CONFIG_HANDLERS,
  writeJSON,
});

const HOSTED_API_ENTRYPOINT = createHostedAPIEntrypoint({
  HTTPError,
  apiRouteDispatcher: HOSTED_API_ROUTE_DISPATCHER,
  assertSupabaseEnv,
  defaultHostedAPIErrorMessage,
  enforceHostedActionRateLimit,
  hostedAPIErrorPayload,
  requestIDFor,
  requestPath,
  securityHeaders: HOSTED_SECURITY_HEADERS,
  writeJSON,
});

module.exports = HOSTED_API_ENTRYPOINT;

module.exports.__test = {
  resetRateLimits() {
    resetRateLimits();
  },
};
