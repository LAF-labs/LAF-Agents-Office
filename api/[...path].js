const {
  createHostedAuditWriter,
} = require("./lib/hosted/auditWriter");
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
  createHostedHandlerBundle,
} = require("./lib/hosted/handlerBundle");
const {
  defaultHostedAPIErrorMessage,
  hostedAPIErrorPayload,
} = require("./lib/hosted/errorEnvelope");
const {
  createHostedInviteEmailDelivery,
} = require("./lib/hosted/inviteEmailDelivery");
const {
  createHostedIngressRateLimits,
} = require("./lib/hosted/ingressRateLimits");
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
const { createServiceRoleAccessGuards } = require("./lib/hosted/serviceRoleAccess");
const {
  createHostedActionRateLimiter,
} = require("./lib/hosted/rateLimits");
const {
  createStartupOfficeRateLimiter,
} = require("./lib/startup-office/rateLimits");
const {
  createHostedRequestIO,
} = require("./lib/hosted/requestIO");
const {
  redactSensitiveValue,
} = require("./lib/hosted/redaction");
const {
  createHostedSecurityHeaders,
} = require("./lib/hosted/securityHeaders");
const {
  createHostedSessionCookies,
} = require("./lib/hosted/sessionCookies");
const {
  createHostedSupabaseAccess,
} = require("./lib/hosted/supabaseAccess");
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
  createStartupOfficeProfileSeedHandlers,
} = require("./lib/startup-office/profileSeedHandlers");
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
  createStartupOfficeObjectHandlerBundle,
} = require("./lib/startup-office/objectHandlerBundle");
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

const STARTUP_OFFICE_OBJECT_HANDLER_BUNDLE = createStartupOfficeObjectHandlerBundle({
  createHTTPError: startupOfficeHTTPError,
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
});
const {
  assetUploadHandlers: STARTUP_OFFICE_ASSET_UPLOAD_HANDLERS,
  customerCsvHandlers: STARTUP_OFFICE_CUSTOMER_CSV_HANDLERS,
  importHandlers: STARTUP_OFFICE_IMPORT_HANDLERS,
  objectHandlers: STARTUP_OFFICE_OBJECT_HANDLERS,
} = STARTUP_OFFICE_OBJECT_HANDLER_BUNDLE;

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

const HOSTED_HANDLER_BUNDLE = createHostedHandlerBundle({
  WORKSPACE_PERMISSIONS,
  WORKSPACE_ROLES,
  RATE_LIMITS,
  activeMembership,
  approvalAction: STARTUP_OFFICE_WORKFLOW_HANDLERS.approvalAction,
  authAdminFetch,
  authFetch,
  clamp,
  clientRateLimitKey,
  createHTTPError: startupOfficeHTTPError,
  effectivePermissions,
  enforceRateLimit,
  env: process.env,
  getTeam,
  hasPermission,
  isHuman,
  normalizePermissionOverride,
  normalizeRole,
  nowISO,
  objectValue,
  originFor: HOSTED_URL_TRUST.trustedPublicOrigin,
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
  truncateText,
  truthy,
  writeAuditEvent,
  writeJSON,
});
const {
  activityHandlers: HOSTED_ACTIVITY_HANDLERS,
  agentLogHandlers: HOSTED_AGENT_LOG_HANDLERS,
  auditHandlers: HOSTED_AUDIT_HANDLERS,
  authHandlers: HOSTED_AUTH_HANDLERS,
  clientTelemetryHandlers: HOSTED_CLIENT_TELEMETRY_HANDLERS,
  commandHandlers: HOSTED_COMMAND_HANDLERS,
  conversationHandlers: HOSTED_CONVERSATION_HANDLERS,
  healthHandlers: HOSTED_HEALTH_HANDLERS,
  inviteHandlers: HOSTED_INVITE_HANDLERS,
  memberHandlers: HOSTED_MEMBER_HANDLERS,
  memoryHandlers: HOSTED_MEMORY_HANDLERS,
  modelAccess: HOSTED_MODEL_ACCESS,
  orchestrationHandlers: HOSTED_ORCHESTRATION_HANDLERS,
  requestHandlers: HOSTED_REQUEST_HANDLERS,
  rosterHandlers: HOSTED_ROSTER_HANDLERS,
  schedulerHandlers: HOSTED_SCHEDULER_HANDLERS,
  signupHandlers: HOSTED_SIGNUP_HANDLERS,
  skillHandlers: HOSTED_SKILL_HANDLERS,
  usageHandlers: HOSTED_USAGE_HANDLERS,
} = HOSTED_HANDLER_BUNDLE;

const STARTUP_OFFICE_PROFILE_SEED_HANDLERS = createStartupOfficeProfileSeedHandlers({
  createHTTPError: startupOfficeHTTPError,
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
});
STARTUP_OFFICE_PROFILE_HANDLERS = STARTUP_OFFICE_PROFILE_SEED_HANDLERS.profileHandlers;
STARTUP_OFFICE_DEMO_SEED_HANDLERS = STARTUP_OFFICE_PROFILE_SEED_HANDLERS.demoSeedHandlers;

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
