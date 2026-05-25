const crypto = require("node:crypto");
const {
  createHostedAuditHandlers,
} = require("./lib/hosted/auditHandlers");
const {
  createHostedAgentLogHandlers,
} = require("./lib/hosted/agentLogHandlers");
const {
  createHostedActivityHandlers,
} = require("./lib/hosted/activityHandlers");
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
  createResendEmailProvider,
} = require("../workers/startup-office/outboxWorker");
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
  redactSensitiveValue,
} = require("./lib/hosted/redaction");
const {
  createHostedSchedulerHandlers,
} = require("./lib/hosted/schedulerHandlers");
const {
  createHostedSkillHandlers,
} = require("./lib/hosted/skillHandlers");
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
  startupOfficeBillingProviderValue,
  startupOfficeBillingStateValue,
  startupOfficePaymentStatusValue,
} = require("./lib/startup-office/billingState");
const {
  publicStartupOfficeBillingDocument,
  startupOfficeCommercialSnapshot,
  startupOfficeEntitlementBlock,
  startupOfficeEntitlementSnapshot,
} = require("./lib/startup-office/commercialBilling");
const {
  activationEventsForTeam,
  recordStartupOfficeApprovalActivation,
  recordStartupOfficeExportActivation,
  recordStartupOfficeRunActivation,
  startupOfficeActivationSnapshot,
} = require("./lib/startup-office/activationAnalytics");
const {
  publicStartupOfficeTermsAcceptance,
  startupOfficeTermsSnapshot,
} = require("./lib/startup-office/betaTerms");
const {
  createStartupOfficeProfileHandlers,
} = require("./lib/startup-office/profileHandlers");
const {
  createStartupOfficeRepository,
} = require("./lib/startup-office/repositories");
const {
  applyStartupOfficeCursor,
} = require("./lib/startup-office/pagination");
const {
  applyStartupOfficeObjectListQuery,
} = require("./lib/startup-office/objectQueries");
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
  createStartupOfficeOperationsHandlers,
} = require("./lib/startup-office/operationsHandlers");
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
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMITS = {
  authSignup: 12,
};
const HOSTED_PERMISSION_GUARDS = createHostedPermissionGuards({
  createHTTPError: startupOfficeHTTPError,
});
const requireAdminRole = HOSTED_PERMISSION_GUARDS.requireAdminRole;
const requirePermission = HOSTED_PERMISSION_GUARDS.requirePermission;
const SERVICE_ROLE_ACCESS_GUARDS = createServiceRoleAccessGuards({ createHTTPError: startupOfficeHTTPError });
const HOSTED_URL_TRUST = createHostedURLTrust({
  createHTTPError: startupOfficeHTTPError,
  env: process.env,
});
const enforceHostedActionRateLimit = createHostedActionRateLimiter({
  claimPersistentRateLimit: persistentRateLimitsEnabled() ? claimHostedRateLimit : null,
  createRateLimitError: () => new HTTPError(429, "rate limit exceeded"),
  enforceRateLimit,
  keyForRequest: clientRateLimitKey,
});
const enforceStartupOfficeRateLimit = createStartupOfficeRateLimiter({
  claimPersistentRateLimit: persistentRateLimitsEnabled() ? claimHostedRateLimit : null,
  createRateLimitError: () => new HTTPError(429, "rate limit exceeded"),
  enforceRateLimit,
});
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
    seedStartupOfficeWorkspace,
    truncateText,
    writeAuditEvent,
    writeJSON,
  });

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
  randomID: () => (crypto.randomUUID ? crypto.randomUUID() : shortID()),
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
  companyProfileSnapshot,
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
  companyProfileSnapshot,
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

const STARTUP_OFFICE_ROUTE_HANDLERS = Object.freeze({
  approvalAction: STARTUP_OFFICE_WORKFLOW_HANDLERS.approvalAction,
  approvals: STARTUP_OFFICE_QUERY_HANDLERS.approvals,
  artifactObjectAction: STARTUP_OFFICE_OBJECT_HANDLERS.artifactObjectAction,
  assetUploadIntent: STARTUP_OFFICE_ASSET_UPLOAD_HANDLERS.assetUploadIntent,
  betaDashboard: STARTUP_OFFICE_OPERATIONS_HANDLERS.betaDashboard,
  billing: STARTUP_OFFICE_OPERATIONS_HANDLERS.billing,
  companyProfile: handleCompanyProfile,
  customerCsv: STARTUP_OFFICE_CUSTOMER_CSV_HANDLERS.customerCsv,
  deletionPurge: STARTUP_OFFICE_LIFECYCLE_HANDLERS.deletionPurge,
  deletionRequest: STARTUP_OFFICE_LIFECYCLE_HANDLERS.deletionRequest,
  demoSeed: handleStartupOfficeDemoSeed,
  export: STARTUP_OFFICE_QUERY_HANDLERS.export,
  growthSummary: STARTUP_OFFICE_QUERY_HANDLERS.growthSummary,
  loopRun: STARTUP_OFFICE_WORKFLOW_HANDLERS.loopRun,
  loops: STARTUP_OFFICE_QUERY_HANDLERS.loops,
  memoryImport: STARTUP_OFFICE_IMPORT_HANDLERS.memoryImport,
  objectCollection: STARTUP_OFFICE_OBJECT_HANDLERS.objectCollection,
  objectItem: STARTUP_OFFICE_OBJECT_HANDLERS.objectItem,
  policy: STARTUP_OFFICE_OPERATIONS_HANDLERS.policy,
  receipts: STARTUP_OFFICE_QUERY_HANDLERS.receipts,
  run: STARTUP_OFFICE_WORKFLOW_HANDLERS.run,
  supportAccess: STARTUP_OFFICE_LIFECYCLE_HANDLERS.supportAccess,
  supportAccessAction: STARTUP_OFFICE_LIFECYCLE_HANDLERS.supportAccess,
  supportTimeline: STARTUP_OFFICE_OPERATIONS_HANDLERS.supportTimeline,
  terms: STARTUP_OFFICE_TERMS_HANDLERS.terms,
  workerJobAction: STARTUP_OFFICE_OPERATIONS_HANDLERS.workerJobAction,
});

