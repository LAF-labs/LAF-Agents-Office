const crypto = require("node:crypto");
const {
  createHostedAuthHandlers,
} = require("./lib/hosted/authHandlers");
const {
  createHostedConversationHandlers,
} = require("./lib/hosted/conversationHandlers");
const {
  createHostedInviteHandlers,
} = require("./lib/hosted/inviteHandlers");
const {
  createHostedMemberHandlers,
} = require("./lib/hosted/memberHandlers");
const {
  createHostedSignupHandlers,
} = require("./lib/hosted/signupHandlers");
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
  createStartupOfficeProfileHandlers,
} = require("./lib/startup-office/profileHandlers");
const {
  createStartupOfficeRepository,
} = require("./lib/startup-office/repositories");
const {
  dispatchStartupOfficeRoute,
} = require("./lib/startup-office/dispatcher");
const {
  createStartupOfficeOperationsHandlers,
} = require("./lib/startup-office/operationsHandlers");
const {
  createStartupOfficeObjectHandlers,
} = require("./lib/startup-office/objectHandlers");
const {
  createStartupOfficeQueryHandlers,
} = require("./lib/startup-office/queryHandlers");
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
  createStartupOfficeModelClient,
} = require("../workers/startup-office/modelClient");
const {
  runStartupOfficeLoop,
} = require("../workers/startup-office/loopEngine");
const {
  applyStartupOfficeMemoryPromotion,
} = require("../workers/startup-office/wikiWriter");

const MAX_REQUEST_BODY_BYTES = 512 * 1024;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMITS = {
  authSignup: 12,
};
const HOSTED_WEB_COMMANDS = Object.freeze([
  { name: "1o1", description: "Open a direct conversation with an agent", webSupported: true },
  { name: "ask", description: "Ask the team lead", webSupported: true },
  { name: "approvals", description: "Review founder approval queue", webSupported: true },
  { name: "clear", description: "Clear messages in this view", webSupported: true },
  { name: "growth", description: "Open Startup Office", webSupported: true },
  { name: "help", description: "Show commands and keys", webSupported: true },
  { name: "loops", description: "Open operating loops", webSupported: true },
  { name: "remember", description: "Store a fact in memory", webSupported: true },
  { name: "receipts", description: "Open run receipts", webSupported: true },
  { name: "requests", description: "Open requests", webSupported: true },
  { name: "search", description: "Search messages and knowledge", webSupported: true },
  { name: "skills", description: "Open skills", webSupported: true },
  { name: "threads", description: "See every active thread", webSupported: true },
]);
const HOSTED_WEB_COMMAND_NAMES = new Set(
  HOSTED_WEB_COMMANDS.map((command) => command.name),
);
const DEFAULT_PROFILE_AVATAR_ID = "human";
const PROFILE_AVATAR_IDS = new Set([
  "human",
  "ceo",
  "pm",
  "fe",
  "be",
  "designer",
  "cmo",
  "cro",
  "qa",
  "content",
]);
const HOSTED_PERMISSION_GUARDS = createHostedPermissionGuards({
  createHTTPError: startupOfficeHTTPError,
});
const requireAdminRole = HOSTED_PERMISSION_GUARDS.requireAdminRole;
const requirePermission = HOSTED_PERMISSION_GUARDS.requirePermission;

const STARTUP_OFFICE_WORKSPACE_CONFIG_HANDLERS =
  createStartupOfficeWorkspaceConfigHandlers({
    clamp,
    createHTTPError: startupOfficeHTTPError,
    nowISO,
    objectValue,
    readBody,
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
  writeAuditEvent,
  writeJSON,
});

const HOSTED_INVITE_HANDLERS = createHostedInviteHandlers({
  createHTTPError: startupOfficeHTTPError,
  normalizeRole,
  nowISO,
  originFor,
  readBody,
  requirePermission,
  requireUser,
  rest,
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
  shortID,
  slugify,
  truncateText,
  writeJSON,
});

