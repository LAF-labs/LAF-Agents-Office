const crypto = require("node:crypto");
const {
  DEMO_ARTIFACTS,
  DEMO_COMPANY_PROFILE,
  DEMO_LOOPS,
  demoSeedUUID,
} = require("./lib/startup-office/demoSeed");
const {
  STARTUP_OFFICE_LOOP_DEFINITIONS,
} = require("./lib/startup-office/loopDefinitions");
const {
  createStartupOfficeRepository,
} = require("./lib/startup-office/repositories");
const {
  dispatchStartupOfficeRoute,
} = require("./lib/startup-office/dispatcher");
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
const DEFAULT_STARTUP_OFFICE_APPROVAL_POLICY = Object.freeze({
  founder_approval_required: {
    customer_promises: true,
    legal_sensitive_language: true,
    outbound_messages: true,
    pricing_changes: true,
    public_claims: true,
    spend: true,
  },
  require_citations_for_public_claims: true,
  revision_enabled: true,
  support_access: {
    logged: true,
    time_bound_hours: 24,
    visible_to_owner: true,
  },
});
const WORKSPACE_ROLES = ["owner", "admin", "manager", "member", "viewer"];
const WORKSPACE_PERMISSIONS = [
  "workspace:read",
  "workspace:manage",
  "member:invite",
  "member:manage_roles",
  "member:manage_permissions",
  "project:create",
  "project:update",
  "project:archive",
  "task:create",
  "task:update",
  "task:assign",
  "task:change_status",
  "task:execute_agent",
  "agent:create",
  "agent:update",
  "agent:assign",
  "skill:read",
  "skill:propose",
  "skill:create_active",
  "skill:approve",
  "skill:update",
  "skill:archive",
  "skill:invoke",
  "memory:read",
  "memory:write_draft",
  "memory:promote",
  "memory:write_canonical",
  "wiki:read",
  "model:use_laf",
  "mcp:use_task_context",
  "mcp:use_workspace_context",
  "audit:read",
];