class HTTPError extends Error {
  constructor(status, message, opts = {}) {
    super(message);
    this.status = status;
    // When safe=true the caller has confirmed the message is generic enough
    // to forward to the client. Upstream Supabase/auth errors should default
    // to safe=false so we don't leak internal detail to attackers.
    this.safe = opts.safe !== false;
  }
}

function startupOfficeHTTPError(status, message) {
  return new HTTPError(status, message);
}

const rateLimitBuckets = new Map();

const ALLOWED_ORIGINS = HOSTED_URL_TRUST.normalizeAllowedOrigins(
  process.env.LAF_OFFICE_ALLOWED_ORIGINS || "",
);

function applyBaselineSecurityHeaders(res) {
  // Conservative defaults. The web bundle is served same-origin via Vercel
  // rewrites, so the API doesn't need a permissive CSP; we just lock down
  // common XSS/clickjacking/MIME-sniffing vectors here.
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains",
  );
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
}

function applyCORSHeaders(req, res) {
  const origin = String(req.headers.origin || "").trim();
  if (!origin) return;
  if (!ALLOWED_ORIGINS.includes(origin)) return;
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Authorization, Content-Type, X-Requested-With",
  );
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PATCH, DELETE, OPTIONS",
  );
  res.setHeader("Access-Control-Max-Age", "600");
}

module.exports = async function handler(req, res) {
  applyBaselineSecurityHeaders(res);
  applyCORSHeaders(req, res);
  try {
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    assertSupabaseEnv();

    const path = requestPath(req);
    await enforceHostedActionRateLimit(req, path);
    if (path === "health" && req.method === "GET") {
      await HOSTED_HEALTH_HANDLERS.health(req, res);
      return;
    }
    if (path === "health/dependencies" && req.method === "GET") {
      await HOSTED_HEALTH_HANDLERS.dependencies(req, res);
      return;
    }
    if (path === "auth/session" && req.method === "GET") {
      await handleAuthSession(req, res);
      return;
    }
    if (path === "auth/users") {
      await handleAuthUsers(req, res);
      return;
    }
    if (path === "auth/me" && req.method === "PATCH") {
      await handleAuthMe(req, res);
      return;
    }
    if (path === "auth/me/password" && req.method === "PATCH") {
      await handleAuthMePassword(req, res);
      return;
    }
    if (path === "auth/login" && req.method === "POST") {
      await handleAuthLogin(req, res);
      return;
    }
    if (path === "auth/signup" && req.method === "POST") {
      await handleAuthSignup(req, res);
      return;
    }
    if (path === "auth/logout" && req.method === "POST") {
      clearAuthCookies(req, res);
      writeJSON(res, 200, { status: "ok" });
      return;
    }
    if (path === "config") {
      await handleHostedConfig(req, res);
      return;
    }
    if (path === "onboarding/state" && req.method === "GET") {
      await handleHostedOnboardingState(req, res);
      return;
    }
    if (path === "onboarding/complete" && req.method === "POST") {
      await handleHostedOnboardingComplete(req, res);
      return;
    }
    if (path === "onboarding/prereqs" && req.method === "GET") {
      writeJSON(res, 200, { prereqs: [] });
      return;
    }
    if (path === "onboarding/blueprints" && req.method === "GET") {
      writeJSON(res, 200, { templates: [] });
      return;
    }
    if (await dispatchStartupOfficeRoute({
      authorize: (access, request) => authorizeStartupOfficeAccess({ access, req: request, requireAdminRole, requirePermission, requireUser }),
      handlers: STARTUP_OFFICE_ROUTE_HANDLERS,
      path,
      req,
      res,
    })) {
      return;
    }
    if (path === "humans" && req.method === "GET") {
      await HOSTED_ROSTER_HANDLERS.humans(req, res);
      return;
    }
    if (path === "teams" && req.method === "GET") {
      await HOSTED_ROSTER_HANDLERS.teams(req, res);
      return;
    }
    if (path === "office-members") {
      await HOSTED_ROSTER_HANDLERS.officeMembers(req, res);
      return;
    }
    if (path === "office-members/generate" && req.method === "POST") {
      await HOSTED_ROSTER_HANDLERS.officeMemberGenerate(req, res);
      return;
    }
    if (path === "members" && req.method === "GET") {
      await HOSTED_ROSTER_HANDLERS.channelMembers(req, res);
      return;
    }
    if (path === "channels") {
      await handleHostedChannels(req, res);
      return;
    }
    if (path === "channels/generate" && req.method === "POST") {
      await handleHostedChannelGenerate(req, res);
      return;
    }
    if (path === "channels/dm" && req.method === "POST") {
      await handleHostedDMChannel(req, res);
      return;
    }
    if (path === "messages") {
      await handleHostedMessages(req, res);
      return;
    }
    if (path === "messages/react" && req.method === "POST") {
      await HOSTED_CONVERSATION_HANDLERS.messageReaction(req, res);
      return;
    }
    if (path === "home-sessions") {
      await handleHostedHomeSessions(req, res);
      return;
    }
    if (path === "commands" && req.method === "GET") {
      HOSTED_COMMAND_HANDLERS.commands(req, res);
      return;
    }
    if (path === "commands/run" && req.method === "POST") {
      await HOSTED_COMMAND_HANDLERS.commandRun(req, res);
      return;
    }
    if (path === "requests" && req.method === "GET") {
      await HOSTED_REQUEST_HANDLERS.requests(req, res);
      return;
    }
    if (path === "requests/answer" && req.method === "POST") {
      await HOSTED_REQUEST_HANDLERS.requestAnswer(req, res);
      return;
    }
    if (path === "actions" && req.method === "GET") {
      await HOSTED_ACTIVITY_HANDLERS.actions(req, res);
      return;
    }
    if (path === "signals") {
      await HOSTED_ACTIVITY_HANDLERS.signals(req, res);
      return;
    }
    if (path === "decisions" && req.method === "GET") {
      await HOSTED_ACTIVITY_HANDLERS.decisions(req, res);
      return;
    }
    if (path === "watchdogs" && req.method === "GET") {
      await HOSTED_ACTIVITY_HANDLERS.watchdogs(req, res);
      return;
    }
    if (path === "scheduler" && req.method === "GET") {
      await HOSTED_SCHEDULER_HANDLERS.scheduler(req, res);
      return;
    }
    if (path === "usage" && req.method === "GET") {
      await HOSTED_USAGE_HANDLERS.usage(req, res);
      return;
    }
    if (path === "client-errors") {
      await HOSTED_CLIENT_TELEMETRY_HANDLERS.clientError(req, res);
      return;
    }
    if (path === "agent-logs" && req.method === "GET") {
      await HOSTED_AGENT_LOG_HANDLERS.agentLogs(req, res);
      return;
    }
    if (path === "memory") {
      await HOSTED_MEMORY_HANDLERS.memory(req, res);
      return;
    }
    if (path === "invites/lookup" && req.method === "GET") {
      await handleInviteLookup(req, res);
      return;
    }
    if (path === "invites/accept" && req.method === "POST") {
      await handleInviteAccept(req, res);
      return;
    }
    if (path === "invites") {
      await handleInvites(req, res);
      return;
    }
    if (path === "permissions") {
      await handlePermissions(req, res);
      return;
    }
    if (path === "audit" && req.method === "GET") {
      await HOSTED_AUDIT_HANDLERS.auditEvents(req, res);
      return;
    }
    if (path === "model/availability" && req.method === "GET") {
      await HOSTED_MODEL_ACCESS.availability(req, res);
      return;
    }
    if (path === "orchestration/intent" && req.method === "POST") {
      await HOSTED_ORCHESTRATION_HANDLERS.orchestrationIntent(req, res);
      return;
    }
    if (path === "orchestration/confirm" && req.method === "POST") {
      await HOSTED_ORCHESTRATION_HANDLERS.orchestrationConfirm(req, res);
      return;
    }
    if (path === "skills") {
      await HOSTED_SKILL_HANDLERS.skills(req, res);
      return;
    }
    const skillInvokeMatch = path.match(/^skills\/([^/]+)\/invoke$/);
    if (skillInvokeMatch && req.method === "POST") {
      await HOSTED_SKILL_HANDLERS.skillInvoke(req, res, decodeURIComponent(skillInvokeMatch[1]));
      return;
    }
    writeJSON(res, 404, hostedAPIErrorPayload({
      message: "hosted API route not found",
      requestID: requestIDFor(req),
      status: 404,
    }));
  } catch (err) {
    const status = err instanceof HTTPError ? err.status : 500;
    let message;
    if (err instanceof HTTPError) {
      // Only forward HTTPError.message when explicitly marked safe. Upstream
      // (Supabase/auth) detail is wrapped with safe=false so we expose a
      // generic message and log the real one server-side.
      message = err.safe === false ? defaultHostedAPIErrorMessage(status) : err.message;
    } else {
      message = "hosted API internal error";
    }
    if (status >= 500 || (err instanceof HTTPError && err.safe === false)) {
      try {
        console.error("[laf-office:api]", req.method, requestPath(req), err);
      } catch {
        // best-effort logging
      }
    }
    writeJSON(res, status, hostedAPIErrorPayload({
      message,
      requestID: requestIDFor(req),
      status,
    }));
  }
};