const STARTUP_OFFICE_OPERATIONS_HANDLERS = createStartupOfficeOperationsHandlers({
  clamp,
  createHTTPError: startupOfficeHTTPError,
  objectValue,
  readBody,
  requireAdminRole,
  requirePermission,
  requireUser,
  safeStartupOfficeRest,
  startupOfficeApprovalPolicy,
  startupOfficeApprovals,
  startupOfficeBetaOpsSnapshot,
  startupOfficeBillingStateValue,
  startupOfficeRuns,
  startupOfficeStuckJobs,
  truncateText,
  upsertStartupOfficeBilling,
  upsertWorkspaceSettings,
  workspaceSettings,
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

const STARTUP_OFFICE_WORKFLOW_HANDLERS = createStartupOfficeWorkflowHandlers({
  applyStartupOfficeMemoryPromotion,
  companyProfileSnapshot,
  createHTTPError: startupOfficeHTTPError,
  createStartupOfficeReceipt,
  ensureStartupOfficeLoop,
  findStartupOfficeApproval,
  nowISO,
  objectValue,
  publicStartupOfficeApproval,
  publicStartupOfficeArtifact,
  publicStartupOfficeRun,
  readBody,
  requirePermission,
  requireUser,
  runStartupOfficeLoop,
  safeStartupOfficeRest,
  shortID,
  startupOfficeApprovals,
  startupOfficeArtifacts,
  startupOfficeBetaOpsSnapshot,
  startupOfficeModelClient,
  startupOfficeReceipts,
  startupOfficeRepository,
  truncateText,
  writeAuditEvent,
  writeJSON,
});

const STARTUP_OFFICE_ROUTE_HANDLERS = Object.freeze({
  approvalAction: STARTUP_OFFICE_WORKFLOW_HANDLERS.approvalAction,
  approvals: STARTUP_OFFICE_QUERY_HANDLERS.approvals,
  artifactObjectAction: STARTUP_OFFICE_OBJECT_HANDLERS.artifactObjectAction,
  betaDashboard: STARTUP_OFFICE_OPERATIONS_HANDLERS.betaDashboard,
  billing: STARTUP_OFFICE_OPERATIONS_HANDLERS.billing,
  companyProfile: handleCompanyProfile,
  demoSeed: handleStartupOfficeDemoSeed,
  export: STARTUP_OFFICE_QUERY_HANDLERS.export,
  growthSummary: STARTUP_OFFICE_QUERY_HANDLERS.growthSummary,
  loopRun: STARTUP_OFFICE_WORKFLOW_HANDLERS.loopRun,
  loops: STARTUP_OFFICE_QUERY_HANDLERS.loops,
  objectCollection: STARTUP_OFFICE_OBJECT_HANDLERS.objectCollection,
  objectItem: STARTUP_OFFICE_OBJECT_HANDLERS.objectItem,
  policy: STARTUP_OFFICE_OPERATIONS_HANDLERS.policy,
  receipts: STARTUP_OFFICE_QUERY_HANDLERS.receipts,
  run: STARTUP_OFFICE_WORKFLOW_HANDLERS.run,
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

const ALLOWED_ORIGINS = normalizeAllowedOrigins(
  process.env.LAF_OFFICE_ALLOWED_ORIGINS || "",
);

function normalizeAllowedOrigins(value) {
  return [
    ...new Set(
      String(value || "")
        .split(",")
        .map(normalizeAllowedOrigin)
        .filter(Boolean),
    ),
  ];
}

function normalizeAllowedOrigin(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    return "";
  }
  if (
    !parsed.hostname ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  ) {
    return "";
  }
  const allowLocalhost = allowLocalHostedURLs();
  if (!allowLocalhost && parsed.protocol !== "https:") return "";
  if (!allowLocalhost && isPrivateHostedHostname(parsed.hostname)) return "";
  const protocol = allowLocalhost ? parsed.protocol : "https:";
  return `${protocol}//${parsed.host}`;
}

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
    if (path === "health" && req.method === "GET") {
      writeJSON(res, 200, {
        service: "laf-hosted-api",
        status: "ok",
      });
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
      handlers: STARTUP_OFFICE_ROUTE_HANDLERS,
      path,
      req,
      res,
    })) {
      return;
    }
    if (path === "humans" && req.method === "GET") {
      await handleHostedHumans(req, res);
      return;
    }
    if (path === "teams" && req.method === "GET") {
      await handleHostedTeams(req, res);
      return;
    }
    if (path === "office-members") {
      await handleHostedOfficeMembers(req, res);
      return;
    }
    if (path === "office-members/generate" && req.method === "POST") {
      await handleHostedOfficeMemberGenerate(req, res);
      return;
    }
    if (path === "members" && req.method === "GET") {
      await handleHostedChannelMembers(req, res);
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
      writeJSON(res, 200, { ok: true });
      return;
    }
    if (path === "home-sessions") {
      await handleHostedHomeSessions(req, res);
      return;
    }
    if (path === "commands" && req.method === "GET") {
      writeJSON(res, 200, HOSTED_WEB_COMMANDS);
      return;
    }
    if (path === "commands/run" && req.method === "POST") {
      await handleHostedCommandRun(req, res);
      return;
    }
    if (path === "requests" && req.method === "GET") {
      writeJSON(res, 200, { requests: [] });
      return;
    }
    if (path === "requests/answer" && req.method === "POST") {
      writeJSON(res, 200, { ok: true });
      return;
    }
    if (["actions", "signals", "decisions", "watchdogs"].includes(path) && req.method === "GET") {
      writeJSON(res, 200, { [path]: [] });
      return;
    }
    if (path === "scheduler" && req.method === "GET") {
      writeJSON(res, 200, { jobs: [] });
      return;
    }
    if (path === "usage" && req.method === "GET") {
      writeJSON(res, 200, { total: { cost_usd: 0, total_tokens: 0 } });
      return;
    }
    if (path === "agent-logs" && req.method === "GET") {
      writeJSON(res, 200, { logs: [] });
      return;
    }
    if (path === "memory") {
      await handleHostedMemory(req, res);
      return;
    }
    if (path === "projects/repo-readiness" && req.method === "GET") {
      await handleHostedProjectRepoReadiness(req, res);
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
      await handleAuditEvents(req, res);
      return;
    }
    if (path === "model/availability" && req.method === "GET") {
      await handleModelAvailability(req, res);
      return;
    }
    if (path === "orchestration/intent" && req.method === "POST") {
      await handleOrchestrationIntent(req, res);
      return;
    }
    if (path === "orchestration/confirm" && req.method === "POST") {
      await handleOrchestrationConfirm(req, res);
      return;
    }
    if (path === "projects") {
      await handleProjects(req, res);
      return;
    }
    if (path === "tasks") {
      await handleTasks(req, res);
      return;
    }
    if (path === "skills") {
      await handleSkills(req, res);
      return;
    }
    const skillInvokeMatch = path.match(/^skills\/([^/]+)\/invoke$/);
    if (skillInvokeMatch && req.method === "POST") {
      await handleSkillInvoke(req, res, decodeURIComponent(skillInvokeMatch[1]));
      return;
    }
    writeJSON(res, 404, { error: "hosted API route not found" });
  } catch (err) {
    const status = err instanceof HTTPError ? err.status : 500;
    let message;
    if (err instanceof HTTPError) {
      // Only forward HTTPError.message when explicitly marked safe. Upstream
      // (Supabase/auth) detail is wrapped with safe=false so we expose a
      // generic message and log the real one server-side.
      message = err.safe === false ? defaultMessageForStatus(status) : err.message;
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
    writeJSON(res, status, { error: message });
  }
};