const STARTUP_OFFICE_ROUTE_HANDLERS = Object.freeze({
  approvalAction: handleStartupOfficeApprovalAction,
  approvals: handleStartupOfficeApprovals,
  artifactObjectAction: handleStartupOfficeArtifactObjectAction,
  betaDashboard: handleStartupOfficeBetaDashboard,
  billing: handleStartupOfficeBilling,
  companyProfile: handleCompanyProfile,
  demoSeed: handleStartupOfficeDemoSeed,
  export: handleStartupOfficeExport,
  growthSummary: handleStartupOfficeGrowthSummary,
  loopRun: handleStartupOfficeLoopRun,
  loops: handleStartupOfficeLoops,
  objectCollection: handleStartupOfficeObjectCollection,
  objectItem: handleStartupOfficeObjectItem,
  policy: handleStartupOfficePolicy,
  receipts: handleStartupOfficeReceipts,
  run: handleStartupOfficeRun,
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

async function inviteByToken(token) {
  const raw = String(token || "").trim();
  if (!raw) return null;
  const rows = await rest("team_invites", {
    query: {
      limit: "1",
      select: "*",
      token_hash: `eq.${hashToken(raw)}`,
    },
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

function normalizeRole(role) {
  const value = String(role || "").trim().toLowerCase();
  return WORKSPACE_ROLES.includes(value) ? value : "member";
}

function normalizePermission(permission) {
  const value = String(permission || "").trim().toLowerCase();
  return WORKSPACE_PERMISSIONS.includes(value) ? value : "";
}

function normalizePermissionList(list) {
  return [...new Set((Array.isArray(list) ? list : []).map(normalizePermission).filter(Boolean))].sort();
}

function normalizePermissionOverride(raw) {
  const value = raw && typeof raw === "object" ? raw : {};
  return {
    allow: normalizePermissionList(value.allow),
    deny: normalizePermissionList(value.deny),
  };
}

function rolePresetPermissions(role) {
  switch (normalizeRole(role)) {
    case "owner":
    case "admin":
      return [...WORKSPACE_PERMISSIONS].sort();
    case "manager":
      return [
        "workspace:read",
        "member:invite",
        "project:create",
        "project:update",
        "project:archive",
        "task:create",
        "task:update",
        "task:assign",
        "task:change_status",
        "task:execute_agent",
        "agent:assign",
        "skill:read",
        "skill:propose",
        "skill:approve",
        "skill:update",
        "skill:invoke",
        "memory:read",
        "memory:write_draft",
        "memory:promote",
        "wiki:read",
        "model:use_laf",
        "mcp:use_task_context",
        "mcp:use_workspace_context",
      ].sort();
    case "member":
      return [
        "workspace:read",
        "project:create",
        "project:update",
        "task:create",
        "task:update",
        "task:change_status",
        "task:execute_agent",
        "skill:read",
        "skill:propose",
        "skill:invoke",
        "memory:read",
        "memory:write_draft",
        "wiki:read",
        "mcp:use_task_context",
      ].sort();
    case "viewer":
      return ["workspace:read", "skill:read", "memory:read", "wiki:read", "execution:receipt_read"];
    default:
      return rolePresetPermissions("member");
  }
}

function effectivePermissions(membership) {
  const role = normalizeRole(membership?.role);
  if (role === "owner") return [...WORKSPACE_PERMISSIONS].sort();
  const set = new Set(rolePresetPermissions(role));
  const overrides = normalizePermissionOverride(membership?.permissions);
  for (const permission of overrides.allow) set.add(permission);
  for (const permission of overrides.deny) set.delete(permission);
  return [...set].sort();
}

function hasPermission(membership, permission) {
  return effectivePermissions(membership).includes(normalizePermission(permission));
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

function requirePermission(membership, permission) {
  if (!hasPermission(membership, permission)) {
    throw new HTTPError(403, `permission required: ${permission}`);
  }
}

function requireAdminRole(membership, message = "admin role required") {
  const role = normalizeRole(membership?.role);
  if (role !== "owner" && role !== "admin") {
    throw new HTTPError(403, message);
  }
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
  try {
    const { membership, team, user } = await requireUser(req);
    writeJSON(res, 200, {
      authenticated: true,
      team: publicTeam(team),
      user: publicUser(user, membership),
    });
  } catch (err) {
    if (err instanceof HTTPError && err.status === 401) {
      writeJSON(res, 200, { authenticated: false });
      return;
    }
    throw err;
  }
}

async function handleHostedConfig(req, res) {
  const { membership, team, user } = await requireUser(req);
  if (req.method === "GET") {
    const settings = await workspaceSettings(membership.team_id);
    writeJSON(res, 200, hostedConfigSnapshot({ settings, team, user }));
    return;
  }
  if (req.method !== "POST") throw new HTTPError(405, "method not allowed");

  const body = await readBody(req);
  const existing = await workspaceSettings(membership.team_id);
  const patch = workspaceSettingsPatch(existing, body);
  const settings = await upsertWorkspaceSettings(membership.team_id, patch);
  writeJSON(res, 200, {
    config: hostedConfigSnapshot({ settings, team, user }),
    status: "ok",
  });
}

async function handleHostedOnboardingState(req, res) {
  const { membership } = await requireUser(req);
  const settings = await workspaceSettings(membership.team_id);
  const fallbackOnboarded = settings
    ? false
    : (await workspaceHasStartupOfficeState(membership.team_id))
      || (await workspaceHasAnyProject(membership.team_id));
  writeJSON(res, 200, {
    onboarded: Boolean(settings?.onboarding_completed_at) || fallbackOnboarded,
    onboarding_completed_at: settings?.onboarding_completed_at || null,
  });
}

async function handleHostedOnboardingComplete(req, res) {
  const { membership, team, user } = await requireUser(req);
  const body = await readBody(req);
  const existing = await workspaceSettings(membership.team_id);
  const patch = workspaceSettingsPatch(existing, body);
  patch.onboarding_completed_at =
    existing?.onboarding_completed_at || nowISO();

  const settings = await upsertWorkspaceSettings(membership.team_id, patch);
  const seeded = existing?.onboarding_completed_at
    ? { loops: [], receipt: null }
    : await seedStartupOfficeWorkspace(membership, team, body);
  await writeAuditEvent(membership, "onboarding.completed", "team", membership.team_id, {
    loop_count: seeded.loops?.length || 0,
    receipt_id: seeded.receipt?.id || "",
  });
  writeJSON(res, 200, {
    config: hostedConfigSnapshot({ settings, team, user }),
    loops: seeded.loops || [],
    onboarded: true,
    receipt: seeded.receipt || null,
    status: "ok",
  });
}

async function workspaceSettings(teamID) {
  try {
    const rows = await rest("workspace_settings", {
      query: {
        limit: "1",
        select: "*",
        team_id: `eq.${teamID}`,
      },
    });
    return rows?.[0] || null;
  } catch (err) {
    if (isMissingWorkspaceSettingsError(err)) return null;
    throw err;
  }
}

async function upsertWorkspaceSettings(teamID, patch) {
  try {
    const [settings] = await rest("workspace_settings", {
      method: "POST",
      prefer: "resolution=merge-duplicates,return=representation",
      query: { on_conflict: "team_id" },
      body: {
        ...patch,
        team_id: teamID,
        updated_at: nowISO(),
      },
    });
    return settings || { ...patch, team_id: teamID };
  } catch (err) {
    if (isMissingWorkspaceSettingsError(err)) {
      return { ...patch, team_id: teamID, updated_at: nowISO() };
    }
    throw err;
  }
}

function workspaceSettingsPatch(existing, body) {
  const currentProfile = objectValue(existing?.company_profile);
  const currentPreferences = objectValue(existing?.preferences);
  const companyProfile = {
    ...currentProfile,
    ...companyProfilePatch(body),
  };
  const preferences = {
    ...currentPreferences,
    ...workspacePreferencesPatch(body),
  };
  const patch = {
    company_profile: companyProfile,
    preferences,
  };
  if (body.llm_provider !== undefined) {
    patch.llm_provider = normalizeHostedLLMProvider(body.llm_provider);
  } else if (!existing?.llm_provider) {
    patch.llm_provider = "claude-code";
  }
  if (body.team_lead_slug !== undefined) {
    patch.team_lead_slug = truncateText(body.team_lead_slug, 80);
  } else if (!existing?.team_lead_slug) {
    patch.team_lead_slug = "ceo";
  }
  return patch;
}

function startupOfficeApprovalPolicy(settings) {
  const preferences = objectValue(settings?.preferences);
  const raw = objectValue(preferences.startup_office_approval_policy);
  const approvalRequired = objectValue(raw.founder_approval_required);
  const supportAccess = objectValue(raw.support_access);
  return {
    founder_approval_required: {
      ...DEFAULT_STARTUP_OFFICE_APPROVAL_POLICY.founder_approval_required,
      ...approvalRequired,
    },
    require_citations_for_public_claims:
      raw.require_citations_for_public_claims === undefined
        ? DEFAULT_STARTUP_OFFICE_APPROVAL_POLICY.require_citations_for_public_claims
        : Boolean(raw.require_citations_for_public_claims),
    revision_enabled:
      raw.revision_enabled === undefined
        ? DEFAULT_STARTUP_OFFICE_APPROVAL_POLICY.revision_enabled
        : Boolean(raw.revision_enabled),
    support_access: {
      ...DEFAULT_STARTUP_OFFICE_APPROVAL_POLICY.support_access,
      ...supportAccess,
      time_bound_hours: clamp(
        Number(supportAccess.time_bound_hours || DEFAULT_STARTUP_OFFICE_APPROVAL_POLICY.support_access.time_bound_hours),
        1,
        168,
      ),
    },
  };
}

function companyProfilePatch(body) {
  const profile = objectValue(body.company_profile);
  const out = { ...profile };
  const companyName = body.company_name ?? body.company;
  if (companyName !== undefined) out.name = truncateText(companyName, 160);
  const companyDescription = body.company_description ?? body.description;
  if (companyDescription !== undefined) {
    out.description = truncateText(companyDescription, 2000);
  }
  if (body.company_goals !== undefined) out.goals = truncateText(body.company_goals, 2000);
  if (body.company_size !== undefined) out.size = truncateText(body.company_size, 120);
  const priority = body.company_priority ?? body.priority;
  if (priority !== undefined) out.priority = truncateText(priority, 1000);
  return out;
}

function workspacePreferencesPatch(body) {
  const out = {};
  for (const key of [
    "blueprint",
  ]) {
    if (body[key] !== undefined) out[key] = truncateText(body[key], 1000);
  }
  for (const key of [
    "insights_poll_minutes",
    "max_concurrent_agents",
    "task_follow_up_minutes",
    "task_recheck_minutes",
    "task_reminder_minutes",
  ]) {
    if (body[key] !== undefined && Number.isFinite(Number(body[key]))) {
      out[key] = Number(body[key]);
    }
  }
  for (const key of ["agent_names", "agents"]) {
    if (Array.isArray(body[key])) out[key] = body[key].map((item) => truncateText(item, 120));
  }
  const firstTask = body.task ?? body.first_task;
  if (firstTask !== undefined) out.first_task = truncateText(firstTask, 1000);
  return out;
}

function hostedConfigSnapshot({ settings, team, user }) {
  const company = objectValue(settings?.company_profile);
  const preferences = objectValue(settings?.preferences);
  return {
    blueprint: preferences.blueprint || "",
    company_description: company.description || "",
    company_goals: company.goals || "",
    company_name: company.name || team?.name || "",
    company_priority: company.priority || "",
    company_size: company.size || "",
    email: user?.email || "",
    insights_poll_minutes: Number(preferences.insights_poll_minutes || 60),
    llm_provider: normalizeHostedLLMProvider(settings?.llm_provider),
    max_concurrent_agents: Number(preferences.max_concurrent_agents || 3),
    task_follow_up_minutes: Number(preferences.task_follow_up_minutes || 1440),
    task_recheck_minutes: Number(preferences.task_recheck_minutes || 1440),
    task_reminder_minutes: Number(preferences.task_reminder_minutes || 60),
    team_lead_slug: settings?.team_lead_slug || "ceo",
    workspace_id: team?.id || "",
    workspace_slug: team?.slug || "",
  };
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
      companyProfilePatch,
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

async function handleCompanyProfile(req, res) {
  const { membership, team, user } = await requireUser(req);
  if (req.method === "GET") {
    requirePermission(membership, "workspace:read");
    writeJSON(res, 200, {
      profile: await companyProfileSnapshot(membership.team_id, team, user),
    });
    return;
  }
  if (req.method !== "PATCH") throw new HTTPError(405, "method not allowed");
  requirePermission(membership, "workspace:manage");
  const body = await readBody(req);
  const existing = await workspaceSettings(membership.team_id);
  const profilePatch = startupOfficeCompanyProfilePatch(body);
  const settings = await upsertWorkspaceSettings(membership.team_id, {
    ...workspaceSettingsPatch(existing, { company_profile: profilePatch }),
    company_profile: {
      ...objectValue(existing?.company_profile),
      ...profilePatch,
    },
  });
  const [row] = await safeStartupOfficeRest("company_profiles", {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=representation",
    query: { on_conflict: "team_id" },
    body: {
      ...companyProfileRowPayload(profilePatch),
      team_id: membership.team_id,
      updated_at: nowISO(),
    },
  });
  await writeAuditEvent(membership, "company_profile.updated", "company", membership.team_id, {
    fields: Object.keys(profilePatch).sort(),
  });
  writeJSON(res, 200, {
    profile: publicCompanyProfile({
      row,
      settings,
      team,
      user,
    }),
    status: "ok",
  });
}

async function handleStartupOfficeGrowthSummary(req, res) {
  const { membership, team, user } = await requireUser(req);
  requirePermission(membership, "workspace:read");
  const [
    loops,
    runs,
    artifacts,
    approvals,
    receipts,
    memoryPages,
    objectSummary,
    betaOps,
    profile,
  ] = await Promise.all([
    startupOfficeLoops(membership.team_id),
    startupOfficeRuns(membership.team_id, { limit: 10 }),
    startupOfficeArtifacts(membership.team_id, { limit: 10 }),
    startupOfficeApprovals(membership.team_id, { status: "pending", limit: 10 }),
    startupOfficeReceipts(membership.team_id, { limit: 10 }),
    startupOfficeRepository().memoryPages(membership.team_id, {
      status: "approved",
      limit: 10,
    }),
    startupOfficeObjectSummary(membership.team_id),
    startupOfficeBetaOpsSnapshot(membership.team_id),
    companyProfileSnapshot(membership.team_id, team, user),
  ]);
  writeJSON(res, 200, {
    company_profile: profile,
    beta_ops: betaOps,
    loops,
    pulse: {
      active_loops: loops.filter((loop) => loop.status === "active").length,
      pending_approvals: approvals.length,
      recent_receipts: receipts.length,
      recent_runs: runs.length,
    },
    memory_pages: memoryPages,
    operating_objects: objectSummary,
    recent_artifacts: artifacts,
    recent_receipts: receipts,
    recent_runs: runs,
    pending_approvals: approvals,
  });
}

async function handleStartupOfficeLoops(req, res) {
  const { membership } = await requireUser(req);
  if (req.method === "GET") {
    requirePermission(membership, "workspace:read");
    writeJSON(res, 200, { loops: await startupOfficeLoops(membership.team_id) });
    return;
  }
  if (req.method !== "POST") throw new HTTPError(405, "method not allowed");
  requirePermission(membership, "workspace:manage");
  const body = await readBody(req);
  const name = truncateText(body.name || "", 160);
  if (!name) throw new HTTPError(400, "name is required");
  const slug = await uniqueStartupOfficeLoopSlug(membership.team_id, body.slug || name);
  const [loop] = await safeStartupOfficeRest("startup_office_loops", {
    method: "POST",
    body: {
      cadence: normalizeStartupOfficeCadence(body.cadence),
      created_by: membership.user_id,
      department: truncateText(body.department || "Operations", 80),
      name,
      objective: truncateText(body.objective || "", 2000),
      policy: objectValue(body.policy),
      slug,
      status: normalizeStartupOfficeLoopStatus(body.status),
      team_id: membership.team_id,
    },
  });
  await writeAuditEvent(membership, "startup_office.loop_created", "loop", loop?.id || slug, {
    slug,
  });
  writeJSON(res, 200, { loop: publicStartupOfficeLoop(loop || { ...body, slug }) });
}

async function handleStartupOfficePolicy(req, res) {
  const { membership } = await requireUser(req);
  const settings = await workspaceSettings(membership.team_id);
  if (req.method === "GET") {
    requirePermission(membership, "workspace:read");
    writeJSON(res, 200, {
      policy: startupOfficeApprovalPolicy(settings),
    });
    return;
  }
  if (req.method !== "PATCH") throw new HTTPError(405, "method not allowed");
  requirePermission(membership, "workspace:manage");
  const body = await readBody(req);
  const currentPreferences = objectValue(settings?.preferences);
  const policy = startupOfficeApprovalPolicy({
    preferences: {
      ...currentPreferences,
      startup_office_approval_policy: body.policy || body,
    },
  });
  const updated = await upsertWorkspaceSettings(membership.team_id, {
    preferences: {
      ...currentPreferences,
      startup_office_approval_policy: policy,
    },
  });
  await writeAuditEvent(membership, "startup_office.policy_updated", "team", membership.team_id, {
    require_citations_for_public_claims: policy.require_citations_for_public_claims,
  });
  writeJSON(res, 200, {
    policy: startupOfficeApprovalPolicy(updated),
    status: "ok",
  });
}

async function handleStartupOfficeBilling(req, res) {
  const { membership } = await requireUser(req);
  if (req.method === "GET") {
    requirePermission(membership, "workspace:read");
    writeJSON(res, 200, await startupOfficeBetaOpsSnapshot(membership.team_id));
    return;
  }
  if (req.method !== "PATCH") throw new HTTPError(405, "method not allowed");
  requireAdminRole(membership, "owner or admin role required for billing changes");
  const body = await readBody(req);
  const billing = await upsertStartupOfficeBilling(membership.team_id, {
    billing_state: startupOfficeBillingStateValue(body.billing_state || body.state),
    laf_model_enabled: body.laf_model_enabled === undefined ? true : Boolean(body.laf_model_enabled),
    monthly_model_spend_cents: clamp(Number(body.monthly_model_spend_cents || 20000), 0, 10000000),
    monthly_run_limit: clamp(Number(body.monthly_run_limit || 50), 0, 100000),
    plan: truncateText(body.plan || "founder_beta", 80),
    storage_mb_limit: clamp(Number(body.storage_mb_limit || 1024), 0, 1000000),
    support_notes: truncateText(body.support_notes || "", 4000),
  });
  await writeAuditEvent(membership, "startup_office.billing_updated", "team", membership.team_id, {
    billing_state: billing.billing_state,
    monthly_run_limit: billing.monthly_run_limit,
  });
  writeJSON(res, 200, await startupOfficeBetaOpsSnapshot(membership.team_id));
}

async function handleStartupOfficeBetaDashboard(req, res) {
  const { membership, team } = await requireUser(req);
  requireAdminRole(membership, "owner or admin role required for beta dashboard");
  const [betaOps, runs, approvals, notifications] = await Promise.all([
    startupOfficeBetaOpsSnapshot(membership.team_id),
    startupOfficeRuns(membership.team_id, { limit: 20 }),
    startupOfficeApprovals(membership.team_id, { status: "pending", limit: 20 }),
    safeStartupOfficeRest("startup_office_notifications", {
      query: {
        limit: "20",
        order: "created_at.desc",
        select: "*",
        team_id: `eq.${membership.team_id}`,
      },
    }),
  ]);
  writeJSON(res, 200, {
    dashboard: {
      billing: betaOps.billing,
      notifications,
      pending_approvals: approvals,
      run_failures: runs.filter((run) => run.status === "failed"),
      stuck_jobs: await startupOfficeStuckJobs(membership.team_id),
      support_notes: betaOps.billing.support_notes || "",
      team: {
        id: team.id,
        name: team.name,
        slug: team.slug,
      },
      usage: betaOps.usage,
    },
  });
}

async function handleStartupOfficeLoopRun(req, res, loopID) {
  const { membership, team, user } = await requireUser(req);
  requirePermission(membership, "memory:write_draft");
  await enforceStartupOfficeRunLimit(membership.team_id);
  const body = await readBody(req);
  const loop = await ensureStartupOfficeLoop(membership, loopID);
  const profile = await companyProfileSnapshot(membership.team_id, team, user);
  const objective = truncateText(
    body.objective || loop.objective || profile.priority || "Run this operating loop.",
    2000,
  );
  const now = nowISO();
  const repository = startupOfficeRepository();
  const run = await repository.createRun(membership, {
    inputs: objectValue(body.inputs),
    loop_id: loop.id || null,
    metadata: {
      company_name: profile.name || "",
      loop_slug: loop.slug,
      provider: startupOfficeModelClient().provider,
    },
    objective,
    status: "queued",
    title: truncateText(body.title || loop.name, 180),
    updated_at: now,
  });
  const runID = run?.id || `run-${shortID()}`;
  const workerJob = await repository.createWorkerJob(membership, {
    loop_slug: loop.slug,
    metadata: {
      objective,
      provider: startupOfficeModelClient().provider,
    },
    run_id: runID,
    status: "queued",
  });
  const receipt = await createStartupOfficeReceipt(membership, {
    actor_slug: "agent",
    event_type: "run.queued",
    run_id: runID,
    summary: `${loop.name} run queued for AI execution.`,
    trace: {
      loop_slug: loop.slug,
      worker_job_id: workerJob?.id || null,
    },
  });
  await writeAuditEvent(membership, "startup_office.run_created", "run", runID, {
    loop_slug: loop.slug,
    worker_job_id: workerJob?.id || "",
  });
  const queuedRun = run || {
    id: runID,
    inputs: objectValue(body.inputs),
    loop_id: loop.id || null,
    metadata: { loop_slug: loop.slug },
    objective,
    status: "queued",
    title: loop.name,
  };
  if (body.defer === true) {
    writeJSON(res, 202, {
      receipt,
      run: publicStartupOfficeRun(queuedRun),
      status: "queued",
      worker_job: workerJob,
    });
    return;
  }
  const result = await runStartupOfficeLoop({
    inputs: objectValue(body.inputs),
    loop,
    membership,
    modelClient: startupOfficeModelClient(),
    nowISO,
    objective,
    profile,
    repository,
    run: queuedRun,
    truncateText,
    workerJob,
  });
  await recordStartupOfficeRunOutcome(membership, result);
  writeJSON(res, 200, {
    approval: publicStartupOfficeApproval(result.approval),
    artifact: publicStartupOfficeArtifact(result.artifact),
    error: result.error,
    receipt: result.receipt || receipt,
    run: publicStartupOfficeRun(result.run),
    status: result.status,
    worker_job: workerJob,
  });
}

async function handleStartupOfficeRun(req, res, runID, action) {
  const { membership, team, user } = await requireUser(req);
  const repository = startupOfficeRepository();
  const run = await repository.findRun(membership.team_id, runID);
  if (!run) throw new HTTPError(404, "run not found");

  if (!action && req.method === "GET") {
    requirePermission(membership, "workspace:read");
    const [artifacts, approvals, receipts] = await Promise.all([
      startupOfficeArtifacts(membership.team_id, { run_id: run.id, limit: 50 }),
      startupOfficeApprovals(membership.team_id, { run_id: run.id, limit: 50 }),
      startupOfficeReceipts(membership.team_id, { run_id: run.id, limit: 50 }),
    ]);
    writeJSON(res, 200, {
      approvals,
      artifacts,
      receipts,
      run: publicStartupOfficeRun(run),
    });
    return;
  }

  if (action === "cancel" && req.method === "POST") {
    requirePermission(membership, "memory:write_draft");
    if (["completed", "canceled"].includes(run.status)) {
      throw new HTTPError(409, `run is already ${run.status}`);
    }
    const now = nowISO();
    const [pendingApproval] = await safeStartupOfficeRest("startup_office_approvals", {
      method: "PATCH",
      query: {
        run_id: `eq.${run.id}`,
        status: "eq.pending",
        team_id: `eq.${membership.team_id}`,
      },
      body: {
        decided_at: now,
        decided_by: membership.user_id,
        decision_note: "Run canceled before founder approval.",
        status: "rejected",
        updated_at: now,
      },
    });
    const updatedRun = await repository.updateRun(membership.team_id, run.id, {
      completed_at: now,
      metadata: {
        ...objectValue(run.metadata),
        canceled_by: membership.user_id,
      },
      status: "canceled",
      summary: "Founder canceled the Startup Office run.",
      updated_at: now,
    });
    const receipt = await createStartupOfficeReceipt(membership, {
      actor_slug: "founder",
      approval_id: pendingApproval?.id || null,
      event_type: "run.canceled",
      run_id: run.id,
      summary: "Founder canceled the Startup Office run.",
      trace: { run_id: run.id },
    });
    await writeAuditEvent(membership, "startup_office.run_canceled", "run", run.id);
    writeJSON(res, 200, {
      receipt,
      run: publicStartupOfficeRun(updatedRun || run),
      status: "canceled",
    });
    return;
  }

  if (action === "retry" && req.method === "POST") {
    requirePermission(membership, "memory:write_draft");
    await enforceStartupOfficeRunLimit(membership.team_id);
    if (!["failed", "canceled"].includes(run.status)) {
      throw new HTTPError(409, `run is ${run.status}; only failed or canceled runs can be retried`);
    }
    const body = await readBody(req);
    const loop = await ensureStartupOfficeLoop(membership, run.loop_id || run.metadata?.loop_slug);
    const profile = await companyProfileSnapshot(membership.team_id, team, user);
    const objective = truncateText(
      body.objective || run.objective || loop.objective || "Retry this operating loop.",
      2000,
    );
    const now = nowISO();
    const retryRun = await repository.updateRun(membership.team_id, run.id, {
      completed_at: null,
      inputs: objectValue(body.inputs || run.inputs),
      metadata: {
        ...objectValue(run.metadata),
        retry_requested_at: now,
        retry_requested_by: membership.user_id,
      },
      objective,
      status: "queued",
      updated_at: now,
    });
    const workerJob = await repository.createWorkerJob(membership, {
      loop_slug: loop.slug,
      metadata: {
        objective,
        provider: startupOfficeModelClient().provider,
        retry: true,
      },
      run_id: run.id,
      status: "queued",
    });
    await createStartupOfficeReceipt(membership, {
      actor_slug: "founder",
      event_type: "run.retry_queued",
      run_id: run.id,
      summary: `${loop.name} retry queued for AI execution.`,
      trace: { worker_job_id: workerJob?.id || null },
    });
    const result = await runStartupOfficeLoop({
      inputs: objectValue(body.inputs || run.inputs),
      loop,
      membership,
      modelClient: startupOfficeModelClient(),
      nowISO,
      objective,
      profile,
      repository,
      run: retryRun || run,
      truncateText,
      workerJob,
    });
    await recordStartupOfficeRunOutcome(membership, result);
    writeJSON(res, 200, {
      approval: publicStartupOfficeApproval(result.approval),
      artifact: publicStartupOfficeArtifact(result.artifact),
      error: result.error,
      receipt: result.receipt,
      run: publicStartupOfficeRun(result.run),
      status: result.status,
      worker_job: workerJob,
    });
    return;
  }

  throw new HTTPError(405, "method not allowed");
}

async function handleStartupOfficeApprovals(req, res) {
  const { membership } = await requireUser(req);
  if (req.method !== "GET") throw new HTTPError(405, "method not allowed");
  requirePermission(membership, "workspace:read");
  writeJSON(res, 200, {
    approvals: await startupOfficeApprovals(membership.team_id, {
      status: req.query?.status,
      limit: Number(req.query?.limit) || 100,
    }),
  });
}

async function handleStartupOfficeApprovalAction(req, res, approvalID, action) {
  const { membership, team, user } = await requireUser(req);
  requirePermission(membership, "memory:promote");
  const body = await readBody(req);
  const approval = await findStartupOfficeApproval(membership.team_id, approvalID);
  if (!approval) throw new HTTPError(404, "approval not found");
  if (approval.status !== "pending") throw new HTTPError(409, "approval is already decided");
  const approved = action === "approve";
  const revisionRequested = action === "revise";
  const now = nowISO();
  const [updatedApproval] = await safeStartupOfficeRest("startup_office_approvals", {
    method: "PATCH",
    query: {
      id: `eq.${approval.id}`,
      team_id: `eq.${membership.team_id}`,
    },
    body: {
      decided_at: now,
      decided_by: membership.user_id,
      decision_note: truncateText(body.note || body.reason || body.revision_note || "", 2000),
      status: approved ? "approved" : revisionRequested ? "revision_requested" : "rejected",
      updated_at: now,
    },
  });
  let updatedRun = null;
  let memoryPromotion = null;
  if (approval.run_id) {
    const existingRun = await startupOfficeRepository().findRun(
      membership.team_id,
      approval.run_id,
    );
    const existingRunMetadata = objectValue(existingRun?.metadata);
    const [run] = await safeStartupOfficeRest("startup_office_runs", {
      method: "PATCH",
      query: {
        id: `eq.${approval.run_id}`,
        team_id: `eq.${membership.team_id}`,
      },
      body: {
        completed_at: revisionRequested ? null : now,
        metadata: revisionRequested
          ? {
              ...existingRunMetadata,
              revision_note: truncateText(body.note || body.reason || body.revision_note || "", 2000),
              revision_requested_at: now,
              revision_requested_by: membership.user_id,
            }
          : existingRunMetadata,
        status: approved ? "completed" : revisionRequested ? "queued" : "canceled",
        summary: approved
          ? "Founder approved the drafted loop output."
          : revisionRequested
            ? "Founder requested a revision before approval."
            : "Founder rejected the drafted loop output.",
        updated_at: now,
      },
    });
    updatedRun = run;
  }
  if (approved && approval.artifact_id) {
    const repository = startupOfficeRepository();
    const [artifact, profile] = await Promise.all([
      repository.findArtifact(membership.team_id, approval.artifact_id),
      companyProfileSnapshot(membership.team_id, team, user),
    ]);
    if (artifact) {
      memoryPromotion = await applyStartupOfficeMemoryPromotion({
        approval,
        artifact,
        membership,
        profile,
        repository,
        run: updatedRun || (approval.run_id
          ? await repository.findRun(membership.team_id, approval.run_id)
          : null),
      });
    }
  }
  const receipt = await createStartupOfficeReceipt(membership, {
    actor_slug: "founder",
    approval_id: approval.id,
    event_type: approved
      ? "approval.approved"
      : revisionRequested
        ? "approval.revision_requested"
        : "approval.rejected",
    run_id: approval.run_id || null,
    summary: approved
      ? "Founder approved the pending Startup Office action."
      : revisionRequested
        ? "Founder requested a revised Startup Office artifact."
        : "Founder rejected the pending Startup Office action.",
    trace: {
      approval_id: approval.id,
      decision_note: truncateText(body.note || body.reason || body.revision_note || "", 500),
      memory_pages: memoryPromotion?.pages?.map((page) => page.slug) || [],
    },
  });
  await writeAuditEvent(
    membership,
    approved
      ? "startup_office.approved"
      : revisionRequested
        ? "startup_office.revision_requested"
        : "startup_office.rejected",
    "approval",
    approval.id,
  );
  writeJSON(res, 200, {
    approval: publicStartupOfficeApproval(updatedApproval || approval),
    memory_diff: memoryPromotion?.diff || null,
    memory_pages: memoryPromotion?.pages || [],
    receipt,
    run: publicStartupOfficeRun(updatedRun),
    status: "ok",
  });
}

async function handleStartupOfficeReceipts(req, res) {
  const { membership } = await requireUser(req);
  if (req.method !== "GET") throw new HTTPError(405, "method not allowed");
  requirePermission(membership, "workspace:read");
  writeJSON(res, 200, {
    receipts: await startupOfficeReceipts(membership.team_id, {
      limit: Number(req.query?.limit) || 100,
    }),
  });
}

async function handleStartupOfficeObjectCollection(req, res, kind) {
  const { membership } = await requireUser(req);
  const definition = startupOfficeObjectDefinition(kind);
  if (req.method === "GET") {
    requirePermission(membership, "workspace:read");
    const rows = await startupOfficeObjectRows(membership.team_id, kind, {
      limit: Number(req.query?.limit) || 100,
      status: req.query?.status,
    });
    writeJSON(res, 200, { [definition.responseKey]: rows });
    return;
  }
  if (req.method !== "POST") throw new HTTPError(405, "method not allowed");
  requirePermission(membership, "memory:write_draft");
  const body = await readBody(req);
  const [row] = await safeStartupOfficeRest(definition.table, {
    method: "POST",
    body: startupOfficeObjectPayload(kind, membership, body),
  });
  const item = definition.public(row);
  await writeAuditEvent(membership, `startup_office.${kind}.created`, kind, item?.id || "");
  writeJSON(res, 200, { [definition.singularKey]: item });
}

async function handleStartupOfficeObjectItem(req, res, kind, objectID) {
  const { membership } = await requireUser(req);
  if (req.method !== "PATCH") throw new HTTPError(405, "method not allowed");
  requirePermission(membership, "memory:write_draft");
  const definition = startupOfficeObjectDefinition(kind);
  const body = await readBody(req);
  const [row] = await safeStartupOfficeRest(definition.table, {
    method: "PATCH",
    query: {
      id: `eq.${objectID}`,
      team_id: `eq.${membership.team_id}`,
    },
    body: startupOfficeObjectPatch(kind, body),
  });
  const item = definition.public(row);
  await writeAuditEvent(membership, `startup_office.${kind}.updated`, kind, objectID);
  writeJSON(res, 200, { [definition.singularKey]: item });
}

async function handleStartupOfficeArtifactObjectAction(req, res, artifactID, action) {
  const { membership } = await requireUser(req);
  requirePermission(membership, "memory:write_draft");
  const artifact = await startupOfficeRepository().findArtifact(membership.team_id, artifactID);
  if (!artifact) throw new HTTPError(404, "artifact not found");
  const body = await readBody(req);
  if (action === "save-as-asset") {
    const [asset] = await safeStartupOfficeRest("startup_office_assets", {
      method: "POST",
      body: {
        body: truncateText(artifact.content || "", 30000),
        created_by: membership.user_id,
        kind: truncateText(body.kind || artifact.kind || "document", 80),
        metadata: {
          artifact_id: artifact.id,
          source: "artifact",
        },
        name: truncateText(body.name || artifact.title || "Startup Office asset", 180),
        run_id: artifact.run_id || null,
        team_id: membership.team_id,
        updated_at: nowISO(),
      },
    });
    await writeAuditEvent(membership, "startup_office.asset.created_from_artifact", "artifact", artifact.id);
    writeJSON(res, 200, { asset: publicStartupOfficeAsset(asset) });
    return;
  }
  if (action === "record-signal") {
    const [signal] = await safeStartupOfficeRest("startup_office_signals", {
      method: "POST",
      body: {
        body: truncateText(body.body || artifact.content || "", 6000),
        created_by: membership.user_id,
        metadata: {
          artifact_id: artifact.id,
          run_id: artifact.run_id || null,
          source: "artifact",
        },
        source: truncateText(body.source || "artifact", 120),
        status: "new",
        team_id: membership.team_id,
        title: truncateText(body.title || artifact.title || "Artifact signal", 180),
        updated_at: nowISO(),
      },
    });
    await writeAuditEvent(membership, "startup_office.signal.created_from_artifact", "artifact", artifact.id);
    writeJSON(res, 200, { signal: publicStartupOfficeSignal(signal) });
    return;
  }
  throw new HTTPError(400, "unsupported artifact action");
}

async function handleStartupOfficeExport(req, res) {
  const { membership } = await requireUser(req);
  requirePermission(membership, "workspace:read");
  const [
    assets,
    customers,
    metrics,
    signals,
    runs,
    approvals,
    receipts,
    memoryPages,
  ] = await Promise.all([
    startupOfficeObjectRows(membership.team_id, "assets", { limit: 1000 }),
    startupOfficeObjectRows(membership.team_id, "customers", { limit: 1000 }),
    startupOfficeObjectRows(membership.team_id, "metrics", { limit: 1000 }),
    startupOfficeObjectRows(membership.team_id, "signals", { limit: 1000 }),
    startupOfficeRuns(membership.team_id, { limit: 1000 }),
    startupOfficeApprovals(membership.team_id, { limit: 1000 }),
    startupOfficeReceipts(membership.team_id, { limit: 1000 }),
    startupOfficeRepository().memoryPages(membership.team_id, { limit: 1000 }),
  ]);
  writeJSON(res, 200, {
    export: {
      approvals,
      assets,
      customers,
      generated_at: nowISO(),
      memory_pages: memoryPages,
      metrics,
      receipts,
      runs,
      signals,
    },
  });
}

async function startupOfficeObjectSummary(teamID) {
  const [assets, customers, metrics, signals] = await Promise.all([
    startupOfficeObjectRows(teamID, "assets", { limit: 5 }),
    startupOfficeObjectRows(teamID, "customers", { limit: 5 }),
    startupOfficeObjectRows(teamID, "metrics", { limit: 5 }),
    startupOfficeObjectRows(teamID, "signals", { limit: 5 }),
  ]);
  return {
    assets,
    counts: {
      assets: assets.length,
      customers: customers.length,
      metrics: metrics.length,
      signals: signals.length,
    },
    customers,
    metrics,
    signals,
  };
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

async function enforceStartupOfficeRunLimit(teamID) {
  const { billing, usage } = await startupOfficeBetaOpsSnapshot(teamID);
  if (["past_due", "paused", "canceled"].includes(billing.billing_state)) {
    throw new HTTPError(402, `billing state blocks AI runs: ${billing.billing_state}`);
  }
  if (usage.runs >= billing.monthly_run_limit) {
    throw new HTTPError(402, "monthly Startup Office run limit reached");
  }
  if (usage.model_spend_cents >= billing.monthly_model_spend_cents) {
    throw new HTTPError(402, "monthly Startup Office model spend limit reached");
  }
}

async function recordStartupOfficeRunOutcome(membership, result) {
  const cost = objectValue(result?.run?.metadata?.cost);
  await safeStartupOfficeRest("startup_office_usage_events", {
    method: "POST",
    body: {
      cost_cents: Number(cost.estimated_cents || 0),
      created_by: membership.user_id,
      event_type: "model_run",
      input_tokens: Number(cost.input_tokens || 0),
      metadata: {
        status: result?.status || "",
      },
      model: cost.model || result?.run?.metadata?.model || "",
      output_tokens: Number(cost.output_tokens || 0),
      provider: cost.provider || result?.run?.metadata?.provider || "",
      run_id: result?.run?.id || null,
      team_id: membership.team_id,
      total_tokens: Number(cost.total_tokens || 0),
    },
  });
  await safeStartupOfficeRest("startup_office_notifications", {
    method: "POST",
    body: {
      event_type: result?.status === "failed" ? "run_failed" : "approval_waiting",
      payload: {
        run_id: result?.run?.id || null,
        status: result?.status || "",
      },
      recipient_user_id: membership.user_id,
      status: "pending",
      team_id: membership.team_id,
    },
  });
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

async function handleStartupOfficeDemoSeed(req, res) {
  const { membership, team, user } = await requireUser(req);
  if (process.env.NODE_ENV === "production" && !truthy(process.env.LAF_OFFICE_ENABLE_DEMO_SEED)) {
    throw new HTTPError(404, "not found");
  }
  requireAdminRole(membership, "owner or admin role required for demo seed");
  const body = await readBody(req);
  const seeded = await seedStartupOfficeDemoWorkspace(membership, team, user, body);
  await writeAuditEvent(membership, "startup_office.demo_seeded", "team", membership.team_id, {
    approval_id: seeded.approval?.id || "",
    artifact_count: seeded.artifacts.length,
    loop_count: seeded.loops.length,
    receipt_count: seeded.receipts.length,
  });
  writeJSON(res, 200, {
    ...seeded,
    status: "ok",
  });
}

async function seedStartupOfficeDemoWorkspace(membership, team, user, body = {}) {
  const now = nowISO();
  const companyName = truncateText(
    body.company_name || body.company || DEMO_COMPANY_PROFILE.name,
    160,
  );
  const [profileRow] = await safeStartupOfficeRest("company_profiles", {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=representation",
    query: { on_conflict: "team_id" },
    body: {
      ...DEMO_COMPANY_PROFILE,
      metadata: {
        demo_seed: true,
        outcome: "paid_beta_validation_package",
        source: "startup_office_demo_seed",
      },
      name: companyName,
      team_id: membership.team_id,
      updated_at: now,
    },
  });

  const loops = [];
  for (const definition of DEMO_LOOPS) {
    const [loop] = await safeStartupOfficeRest("startup_office_loops", {
      method: "POST",
      prefer: "resolution=merge-duplicates,return=representation",
      query: { on_conflict: "team_id,slug" },
      body: {
        ...definition,
        created_by: membership.user_id,
        policy: {
          founder_approval_required: true,
          source: "demo_seed",
        },
        status: "active",
        team_id: membership.team_id,
        updated_at: now,
      },
    });
    loops.push(publicStartupOfficeLoop(loop || {
      ...definition,
      id: definition.slug,
      status: "active",
    }));
  }

  const loopBySlug = new Map(loops.map((loop) => [loop.slug, loop]));
  const ideaLoop = loopBySlug.get("idea-validation");
  const offerLoop = loopBySlug.get("offer-package");
  const discoveryLoop = loopBySlug.get("customer-discovery");
  const ideaRunID = demoSeedUUID(membership.team_id, "idea-validation-run");
  const offerRunID = demoSeedUUID(membership.team_id, "offer-package-run");
  const discoveryRunID = demoSeedUUID(membership.team_id, "customer-discovery-run");
  const [ideaRun] = await upsertStartupOfficeDemoRun(membership, {
    id: ideaRunID,
    loop_id: ideaLoop?.id || null,
    metadata: { demo_seed: true, loop_slug: "idea-validation" },
    objective: ideaLoop?.objective || DEMO_LOOPS[0].objective,
    status: "waiting_approval",
    title: "Idea Validation",
  });
  const [offerRun] = await upsertStartupOfficeDemoRun(membership, {
    id: offerRunID,
    loop_id: offerLoop?.id || null,
    metadata: { demo_seed: true, loop_slug: "offer-package" },
    objective: offerLoop?.objective || DEMO_LOOPS[1].objective,
    status: "completed",
    summary: "Offer Package demo artifact is ready for founder review.",
    title: "Offer Package",
  });
  await upsertStartupOfficeDemoRun(membership, {
    id: discoveryRunID,
    loop_id: discoveryLoop?.id || null,
    metadata: { demo_seed: true, loop_slug: "customer-discovery" },
    objective: discoveryLoop?.objective || DEMO_LOOPS[2].objective,
    status: "completed",
    summary: "Customer Discovery demo receipt is ready.",
    title: "Customer Discovery",
  });

  const [ideaArtifact] = await upsertStartupOfficeDemoArtifact(membership, {
    content: DEMO_ARTIFACTS.ideaValidation,
    id: demoSeedUUID(membership.team_id, "idea-validation-artifact"),
    kind: "plan",
    metadata: { demo_seed: true, loop_slug: "idea-validation" },
    run_id: ideaRunID,
    title: "Idea Validation draft",
  });
  const [offerArtifact] = await upsertStartupOfficeDemoArtifact(membership, {
    content: DEMO_ARTIFACTS.offerPackage,
    id: demoSeedUUID(membership.team_id, "offer-package-artifact"),
    kind: "report",
    metadata: { demo_seed: true, loop_slug: "offer-package" },
    run_id: offerRunID,
    title: "Offer Package artifact",
  });
  const [approval] = await safeStartupOfficeRest("startup_office_approvals", {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=representation",
    query: { on_conflict: "id" },
    body: {
      action: "approve_loop_draft",
      artifact_id: ideaArtifact?.id || null,
      details: truncateText(DEMO_ARTIFACTS.ideaValidation, 4000),
      id: demoSeedUUID(membership.team_id, "idea-validation-approval"),
      metadata: { demo_seed: true, loop_slug: "idea-validation" },
      requested_by: membership.user_id,
      risk_level: "medium",
      run_id: ideaRunID,
      status: "pending",
      team_id: membership.team_id,
      title: "Approve Idea Validation draft",
      updated_at: now,
    },
  });
  const receipts = [];
  receipts.push(await upsertStartupOfficeDemoReceipt(membership, {
    actor_slug: "ceo",
    approval_id: approval?.id || null,
    event_type: "demo.idea_validation_queued",
    id: demoSeedUUID(membership.team_id, "idea-validation-receipt"),
    run_id: ideaRunID,
    summary:
      "Idea Validation demo draft is queued for founder approval with assumptions, risks, and next evidence.",
    trace: { demo_seed: true, loop_slug: "idea-validation" },
  }));
  receipts.push(await upsertStartupOfficeDemoReceipt(membership, {
    actor_slug: "growth",
    event_type: "demo.customer_discovery_ready",
    id: demoSeedUUID(membership.team_id, "customer-discovery-receipt"),
    run_id: discoveryRunID,
    summary:
      "Customer Discovery demo receipt shows the next founder-led interview motion.",
    trace: { demo_seed: true, loop_slug: "customer-discovery" },
  }));
  receipts.push(await upsertStartupOfficeDemoReceipt(membership, {
    actor_slug: "system",
    event_type: "demo.seeded",
    id: demoSeedUUID(membership.team_id, "workspace-demo-seeded"),
    run_id: null,
    summary:
      "Demo workspace seeded for a paid beta validation package with approval-gated artifacts.",
    trace: {
      company: companyName,
      demo_seed: true,
      loops: loops.map((loop) => loop.slug),
    },
  }));

  const settings = await workspaceSettings(membership.team_id);
  return {
    approval: publicStartupOfficeApproval(approval),
    artifacts: [
      publicStartupOfficeArtifact(ideaArtifact),
      publicStartupOfficeArtifact(offerArtifact),
    ].filter(Boolean),
    loops,
    profile: publicCompanyProfile({
      row: profileRow,
      settings,
      team,
      user,
    }),
    receipts: receipts.filter(Boolean),
    runs: [
      publicStartupOfficeRun(ideaRun),
      publicStartupOfficeRun(offerRun),
    ].filter(Boolean),
  };
}

async function upsertStartupOfficeDemoRun(membership, body) {
  return await safeStartupOfficeRest("startup_office_runs", {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=representation",
    query: { on_conflict: "id" },
    body: {
      created_at: nowISO(),
      created_by: membership.user_id,
      inputs: { demo_seed: true },
      started_at: nowISO(),
      summary: "",
      team_id: membership.team_id,
      updated_at: nowISO(),
      ...body,
    },
  });
}

async function upsertStartupOfficeDemoArtifact(membership, body) {
  return await safeStartupOfficeRest("startup_office_artifacts", {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=representation",
    query: { on_conflict: "id" },
    body: {
      created_by: membership.user_id,
      team_id: membership.team_id,
      ...body,
    },
  });
}

async function upsertStartupOfficeDemoReceipt(membership, body) {
  const [receipt] = await safeStartupOfficeRest("startup_office_receipts", {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=representation",
    query: { on_conflict: "id" },
    body: {
      approval_id: null,
      created_by: membership.user_id,
      team_id: membership.team_id,
      trace: {},
      ...body,
    },
  });
  return publicStartupOfficeReceipt(receipt);
}

async function seedStartupOfficeWorkspace(membership, team, body) {
  const loops = [];
  for (const definition of STARTUP_OFFICE_LOOP_DEFINITIONS) {
    const [loop] = await safeStartupOfficeRest("startup_office_loops", {
      method: "POST",
      prefer: "resolution=merge-duplicates,return=representation",
      query: { on_conflict: "team_id,slug" },
      body: {
        cadence: definition.cadence,
        created_by: membership.user_id,
        department: definition.department,
        name: definition.name,
        objective: definition.objective,
        policy: { founder_approval_required: true, source: "onboarding_seed" },
        slug: definition.slug,
        status: "active",
        team_id: membership.team_id,
        updated_at: nowISO(),
      },
    });
    loops.push(publicStartupOfficeLoop(loop || { ...definition, id: definition.slug, status: "active" }));
  }
  const receipt = await createStartupOfficeReceipt(membership, {
    actor_slug: "system",
    event_type: "workspace.onboarded",
    run_id: null,
    summary: `${team?.name || "Workspace"} Startup Office was initialized with founder-controlled operating loops.`,
    trace: {
      company: truncateText(body.company || body.company_name || team?.name || "", 160),
      loops: loops.map((loop) => loop.slug),
    },
  });
  return { loops, receipt };
}

async function companyProfileSnapshot(teamID, team, user) {
  const [settings, rows] = await Promise.all([
    workspaceSettings(teamID),
    safeStartupOfficeRest("company_profiles", {
      query: {
        limit: "1",
        select: "*",
        team_id: `eq.${teamID}`,
      },
    }),
  ]);
  return publicCompanyProfile({
    row: rows?.[0] || null,
    settings,
    team,
    user,
  });
}

function startupOfficeCompanyProfilePatch(body) {
  return startupOfficeServices().startupOfficeCompanyProfilePatch(body);
}

function companyProfileRowPayload(profile) {
  return startupOfficeServices().companyProfileRowPayload(profile);
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

async function uniqueStartupOfficeLoopSlug(teamID, seed) {
  return startupOfficeRepository().uniqueLoopSlug(teamID, seed);
}

async function workspaceHasAnyProject(teamID) {
  const rows = await rest("projects", {
    query: {
      limit: "1",
      select: "id",
      team_id: `eq.${teamID}`,
    },
  }).catch(() => []);
  return Boolean(rows?.length);
}

async function workspaceHasStartupOfficeState(teamID) {
  const rows = await safeStartupOfficeRest("startup_office_loops", {
    query: {
      limit: "1",
      select: "id",
      team_id: `eq.${teamID}`,
    },
  }).catch(() => []);
  return Boolean(rows?.length);
}

function normalizeHostedLLMProvider(value) {
  const provider = String(value || "").trim().toLowerCase().replace(/_/g, "-");
  if (provider === "codex") return "codex";
  if (provider === "claude" || provider === "claude-code") return "claude-code";
  return "claude-code";
}

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function isMissingWorkspaceSettingsError(err) {
  if (!(err instanceof HTTPError)) return false;
  if (err.status !== 404) return false;
  return String(err.message || "").includes("workspace_settings");
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
  await requireUser(req);
  if (req.method === "GET") {
    writeJSON(res, 200, {
      channels: [hostedChannel("general", "General", "Workspace home")],
    });
    return;
  }
  if (req.method !== "POST") throw new HTTPError(405, "method not allowed");
  const body = await readBody(req);
  const slug = slugify(body.slug || body.name || "channel") || `channel-${shortID()}`;
  writeJSON(res, 200, hostedChannel(slug, body.name || slug, body.description || ""));
}

async function handleHostedChannelGenerate(req, res) {
  await requireUser(req);
  const body = await readBody(req);
  const name = truncateText(body.prompt || "Generated channel", 80);
  const slug = slugify(name) || `channel-${shortID()}`;
  writeJSON(res, 200, hostedChannel(slug, name, ""));
}

async function handleHostedDMChannel(req, res) {
  await requireUser(req);
  const body = await readBody(req);
  const members = Array.isArray(body.members) ? body.members.map((item) => String(item || "")) : [];
  const agent = members.find((member) => !["human", "you"].includes(member)) || "agent";
  writeJSON(res, 200, {
    ...hostedChannel(`dm-${slugify(agent) || "agent"}`, `@${agent}`, ""),
    created: false,
    members,
    type: "direct",
  });
}

async function handleHostedMessages(req, res) {
  const { membership } = await requireUser(req);
  if (req.method === "GET") {
    writeJSON(res, 200, await listHostedChannelMessages(membership, req.query || {}));
    return;
  }
  if (req.method !== "POST") throw new HTTPError(405, "method not allowed");
  const body = await readBody(req);
  const message = await createHostedChannelMessage(membership, body);
  writeJSON(res, 200, message);
}

async function handleHostedHomeSessions(req, res) {
  const { membership } = await requireUser(req);
  if (req.method === "GET") {
    writeJSON(res, 200, await listHostedHomeSessions(membership, req.query || {}));
    return;
  }
  if (req.method === "DELETE") {
    const threadID = String(req.query?.thread_id || "").trim();
    if (!threadID) throw new HTTPError(400, "thread_id is required");
    const now = nowISO();
    const rows = await rest("channel_messages", {
      method: "PATCH",
      query: {
        home_session_thread_id: `eq.${threadID}`,
        team_id: `eq.${membership.team_id}`,
      },
      body: { deleted_at: now, updated_at: now },
    }).catch((err) => {
      if (isMissingChannelMessagesError(err)) return [];
      throw err;
    });
    writeJSON(res, 200, { deleted: (rows || []).length > 0, ok: true });
    return;
  }
  throw new HTTPError(405, "method not allowed");
}

async function listHostedChannelMessages(membership, query = {}) {
  const channel = String(query.channel || "general").trim() || "general";
  const limit = clamp(Number(query.limit) || 100, 1, 500);
  const threadID = String(query.thread_id || "").trim();
  const sinceID = String(query.since_id || "").trim();
  const rows = await rest("channel_messages", {
    query: {
      channel: `eq.${channel}`,
      order: "created_at.asc",
      select: "*",
      team_id: `eq.${membership.team_id}`,
      limit: String(threadID ? 500 : limit),
    },
  }).catch((err) => {
    if (isMissingChannelMessagesError(err)) return [];
    throw err;
  });
  let messages = (rows || []).filter((row) => !row.deleted_at);
  if (threadID) {
    messages = messages.filter((row) => hostedMessageBelongsToThread(row, threadID));
  }
  if (sinceID) {
    const index = messages.findIndex((row) => String(row.id || "") === sinceID);
    if (index >= 0) messages = messages.slice(index + 1);
  }
  if (messages.length > limit) messages = messages.slice(-limit);
  return { messages: messages.map(publicChannelMessage) };
}

async function listHostedHomeSessions(membership, query = {}) {
  const baseThreadID = String(query.base_thread_id || "").trim();
  if (!baseThreadID) return { sessions: [] };
  const rows = await rest("channel_messages", {
    query: {
      channel: "eq.general",
      limit: "500",
      order: "created_at.asc",
      select: "*",
      team_id: `eq.${membership.team_id}`,
    },
  }).catch((err) => {
    if (isMissingChannelMessagesError(err)) return [];
    throw err;
  });
  const sessions = new Map();
  for (const row of rows || []) {
    if (row.deleted_at) continue;
    const threadID = String(row.home_session_thread_id || row.thread_id || "").trim();
    if (!threadID || !(threadID === baseThreadID || threadID.startsWith(`${baseThreadID}:`))) {
      continue;
    }
    const current = sessions.get(threadID) || {
      created_at: row.created_at || nowISO(),
      id: threadID,
      message_count: 0,
      thread_id: threadID,
      title: "",
      updated_at: row.created_at || nowISO(),
    };
    current.message_count += 1;
    current.updated_at = row.created_at || current.updated_at;
    if (!current.title && isHuman(row.sender_slug)) {
      current.title = sessionTitleFromContent(row.content);
    }
    sessions.set(threadID, current);
  }
  return {
    sessions: [...sessions.values()]
      .map((session) => ({
        ...session,
        title: session.title || "새 대화",
      }))
      .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))
      .slice(0, 30),
  };
}

async function createHostedChannelMessage(membership, body = {}) {
  const now = nowISO();
  const content = String(body.content || "").trim();
  if (!content) throw new HTTPError(400, "content is required");
  const channel = String(body.channel || "general").trim() || "general";
  const homeSessionThreadID = String(body.home_session_thread_id || "").trim();
  const threadID = String(body.thread_id || homeSessionThreadID || body.reply_to || "").trim();
  const [row] = await rest("channel_messages", {
    method: "POST",
    body: {
      audience: normalizeStringList(body.audience || []),
      channel,
      content,
      created_at: now,
      home_session_thread_id: homeSessionThreadID || null,
      kind: String(body.kind || "message").trim() || "message",
      metadata: objectValue(body.metadata),
      model_mode: normalizeModelMode(body.model_mode),
      project_id: body.project_id ? String(body.project_id) : null,
      public_reply_to: body.public_reply_to ? String(body.public_reply_to) : null,
      reply_to: body.reply_to ? String(body.reply_to) : null,
      run_id: body.run_id ? String(body.run_id) : null,
      scope: body.scope ? String(body.scope) : null,
      sender_slug: String(body.from || body.sender_slug || "you").trim() || "you",
      tagged: normalizeStringList(body.tagged || []),
      task_id: body.task_id ? String(body.task_id) : null,
      team_id: membership.team_id,
      thread_id: threadID || null,
      updated_at: now,
      visibility: body.visibility ? String(body.visibility) : null,
    },
  });
  return publicChannelMessage(row);
}

function publicChannelMessage(row = {}) {
  const threadID = row.thread_id || row.home_session_thread_id || row.reply_to || "";
  return {
    audience: normalizeStringList(row.audience || []),
    channel: row.channel || "general",
    content: row.content || "",
    from: row.sender_slug || row.from || "system",
    home_session_thread_id: row.home_session_thread_id || "",
    id: row.id || `msg-${shortID()}`,
    kind: row.kind || "message",
    model_mode: row.model_mode || "record_only",
    project_id: row.project_id || "",
    public_reply_to: row.public_reply_to || row.reply_to || "",
    reactions: row.reactions || {},
    reply_to: row.reply_to || "",
    run_id: row.run_id || "",
    scope: row.scope || "",
    tagged: normalizeStringList(row.tagged || []),
    task_id: row.task_id || "",
    team_id: row.team_id || "",
    thread_id: threadID,
    timestamp: row.created_at || row.timestamp || nowISO(),
    visibility: row.visibility || "",
  };
}

function publicTaskExecutionMode(value) {
  const mode = String(value || "").trim();
  if (mode === "office") return "office";
  return "office";
}

function hostedMessageBelongsToThread(row, threadID) {
  return [
    row.thread_id,
    row.home_session_thread_id,
    row.reply_to,
    row.public_reply_to,
  ].some((value) => String(value || "").trim() === threadID);
}

function sessionTitleFromContent(content) {
  return truncateText(String(content || "").replace(/^@\S+\s*/, ""), 48) || "새 대화";
}

function isMissingChannelMessagesError(err) {
  return (
    err instanceof HTTPError &&
    err.status === 404 &&
    String(err.message || "").includes("channel_messages")
  );
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

function hostedChannel(slug, name, description) {
  return {
    created_by: "system",
    description: String(description || ""),
    members: ["human", "ceo", "pm", "fe", "be", "reviewer"],
    name: String(name || slug),
    slug: String(slug || "general"),
    type: "public",
  };
}

// adminUserByID fetches a single auth user via the admin endpoint. Unlike the
// previous adminUsersByID() that pulled the entire project user list, this
// scoped variant only requests the ids that the caller actually needs (and
// for which permission has already been verified via memberships RLS).
async function adminUserByID(userID) {
  if (!userID) return null;
  try {
    const user = await strictAdminUserByID(userID);
    return user && typeof user === "object" ? user : null;
  } catch {
    return null;
  }
}

async function strictAdminUserByID(userID) {
  if (!userID) return null;
  return await authAdminFetch(`admin/users/${encodeURIComponent(userID)}`);
}

async function adminUsersByIDs(userIDs) {
  const unique = Array.from(new Set((userIDs || []).filter(Boolean)));
  if (unique.length === 0) return {};
  // Bounded fan-out: 16 concurrent admin/users lookups is plenty for any
  // realistic team size while keeping the Supabase admin endpoint healthy.
  const concurrency = 16;
  const result = {};
  for (let i = 0; i < unique.length; i += concurrency) {
    const slice = unique.slice(i, i + concurrency);
    const users = await Promise.all(slice.map(adminUserByID));
    for (let j = 0; j < slice.length; j += 1) {
      const user = users[j];
      if (user && user.id) result[user.id] = user;
    }
  }
  return result;
}

async function listTeamAuthUsers(teamID) {
  const memberships = await rest("memberships", {
    query: {
      order: "created_at.asc",
      select: "*",
      team_id: `eq.${teamID}`,
    },
  });
  const usersByID = await adminUsersByIDs(memberships.map((row) => row.user_id));
  return memberships.map((row) => {
    const user = usersByID[row.user_id] || {
      id: row.user_id,
      email: row.user_id,
      user_metadata: {},
    };
    return publicUser(user, row);
  });
}

async function handleAuthUsers(req, res) {
  const { membership } = await requireUser(req);
  if (req.method === "GET") {
    writeJSON(res, 200, {
      users: await listTeamAuthUsers(membership.team_id),
    });
    return;
  }
  if (req.method !== "PATCH") throw new HTTPError(405, "method not allowed");
  requirePermission(membership, "member:manage_roles");
  const body = await readBody(req);
  const targetUserID = String(body.user_id || "").trim();
  if (!targetUserID) throw new HTTPError(400, "user_id is required");
  const nextRole = normalizeRole(body.role);
  // Block self-role changes. An admin must not be able to self-promote to
  // owner; ownership transfer should go through a separate, explicit flow.
  if (targetUserID === membership.user_id && nextRole !== normalizeRole(membership.role)) {
    throw new HTTPError(403, "cannot change your own role");
  }
  const [target] = await rest("memberships", {
    query: {
      limit: "1",
      select: "*",
      team_id: `eq.${membership.team_id}`,
      user_id: `eq.${targetUserID}`,
    },
  });
  if (!target) throw new HTTPError(404, "member not found");
  if (normalizeRole(target.role) === "owner" && nextRole !== "owner") {
    const owners = await rest("memberships", {
      query: {
        role: "eq.owner",
        select: "id",
        status: "eq.active",
        team_id: `eq.${membership.team_id}`,
      },
    });
    if ((owners || []).length <= 1) {
      throw new HTTPError(409, "cannot remove the last owner");
    }
  }
  const [updated] = await rest("memberships", {
    method: "PATCH",
    query: {
      team_id: `eq.${membership.team_id}`,
      user_id: `eq.${targetUserID}`,
    },
    body: { role: nextRole, updated_at: nowISO() },
  });
  await writeAuditEvent(membership, "member.role_updated", "user", targetUserID, {
    role: nextRole,
  });
  const users = await listTeamAuthUsers(membership.team_id);
  const user = users.find((candidate) => candidate.id === updated.user_id) || null;
  writeJSON(res, 200, { user, users });
}

async function handleAuthMe(req, res) {
  const { membership, token, user } = await requireUser(req);
  const body = await readBody(req);
  const name = String(body.name || "").trim();
  if (!name) throw new HTTPError(400, "name is required");
  if (name.length > 80) {
    throw new HTTPError(400, "name must be 80 characters or fewer");
  }
  const avatarID = normalizeProfileAvatarID(body.avatar_id);
  const currentMetadata =
    user.user_metadata && typeof user.user_metadata === "object"
      ? user.user_metadata
      : {};
  const updated = await authFetch("user", {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: {
      data: {
        ...currentMetadata,
        avatar_id: avatarID,
        name,
      },
    },
  });
  await writeAuditEvent(membership, "profile.updated", "user", user.id, {
    avatar_id: avatarID,
  });
  writeJSON(res, 200, {
    user: publicUser(
      updated || {
        ...user,
        user_metadata: { ...currentMetadata, name, avatar_id: avatarID },
      },
      membership,
    ),
  });
}

async function handleAuthMePassword(req, res) {
  const { membership, user } = await requireUser(req);
  const body = await readBody(req);
  const currentPassword = String(body.current_password || "").trim();
  const newPassword = String(body.new_password || "").trim();
  if (!currentPassword) throw new HTTPError(400, "current_password is required");
  if (newPassword.length < 8) {
    throw new HTTPError(400, "new_password length >= 8 required");
  }
  let verifiedSession;
  try {
    verifiedSession = await authFetch("token?grant_type=password", {
      method: "POST",
      body: { email: user.email, password: currentPassword },
    });
  } catch {
    throw new HTTPError(403, "current password is incorrect");
  }
  const accessToken = verifiedSession?.access_token;
  if (!accessToken) throw new HTTPError(403, "current password is incorrect");
  await authFetch("user", {
    method: "PUT",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: { password: newPassword },
  });
  setAuthCookies(req, res, verifiedSession);
  await writeAuditEvent(membership, "profile.password_changed", "user", user.id);
  writeJSON(res, 200, { status: "ok" });
}

async function handleAuthLogin(req, res) {
  const body = await readBody(req);
  const session = await authFetch("token?grant_type=password", {
    method: "POST",
    body: { email: body.email, password: body.password },
  });
  const membership = await activeMembership(session.user.id);
  if (!membership) throw new HTTPError(403, "active team membership required");
  const team = await getTeam(membership.team_id);
  setAuthCookies(req, res, session);
  writeJSON(res, 200, {
    team: publicTeam(team),
    user: publicUser(session.user, membership),
  });
}

async function handleAuthSignup(req, res) {
  enforceRateLimit("auth_signup", clientRateLimitKey(req), RATE_LIMITS.authSignup);
  const body = await readBody(req);
  const session = await createConfirmedSignupSession(body);
  const authenticated = Boolean(session?.access_token);
  const user = session.user;
  if (!user?.id) throw new HTTPError(400, "signup did not return a user");
  const emailConfirmationRequired = !authenticated;

  if (body.team_action === "join") {
    const invite = await inviteByToken(body.invite_token);
    if (!invite || invite.status !== "pending") {
      throw new HTTPError(404, "invite not found");
    }
    const [membership] = await rest("memberships", {
      method: "POST",
      query: { on_conflict: "team_id,user_id" },
      prefer: "resolution=merge-duplicates,return=representation",
      body: {
        role: invite.role || "member",
        status: "active",
        team_id: invite.team_id,
        user_id: user.id,
      },
    });
    await rest("team_invites", {
      method: "PATCH",
      query: { id: `eq.${invite.id}` },
      body: {
        accepted_at: nowISO(),
        accepted_by: user.id,
        status: "accepted",
      },
    });
    const team = await getTeam(invite.team_id);
    if (authenticated) setAuthCookies(req, res, session);
    writeJSON(res, 200, {
      authenticated,
      email_confirmation_required: emailConfirmationRequired,
      team: publicTeam(team),
      user: publicUser(user, membership),
    });
    return;
  }

  const teamName = body.team_name || `${body.name || "My"} Team`;
  const [team] = await rest("teams", {
    method: "POST",
    body: {
      created_by: user.id,
      name: teamName,
      slug: await uniqueTeamSlug(teamName),
    },
  });
  const [membership] = await rest("memberships", {
    method: "POST",
    body: {
      role: "owner",
      status: "active",
      team_id: team.id,
      user_id: user.id,
    },
  });
  if (authenticated) setAuthCookies(req, res, session);
  writeJSON(res, 200, {
    authenticated,
    email_confirmation_required: emailConfirmationRequired,
    team: publicTeam(team),
    user: publicUser(user, membership),
  });
}

async function createConfirmedSignupSession(body) {
  const email = String(body.email || "").trim();
  const password = String(body.password || "");
  const name = String(body.name || "").trim();
  try {
    await authAdminFetch("admin/users", {
      method: "POST",
      body: {
        email,
        password,
        email_confirm: true,
        user_metadata: {
          avatar_id: DEFAULT_PROFILE_AVATAR_ID,
          name,
        },
      },
    });
  } catch (err) {
    if (isDuplicateSignupError(err)) {
      throw new HTTPError(409, "account already exists");
    }
    throw err;
  }

  const session = await authFetch("token?grant_type=password", {
    method: "POST",
    body: { email, password },
  });
  if (!session?.access_token || !session?.user?.id) {
    throw new HTTPError(502, "signup session was not issued");
  }
  return session;
}

function isDuplicateSignupError(err) {
  if (!(err instanceof HTTPError)) return false;
  if (![400, 409, 422].includes(err.status)) return false;
  const message = String(err.message || "").toLowerCase();
  return (
    message.includes("already") ||
    message.includes("registered") ||
    message.includes("exists")
  );
}

async function handlePermissions(req, res) {
  const { membership } = await requireUser(req);
  if (req.method === "GET") {
    const memberships = await rest("memberships", {
      query: {
        order: "created_at.asc",
        select: "*",
        team_id: `eq.${membership.team_id}`,
      },
    });
    const usersByID = await adminUsersByIDs(memberships.map((row) => row.user_id));
    writeJSON(res, 200, {
      roles: WORKSPACE_ROLES,
      permissions: [...WORKSPACE_PERMISSIONS].sort(),
      members: memberships.map((row) => {
        const user = usersByID[row.user_id] || {};
        return {
          user_id: row.user_id,
          email: user.email || row.user_id,
          name: user.user_metadata?.name || user.email || row.user_id,
          role: normalizeRole(row.role),
          status: row.status || "active",
          overrides: normalizePermissionOverride(row.permissions),
          effective_permissions: effectivePermissions(row),
        };
      }),
    });
    return;
  }
  if (req.method !== "PATCH") throw new HTTPError(405, "method not allowed");
  requirePermission(membership, "member:manage_permissions");
  const body = await readBody(req);
  const targetUserID = String(body.user_id || "").trim();
  if (!targetUserID) throw new HTTPError(400, "user_id is required");
  // Block self-permission edits. Even users with member:manage_permissions
  // should not be able to override their own permission set or escalate
  // themselves to a higher role.
  const isSelf = targetUserID === membership.user_id;
  if (isSelf && body.role !== undefined && normalizeRole(body.role) !== normalizeRole(membership.role)) {
    throw new HTTPError(403, "cannot change your own role");
  }
  if (isSelf && body.permissions !== undefined) {
    throw new HTTPError(403, "cannot change your own permissions");
  }
  const [target] = await rest("memberships", {
    query: {
      limit: "1",
      select: "*",
      team_id: `eq.${membership.team_id}`,
      user_id: `eq.${targetUserID}`,
    },
  });
  if (!target) throw new HTTPError(404, "member not found");
  const patch = { updated_at: nowISO() };
  if (body.role !== undefined) {
    patch.role = normalizeRole(body.role);
    if (normalizeRole(target.role) === "owner" && patch.role !== "owner") {
      const owners = await rest("memberships", {
        query: {
          role: "eq.owner",
          select: "id",
          status: "eq.active",
          team_id: `eq.${membership.team_id}`,
        },
      });
      if ((owners || []).length <= 1) {
        throw new HTTPError(409, "cannot remove the last owner");
      }
    }
  }
  if (body.permissions !== undefined) {
    patch.permissions = normalizePermissionOverride(body.permissions);
  }
  const [updated] = await rest("memberships", {
    method: "PATCH",
    query: {
      team_id: `eq.${membership.team_id}`,
      user_id: `eq.${targetUserID}`,
    },
    body: patch,
  });
  await writeAuditEvent(membership, "permissions.updated", "user", targetUserID, {
    role: updated.role,
  });
  writeJSON(res, 200, {
    member: {
      user_id: updated.user_id,
      role: normalizeRole(updated.role),
      status: updated.status,
      overrides: normalizePermissionOverride(updated.permissions),
      effective_permissions: effectivePermissions(updated),
    },
  });
}

async function handleInvites(req, res) {
  const { membership } = await requireUser(req);
  if (req.method === "GET") {
    const rows = await rest("team_invites", {
      query: {
        order: "created_at.desc",
        select: "*",
        team_id: `eq.${membership.team_id}`,
      },
    });
    writeJSON(res, 200, {
      human_members: [],
      invites: rows.map((invite) => publicInvite(invite, req)),
    });
    return;
  }
  if (req.method !== "POST") throw new HTTPError(405, "method not allowed");
  requirePermission(membership, "member:invite");
  const body = await readBody(req);
  const token = `laf_invite_${crypto.randomBytes(18).toString("hex")}`;
  const [invite] = await rest("team_invites", {
    method: "POST",
    body: {
      channel: body.channel || "",
      created_by: membership.user_id,
      email: String(body.email || "").trim().toLowerCase(),
      name: body.name || "",
      role: normalizeRole(body.role || "member") === "owner" ? "member" : normalizeRole(body.role || "member"),
      status: "pending",
      team_id: membership.team_id,
      token_hash: hashToken(token),
    },
  });
  // Token-bearing fields are returned ONCE on creation and never again.
  // GET /invites and /invites/lookup only see token_hash from the DB, so
  // they cannot reconstruct the plaintext token. We strip the raw `token`
  // string from the embedded invite object — clients should consume the
  // generated URL, not the raw token — and reduce the surface where a
  // careless logger persists it.
  const withToken = publicInvite({ ...invite, token }, req);
  const oneTimeURL = withToken.invite_url;
  const inviteForBody = { ...withToken };
  delete inviteForBody.token;
  await writeAuditEvent(membership, "invite.created", "invite", invite.id, {
    email: invite.email,
    role: invite.role,
  });
  writeJSON(res, 200, {
    email_sent: false,
    invite: inviteForBody,
    invite_url: oneTimeURL,
    one_time_invite_url: oneTimeURL,
  });
}

async function handleInviteLookup(req, res) {
  const invite = await inviteByToken(req.query.token);
  if (!invite || invite.status !== "pending") {
    throw new HTTPError(404, "invite not found");
  }
  writeJSON(res, 200, { invite: publicInvite(invite, req) });
}

async function handleInviteAccept(req, res) {
  const body = await readBody(req);
  const { membership, team, user } = await requireUser(req);
  const invite = await inviteByToken(body.token);
  if (!invite || invite.status !== "pending") {
    throw new HTTPError(404, "invite not found");
  }
  if (invite.team_id !== membership.team_id) {
    throw new HTTPError(403, "active session is for a different team");
  }
  await rest("team_invites", {
    method: "PATCH",
    query: { id: `eq.${invite.id}` },
    body: {
      accepted_at: nowISO(),
      accepted_by: user.id,
      status: "accepted",
    },
  });
  writeJSON(res, 200, {
    invite: publicInvite({ ...invite, status: "accepted" }, req),
    member: {
      email: user.email,
      joined_at: membership.created_at,
      name: body.name || user.user_metadata?.name || user.email,
      role: membership.role,
      slug: user.email,
      team_id: team.id,
    },
  });
}

async function uniqueTeamSlug(name) {
  const base = slugify(name) || "team";
  const candidate = base;
  const existing = await rest("teams", {
    query: { slug: `eq.${candidate}`, select: "id", limit: "1" },
  });
  return existing?.length ? `${base}-${shortID()}` : candidate;
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
      execution_mode: "office",
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
    execution_mode: publicTaskExecutionMode(row.execution_mode),
    id: row.local_id || row.id,
    project_id: row.project_id
      ? projects[row.project_id]?.local_id || row.project_id
      : "",
  };
  delete task.worktree_path;
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

// publicInvite renders an invite row for the client. The plaintext token is
// only included when explicitly passed (row.token is only present on the
// one-time creation response and on the recipient-side /invites/lookup path
// that already requires the token to be known). The general /invites listing
// and audit responses never see the token.
function publicInvite(row, req) {
  const token = row.token || "";
  let inviteURL = "";
  if (token) {
    try {
      inviteURL = `${originFor(req)}/invite/${encodeURIComponent(token)}`;
    } catch {
      inviteURL = "";
    }
  }
  const result = {
    accepted_at: row.accepted_at,
    accepted_by: row.accepted_by,
    channel: row.channel,
    created_at: row.created_at,
    created_by: row.created_by,
    email: row.email,
    expires_at: row.expires_at,
    id: row.id,
    invite_url: inviteURL,
    mailto_url: "",
    name: row.name,
    role: row.role,
    send_error: row.send_error,
    send_status: row.send_status,
    sent_at: row.sent_at,
    status: row.status,
  };
  if (token) result.token = token;
  return result;
}

function normalizeStringList(values) {
  if (!Array.isArray(values)) return [];
  return values.map((value) => String(value || "").trim()).filter(Boolean);
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

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token).trim()).digest("hex");
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