function requestIDFor(req) {
  return String(req.headers?.["x-request-id"] || req.headers?.["x-vercel-id"] || "").trim();
}

function assertSupabaseEnv() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new HTTPError(
      503,
      "supabase environment is not configured",
    );
  }
}

function requestPath(req) {
  const raw = req.query?.path;
  if (Array.isArray(raw)) return raw.join("/");
  return String(raw || "").replace(/^\/+|\/+$/g, "");
}

async function readBody(req) {
  const contentLength = Number(req.headers?.["content-length"] || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BODY_BYTES) {
    throw new HTTPError(413, "request body exceeds 524288 bytes");
  }
  if (req.body && typeof req.body === "object") {
    assertJSONByteSize(req.body, MAX_REQUEST_BODY_BYTES, "request body");
    return req.body;
  }
  if (typeof req.body === "string" && req.body.trim()) {
    if (Buffer.byteLength(req.body, "utf8") > MAX_REQUEST_BODY_BYTES) {
      throw new HTTPError(413, "request body exceeds 524288 bytes");
    }
    try {
      return JSON.parse(req.body);
    } catch {
      throw new HTTPError(400, "invalid json body");
    }
  }
  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    totalBytes += Buffer.byteLength(chunk);
    if (totalBytes > MAX_REQUEST_BODY_BYTES) {
      throw new HTTPError(413, "request body exceeds 524288 bytes");
    }
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new HTTPError(400, "invalid json body");
  }
}