function defaultMessageForStatus(status) {
  if (status === 400) return "invalid request";
  if (status === 401) return "authentication required";
  if (status === 403) return "forbidden";
  if (status === 404) return "not found";
  if (status === 409) return "conflict";
  if (status === 410) return "gone";
  if (status === 429) return "rate limited";
  if (status >= 500) return "upstream error";
  return "request failed";
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
  const method = options.method || "GET";
  const url = new URL(supabaseURL(`/rest/v1/${table}`));
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
  const response = await fetch(supabaseURL(`/rest/v1/rpc/${name}`), {
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
  const token = authToken(req);
  if (!token) throw new HTTPError(401, "authentication required");
  const user = await authFetch("user", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const membership = await activeMembership(user.id);
  if (!membership) throw new HTTPError(403, "active team membership required");
  const team = await getTeam(membership.team_id);
  return { membership, team, token, user };
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

function publicUser(user, membership) {
  return {
    id: user.id,
    email: user.email || "",
    name: user.user_metadata?.name || user.email || "User",
    avatar_id: normalizeProfileAvatarID(user.user_metadata?.avatar_id),
    permissions: normalizePermissionOverride(membership.permissions),
    team_id: membership.team_id,
    role: normalizeRole(membership.role),
    status: membership.status || "active",
    created_at: user.created_at,
    updated_at: user.updated_at,
    last_login_at: user.last_sign_in_at,
  };
}

function normalizeProfileAvatarID(value) {
  const id = String(value || "").trim().toLowerCase();
  return PROFILE_AVATAR_IDS.has(id) ? id : DEFAULT_PROFILE_AVATAR_ID;
}

function normalizeModelMode(raw) {
  const value = String(raw || "").trim();
  return ["laf_model", "record_only"].includes(value)
    ? value
    : "record_only";
}

async function modelAvailabilityForMembership(membership) {
  let billingRows = [];
  try {
    billingRows = await rest("workspace_billing", {
      query: { team_id: `eq.${membership.team_id}`, select: "*", limit: "1" },
    });
  } catch {
    billingRows = [];
  }
  const billing = billingRows?.[0] || null;
  const paid = billing
    ? Boolean(billing.laf_model_enabled)
    : truthy(process.env.LAF_OFFICE_WORKSPACE_PAID) ||
      truthy(process.env.LAF_OFFICE_MANAGED_MODEL_ENABLED);
  const lafAllowed = paid && hasPermission(membership, "model:use_laf");
  const allowedModes = ["record_only"];
  if (lafAllowed) allowedModes.unshift("laf_model");
  const defaultMode = lafAllowed ? "laf_model" : "record_only";
  return {
    default_mode: defaultMode,
    allowed_modes: allowedModes,
    laf_model: {
      available: lafAllowed,
      reason: lafAllowed
        ? ""
        : paid
          ? "permission required: model:use_laf"
          : "workspace is not on a paid managed-model plan",
    },
    record_only: {
      available: true,
      reason: "records chat without agent execution",
    },
    reason: billing
      ? "workspace billing loaded from DB"
      : "workspace billing uses environment fallback",
  };
}

async function resolveAllowedModelMode(membership, rawMode) {
  const mode = normalizeModelMode(rawMode);
  if (mode === "record_only") return mode;
  const availability = await modelAvailabilityForMembership(membership);
  if (!availability.allowed_modes.includes(mode)) {
    throw new HTTPError(403, availability[mode]?.reason || `model mode unavailable: ${mode}`);
  }
  return mode;
}

async function handleAuditEvents(req, res) {
  const { membership } = await requireUser(req);
  requirePermission(membership, "audit:read");
  const limit = clamp(Number(req.query?.limit) || 100, 1, 500);
  const beforeRaw = String(req.query?.before || "").trim();
  let beforeISO = "";
  if (beforeRaw) {
    const parsed = new Date(beforeRaw);
    if (Number.isNaN(parsed.getTime())) {
      throw new HTTPError(400, "before must be an ISO-8601 timestamp");
    }
    beforeISO = parsed.toISOString();
  }
  const query = {
    order: "created_at.desc",
    select: "*",
    team_id: `eq.${membership.team_id}`,
    limit: String(limit),
  };
  if (beforeISO) query.created_at = `lt.${beforeISO}`;
  const rows = await rest("audit_events", { query });
  writeJSON(res, 200, {
    events: (rows || []).map((row) => ({
      action: row.action,
      actor_user_id: row.actor_user_id,
      created_at: row.created_at,
      id: row.id,
      metadata: row.metadata || {},
      target_id: row.target_id || "",
      target_type: row.target_type || "",
    })),
  });
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
    order: "created_at.desc",
    select: "*",
    team_id: `eq.${teamID}`,
  };
  if (options.status) query.status = `eq.${options.status}`;
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
      team_id: membership.team_id,
      updated_at: now,
    };
  }
  if (kind === "customers") {
    return {
      created_by: membership.user_id,
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
    };
  }
  if (kind === "signals") {
    return {
      body: truncateText(body.body || "", 6000),
      created_by: membership.user_id,
      metadata: objectValue(body.metadata),
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
    return patch;
  }
  if (kind === "customers") {
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

function startupOfficeCustomerStatus(value) {
  const raw = String(value || "").trim().toLowerCase();
  return ["lead", "interviewing", "qualified", "customer", "lost", "archived"].includes(raw)
    ? raw
    : "lead";
}

function startupOfficeSignalStatus(value) {
  const raw = String(value || "").trim().toLowerCase();
  return ["new", "triaged", "used", "archived"].includes(raw) ? raw : "new";
}

function numericOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

async function startupOfficeBetaOpsSnapshot(teamID) {
  const [billing, usage] = await Promise.all([
    startupOfficeBilling(teamID),
    startupOfficeUsage(teamID),
  ]);
  return {
    billing,
    limits: {
      monthly_model_spend_cents: billing.monthly_model_spend_cents,
      monthly_run_limit: billing.monthly_run_limit,
      storage_mb_limit: billing.storage_mb_limit,
    },
    usage: {
      ...usage,
      model_spend_percent: percent(usage.model_spend_cents, billing.monthly_model_spend_cents),
      run_percent: percent(usage.runs, billing.monthly_run_limit),
    },
  };
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
    billing_state: startupOfficeBillingStateValue(billing.billing_state || "trial"),
    laf_model_enabled: billing.laf_model_enabled !== false,
    monthly_model_spend_cents: Number(billing.monthly_model_spend_cents || 20000),
    monthly_run_limit: Number(billing.monthly_run_limit || 50),
    plan: billing.plan || "trial",
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

async function startupOfficeUsage(teamID) {
  const events = await safeStartupOfficeRest("startup_office_usage_events", {
    query: {
      limit: "1000",
      order: "created_at.desc",
      select: "*",
      team_id: `eq.${teamID}`,
    },
  });
  return events.reduce(
    (out, event) => {
      out.model_spend_cents += Number(event.cost_cents || 0);
      out.runs += event.event_type === "model_run" ? 1 : 0;
      out.total_tokens += Number(event.total_tokens || 0);
      return out;
    },
    { model_spend_cents: 0, runs: 0, total_tokens: 0 },
  );
}

async function startupOfficeStuckJobs(teamID) {
  return safeStartupOfficeRest("startup_office_worker_jobs", {
    query: {
      limit: "20",
      select: "*",
      status: "in.(queued,running)",
      team_id: `eq.${teamID}`,
    },
  });
}

function startupOfficeBillingStateValue(value) {
  const raw = String(value || "").trim().toLowerCase();
  return ["trial", "active", "past_due", "paused", "comped", "canceled"].includes(raw)
    ? raw
    : "trial";
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

async function handleHostedHumans(req, res) {
  const { membership, user } = await requireUser(req);
  writeJSON(res, 200, {
    humans: [
      {
        email: user.email || "",
        name: user.user_metadata?.name || user.email || "You",
        slug: "human",
        team_id: membership.team_id,
      },
    ],
  });
}

async function handleHostedTeams(req, res) {
  const { team } = await requireUser(req);
  writeJSON(res, 200, { teams: [publicTeam(team)] });
}

async function handleHostedOfficeMembers(req, res) {
  const { user } = await requireUser(req);
  if (req.method === "GET") {
    writeJSON(res, 200, { members: hostedOfficeMembers(user) });
    return;
  }
  if (req.method !== "POST") throw new HTTPError(405, "method not allowed");
  const body = await readBody(req);
  const member = hostedOfficeMember({
    built_in: false,
    name: body.name || body.slug || "Agent",
    role: body.role || "",
    slug: body.slug || slugify(body.name || "agent") || `agent-${shortID()}`,
  });
  writeJSON(res, 200, { member });
}

async function handleHostedOfficeMemberGenerate(req, res) {
  await requireUser(req);
  const body = await readBody(req);
  const prompt = truncateText(body.prompt || "", 120);
  const slug = slugify(prompt) || `agent-${shortID()}`;
  writeJSON(res, 200, {
    expertise: [],
    name: prompt || "Specialist Agent",
    personality: "",
    role: prompt || "Specialist",
    slug,
  });
}

async function handleHostedChannelMembers(req, res) {
  const { user } = await requireUser(req);
  writeJSON(res, 200, { members: hostedOfficeMembers(user) });
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

async function handleHostedCommandRun(req, res) {
  await requireUser(req);
  const body = await readBody(req);
  const commandName = hostedSlashCommandName(body.input);
  if (!commandName) {
    throw new HTTPError(400, "slash command input is required");
  }
  if (HOSTED_WEB_COMMAND_NAMES.has(commandName)) {
    throw new HTTPError(400, "slash command is handled directly in the web workspace");
  }
  throw new HTTPError(400, "slash command is not available in the hosted workspace");
}

function hostedSlashCommandName(input) {
  const firstToken = String(input || "").trim().split(/\s+/)[0] || "";
  if (!firstToken.startsWith("/")) return "";
  return firstToken.slice(1).toLowerCase();
}

async function handleHostedMemory(req, res) {
  await requireUser(req);
  if (req.method === "GET") {
    writeJSON(res, 200, { memory: {}, namespaces: [] });
    return;
  }
  if (req.method === "POST") {
    writeJSON(res, 200, { ok: true });
    return;
  }
  throw new HTTPError(405, "method not allowed");
}

async function handleHostedProjectRepoReadiness(req, res) {
  const { membership } = await requireUser(req);
  const projectID = String(req.query?.id || req.query?.project_id || "").trim();
  const project = projectID
    ? await findProject(membership.team_id, projectID).catch(() => null)
    : null;
  let repoURL = "";
  try {
    repoURL = normalizeGitHubRepoURL(project?.github_repo_url || "");
  } catch {
    repoURL = "";
  }
  writeJSON(res, 200, {
    readiness: {
      can_create_coding_tasks: Boolean(repoURL),
      default_branch: "",
      message: repoURL
        ? "Repository URL is configured for cloud workspace reference."
        : "No GitHub repository is configured for this project yet.",
      project_id: project?.local_id || project?.id || projectID,
      repo_url: repoURL,
      status: repoURL ? "ready" : "missing_repo",
    },
  });
}

function hostedOfficeMembers(user) {
  return [
    hostedOfficeMember({
      built_in: true,
      name: user.user_metadata?.name || user.email || "You",
      role: "Human owner",
      slug: "human",
    }),
    hostedOfficeMember({ built_in: true, name: "CEO", role: "Company lead", slug: "ceo" }),
    hostedOfficeMember({ built_in: true, name: "PM", role: "Product manager", slug: "pm" }),
    hostedOfficeMember({ built_in: true, name: "Frontend Engineer", role: "Frontend", slug: "fe" }),
    hostedOfficeMember({ built_in: true, name: "Backend Engineer", role: "Backend", slug: "be" }),
    hostedOfficeMember({ built_in: true, name: "Reviewer", role: "Reviewer", slug: "reviewer" }),
  ];
}

function hostedOfficeMember(member) {
  return {
    activity: "",
    built_in: Boolean(member.built_in),
    detail: "",
    name: String(member.name || member.slug || "Agent"),
    provider: { kind: "claude-code" },
    role: String(member.role || ""),
    slug: String(member.slug || "agent"),
    status: "idle",
  };
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

async function handleProjects(req, res) {
  const { membership } = await requireUser(req);
  if (req.method === "GET") {
    const rows = await rest("projects", {
      query: {
        team_id: `eq.${membership.team_id}`,
        select: "*",
        order: "updated_at.desc",
      },
    });
    writeJSON(res, 200, { projects: rows.map(publicProject) });
    return;
  }
  if (req.method !== "POST") throw new HTTPError(405, "method not allowed");
  const body = await readBody(req);
  if (body.action === "update") {
    requirePermission(membership, "project:update");
    const project = await findProject(membership.team_id, body.id);
    const [updated] = await rest("projects", {
      method: "PATCH",
      query: { id: `eq.${project.id}` },
      body: projectPayload(body),
    });
    await writeAuditEvent(membership, "project.updated", "project", updated.id, {
      status: updated.status,
    });
    writeJSON(res, 200, { project: publicProject(updated) });
    return;
  }
  if (body.action !== "create") throw new HTTPError(400, "unsupported action");
  requirePermission(membership, "project:create");

  const localID = await uniqueProjectLocalID(
    membership.team_id,
    body.id || body.name,
  );
  const [project] = await rest("projects", {
    method: "POST",
    body: {
      ...projectPayload(body),
      local_id: localID,
      name: String(body.name || localID),
      team_id: membership.team_id,
      status: body.status || "active",
      created_by: membership.user_id,
    },
  });
  await writeAuditEvent(membership, "project.created", "project", project.id, {
    name: project.name,
  });
  writeJSON(res, 200, { project: publicProject(project) });
}

function projectPayload(body) {
  const payload = {};
  for (const key of [
    "name",
    "description",
    "additional_info",
    "channel",
    "lead_agent",
    "github_repo_url",
    "recipe_filename",
    "recipe_markdown",
    "status",
  ]) {
    if (body[key] !== undefined) {
      payload[key] =
        key === "github_repo_url" ? normalizeGitHubRepoURL(body[key]) : body[key];
    }
  }
  if (body.recipe_markdown !== undefined) payload.recipe_updated_at = nowISO();
  return payload;
}

async function uniqueProjectLocalID(teamID, seed) {
  const base = slugify(seed) || `project-${shortID()}`;
  const existing = await rest("projects", {
    query: {
      team_id: `eq.${teamID}`,
      local_id: `eq.${base}`,
      select: "id",
      limit: "1",
    },
  });
  return existing?.length ? `${base}-${shortID()}` : base;
}

async function handleTasks(req, res) {
  const { membership } = await requireUser(req);
  if (req.method === "GET") {
    const project = req.query.project_id
      ? await findProject(membership.team_id, req.query.project_id)
      : null;
    const query = {
      team_id: `eq.${membership.team_id}`,
      select: "*",
      order: "updated_at.desc",
    };
    if (project) query.project_id = `eq.${project.id}`;
    if (req.query.status) {
      query.status = `eq.${req.query.status}`;
    } else if (!truthy(req.query.include_done)) {
      query.status = "not.in.(done,canceled)";
    }
    const rows = await rest("tasks", { query });
    const projects = await projectMap(membership.team_id);
    writeJSON(res, 200, {
      tasks: rows.map((task) => publicTask(task, projects)),
    });
    return;
  }
  if (req.method !== "POST") throw new HTTPError(405, "method not allowed");

  const body = await readBody(req);
  const action = body.action || "create";
  if (action === "create") {
    requirePermission(membership, "task:create");
    if (body.owner && !isHuman(body.owner)) requirePermission(membership, "task:execute_agent");
    const result = await createTask(membership, body);
    writeJSON(res, 200, result);
    return;
  }
  const task = await findTask(membership.team_id, body.id);
  let updated;
  if (action === "update") {
    requirePermission(membership, "task:update");
    if (body.model_mode !== undefined) {
      body.model_mode = await resolveAllowedModelMode(membership, body.model_mode);
    }
    if (body.project_id) {
      const nextProject = await findProject(membership.team_id, body.project_id);
      body.project_id = nextProject.id;
    }
    [updated] = await rest("tasks", {
      method: "PATCH",
      query: { id: `eq.${task.id}` },
      body: taskUpdatePayload(body),
    });
  } else if (action === "reassign") {
    requirePermission(membership, "task:assign");
    if (body.owner && !isHuman(body.owner)) requirePermission(membership, "task:execute_agent");
    const modelMode =
      body.model_mode === undefined
        ? normalizeModelMode(task.model_mode)
        : await resolveAllowedModelMode(membership, body.model_mode);
    [updated] = await rest("tasks", {
      method: "PATCH",
      query: { id: `eq.${task.id}` },
      body: {
        assignee_id: body.owner || null,
        assignee_type: body.owner ? (isHuman(body.owner) ? "human" : "agent") : "none",
        model_mode: modelMode,
        owner: body.owner || "",
        status: body.owner && !isHuman(body.owner) ? "in_progress" : "open",
        updated_at: nowISO(),
      },
    });
  } else {
    requirePermission(membership, "task:change_status");
    if (body.model_mode !== undefined) {
      body.model_mode = await resolveAllowedModelMode(membership, body.model_mode);
    }
    [updated] = await rest("tasks", {
      method: "PATCH",
      query: { id: `eq.${task.id}` },
      body: taskStatusPayload(action, body),
    });
  }
  const project = updated.project_id
    ? await getProjectByID(membership.team_id, updated.project_id)
    : null;
  const projects = await projectMap(membership.team_id);
  writeJSON(res, 200, {
    task: publicTask(updated, projects),
  });
}

async function createTask(membership, body) {
  const project = body.project_id
    ? await findProject(membership.team_id, body.project_id)
    : null;
  const owner = String(body.owner || "").trim();
  const assigneeID = String(body.assignee_id || owner || "").trim();
  const assigneeType =
    body.assignee_type || (assigneeID ? (isHuman(assigneeID) ? "human" : "agent") : "none");
  const status = body.status || (owner && !isHuman(owner) ? "in_progress" : "open");
  const modelMode = await resolveAllowedModelMode(membership, body.model_mode);
  const [task] = await rest("tasks", {
    method: "POST",
    body: {
      blocked: false,
      assignee_id: assigneeID || null,
      assignee_type: assigneeType,
      channel: body.channel || project?.channel || "general",
      created_by: membership.user_id,
      details: body.details || "",
      human_details: body.human_details || body.details || "",
      human_owner_user_id: body.human_owner_user_id || membership.user_id,
      local_id: body.id || `task-${shortID()}`,
      model_mode: modelMode,
      owner,
      project_id: project?.id || null,
      status,
      task_type: body.task_type || "",
      team_id: membership.team_id,
      thread_id: body.thread_id || "",
      title: body.title || "Untitled task",
    },
  });
  await writeAuditEvent(membership, "task.created", "task", task.id, {
    model_mode: task.model_mode,
    owner: task.owner,
  });
  const projects = await projectMap(membership.team_id);
  return {
    task: publicTask(task, projects),
  };
}

function taskUpdatePayload(body) {
  const payload = { updated_at: nowISO() };
  for (const key of [
    "title",
    "details",
    "human_details",
    "project_id",
    "channel",
    "owner",
    "assignee_type",
    "assignee_id",
    "human_owner_user_id",
    "model_mode",
    "task_type",
  ]) {
    if (body[key] !== undefined) payload[key] = body[key];
  }
  if (body.clear_details) {
    payload.details = "";
    payload.human_details = "";
  }
  if (payload.owner !== undefined && payload.assignee_id === undefined) {
    payload.assignee_id = payload.owner || null;
    payload.assignee_type = payload.owner ? (isHuman(payload.owner) ? "human" : "agent") : "none";
  }
  if (payload.model_mode !== undefined) payload.model_mode = normalizeModelMode(payload.model_mode);
  return payload;
}

function taskStatusPayload(action, body) {
  const payload = { updated_at: nowISO() };
  if (action === "release") {
    payload.owner = "";
    payload.assignee_id = null;
    payload.assignee_type = "none";
    payload.status = "open";
    payload.blocked = false;
  } else if (action === "review") {
    payload.status = "review";
  } else if (action === "block") {
    payload.status = "blocked";
    payload.blocked = true;
  } else if (action === "complete") {
    payload.status = "done";
    payload.blocked = false;
    payload.delivered_at = nowISO();
  } else if (action === "cancel") {
    payload.status = "canceled";
  } else {
    throw new HTTPError(400, "unsupported task action");
  }
  for (const key of ["delivery_url", "delivery_summary"]) {
    if (body[key] !== undefined) payload[key] = body[key];
  }
  return payload;
}

async function handleModelAvailability(req, res) {
  const { membership } = await requireUser(req);
  writeJSON(res, 200, await modelAvailabilityForMembership(membership));
}

async function handleOrchestrationIntent(req, res) {
  const { membership } = await requireUser(req);
  const body = await readBody(req);
  const message = String(body.message || "").trim();
  if (!message) throw new HTTPError(400, "message is required");
  const intent = buildOrchestrationIntent(message, {
    model_mode: body.model_mode,
    project_id: body.project_id,
  });
  for (const permission of intent.required_permissions) {
    requirePermission(membership, permission);
  }
  await persistOrchestrationIntent(membership, intent);
  await writeAuditEvent(membership, "orchestration.intent", "intent", intent.id, {
    type: intent.type,
  });
  writeJSON(res, 200, { intent });
}

async function persistOrchestrationIntent(membership, intent) {
  if (!intent.requires_confirmation || intent.status !== "pending") return null;
  const [row] = await rest("orchestration_intents", {
    method: "POST",
    body: {
      id: intent.id,
      team_id: membership.team_id,
      requested_by: membership.user_id,
      type: intent.type,
      risk: intent.risk || "low",
      summary: intent.summary || "",
      proposed_actions: Array.isArray(intent.proposed_actions) ? intent.proposed_actions : [],
      required_permissions: Array.isArray(intent.required_permissions)
        ? intent.required_permissions
        : [],
      status: "pending",
      created_at: intent.created_at || nowISO(),
    },
  });
  return row || null;
}

function buildOrchestrationIntent(message, context = {}) {
  const id = crypto.randomUUID ? crypto.randomUUID() : shortID();
  const now = nowISO();
  const lower = message.toLowerCase();
  const projectMatch = message.match(/(?:create|new|make|add)\s+(?:a\s+)?project\s+["']?([^"'\n]+)["']?/i);
  const taskMatch = message.match(/(?:create|new|make|add)\s+(?:a\s+)?(?:task|work item)\s+["']?([^"'\n]+)["']?/i);
  if (projectMatch || (message.includes("프로젝트") && (message.includes("만들") || message.includes("생성")))) {
    const name = (projectMatch?.[1] || message.replace(/프로젝트|만들어|만들|생성/g, "")).trim() || "New Project";
    return {
      id,
      type: "project.create",
      risk: "medium",
      summary: `Create project: ${name}`,
      proposed_actions: [{
        method: "POST",
        path: "/projects",
        body: { action: "create", name },
      }],
      required_permissions: ["project:create"],
      status: "pending",
      requires_confirmation: true,
      created_at: now,
    };
  }
  if (taskMatch || ((lower.includes("task") || message.includes("태스크") || message.includes("작업")) && (lower.includes("create") || lower.includes("add") || message.includes("만들") || message.includes("생성")))) {
    const title = (taskMatch?.[1] || message).trim();
    const actionBody = {
      action: "create",
      title,
      model_mode: normalizeModelMode(context.model_mode),
    };
    if (context.project_id) actionBody.project_id = context.project_id;
    return {
      id,
      type: "task.create",
      risk: "medium",
      summary: `Create task: ${title}`,
      proposed_actions: [{
        method: "POST",
        path: "/tasks",
        body: actionBody,
      }],
      required_permissions: ["task:create"],
      status: "pending",
      requires_confirmation: true,
      created_at: now,
    };
  }
  return {
    id,
    type: "chat",
    risk: "low",
    summary: "Route as normal home chat",
    proposed_actions: [],
    required_permissions: [],
    status: "routed",
    requires_confirmation: false,
    created_at: now,
  };
}

async function handleOrchestrationConfirm(req, res) {
  const { membership } = await requireUser(req);
  const body = await readBody(req);
  const intentID = String(body.intent_id || "").trim();
  if (!intentID) {
    throw new HTTPError(400, "intent_id is required");
  }
  const [intent] = await rest("orchestration_intents", {
    query: {
      id: `eq.${intentID}`,
      select: "*",
      team_id: `eq.${membership.team_id}`,
      limit: "1",
    },
  });
  if (!intent) {
    throw new HTTPError(404, "orchestration intent not found");
  }
  if (intent.status !== "pending") {
    throw new HTTPError(409, `orchestration intent is ${intent.status}`);
  }
  if (!Array.isArray(intent.proposed_actions) || intent.proposed_actions.length === 0) {
    throw new HTTPError(400, "orchestration intent has no proposed actions");
  }
  for (const permission of intent.required_permissions || []) {
    requirePermission(membership, permission);
  }
  // Apply mutating actions sequentially when they could race on a unique
  // identifier (e.g. project local_id is minted via a read-then-write inside
  // applyOrchestrationAction → uniqueProjectLocalID). Read-only actions and
  // those targeting distinct entity types can safely run in parallel, but
  // since the current orchestrator emits at most a handful of actions per
  // intent the simplicity of a sequential loop is worth the trivial latency
  // cost — and avoids silent duplicate-row creation under contention.
  const applied = [];
  for (const action of intent.proposed_actions) {
    applied.push(await applyOrchestrationAction(membership, action));
  }
  const confirmationID = crypto.randomUUID ? crypto.randomUUID() : shortID();
  await rest("orchestration_intents", {
    method: "PATCH",
    query: {
      id: `eq.${intent.id}`,
      team_id: `eq.${membership.team_id}`,
    },
    body: {
      confirmed_at: nowISO(),
      confirmation_id: confirmationID,
      status: "applied",
    },
  });
  await writeAuditEvent(membership, "orchestration.confirmed", "intent", intent.id, {
    confirmation_id: confirmationID,
    type: intent.type,
  });
  writeJSON(res, 200, {
    confirmation_id: confirmationID,
    intent_id: intent.id,
    applied,
    status: "applied",
  });
}

async function applyOrchestrationAction(membership, action) {
  const path = String(action?.path || "");
  const method = String(action?.method || "").toUpperCase();
  const body = action?.body || {};
  if (method !== "POST") throw new HTTPError(400, "unsupported orchestration action");
  if (path === "/projects" && body.action === "create") {
    requirePermission(membership, "project:create");
    const localID = await uniqueProjectLocalID(membership.team_id, body.id || body.name);
    const [project] = await rest("projects", {
      method: "POST",
      body: {
        ...projectPayload(body),
        created_by: membership.user_id,
        local_id: localID,
        name: String(body.name || localID),
        status: body.status || "active",
        team_id: membership.team_id,
      },
    });
    return { path, project: publicProject(project) };
  }
  if (path === "/tasks" && body.action === "create") {
    requirePermission(membership, "task:create");
    return { path, ...(await createTask(membership, body)) };
  }
  throw new HTTPError(400, "unsupported orchestration action");
}

async function handleSkills(req, res) {
  const { membership } = await requireUser(req);
  if (req.method === "GET") {
    requirePermission(membership, "skill:read");
    const rows = await rest("skills", {
      query: {
        order: "updated_at.desc",
        select: "*",
        status: "neq.archived",
        team_id: `eq.${membership.team_id}`,
      },
    });
    writeJSON(res, 200, { skills: rows || [] });
    return;
  }
  if (req.method === "POST") {
    const body = await readBody(req);
    const action = String(body.action || "propose").trim();
    if (action === "create") {
      requirePermission(membership, "skill:create_active");
    } else {
      requirePermission(membership, "skill:propose");
    }
    const status = action === "create" ? "active" : "proposed";
    const [skill] = await rest("skills", {
      method: "POST",
      body: {
        channel: body.channel || "general",
        content: String(body.content || ""),
        created_by: body.created_by || membership.user_id,
        created_by_user_id: membership.user_id,
        description: body.description || "",
        name: String(body.name || "").trim(),
        risk: body.risk || "low",
        required_permissions: permissionRequirementList(body.required_permissions),
        status,
        tags: Array.isArray(body.tags) ? body.tags : [],
        team_id: membership.team_id,
        title: body.title || body.name || "",
        trigger: body.trigger || "",
        workflow_definition: body.workflow_definition || "",
        workflow_key: body.workflow_key || "",
        workflow_provider: body.workflow_provider || "",
        workflow_schedule: body.workflow_schedule || "",
      },
    });
    await writeAuditEvent(membership, "skill.created", "skill", skill.id, {
      name: skill.name,
      status,
    });
    writeJSON(res, 200, { skill });
    return;
  }
  if (req.method === "PUT") {
    const body = await readBody(req);
    const name = String(body.name || "").trim();
    if (!name) throw new HTTPError(400, "name is required");
    const [existing] = await rest("skills", {
      query: {
        limit: "1",
        name: `eq.${name}`,
        select: "*",
        team_id: `eq.${membership.team_id}`,
      },
    });
    if (!existing) throw new HTTPError(404, "skill not found");
    const patch = { updated_at: nowISO() };
    for (const key of [
      "title",
      "description",
      "content",
      "channel",
      "trigger",
      "workflow_provider",
      "workflow_key",
      "workflow_definition",
      "workflow_schedule",
      "risk",
    ]) {
      if (body[key] !== undefined) patch[key] = body[key];
    }
    if (body.tags !== undefined) patch.tags = Array.isArray(body.tags) ? body.tags : [];
    if (body.required_permissions !== undefined) {
      patch.required_permissions = permissionRequirementList(body.required_permissions);
    }
    if (body.status !== undefined) {
      const nextStatus = String(body.status || "").trim();
      if (nextStatus === "active" && existing.status !== "active") {
        requirePermission(membership, "skill:approve");
        patch.approved_at = nowISO();
        patch.approved_by = membership.user_id;
      } else if (nextStatus === "rejected") {
        requirePermission(membership, "skill:approve");
        patch.rejected_at = nowISO();
        patch.rejected_by = membership.user_id;
      } else {
        requirePermission(membership, "skill:update");
      }
      patch.status = nextStatus;
    } else {
      requirePermission(membership, "skill:update");
    }
    const [skill] = await rest("skills", {
      method: "PATCH",
      query: { id: `eq.${existing.id}`, team_id: `eq.${membership.team_id}` },
      body: patch,
    });
    await writeAuditEvent(membership, "skill.updated", "skill", skill.id, {
      name: skill.name,
      status: skill.status,
    });
    writeJSON(res, 200, { skill });
    return;
  }
  if (req.method === "DELETE") {
    requirePermission(membership, "skill:archive");
    const body = await readBody(req);
    const name = String(body.name || "").trim();
    if (!name) throw new HTTPError(400, "name is required");
    await rest("skills", {
      method: "PATCH",
      query: { name: `eq.${name}`, team_id: `eq.${membership.team_id}` },
      body: { status: "archived", updated_at: nowISO() },
    });
    await writeAuditEvent(membership, "skill.archived", "skill", name);
    writeJSON(res, 200, { ok: true });
    return;
  }
  throw new HTTPError(405, "method not allowed");
}

async function handleSkillInvoke(req, res, name) {
  const { membership } = await requireUser(req);
  requirePermission(membership, "skill:read");
  requirePermission(membership, "skill:invoke");
  const [skill] = await rest("skills", {
    query: {
      limit: "1",
      name: `eq.${name}`,
      select: "*",
      status: "eq.active",
      team_id: `eq.${membership.team_id}`,
    },
  });
  if (!skill) throw new HTTPError(404, "skill not found");
  for (const permission of skillRequiredPermissions(skill)) {
    requirePermission(membership, permission);
  }
  const [updated] = await rest("skills", {
    method: "PATCH",
    query: { id: `eq.${skill.id}` },
    body: {
      last_execution_at: nowISO(),
      last_execution_status: "invoked",
      usage_count: Number(skill.usage_count || 0) + 1,
      updated_at: nowISO(),
    },
  });
  await writeAuditEvent(membership, "skill.invoked", "skill", updated.id, {
    name: updated.name,
  });
  writeJSON(res, 200, { skill: updated });
}

function skillRequiredPermissions(skill) {
  const out = [];
  const add = (value) => {
    if (Array.isArray(value)) {
      for (const item of value) add(item);
      return;
    }
    const permission = String(value || "").trim();
    if (permission) out.push(permission);
  };
  add(skill?.required_permissions);
  for (const key of ["workflow_definition", "content"]) {
    const raw = skill?.[key];
    if (typeof raw !== "string" || !raw.trim().startsWith("{")) continue;
    try {
      const parsed = JSON.parse(raw);
      add(parsed?.required_permissions);
      add(parsed?.manifest?.required_permissions);
    } catch {
      // Plain-text skills are expected; JSON manifests are optional.
    }
  }
  return [...new Set(out)];
}

function permissionRequirementList(raw) {
  return [
    ...new Set(
      (Array.isArray(raw) ? raw : [])
        .map((item) => String(item || "").trim())
        .filter(Boolean),
    ),
  ];
}

async function findProject(teamID, externalID) {
  const raw = String(externalID || "").trim();
  if (!raw) throw new HTTPError(400, "project id is required");
  let rows = await rest("projects", {
    query: {
      local_id: `eq.${raw}`,
      select: "*",
      team_id: `eq.${teamID}`,
      limit: "1",
    },
  });
  if (!rows?.length && isUUID(raw)) {
    rows = await rest("projects", {
      query: { id: `eq.${raw}`, select: "*", team_id: `eq.${teamID}`, limit: "1" },
    });
  }
  if (!rows?.length) throw new HTTPError(404, "project not found");
  return rows[0];
}

async function getProjectByID(teamID, id) {
  const rows = await rest("projects", {
    query: { id: `eq.${id}`, select: "*", team_id: `eq.${teamID}`, limit: "1" },
  });
  return rows?.[0] || null;
}

async function findTask(teamID, externalID) {
  const raw = String(externalID || "").trim();
  if (!raw) throw new HTTPError(400, "task id is required");
  let rows = await rest("tasks", {
    query: {
      local_id: `eq.${raw}`,
      select: "*",
      team_id: `eq.${teamID}`,
      limit: "1",
    },
  });
  if (!rows?.length && isUUID(raw)) {
    rows = await rest("tasks", {
      query: { id: `eq.${raw}`, select: "*", team_id: `eq.${teamID}`, limit: "1" },
    });
  }
  if (!rows?.length) throw new HTTPError(404, "task not found");
  return rows[0];
}

async function projectMap(teamID, ids) {
  const hasIDFilter = ids !== undefined;
  const query = { team_id: `eq.${teamID}`, select: "id,local_id,name" };
  const selected = uniqueNonEmpty(ids);
  if (hasIDFilter && selected.length === 0) return {};
  if (selected.length > 0) query.id = `in.(${selected.join(",")})`;
  const rows = await rest("projects", {
    query,
  });
  return Object.fromEntries((rows || []).map((row) => [row.id, row]));
}

async function taskMap(teamID, ids) {
  const hasIDFilter = ids !== undefined;
  const query = { team_id: `eq.${teamID}`, select: "id,local_id,title" };
  const selected = uniqueNonEmpty(ids);
  if (hasIDFilter && selected.length === 0) return {};
  if (selected.length > 0) query.id = `in.(${selected.join(",")})`;
  const rows = await rest("tasks", {
    query,
  });
  return Object.fromEntries((rows || []).map((row) => [row.id, row]));
}

function uniqueNonEmpty(values) {
  const list = Array.isArray(values) ? values : [values];
  return [
    ...new Set(list.map((value) => String(value || "").trim()).filter(Boolean)),
  ];
}

function publicProject(row) {
  return {
    ...row,
    id: row.local_id || row.id,
  };
}

function publicTask(row, projects = {}) {
  const task = {
    ...row,
    id: row.local_id || row.id,
    project_id: row.project_id
      ? projects[row.project_id]?.local_id || row.project_id
      : "",
  };
  return task;
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

function normalizeGitHubRepoURL(value) {
  const repoURL = String(value || "").trim();
  if (!repoURL) return "";
  if (
    /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?\/?$/.test(
      repoURL,
    )
  ) {
    return repoURL.replace(/\/$/, "");
  }
  if (/^git@github\.com:[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?$/.test(repoURL)) {
    return repoURL;
  }
  throw new HTTPError(
    400,
    "github_repo_url must be a GitHub HTTPS URL or git@github.com SSH URL",
  );
}

function redactSensitiveText(value) {
  return String(value || "")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/laf_[a-z]+_[A-Fa-f0-9]{20,}/g, "laf_[REDACTED]")
    .replace(/lafr_[A-Za-z0-9_-]{20,}/g, "lafr_[REDACTED]")
    .replace(/lafb_[A-Za-z0-9_-]{20,}/g, "lafb_[REDACTED]")
    .replace(/gh[pousr]_[A-Za-z0-9_]{20,}/g, "gh_[REDACTED]")
    .replace(/sk-(proj-)?[A-Za-z0-9_-]{20,}/g, "sk-[REDACTED]");
}

function redactSensitiveValue(value) {
  if (typeof value === "string") return redactSensitiveText(value);
  if (Array.isArray(value)) return value.map(redactSensitiveValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        /token|secret|password|api[_-]?key/i.test(key)
          ? "[REDACTED]"
          : redactSensitiveValue(entry),
      ]),
    );
  }
  return value;
}

function truncateText(value, max) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}...` : text;
}

function isHuman(slug) {
  return slug === "human" || slug === "you";
}

function trustedPublicAPIURL(req) {
  const publicAPIBase = String(process.env.LAF_OFFICE_PUBLIC_API_BASE_URL || "").trim();
  if (publicAPIBase) {
    return normalizeConfiguredPublicAPIBase(
      publicAPIBase,
      req,
      "LAF_OFFICE_PUBLIC_API_BASE_URL",
    );
  }
  const browserAPIBase = String(process.env.VITE_LAF_API_BASE_URL || "").trim();
  if (browserAPIBase) {
    return normalizeConfiguredPublicAPIBase(
      browserAPIBase,
      req,
      "VITE_LAF_API_BASE_URL",
    );
  }
  const origin = trustedPublicOrigin(req);
  if (!origin) throw new HTTPError(503, "canonical hosted API URL is not configured");
  return `${origin}/api`;
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

// trustedPublicOrigin resolves the absolute origin used in user-facing URLs
// such as invite links. It never trusts request headers in
// production, because Host / x-forwarded-host are client-controlled when the
// API is reached through unexpected proxies, enabling host-header injection
// against invite recipients. The canonical host is configured via
// LAF_OFFICE_PUBLIC_HOST (or VERCEL_URL on Vercel), and only falls back to
// request headers in local development (NODE_ENV !== "production").
function trustedPublicOrigin(req) {
  const configured = String(
    process.env.LAF_OFFICE_PUBLIC_HOST || process.env.VERCEL_URL || "",
  ).trim();
  if (configured) {
    return normalizeConfiguredPublicOrigin(configured);
  }
  if (process.env.NODE_ENV === "production") {
    throw new HTTPError(
      503,
      "LAF_OFFICE_PUBLIC_HOST is not configured for production",
    );
  }
  const proto = String(req.headers["x-forwarded-proto"] || "http")
    .split(",")[0]
    .trim();
  const host = String(req.headers.host || "").trim();
  if (!host) {
    throw new HTTPError(400, "cannot resolve public origin");
  }
  return `${proto}://${host}`;
}

function normalizeConfiguredPublicOrigin(value) {
  const raw = String(value || "").trim();
  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  const allowLocalhost = allowLocalHostedURLs();
  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new HTTPError(503, "LAF_OFFICE_PUBLIC_HOST must be a valid origin");
  }
  if (!parsed.hostname || parsed.username || parsed.password) {
    throw new HTTPError(503, "LAF_OFFICE_PUBLIC_HOST must be a valid origin");
  }
  if (parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new HTTPError(503, "LAF_OFFICE_PUBLIC_HOST must be an origin without a path");
  }
  if (!allowLocalhost && parsed.protocol !== "https:") {
    throw new HTTPError(503, "LAF_OFFICE_PUBLIC_HOST must use https");
  }
  if (!allowLocalhost && isPrivateHostedHostname(parsed.hostname)) {
    throw new HTTPError(
      503,
      "LAF_OFFICE_PUBLIC_HOST must not point at localhost or a private network address",
    );
  }
  const protocol = allowLocalhost ? parsed.protocol : "https:";
  return `${protocol}//${parsed.host}`;
}

function normalizeConfiguredPublicAPIBase(
  value,
  req,
  label = "LAF_OFFICE_PUBLIC_API_BASE_URL",
) {
  const raw = String(value || "").trim();
  if (raw.startsWith("//")) {
    throw new HTTPError(503, `${label} must not be a protocol-relative URL`);
  }
  if (
    raw.startsWith("/") ||
    (label === "VITE_LAF_API_BASE_URL" && !looksLikeBareHostedAPIHost(raw))
  ) {
    if (/[?#]/.test(raw)) {
      throw new HTTPError(503, `${label} must not include a query string or hash`);
    }
    const origin = trustedPublicOrigin(req);
    const pathname = (raw.startsWith("/") ? raw : `/${raw}`).replace(/\/+$/, "") || "/api";
    return `${origin}${pathname}`;
  }
  if (!/^https?:\/\//i.test(raw) && !looksLikeBareHostedAPIHost(raw)) {
    throw new HTTPError(503, `${label} must be a valid URL`);
  }
  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new HTTPError(503, `${label} must be a valid URL`);
  }
  if (!parsed.hostname || parsed.username || parsed.password) {
    throw new HTTPError(503, `${label} must be a valid URL`);
  }
  if (parsed.search || parsed.hash) {
    throw new HTTPError(503, `${label} must not include a query string or hash`);
  }
  const allowLocalhost = allowLocalHostedURLs();
  if (!allowLocalhost && parsed.protocol !== "https:") {
    throw new HTTPError(503, `${label} must use https`);
  }
  if (!allowLocalhost && isPrivateHostedHostname(parsed.hostname)) {
    throw new HTTPError(
      503,
      `${label} must not point at localhost or a private network address`,
    );
  }
  const pathname = parsed.pathname.replace(/\/+$/, "");
  parsed.pathname = pathname && pathname !== "/" ? pathname : "/api";
  const protocol = allowLocalhost ? parsed.protocol : "https:";
  return `${protocol}//${parsed.host}${parsed.pathname}`;
}

function allowLocalHostedURLs() {
  return process.env.NODE_ENV !== "production";
}

function looksLikeBareHostedAPIHost(value) {
  const hostPart = String(value || "").split(/[/?#]/)[0];
  return hostPart.includes(".") || hostPart.includes(":") || hostPart.startsWith("[");
}

function isPrivateHostedHostname(hostname) {
  const host = String(hostname || "").toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
  if (
    host === "localhost" ||
    host === "0.0.0.0" ||
    host === "127.0.0.1" ||
    host === "::" ||
    host === "::1"
  ) {
    return true;
  }
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) return true;
  if (/^169\.254\./.test(host)) return true;
  const private172 = host.match(/^172\.(\d+)\./);
  if (private172 && Number(private172[1]) >= 16 && Number(private172[1]) <= 31) return true;
  const carrierGradeNAT = host.match(/^100\.(\d+)\./);
  if (carrierGradeNAT && Number(carrierGradeNAT[1]) >= 64 && Number(carrierGradeNAT[1]) <= 127) return true;
  return host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:");
}

function originFor(req) {
  return trustedPublicOrigin(req);
}

module.exports.__test = {
  resetRateLimits() {
    rateLimitBuckets.clear();
  },
};