function writeJSON(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

function jsonByteSize(value) {
  return Buffer.byteLength(JSON.stringify(value ?? null), "utf8");
}

function assertJSONByteSize(value, maxBytes, label) {
  if (jsonByteSize(value) > maxBytes) {
    throw new HTTPError(413, `${label} exceeds ${maxBytes} bytes`);
  }
}

function clientRateLimitKey(req) {
  return String(
    req.headers?.["x-forwarded-for"] ||
      req.headers?.["x-real-ip"] ||
      req.socket?.remoteAddress ||
      req.connection?.remoteAddress ||
      "unknown",
  )
    .split(",")[0]
    .trim();
}

function enforceRateLimit(scope, key, limit, windowMs = RATE_LIMIT_WINDOW_MS) {
  const bucketKey = `${scope}:${key || "anonymous"}`;
  const now = Date.now();
  const bucket = rateLimitBuckets.get(bucketKey);
  if (!bucket || bucket.resetAt <= now) {
    rateLimitBuckets.set(bucketKey, { count: 1, resetAt: now + windowMs });
    return;
  }
  bucket.count += 1;
  if (bucket.count > limit) {
    throw new HTTPError(429, "rate limit exceeded");
  }
}

function persistentRateLimitsEnabled() {
  return (
    process.env.NODE_ENV === "production" ||
    process.env.LAF_OFFICE_PERSISTENT_RATE_LIMITS === "1"
  );
}

async function claimHostedRateLimit({ key, limit, scope, windowMs }) {
  return rpc("claim_hosted_rate_limit", {
    p_bucket_key: key || "anonymous",
    p_limit: limit,
    p_scope: scope,
    p_window_ms: windowMs,
  });
}

async function sendInviteEmail(email) {
  const provider = inviteEmailProviderFromEnv();
  if (!provider) return null;
  return provider.sendEmail(email);
}

function inviteEmailProviderFromEnv() {
  const provider = String(process.env.LAF_OUTBOX_EMAIL_PROVIDER || "in_app")
    .trim()
    .toLowerCase();
  if (!provider || provider === "in_app" || provider === "none") return null;
  if (provider === "resend") {
    return createResendEmailProvider({
      apiKey: process.env.RESEND_API_KEY || "",
      from: process.env.LAF_EMAIL_FROM || "",
      replyTo: process.env.LAF_EMAIL_REPLY_TO || "",
    });
  }
  throw new HTTPError(503, `unsupported LAF_OUTBOX_EMAIL_PROVIDER: ${provider}`);
}

function supabaseURL(path) {
  return `${process.env.SUPABASE_URL.replace(/\/+$/, "")}${path}`;
}

function serviceHeaders(extra = {}) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

function anonHeaders(extra = {}) {
  const key = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function rest(table, options = {}) {
  const tableName = SERVICE_ROLE_ACCESS_GUARDS.assertAllowedRestTable(table);
  const method = options.method || "GET";
  const url = new URL(supabaseURL(`/rest/v1/${tableName}`));
  for (const [key, value] of Object.entries(options.query || {})) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }
  const headers = serviceHeaders();
  if (method !== "GET") {
    headers.Prefer = options.prefer || "return=representation";
  }
  const response = await fetch(url, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  if (!response.ok) {
    // safe=false: upstream PostgREST errors can include column names,
    // constraint identifiers, or RLS detail that should not reach the
    // browser. The catch in handler() will redact and log.
    throw new HTTPError(
      response.status,
      responseErrorMessage(text, response.statusText),
      { safe: false },
    );
  }
  return text ? JSON.parse(text) : null;
}

async function rpc(name, body = {}) {
  const rpcName = SERVICE_ROLE_ACCESS_GUARDS.assertAllowedRPC(name);
  const response = await fetch(supabaseURL(`/rest/v1/rpc/${rpcName}`), {
    method: "POST",
    headers: serviceHeaders(),
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new HTTPError(
      response.status,
      responseErrorMessage(text, response.statusText),
      { safe: false },
    );
  }
  return text ? JSON.parse(text) : null;
}

async function authFetch(path, options = {}) {
  const response = await fetch(supabaseURL(`/auth/v1/${path}`), {
    method: options.method || "GET",
    headers: anonHeaders(options.headers),
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new HTTPError(
      response.status,
      responseErrorMessage(text, response.statusText),
      { safe: false },
    );
  }
  return text ? JSON.parse(text) : null;
}

async function authAdminFetch(path, options = {}) {
  const response = await fetch(supabaseURL(`/auth/v1/${path}`), {
    method: options.method || "GET",
    headers: serviceHeaders(options.headers),
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new HTTPError(
      response.status,
      responseErrorMessage(text, response.statusText),
      { safe: false },
    );
  }
  return text ? JSON.parse(text) : null;
}

function responseErrorMessage(text, fallback) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return fallback;
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object") {
      for (const key of ["msg", "message", "error_description", "error"]) {
        const value = parsed[key];
        if (typeof value === "string" && value.trim()) {
          return value.trim();
        }
      }
    }
  } catch {
    // Plain-text upstream errors are already useful.
  }
  return trimmed || fallback;
}

function cookie(req, name) {
  const header = req.headers.cookie || "";
  const parts = header.split(";").map((part) => part.trim());
  for (const part of parts) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    if (part.slice(0, index) === name) {
      return decodeURIComponent(part.slice(index + 1));
    }
  }
  return "";
}

function bearer(req) {
  const header = req.headers.authorization || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

function authToken(req) {
  return bearer(req) || cookie(req, "laf_access");
}

function trustedBrowserOrigin(req) {
  const origin = String(req.headers.origin || "").trim();
  return origin && ALLOWED_ORIGINS.includes(origin) ? origin : "";
}

function authCookieSameSite(req) {
  return process.env.NODE_ENV === "production" && trustedBrowserOrigin(req)
    ? "None"
    : "Lax";
}

function setAuthCookies(req, res, session) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  const sameSite = authCookieSameSite(req);
  const accessMaxAge = Number(session.expires_in || 3600);
  const cookies = [
    `laf_access=${encodeURIComponent(session.access_token)}; Path=/; HttpOnly; SameSite=${sameSite}; Max-Age=${accessMaxAge}${secure}`,
  ];
  if (session.refresh_token) {
    cookies.push(
      `laf_refresh=${encodeURIComponent(session.refresh_token)}; Path=/; HttpOnly; SameSite=${sameSite}; Max-Age=2592000${secure}`,
    );
  }
  res.setHeader("Set-Cookie", cookies);
}

function clearAuthCookies(req, res) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  const sameSite = authCookieSameSite(req);
  res.setHeader("Set-Cookie", [
    `laf_access=; Path=/; HttpOnly; SameSite=${sameSite}; Max-Age=0${secure}`,
    `laf_refresh=; Path=/; HttpOnly; SameSite=${sameSite}; Max-Age=0${secure}`,
  ]);
}

async function requireUser(req) {
  if (req.__lafOfficeUserContext) return req.__lafOfficeUserContext;
  const token = authToken(req);
  if (!token) throw new HTTPError(401, "authentication required");
  const user = await authFetch("user", { headers: { Authorization: `Bearer ${token}` } });
  const membership = await activeMembership(user.id);
  if (!membership) throw new HTTPError(403, "active team membership required");
  const team = await getTeam(membership.team_id);
  return (req.__lafOfficeUserContext = { membership, team, token, user });
}

async function activeMembership(userID) {
  const rows = await rest("memberships", {
    query: {
      user_id: `eq.${userID}`,
      status: "eq.active",
      select: "*",
      limit: "1",
    },
  });
  return rows?.[0] || null;
}

async function getTeam(teamID) {
  const rows = await rest("teams", {
    query: { id: `eq.${teamID}`, select: "*", limit: "1" },
  });
  return rows?.[0] || null;
}

async function writeAuditEvent(membership, action, targetType, targetID, metadata = {}, options = {}) {
  return await writeTeamAuditEvent(
    membership?.team_id,
    membership?.user_id,
    action,
    targetType,
    targetID,
    metadata,
    options,
  );
}

async function writeTeamAuditEvent(
  teamID,
  actorUserID,
  action,
  targetType,
  targetID,
  metadata = {},
  options = {},
) {
  if (!teamID) return null;
  try {
    const [event] = await rest("audit_events", {
      method: "POST",
      body: {
        action,
        actor_user_id: actorUserID || null,
        metadata: redactSensitiveValue(metadata),
        target_id: targetID || "",
        target_type: targetType || "",
        team_id: teamID,
      },
    });
    return event;
  } catch {
    if (options.required) throw new HTTPError(500, "audit write failed");
    return null;
  }
}

async function handleAuthSession(req, res) {
  return HOSTED_AUTH_HANDLERS.session(req, res);
}

async function handleHostedConfig(req, res) {
  return STARTUP_OFFICE_WORKSPACE_CONFIG_HANDLERS.config(req, res);
}

async function handleHostedOnboardingState(req, res) {
  return STARTUP_OFFICE_WORKSPACE_CONFIG_HANDLERS.onboardingState(req, res);
}

async function handleHostedOnboardingComplete(req, res) {
  return STARTUP_OFFICE_WORKSPACE_CONFIG_HANDLERS.onboardingComplete(req, res);
}

async function workspaceSettings(teamID) {
  return STARTUP_OFFICE_WORKSPACE_CONFIG_HANDLERS.workspaceSettings(teamID);
}

async function upsertWorkspaceSettings(teamID, patch) {
  return STARTUP_OFFICE_WORKSPACE_CONFIG_HANDLERS.upsertWorkspaceSettings(teamID, patch);
}

function workspaceSettingsPatch(existing, body) {
  return STARTUP_OFFICE_WORKSPACE_CONFIG_HANDLERS.workspaceSettingsPatch(existing, body);
}

function startupOfficeApprovalPolicy(settings) {
  return STARTUP_OFFICE_WORKSPACE_CONFIG_HANDLERS.startupOfficeApprovalPolicy(settings);
}

function hostedConfigSnapshot({ settings, team, user }) {
  return STARTUP_OFFICE_WORKSPACE_CONFIG_HANDLERS.hostedConfigSnapshot({
    settings,
    team,
    user,
  });
}

let startupOfficeRepositoryInstance = null;
function startupOfficeRepository() {
  if (!startupOfficeRepositoryInstance) {
    startupOfficeRepositoryInstance = createStartupOfficeRepository({
      HTTPError,
      clamp,
      nowISO,
      rest,
      shortID,
      slugify,
      truncateText,
    });
  }
  return startupOfficeRepositoryInstance;
}

let startupOfficeServicesInstance = null;
function startupOfficeServices() {
  if (!startupOfficeServicesInstance) {
    startupOfficeServicesInstance = createStartupOfficeServices({
      objectValue,
      truncateText,
    });
  }
  return startupOfficeServicesInstance;
}

let startupOfficeModelClientInstance = null;
function startupOfficeModelClient() {
  if (!startupOfficeModelClientInstance) {
    startupOfficeModelClientInstance = createStartupOfficeModelClient({
      env: process.env,
      fetchImpl: fetch,
    });
  }
  return startupOfficeModelClientInstance;
}

const STARTUP_OFFICE_PROFILE_HANDLERS = createStartupOfficeProfileHandlers({
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

const STARTUP_OFFICE_DEMO_SEED_HANDLERS = createStartupOfficeDemoSeedHandlers({
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

async function handleCompanyProfile(req, res) {
  return STARTUP_OFFICE_PROFILE_HANDLERS.companyProfile(req, res);
}

async function companyProfileSnapshot(teamID, team, user) {
  return STARTUP_OFFICE_PROFILE_HANDLERS.companyProfileSnapshot(teamID, team, user);
}

async function handleStartupOfficeDemoSeed(req, res) {
  return STARTUP_OFFICE_DEMO_SEED_HANDLERS.demoSeed(req, res);
}

async function seedStartupOfficeWorkspace(membership, team, body) {
  return STARTUP_OFFICE_DEMO_SEED_HANDLERS.seedStartupOfficeWorkspace(membership, team, body);
}

async function startupOfficeObjectRows(teamID, kind, options = {}) {
  const definition = startupOfficeObjectDefinition(kind);
  const query = {
    select: "*",
    team_id: `eq.${teamID}`,
  };
  applyStartupOfficeObjectListQuery(query, kind, options);
  applyStartupOfficeCursor(query, options.cursor);
  if (options.limit) query.limit = String(clamp(Number(options.limit) || 100, 1, 1000));
  const rows = await safeStartupOfficeRest(definition.table, { query });
  return rows.map(definition.public).filter(Boolean);
}

function startupOfficeObjectDefinition(kind) {
  const definitions = {
    assets: {
      public: publicStartupOfficeAsset,
      responseKey: "assets",
      singularKey: "asset",
      table: "startup_office_assets",
    },
    customers: {
      public: publicStartupOfficeCustomer,
      responseKey: "customers",
      singularKey: "customer",
      table: "startup_office_customers",
    },
    metrics: {
      public: publicStartupOfficeMetric,
      responseKey: "metrics",
      singularKey: "metric",
      table: "startup_office_metrics",
    },
    signals: {
      public: publicStartupOfficeSignal,
      responseKey: "signals",
      singularKey: "signal",
      table: "startup_office_signals",
    },
  };
  const definition = definitions[kind];
  if (!definition) throw new HTTPError(404, "startup office object not found");
  return definition;
}

function startupOfficeObjectPayload(kind, membership, body) {
  const now = nowISO();
  if (kind === "assets") {
    return {
      body: truncateText(body.body || "", 30000),
      created_by: membership.user_id,
      kind: truncateText(body.kind || "document", 80),
      metadata: objectValue(body.metadata),
      name: truncateText(body.name || "Untitled asset", 180),
      run_id: body.run_id || null,
      status: startupOfficeAssetStatus(body.status),
      team_id: membership.team_id,
      updated_at: now,
    };
  }
  if (kind === "customers") {
    return {
      created_by: membership.user_id,
      loop_id: body.loop_id || body.discovery_loop_id || null,
      name: truncateText(body.name || "Untitled customer", 180),
      notes: truncateText(body.notes || "", 6000),
      profile: objectValue(body.profile),
      status: startupOfficeCustomerStatus(body.status),
      team_id: membership.team_id,
      updated_at: now,
    };
  }
  if (kind === "metrics") {
    return {
      created_by: membership.user_id,
      metadata: objectValue(body.metadata),
      metric_key: truncateText(body.metric_key || body.key || "metric", 120),
      metric_value: numericOrNull(body.metric_value ?? body.value),
      period_end: body.period_end || null,
      period_start: body.period_start || null,
      team_id: membership.team_id,
      unit: truncateText(body.unit || "", 40),
      updated_at: now,
    };
  }
  if (kind === "signals") {
    return {
      body: truncateText(body.body || "", 6000),
      created_by: membership.user_id,
      loop_id: body.loop_id || body.discovery_loop_id || null,
      metadata: objectValue(body.metadata),
      run_id: body.run_id || null,
      signal_type: startupOfficeSignalType(body.signal_type || body.type),
      source: truncateText(body.source || "manual", 120),
      status: startupOfficeSignalStatus(body.status),
      team_id: membership.team_id,
      title: truncateText(body.title || "Untitled signal", 180),
      updated_at: now,
    };
  }
  throw new HTTPError(400, "unsupported startup office object");
}

function startupOfficeObjectPatch(kind, body) {
  const patch = { updated_at: nowISO() };
  if (kind === "assets") {
    for (const key of ["name", "kind", "body"]) {
      if (body[key] !== undefined) patch[key] = truncateText(body[key], key === "body" ? 30000 : 180);
    }
    if (body.metadata !== undefined) patch.metadata = objectValue(body.metadata);
    if (body.run_id !== undefined) patch.run_id = body.run_id || null;
    if (body.status !== undefined || body.archive) {
      patch.status = body.archive ? "archived" : startupOfficeAssetStatus(body.status);
    }
    return patch;
  }
  if (kind === "customers") {
    if (body.loop_id !== undefined || body.discovery_loop_id !== undefined) {
      patch.loop_id = body.loop_id || body.discovery_loop_id || null;
    }
    if (body.name !== undefined) patch.name = truncateText(body.name, 180);
    if (body.notes !== undefined) patch.notes = truncateText(body.notes, 6000);
    if (body.profile !== undefined) patch.profile = objectValue(body.profile);
    if (body.status !== undefined || body.archive) {
      patch.status = body.archive ? "archived" : startupOfficeCustomerStatus(body.status);
    }
    return patch;
  }
  if (kind === "metrics") {
    if (body.metric_key !== undefined || body.key !== undefined) {
      patch.metric_key = truncateText(body.metric_key || body.key, 120);
    }
    if (body.metric_value !== undefined || body.value !== undefined) {
      patch.metric_value = numericOrNull(body.metric_value ?? body.value);
    }
    for (const key of ["unit", "period_start", "period_end"]) {
      if (body[key] !== undefined) patch[key] = body[key];
    }
    if (body.metadata !== undefined) patch.metadata = objectValue(body.metadata);
    return patch;
  }
  if (kind === "signals") {
    if (body.loop_id !== undefined || body.discovery_loop_id !== undefined) {
      patch.loop_id = body.loop_id || body.discovery_loop_id || null;
    }
    if (body.run_id !== undefined) patch.run_id = body.run_id || null;
    if (body.signal_type !== undefined || body.type !== undefined) {
      patch.signal_type = startupOfficeSignalType(body.signal_type || body.type);
    }
    if (body.title !== undefined) patch.title = truncateText(body.title, 180);
    if (body.body !== undefined) patch.body = truncateText(body.body, 6000);
    if (body.source !== undefined) patch.source = truncateText(body.source, 120);
    if (body.metadata !== undefined) patch.metadata = objectValue(body.metadata);
    if (body.status !== undefined || body.archive) {
      patch.status = body.archive ? "archived" : startupOfficeSignalStatus(body.status);
    }
    return patch;
  }
  throw new HTTPError(400, "unsupported startup office object");
}

function numericOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

async function startupOfficeBetaOpsSnapshot(teamID) {
  const [billing, usage, billingDocuments, activationEvents, termsAcceptances] = await Promise.all([
    startupOfficeBilling(teamID),
    startupOfficeUsage(teamID),
    startupOfficeBillingDocuments(teamID),
    activationEventsForTeam(teamID, safeStartupOfficeRest),
    startupOfficeTermsAcceptances(teamID),
  ]);
  const terms = startupOfficeTermsSnapshot(termsAcceptances);
  const commercial = startupOfficeCommercialSnapshot({
    billing,
    documents: billingDocuments,
    termsAccepted: terms.accepted,
  });
  const entitlements = startupOfficeEntitlementSnapshot({
    billing,
    commercial,
    usage,
  });
  return {
    activation: startupOfficeActivationSnapshot(activationEvents),
    activation_events: activationEvents,
    billing,
    billing_documents: billingDocuments,
    commercial,
    entitlements,
    limits: {
      monthly_model_spend_cents: billing.monthly_model_spend_cents,
      monthly_run_limit: billing.monthly_run_limit,
      seat_limit: billing.seat_limit,
      storage_mb_limit: billing.storage_mb_limit,
    },
    terms,
    usage: {
      ...usage,
      model_spend_percent: percent(usage.model_spend_cents, billing.monthly_model_spend_cents),
      run_percent: percent(usage.runs, billing.monthly_run_limit),
      seat_percent: percent(usage.seats + usage.pending_invites, billing.seat_limit),
      storage_percent: percent(usage.storage_mb, billing.storage_mb_limit),
    },
  };
}

async function startupOfficeBillingDocuments(teamID, options = {}) {
  const rows = await safeStartupOfficeRest("startup_office_billing_documents", {
    query: {
      limit: String(clamp(Number(options.limit) || 20, 1, 100)),
      order: "created_at.desc",
      select: "*",
      team_id: `eq.${teamID}`,
    },
  });
  return rows.map(publicStartupOfficeBillingDocument);
}

async function startupOfficeTermsAcceptances(teamID, options = {}) {
  const rows = await safeStartupOfficeRest("startup_office_terms_acceptances", {
    query: {
      limit: String(clamp(Number(options.limit) || 10, 1, 100)),
      order: "accepted_at.desc",
      select: "*",
      team_id: `eq.${teamID}`,
    },
  });
  return rows.map(publicStartupOfficeTermsAcceptance).filter(Boolean);
}

async function startupOfficeBilling(teamID) {
  const rows = await safeStartupOfficeRest("workspace_billing", {
    query: {
      limit: "1",
      select: "*",
      team_id: `eq.${teamID}`,
    },
  });
  const billing = rows?.[0] || {};
  return {
    beta_agreement_url: billing.beta_agreement_url || "",
    billing_provider: startupOfficeBillingProviderValue(billing.billing_provider || "manual"),
    billing_state: startupOfficeBillingStateValue(billing.billing_state || "trial"),
    blocked_reason: billing.blocked_reason || "",
    laf_model_enabled: billing.laf_model_enabled !== false,
    last_paid_at: billing.last_paid_at || null,
    monthly_model_spend_cents: Number(billing.monthly_model_spend_cents || 20000),
    monthly_run_limit: Number(billing.monthly_run_limit || 50),
    payment_status: startupOfficePaymentStatusValue(billing.payment_status || billing.billing_state),
    plan: billing.plan || "trial",
    seat_limit: Number(billing.seat_limit || 5),
    storage_mb_limit: Number(billing.storage_mb_limit || 1024),
    support_notes: billing.support_notes || "",
    team_id: teamID,
    updated_at: billing.updated_at || null,
  };
}

async function upsertStartupOfficeBilling(teamID, patch) {
  const [billing] = await safeStartupOfficeRest("workspace_billing", {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=representation",
    query: { on_conflict: "team_id" },
    body: {
      ...patch,
      team_id: teamID,
      updated_at: nowISO(),
    },
  });
  return {
    ...(billing || patch),
    team_id: teamID,
  };
}

async function upsertStartupOfficeBillingDocument(membership, patch) {
  if (!patch) return null;
  const [document] = await safeStartupOfficeRest("startup_office_billing_documents", {
    method: "POST",
    body: {
      ...patch,
      created_by: patch.created_by || membership.user_id || null,
      team_id: membership.team_id,
    },
  });
  return publicStartupOfficeBillingDocument(document || patch);
}

async function upsertStartupOfficeTermsAcceptance(membership, patch) {
  const [acceptance] = await safeStartupOfficeRest("startup_office_terms_acceptances", {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=representation",
    query: { on_conflict: "team_id,terms_version" },
    body: {
      ...patch,
      team_id: membership.team_id,
      updated_at: nowISO(),
    },
  });
  return publicStartupOfficeTermsAcceptance(acceptance || { id: shortID(), ...patch });
}

async function startupOfficeUsage(teamID) {
  const [events, memberships, invites, storageBytes] = await Promise.all([
    safeStartupOfficeRest("startup_office_usage_events", {
      query: {
        limit: "1000",
        order: "created_at.desc",
        select: "*",
        team_id: `eq.${teamID}`,
      },
    }),
    safeStartupOfficeRest("memberships", {
      query: {
        select: "id",
        status: "eq.active",
        team_id: `eq.${teamID}`,
      },
    }),
    safeStartupOfficeRest("team_invites", {
      query: {
        select: "id",
        status: "eq.pending",
        team_id: `eq.${teamID}`,
      },
    }),
    startupOfficeStorageUsage(teamID),
  ]);
  return events.reduce(
    (out, event) => {
      out.model_spend_cents += Number(event.cost_cents || 0);
      out.runs += event.event_type === "model_run" ? 1 : 0;
      out.tool_calls += Number(event.tool_calls || 0);
      out.total_tokens += Number(event.total_tokens || 0);
      return out;
    },
    {
      model_spend_cents: 0,
      pending_invites: invites.length,
      runs: 0,
      seats: memberships.length,
      storage_bytes: storageBytes,
      storage_mb: storageBytes / 1024 / 1024,
      tool_calls: 0,
      total_tokens: 0,
    },
  );
}

const STARTUP_OFFICE_STORAGE_SOURCES = Object.freeze([
  ["startup_office_activation_events", "milestone,source_table,source_id,metadata"],
  ["company_profiles", "description,goals,priority,icp,offer,positioning,metadata"],
  ["startup_office_artifacts", "title,content,metadata"],
  ["startup_office_assets", "name,body,metadata"],
  ["startup_office_billing_documents", "document_type,status,reference_url,external_reference,notes,metadata"],
  ["startup_office_customers", "name,profile,notes"],
  ["startup_office_loops", "name,objective,policy"],
  ["startup_office_memory_pages", "slug,title,body,summary,provenance,sources,assumptions"],
  ["startup_office_metrics", "metric_key,unit,metadata"],
  ["startup_office_receipts", "summary,trace"],
  ["startup_office_runs", "title,objective,inputs,metadata,summary"],
  ["startup_office_signals", "source,title,body,metadata"],
  ["startup_office_terms_acceptances", "terms_version,privacy_version,dpa_version,ai_use_version,retention_version,deletion_version,metadata"],
]);

async function startupOfficeStorageUsage(teamID) {
  const rowsBySource = await Promise.all(
    STARTUP_OFFICE_STORAGE_SOURCES.map(([table, select]) =>
      safeStartupOfficeRest(table, {
        query: {
          limit: "1000",
          select,
          team_id: `eq.${teamID}`,
        },
      }),
    ),
  );
  return rowsBySource.flat().reduce((sum, row) => {
    return sum + Buffer.byteLength(JSON.stringify(row || {}), "utf8");
  }, 0);
}

async function startupOfficeStuckJobs(teamID) {
  return safeStartupOfficeRest("startup_office_worker_jobs", {
    query: {
      limit: "20",
      select: "*",
      status: "in.(queued,running,failed,dead_letter)",
      team_id: `eq.${teamID}`,
    },
  });
}

function percent(value, limit) {
  const denominator = Number(limit || 0);
  if (!denominator) return 0;
  return Math.round((Number(value || 0) / denominator) * 100);
}

async function startupOfficeLoops(teamID) {
  return startupOfficeRepository().loops(teamID);
}

async function startupOfficeRuns(teamID, options = {}) {
  return startupOfficeRepository().runs(teamID, options);
}

async function startupOfficeArtifacts(teamID, options = {}) {
  return startupOfficeRepository().artifacts(teamID, options);
}

async function startupOfficeApprovals(teamID, options = {}) {
  return startupOfficeRepository().approvals(teamID, options);
}

async function startupOfficeReceipts(teamID, options = {}) {
  return startupOfficeRepository().receipts(teamID, options);
}

async function ensureStartupOfficeLoop(membership, loopID) {
  return startupOfficeRepository().ensureLoop(membership, loopID);
}

async function findStartupOfficeApproval(teamID, approvalID) {
  return startupOfficeRepository().findApproval(teamID, approvalID);
}

async function createStartupOfficeReceipt(membership, body) {
  return startupOfficeRepository().createReceipt(membership, body);
}

async function safeStartupOfficeRest(table, options = {}) {
  return startupOfficeRepository().safeRest(table, options);
}

function isMissingStartupOfficeTableError(err, table) {
  return startupOfficeRepository().isMissingTableError(err, table);
}

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

async function handleHostedChannels(req, res) {
  return HOSTED_CONVERSATION_HANDLERS.channels(req, res);
}

async function handleHostedChannelGenerate(req, res) {
  return HOSTED_CONVERSATION_HANDLERS.channelGenerate(req, res);
}

async function handleHostedDMChannel(req, res) {
  return HOSTED_CONVERSATION_HANDLERS.dmChannel(req, res);
}

async function handleHostedMessages(req, res) {
  return HOSTED_CONVERSATION_HANDLERS.messages(req, res);
}

async function handleHostedHomeSessions(req, res) {
  return HOSTED_CONVERSATION_HANDLERS.homeSessions(req, res);
}

async function handleAuthUsers(req, res) {
  return HOSTED_MEMBER_HANDLERS.authUsers(req, res);
}

async function handleAuthMe(req, res) {
  return HOSTED_AUTH_HANDLERS.me(req, res);
}

async function handleAuthMePassword(req, res) {
  return HOSTED_AUTH_HANDLERS.password(req, res);
}

async function handleAuthLogin(req, res) {
  return HOSTED_AUTH_HANDLERS.login(req, res);
}

async function handleAuthSignup(req, res) {
  return HOSTED_SIGNUP_HANDLERS.signup(req, res);
}

async function handlePermissions(req, res) {
  return HOSTED_MEMBER_HANDLERS.permissions(req, res);
}

async function handleInvites(req, res) {
  return HOSTED_INVITE_HANDLERS.invites(req, res);
}

async function handleInviteLookup(req, res) {
  return HOSTED_INVITE_HANDLERS.inviteLookup(req, res);
}

async function handleInviteAccept(req, res) {
  return HOSTED_INVITE_HANDLERS.inviteAccept(req, res);
}

function publicTeam(row) {
  if (!row) return undefined;
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function truncateText(value, max) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}...` : text;
}

function isHuman(slug) {
  return slug === "human" || slug === "you";
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function shortID() {
  return crypto.randomBytes(5).toString("hex");
}

function nowISO() {
  return new Date().toISOString();
}

function truthy(value) {
  return value === true || value === "true" || value === "1" || value === "yes";
}

function isUUID(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function arrayOrEmpty(value) {
  return Array.isArray(value) ? value : [];
}

function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  );
}

module.exports.__test = {
  resetRateLimits() {
    rateLimitBuckets.clear();
  },
};
