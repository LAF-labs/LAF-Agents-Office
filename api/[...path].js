const crypto = require("node:crypto");

const TERMINAL_TASK_STATUSES = ["done", "canceled"];
const SUPPORTED_LOCAL_CLI_RUNTIMES = ["codex", "claude-code"];
const MAX_REQUEST_BODY_BYTES = 512 * 1024;
const MAX_EXECUTION_EVENT_PAYLOAD_BYTES = 64 * 1024;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMITS = {
  authSignup: 12,
  bridgeEvents: 240,
  bridgeHeartbeat: 120,
  bridgePairingClaim: 30,
  bridgePairingStart: 12,
};
const HOSTED_WEB_COMMANDS = Object.freeze([
  { name: "1o1", description: "Open a direct conversation with an agent", webSupported: true },
  { name: "ask", description: "Ask the team lead", webSupported: true },
  { name: "cancel", description: "Cancel a task assignment", webSupported: true },
  { name: "clear", description: "Clear messages in this view", webSupported: true },
  { name: "growth", description: "Open Growth Center", webSupported: true },
  { name: "help", description: "Show commands and keys", webSupported: true },
  { name: "provider", description: "Switch default Bridge provider", webSupported: true },
  { name: "remember", description: "Store a fact in memory", webSupported: true },
  { name: "requests", description: "Open requests", webSupported: true },
  { name: "search", description: "Search messages and knowledge", webSupported: true },
  { name: "skills", description: "Open skills", webSupported: true },
  { name: "task", description: "Update a task", webSupported: true },
  { name: "tasks", description: "Open task board", webSupported: true },
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
  "bridge:pair_own",
  "bridge:read_own",
  "bridge:execute_own",
  "bridge:manage_own",
  "execution:plan_create",
  "execution:read",
  "execution:cancel",
  "execution:receipt_read",
  "execution:receipt_write",
  "mcp:use_task_context",
  "mcp:use_workspace_context",
  "audit:read",
];

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
    if (path === "bridge/availability" && req.method === "GET") {
      await handleBridgeAvailability(req, res);
      return;
    }
    if (path === "bridge/devices" && req.method === "GET") {
      await handleBridgeDevices(req, res);
      return;
    }
    if (path === "bridge/pairing/start" && req.method === "POST") {
      await handleBridgePairingStart(req, res);
      return;
    }
    if (path === "bridge/pairing/claim" && req.method === "POST") {
      await handleBridgePairingClaim(req, res);
      return;
    }
    const bridgeDeviceActionMatch = path.match(
      /^bridge\/devices\/([^/]+)\/(heartbeat|revoke|pending-plans)$/,
    );
    if (
      bridgeDeviceActionMatch &&
      req.method === "POST" &&
      ["heartbeat", "revoke"].includes(bridgeDeviceActionMatch[2])
    ) {
      const [, deviceID, action] = bridgeDeviceActionMatch;
      if (action === "heartbeat") {
        await handleBridgeDeviceHeartbeat(req, res, decodeURIComponent(deviceID));
      } else if (action === "revoke") {
        await handleBridgeDeviceRevoke(req, res, decodeURIComponent(deviceID));
      }
      return;
    }
    if (
      bridgeDeviceActionMatch &&
      req.method === "GET" &&
      bridgeDeviceActionMatch[2] === "pending-plans"
    ) {
      await handleBridgePendingPlans(req, res, decodeURIComponent(bridgeDeviceActionMatch[1]));
      return;
    }
    if (path === "execution/plans" && req.method === "POST") {
      await handleExecutionPlanCreate(req, res);
      return;
    }
    const executionPlanMatch = path.match(
      /^execution\/plans\/([^/]+)(?:\/(ack|start|events|complete|cancel))?$/,
    );
    if (executionPlanMatch) {
      const planID = decodeURIComponent(executionPlanMatch[1]);
      const action = executionPlanMatch[2] || "";
      if (!action && req.method === "GET") {
        await handleExecutionPlanGet(req, res, planID);
        return;
      }
      if (action === "cancel" && req.method === "POST") {
        await handleExecutionPlanCancel(req, res, planID);
        return;
      }
      if (action === "events" && req.method === "GET") {
        await handleExecutionPlanEvents(req, res, planID);
        return;
      }
      if (["ack", "start", "events", "complete"].includes(action) && req.method === "POST") {
        await handleBridgeExecutionPlanAction(req, res, planID, action);
        return;
      }
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

async function publishRelayEvent(topic, event, payload) {
  const endpoint = String(process.env.SUPABASE_REALTIME_BROADCAST_URL || "").trim()
    || (truthy(process.env.LAF_BRIDGE_RELAY_ENABLED)
      ? supabaseURL("/realtime/v1/api/broadcast")
      : "");
  if (!endpoint) return false;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: serviceHeaders(),
    body: JSON.stringify({
      messages: [
        {
          event,
          payload,
          topic,
        },
      ],
    }),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new HTTPError(response.status, responseErrorMessage(text, response.statusText));
  }
  return true;
}

async function publishExecutionPlanCreated(plan) {
  if (!plan?.device_id) return false;
  return await publishRelayEvent(
    `bridge:device:${plan.device_id}`,
    "execution.plan.created",
    {
      created_at: plan.created_at,
      expires_at: plan.expires_at,
      plan_id: plan.id,
      project_id: plan.project_id || null,
      task_id: plan.task_id || null,
      team_id: plan.team_id,
    },
  );
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

function looksLikeBridgeToken(value) {
  return /^laf_bridge_[a-f0-9]{20,}$/i.test(String(value || "").trim());
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
  if (looksLikeBridgeToken(token)) throw new HTTPError(401, "user authentication required");
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
        "bridge:execute_own",
        "execution:plan_create",
        "execution:read",
        "execution:cancel",
        "execution:receipt_read",
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
        "bridge:pair_own",
        "bridge:read_own",
        "bridge:execute_own",
        "bridge:manage_own",
        "execution:plan_create",
        "execution:read",
        "execution:cancel",
        "execution:receipt_read",
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
  if (value === "local_cli") return "my_bridge";
  if (value === "team_bridge") return "my_bridge";
  return ["laf_model", "my_bridge", "record_only"].includes(value)
    ? value
    : "record_only";
}

function isSupportedLocalCLIRuntime(raw) {
  const value = normalizeProviderKind(raw);
  return SUPPORTED_LOCAL_CLI_RUNTIMES.includes(value);
}

function cliDetailDetected(detail) {
  if (!detail || typeof detail !== "object") return false;
  if (!("detected" in detail)) return true;
  const detected = detail.detected;
  if (typeof detected === "boolean") return detected;
  return !["", "0", "false", "no", "off"].includes(String(detected).trim().toLowerCase());
}

function capabilitiesHaveSupportedLocalCLI(capabilities) {
  if (!capabilities || typeof capabilities !== "object") return false;
  const runtimes = Array.isArray(capabilities.provider_runtimes)
    ? capabilities.provider_runtimes
    : [];
  if (runtimes.some(isSupportedLocalCLIRuntime)) return true;
  const cliDetails =
    capabilities.cli_details && typeof capabilities.cli_details === "object"
      ? capabilities.cli_details
      : {};
  return Object.entries(cliDetails).some(
    ([name, detail]) => isSupportedLocalCLIRuntime(name) && cliDetailDetected(detail),
  );
}

function bridgeDeviceHasSupportedLocalCLI(device) {
  if (!device || device.revoked_at || device.status === "revoked") return false;
  return capabilitiesHaveSupportedLocalCLI(device.capabilities);
}

function bridgeDeviceProviderRuntimes(device) {
  const caps = device?.capabilities && typeof device.capabilities === "object"
    ? device.capabilities
    : {};
  const runtimes = Array.isArray(caps.provider_runtimes) ? caps.provider_runtimes : [];
  const detailRuntimes = caps.cli_details && typeof caps.cli_details === "object"
    ? Object.entries(caps.cli_details)
        .filter(([, detail]) => cliDetailDetected(detail))
        .map(([name]) => name)
    : [];
  return [
    ...new Set(
      [...runtimes, ...detailRuntimes]
        .map(normalizeProviderKind)
        .filter(isSupportedLocalCLIRuntime),
    ),
  ];
}

function executionProviderRuntime(provider) {
  const value = String(provider || "").trim().toLowerCase().replace(/-/g, "_");
  if (value === "claude_code" || value === "claude") return "claude-code";
  if (value === "codex") return "codex";
  return "";
}

function bridgeDeviceSupportsProvider(device, provider) {
  const runtime = executionProviderRuntime(provider);
  if (!runtime) return true;
  return bridgeDeviceProviderRuntimes(device).includes(runtime);
}

function defaultExecutionProviderForBridgeDevice(device) {
  const runtimes = bridgeDeviceProviderRuntimes(device);
  if (runtimes.includes("codex")) return "codex";
  if (runtimes.includes("claude-code")) return "claude_code";
  return "";
}

function bridgeProviderLabel(provider) {
  return executionProviderRuntime(provider) === "claude-code"
    ? "Claude Code"
    : "Codex";
}

function selectBridgeExecutionDevice(devices, provider = "") {
  const usable = (devices || []).filter(
    (device) => !device.revoked_at && device.status !== "revoked",
  );
  if (usable.length === 0) {
    throw new HTTPError(400, "no paired LAF Bridge detected");
  }
  const online = usable.filter((device) => device.status === "online");
  if (online.length === 0) {
    throw new HTTPError(400, "no online LAF Bridge detected");
  }
  const capable = online.filter(bridgeDeviceHasSupportedLocalCLI);
  if (capable.length === 0) {
    throw new HTTPError(409, "LAF Bridge has no supported local CLI detected");
  }
  if (!provider) {
    return (
      capable.find((device) => bridgeDeviceSupportsProvider(device, "codex")) ||
      capable[0]
    );
  }
  const device = capable.find((candidate) =>
    bridgeDeviceSupportsProvider(candidate, provider),
  );
  if (!device) {
    throw new HTTPError(
      409,
      `LAF Bridge has not detected ${bridgeProviderLabel(provider)} CLI`,
    );
  }
  return device;
}

async function bridgeDevicesForMembership(membership) {
  const query = {
    select: "*",
    status: "not.in.(revoked)",
    team_id: `eq.${membership.team_id}`,
    user_id: `eq.${membership.user_id}`,
    order: "updated_at.desc",
  };
  return await rest("bridge_devices", { query }).catch(() => []);
}

function bridgeAvailabilityFromDevices(membership, devices) {
  const usable = (devices || []).filter((device) => !device.revoked_at && device.status !== "revoked");
  const online = usable.filter((device) => device.status === "online");
  const capable = online.filter(bridgeDeviceHasSupportedLocalCLI);
  const defaultDevice =
    capable.find((device) => bridgeDeviceSupportsProvider(device, "codex")) ||
    capable[0] ||
    online[0];
  const canExecute = hasPermission(membership, "bridge:execute_own");
  const available = canExecute && capable.length > 0;
  const reason = available
    ? ""
    : !canExecute
      ? "permission required: bridge:execute_own"
      : usable.length === 0
        ? "no paired LAF Bridge detected"
        : online.length === 0
          ? "no online LAF Bridge detected"
          : "no supported local CLI detected";
  return {
    available,
    default_device_id: defaultDevice?.id || "",
    device_count: usable.length,
    online_device_count: online.length,
    runtimes: [...new Set(online.flatMap(bridgeDeviceProviderRuntimes))],
    reason,
  };
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
  const bridgeState = bridgeAvailabilityFromDevices(
    membership,
    await bridgeDevicesForMembership(membership),
  );
  const lafAllowed = paid && hasPermission(membership, "model:use_laf");
  const myBridgeAllowed = bridgeState.available;
  const allowedModes = ["record_only"];
  if (lafAllowed) allowedModes.unshift("laf_model");
  if (myBridgeAllowed) allowedModes.push("my_bridge");
  const defaultMode = lafAllowed
    ? "laf_model"
    : myBridgeAllowed
      ? "my_bridge"
      : "record_only";
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
    my_bridge: {
      available: myBridgeAllowed,
      reason: bridgeState.reason,
      runtimes: [...new Set(bridgeState.runtimes || [])],
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

async function writeBridgeAuditEvent(device, action, targetType, targetID, metadata = {}, options = {}) {
  return await writeTeamAuditEvent(
    device?.team_id,
    device?.user_id,
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
    : await workspaceHasAnyProject(membership.team_id);
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
    ? { project: null, task: null }
    : await seedOnboardingWorkspace(membership, team, body);
  await writeAuditEvent(membership, "onboarding.completed", "team", membership.team_id, {
    project_id: seeded.project?.id || "",
    task_id: seeded.task?.id || "",
  });
  writeJSON(res, 200, {
    config: hostedConfigSnapshot({ settings, team, user }),
    onboarded: true,
    project: seeded.project ? publicProject(seeded.project) : null,
    status: "ok",
    task: seeded.task ? publicTask(seeded.task, { [seeded.project.id]: seeded.project }) : null,
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

async function seedOnboardingWorkspace(membership, team, body) {
  const title = truncateText(body.task || body.first_task || "", 200);
  if (!title || body.skip_task === true) return { project: null, task: null };

  let project = await firstTeamProject(membership.team_id);
  if (!project) {
    const name = truncateText(body.company || body.company_name || team?.name || "First project", 120);
    const [created] = await rest("projects", {
      method: "POST",
      body: {
        additional_info: truncateText(body.priority || body.company_priority || "", 1000),
        channel: "general",
        created_by: membership.user_id,
        description: truncateText(body.description || body.company_description || "", 2000),
        local_id: await uniqueProjectLocalID(membership.team_id, name),
        name,
        status: "active",
        team_id: membership.team_id,
      },
    });
    project = created;
    await writeAuditEvent(membership, "project.created", "project", project.id, {
      source: "onboarding",
    });
  }

  const { task } = await createTask(membership, {
    action: "create",
    channel: project.channel || "general",
    details: truncateText(body.description || "", 2000),
    execution_mode: "office",
    model_mode: "record_only",
    project_id: project.local_id || project.id,
    title,
  });
  return {
    project,
    task: await findTask(membership.team_id, task.id),
  };
}

async function firstTeamProject(teamID) {
  const rows = await rest("projects", {
    query: {
      limit: "1",
      order: "created_at.asc",
      select: "*",
      team_id: `eq.${teamID}`,
    },
  });
  return rows?.[0] || null;
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
  let executionPlan = null;
  if (shouldCreateHomeBridgePlan(message)) {
    try {
      const created = await createHomeBridgeExecutionPlan(membership, message, body);
      executionPlan = created.plan;
    } catch (err) {
      await createHostedChannelMessage(membership, {
        channel: message.channel,
        content: homeBridgeFailureMessage(err),
        from: "system",
        home_session_thread_id: message.home_session_thread_id || message.thread_id,
        kind: "system",
        model_mode: message.model_mode,
        reply_to: message.id,
        scope: message.scope,
        thread_id: message.thread_id || message.home_session_thread_id,
      }).catch(() => null);
    }
  }
  writeJSON(res, 200, {
    ...message,
    execution_plan_id: executionPlan?.id || "",
  });
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

function hostedTaskExecutionMode(project) {
  if (!project?.github_repo_url) return "office";
  try {
    return normalizeGitHubRepoURL(project.github_repo_url) ? "managed_checkout" : "office";
  } catch {
    return "office";
  }
}

function publicTaskExecutionMode(value) {
  const mode = String(value || "").trim();
  if (mode === "local_worktree" || mode === "managed_checkout") return "managed_checkout";
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

function shouldCreateHomeBridgePlan(message) {
  const mode = normalizeModelMode(message?.model_mode);
  return message?.scope === "home_orchestration" && mode === "my_bridge";
}

async function createHomeBridgeExecutionPlan(membership, message, body = {}) {
  const mode = normalizeModelMode(message.model_mode);
  if (mode !== "my_bridge") throw new HTTPError(400, "home bridge plan requires my_bridge mode");
  requirePermission(membership, "bridge:execute_own");
  requirePermission(membership, "execution:plan_create");
  requirePermission(membership, "task:execute_agent");
  const devices = await bridgeDevicesForMembership(membership);
  const requestedProvider = String(body.provider || "").trim()
    ? normalizeExecutionProvider(body.provider, mode)
    : "";
  const device = selectBridgeExecutionDevice(devices, requestedProvider);
  const provider =
    requestedProvider || defaultExecutionProviderForBridgeDevice(device);

  const requiredPermissions = [];
  const effective = effectivePermissions(membership);
  const expiresInSeconds = clamp(Number(body.expires_in_seconds || 900), 120, 3600);
  const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();
  const planID = crypto.randomUUID ? crypto.randomUUID() : `plan-${shortID()}`;
  const agentSlug = normalizeStringList(message.tagged || [])[0] || "ceo";
  const policy = {
    ...objectValue(body.policy),
    agent_slug: agentSlug,
    channel: message.channel || "general",
    home_session_thread_id: message.home_session_thread_id || message.thread_id || "",
    message_id: message.id,
    sandbox: objectValue(body.policy).sandbox || "read-only",
    source: "home_message",
  };
  const plan = {
    actor_user_id: membership.user_id,
    cancel_requested_at: null,
    completed_at: null,
    context_refs: [],
    created_at: nowISO(),
    device_id: device.id,
    dispatched_at: null,
    effective_permissions: effective,
    executor_user_id: device.user_id || membership.user_id,
    expires_at: expiresAt,
    id: planID,
    mode,
    policy,
    project_id: null,
    prompt: homeBridgePrompt(message, agentSlug),
    provider,
    required_permissions: requiredPermissions,
    started_at: null,
    status: "pending",
    task_id: null,
    team_id: membership.team_id,
  };
  const signed = signExecutionPlan(plan);
  const [created] = await rest("execution_plans", {
    method: "POST",
    body: {
      ...plan,
      local_approval_status: "pending",
      nonce: signed.nonce,
      payload_hash: signed.payload_hash,
      signature: signed.signature,
      signature_alg: signed.signature_alg,
      signature_key_id: signed.signature_key_id,
      updated_at: nowISO(),
    },
  });
  let relay = { published: false };
  try {
    relay.published = await publishExecutionPlanCreated(created);
  } catch (err) {
    relay = { error: redactSensitiveText(err?.message || String(err)), published: false };
  }
  return { plan: created, relay };
}

function homeBridgePrompt(message, agentSlug) {
  return [
    `You are @${agentSlug} in LAF Office home chat.`,
    "Answer the user's latest message directly and concisely.",
    "Use the same language as the user unless they ask otherwise.",
    "Do not modify files, run deploys, or perform destructive actions from this home chat plan.",
    "",
    "User message:",
    message.content || "",
  ].join("\n");
}

function homeBridgeFailureMessage(err) {
  return `LAF Bridge 실행을 시작하지 못했습니다. ${homeBridgeFailureDetail(err)}`;
}

function homeBridgeFailureDetail(err) {
  const detail = err instanceof HTTPError ? err.message : err?.message || String(err || "");
  switch (String(detail || "").trim()) {
    case "no paired LAF Bridge detected":
      return "Settings에서 LAF Bridge를 먼저 연결하세요.";
    case "no online LAF Bridge detected":
      return "LAF Bridge가 오프라인입니다. Bridge 터미널을 다시 연결해주세요.";
    case "LAF Bridge has no supported local CLI detected":
    case "no supported local CLI detected":
      return "LAF Bridge가 Codex/Claude Code CLI를 감지하지 못했습니다.";
    case "permission required: bridge:execute_own":
      return "이 계정에는 LAF Bridge 실행 권한이 없습니다.";
    case "permission required: execution:plan_create":
      return "이 계정에는 실행 계획 생성 권한이 없습니다.";
    case "permission required: task:execute_agent":
      return "이 계정에는 에이전트 실행 권한이 없습니다.";
    default:
      return redactSensitiveText(detail || "Bridge 상태를 확인해 주세요.");
  }
}

function executionPlanPolicy(rawPolicy, project) {
  const policy = objectValue(rawPolicy);
  if (!project) return policy;
  const repoURL = normalizeGitHubRepoURL(project.github_repo_url || "");
  return {
    ...policy,
    github_repo_url: repoURL || undefined,
    project_id: project.id,
    project_slug: project.local_id || project.id,
    project_name: project.name || "",
  };
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
        ? "Repository URL is configured. Connect LAF Bridge for managed checkout."
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
  if (TERMINAL_TASK_STATUSES.includes(updated.status)) {
    await closeExecutionPlansForTask(updated, updated.status === "canceled" ? "cancelled" : "completed");
  }
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
  const executionMode = hostedTaskExecutionMode(project);
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
      execution_mode: executionMode,
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

async function handleBridgeAvailability(req, res) {
  const { membership } = await requireUser(req);
  requirePermission(membership, "bridge:read_own");
  const ownDevices = await bridgeDevicesForMembership(membership);
  writeJSON(res, 200, {
    my_bridge: bridgeAvailabilityFromDevices(membership, ownDevices),
    devices: ownDevices.map(publicBridgeDevice),
  });
}

async function handleBridgeDevices(req, res) {
  const { membership } = await requireUser(req);
  requirePermission(membership, "bridge:read_own");
  const devices = await bridgeDevicesForMembership(membership);
  writeJSON(res, 200, { devices: devices.map(publicBridgeDevice) });
}

async function handleBridgePairingStart(req, res) {
  const { membership } = await requireUser(req);
  requirePermission(membership, "bridge:pair_own");
  enforceRateLimit(
    "bridge_pairing_start",
    `${membership.team_id}:${membership.user_id}`,
    RATE_LIMITS.bridgePairingStart,
  );
  const body = await readBody(req);
  const apiURL = pairingCommandAPIURL(req, body.api_url);
  const code = generatePairingCode();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const now = nowISO();
  await rest("bridge_pairing_codes", {
    method: "POST",
    body: {
      code_hash: hashToken(normalizePairingCode(code)),
      created_at: now,
      expires_at: expiresAt,
      status: "pending",
      team_id: membership.team_id,
      user_id: membership.user_id,
    },
  });
  writeJSON(res, 200, bridgePairingStartResponse(apiURL, code, membership.team_id, expiresAt));
}

async function handleBridgePairingClaim(req, res) {
  const body = await readBody(req);
  const code = normalizePairingCode(body.code || body.pairing_code || "");
  if (!code) throw new HTTPError(400, "pairing code is required");
  enforceRateLimit(
    "bridge_pairing_claim",
    `${clientRateLimitKey(req)}:${hashToken(code).slice(0, 12)}`,
    RATE_LIMITS.bridgePairingClaim,
  );
  const publicKey = normalizeBridgePublicKey(body.public_key);
  const deviceLabel = String(body.device_label || body.name || "").trim();
  if (!deviceLabel) throw new HTTPError(400, "device_label is required");
  const planSigningKeyPair = signingKeyPair();
  const planSigningPublicKey = executionPlanSigningPublicKeyPEM();
  const now = nowISO();
  const rows = await rest("bridge_pairing_codes", {
    query: {
      code_hash: `eq.${hashToken(code)}`,
      limit: "1",
      select: "*",
      status: "eq.pending",
    },
  });
  const pairing = rows?.[0];
  if (!pairing) throw new HTTPError(410, "pairing code expired or already used");
  if (pairing.expires_at && new Date(pairing.expires_at).getTime() <= Date.now()) {
    await rest("bridge_pairing_codes", {
      method: "PATCH",
      query: { id: `eq.${pairing.id}`, status: "eq.pending" },
      body: { status: "expired" },
    });
    throw new HTTPError(410, "pairing code expired or already used");
  }
  const claimed = await rest("bridge_pairing_codes", {
    method: "PATCH",
    query: { id: `eq.${pairing.id}`, status: "eq.pending" },
    body: { claimed_at: now, status: "claimed" },
  });
  if (!claimed?.length) throw new HTTPError(409, "pairing code was already claimed");

  const bridgeToken = `laf_bridge_${crypto.randomBytes(24).toString("hex")}`;
  let device;
  try {
    [device] = await rest("bridge_devices", {
      method: "POST",
      body: {
        arch: String(body.arch || "").trim(),
        bridge_version: String(body.bridge_version || "").trim(),
        capabilities: sanitizeBridgeCapabilities(body.capabilities || {}),
        created_at: now,
        device_kind: "desktop",
        device_label: deviceLabel,
        last_seen_at: now,
        paired_at: now,
        platform: String(body.platform || "").trim(),
        public_key: publicKey,
        status: "online",
        team_id: pairing.team_id,
        token_hash: hashToken(bridgeToken),
        updated_at: now,
        user_id: pairing.user_id,
      },
    });
  } catch (err) {
    await rest("bridge_pairing_codes", {
      method: "PATCH",
      query: { id: `eq.${pairing.id}`, status: "eq.claimed" },
      body: { claimed_at: null, status: "pending" },
    }).catch(() => {});
    throw err;
  }
  await rest("bridge_pairing_codes", {
    method: "PATCH",
    query: { id: `eq.${pairing.id}` },
    body: { claimed_device_id: device.id },
  });
  writeJSON(res, 200, {
    bridge_token: bridgeToken,
    device: publicBridgeDevice(device),
    plan_signing_key_id: planSigningKeyPair.key_id,
    plan_signing_public_key: planSigningPublicKey,
  });
}

async function handleBridgeDeviceHeartbeat(req, res, deviceID) {
  const device = await requireBridgeDevice(req);
  if (device.id !== deviceID) throw new HTTPError(403, "bridge device token mismatch");
  enforceRateLimit("bridge_heartbeat", device.id, RATE_LIMITS.bridgeHeartbeat);
  const body = await readBody(req);
  const now = nowISO();
  const [updated] = await rest("bridge_devices", {
    method: "PATCH",
    query: { id: `eq.${device.id}`, status: "not.in.(revoked)" },
    body: {
      arch: body.arch === undefined ? device.arch || "" : String(body.arch || "").trim(),
      bridge_version:
        body.bridge_version === undefined
          ? device.bridge_version || ""
          : String(body.bridge_version || "").trim(),
      capabilities: sanitizeBridgeCapabilities(body.capabilities || device.capabilities || {}),
      last_seen_at: now,
      platform:
        body.platform === undefined ? device.platform || "" : String(body.platform || "").trim(),
      status: body.status === "offline" ? "offline" : "online",
      updated_at: now,
    },
  });
  if (!updated) throw new HTTPError(404, "bridge device not found");
  writeJSON(res, 200, { device: publicBridgeDevice(updated) });
}

async function handleBridgeDeviceRevoke(req, res, deviceID) {
  const { membership } = await requireUser(req);
  const rows = await rest("bridge_devices", {
    query: {
      id: `eq.${deviceID}`,
      limit: "1",
      select: "*",
      team_id: `eq.${membership.team_id}`,
      user_id: `eq.${membership.user_id}`,
    },
  });
  const device = rows?.[0];
  if (!device) throw new HTTPError(404, "bridge device not found");
  requirePermission(membership, "bridge:manage_own");
  const now = nowISO();
  await writeAuditEvent(
    membership,
    "bridge.device_revoked",
    "bridge_device",
    device.id,
    {
      device_kind: device.device_kind,
    },
    { required: true },
  );
  const [updated] = await rest("bridge_devices", {
    method: "PATCH",
    query: { id: `eq.${device.id}`, team_id: `eq.${membership.team_id}` },
    body: {
      revoked_at: now,
      revoked_by: membership.user_id,
      status: "revoked",
      token_hash: hashToken(`${device.id}:${now}:revoked`),
      updated_at: now,
    },
  });
  writeJSON(res, 200, { device: publicBridgeDevice(updated) });
}

async function handleBridgePendingPlans(req, res, deviceID) {
  const device = await requireBridgeDevice(req);
  if (device.id !== deviceID) throw new HTTPError(403, "bridge device token mismatch");
  const rows = await rest("execution_plans", {
    query: {
      device_id: `eq.${device.id}`,
      select: "*",
      status: "in.(pending,dispatched,acknowledged,running)",
      team_id: `eq.${device.team_id}`,
      order: "created_at.asc",
    },
  }).catch(() => []);
  const now = Date.now();
  const plans = [];
  for (const plan of rows || []) {
    if (plan.expires_at && Date.parse(plan.expires_at) <= now) {
      await rest("execution_plans", {
        method: "PATCH",
        query: {
          id: `eq.${plan.id}`,
          status: "not.in.(completed,failed,cancelled,expired)",
          team_id: `eq.${device.team_id}`,
        },
        body: { last_error: "execution plan expired", status: "expired", updated_at: nowISO() },
      }).catch(() => {});
      continue;
    }
    plans.push(bridgeExecutionPlan(plan));
  }
  writeJSON(res, 200, { plans });
}

async function handleExecutionPlanCreate(req, res) {
  const { membership } = await requireUser(req);
  requirePermission(membership, "execution:plan_create");
  requirePermission(membership, "task:execute_agent");
  const body = await readBody(req);
  const mode = normalizeModelMode(body.mode);
  if (mode === "record_only") throw new HTTPError(400, "record_only mode cannot create execution plans");
  if (mode === "my_bridge") requirePermission(membership, "bridge:execute_own");
  let provider =
    mode === "my_bridge" && !String(body.provider || "").trim()
      ? ""
      : normalizeExecutionProvider(body.provider, mode);
  const task = await findTask(membership.team_id, body.task_id || body.taskID || body.taskId);
  const project = task.project_id ? await getProjectByID(membership.team_id, task.project_id) : null;
  const prompt = String(body.message || body.prompt || "").trim();
  if (!prompt) throw new HTTPError(400, "message is required");
  if (String(body.binding_id || "").trim()) {
    throw new HTTPError(400, "my_bridge uses managed checkout; local binding execution is not supported");
  }
  const deviceID = String(body.device_id || "").trim();
  const target = await resolveExecutionTarget({
    deviceID,
    membership,
    mode,
    provider,
    project,
  });
  if (mode === "my_bridge" && !provider) {
    provider = defaultExecutionProviderForBridgeDevice(target.device);
  }
  const requiredPermissions = normalizeStringList(body.required_permissions || []);
  const effective = effectivePermissions(membership);
  for (const permission of requiredPermissions) {
    if (!effective.includes(permission)) {
      throw new HTTPError(403, `required permission exceeds actor scope: ${permission}`);
    }
  }
  const now = Date.now();
  const expiresInSeconds = clamp(Number(body.expires_in_seconds || 900), 120, 3600);
  const planID = crypto.randomUUID ? crypto.randomUUID() : `plan-${shortID()}`;
  const expiresAt = new Date(now + expiresInSeconds * 1000).toISOString();
  const plan = {
    actor_user_id: membership.user_id,
    cancel_requested_at: null,
    completed_at: null,
    context_refs: [],
    created_at: nowISO(),
    device_id: target.device?.id || null,
    dispatched_at: null,
    effective_permissions: effective,
    executor_user_id: target.device?.user_id || membership.user_id,
    expires_at: expiresAt,
    id: planID,
    mode,
    policy: executionPlanPolicy(body.policy, project),
    project_id: project?.id || null,
    prompt,
    provider,
    required_permissions: requiredPermissions,
    started_at: null,
    status: "pending",
    task_id: task.id,
    team_id: membership.team_id,
  };
  const signed = signExecutionPlan(plan);
  const [created] = await rest("execution_plans", {
    method: "POST",
    body: {
      ...plan,
      local_approval_status: "pending",
      nonce: signed.nonce,
      payload_hash: signed.payload_hash,
      signature: signed.signature,
      signature_alg: signed.signature_alg,
      signature_key_id: signed.signature_key_id,
      updated_at: nowISO(),
    },
  });
  let relay = { published: false };
  try {
    relay.published = await publishExecutionPlanCreated(created);
  } catch (err) {
    relay = { error: redactSensitiveText(err?.message || String(err)), published: false };
  }
  writeJSON(res, 200, { plan: publicExecutionPlan(created), relay });
}

async function handleExecutionPlanGet(req, res, planID) {
  const { membership } = await requireUser(req);
  requirePermission(membership, "execution:read");
  const plan = await findExecutionPlan(membership.team_id, planID);
  const receipt = hasPermission(membership, "execution:receipt_read")
    ? await findExecutionReceipt(plan.id)
    : null;
  writeJSON(res, 200, {
    plan: publicExecutionPlan(plan),
    receipt: receipt ? publicExecutionReceipt(receipt) : null,
  });
}

async function handleExecutionPlanCancel(req, res, planID) {
  const { membership } = await requireUser(req);
  requirePermission(membership, "execution:cancel");
  const plan = await findExecutionPlan(membership.team_id, planID);
  if (["completed", "failed", "cancelled", "expired"].includes(plan.status)) {
    throw new HTTPError(409, `execution plan is already terminal (${plan.status})`);
  }
  const now = nowISO();
  await writeAuditEvent(
    membership,
    "execution.plan_cancelled",
    "execution_plan",
    plan.id,
    { status: plan.status },
    { required: true },
  );
  const [updated] = await rest("execution_plans", {
    method: "PATCH",
    query: { id: `eq.${plan.id}`, team_id: `eq.${membership.team_id}` },
    body: {
      cancel_requested_at: now,
      status: plan.status === "pending" || plan.status === "dispatched" || plan.status === "acknowledged"
        ? "cancelled"
        : plan.status,
      updated_at: now,
    },
  });
  writeJSON(res, 200, { plan: publicExecutionPlan(updated), cancelled: true });
}

async function handleExecutionPlanEvents(req, res, planID) {
  const { membership } = await requireUser(req);
  requirePermission(membership, "execution:read");
  const plan = await findExecutionPlan(membership.team_id, planID);
  const rows = await rest("execution_events", {
    query: {
      order: "created_at.asc",
      plan_id: `eq.${plan.id}`,
      select: "*",
      team_id: `eq.${membership.team_id}`,
    },
  }).catch(() => []);
  writeJSON(res, 200, { events: (rows || []).map(publicExecutionEvent) });
}

async function handleBridgeExecutionPlanAction(req, res, planID, action) {
  const device = await requireBridgeDevice(req);
  const plan = await findExecutionPlanForBridge(device, planID);
  if (action === "ack") {
    await handleBridgeExecutionPlanAck(req, res, device, plan);
    return;
  }
  if (action === "start") {
    await handleBridgeExecutionPlanStart(req, res, device, plan);
    return;
  }
  if (action === "events") {
    await handleBridgeExecutionPlanEvent(req, res, device, plan);
    return;
  }
  if (action === "complete") {
    await handleBridgeExecutionPlanComplete(req, res, device, plan);
  }
}

async function handleBridgeExecutionPlanAck(req, res, device, plan) {
  ensureExecutionPlanNotTerminal(plan);
  const body = await readBody(req);
  const now = nowISO();
  const leaseSeconds = clamp(Number(body.lease_seconds || 300), 30, 1800);
  const [updated] = await rest("execution_plans", {
    method: "PATCH",
    query: {
      device_id: `eq.${device.id}`,
      id: `eq.${plan.id}`,
      status: "not.in.(completed,failed,cancelled,expired)",
      team_id: `eq.${device.team_id}`,
    },
    body: {
      acknowledged_at: plan.acknowledged_at || now,
      lease_until: new Date(Date.now() + leaseSeconds * 1000).toISOString(),
      status:
        plan.status === "pending" || plan.status === "dispatched"
          ? "acknowledged"
          : plan.status,
      updated_at: now,
    },
  });
  writeJSON(res, 200, { plan: bridgeExecutionPlan(updated || plan) });
}

async function handleBridgeExecutionPlanStart(req, res, device, plan) {
  ensureExecutionPlanNotTerminal(plan);
  const body = await readBody(req);
  const now = nowISO();
  if (body.local_approval_status === "denied") {
    const reason = truncateText(
      redactSensitiveText(body.reason || body.error || "local approval denied"),
      500,
    );
    await writeBridgeAuditEvent(
      device,
      "execution.local_approval_denied",
      "execution_plan",
      plan.id,
      { reason },
      { required: true },
    );
    const [updated] = await rest("execution_plans", {
      method: "PATCH",
      query: {
        device_id: `eq.${device.id}`,
        id: `eq.${plan.id}`,
        status: "not.in.(completed,failed,cancelled,expired)",
        team_id: `eq.${device.team_id}`,
      },
      body: {
        cancel_requested_at: now,
        last_error: reason,
        lease_until: null,
        local_approval_status: "denied",
        status: "cancelled",
        updated_at: now,
      },
    });
    writeJSON(res, 200, { plan: bridgeExecutionPlan(updated || { ...plan, status: "cancelled" }) });
    return;
  }
  const [updated] = await rest("execution_plans", {
    method: "PATCH",
    query: {
      device_id: `eq.${device.id}`,
      id: `eq.${plan.id}`,
      status: "not.in.(completed,failed,cancelled,expired)",
      team_id: `eq.${device.team_id}`,
    },
    body: {
      lease_until: new Date(
        Date.now() + clamp(Number(body.lease_seconds || 300), 30, 1800) * 1000,
      ).toISOString(),
      local_approval_status:
        body.local_approval_status === "approved" || body.local_approval_status === "not_required"
          ? body.local_approval_status
          : plan.local_approval_status || "pending",
      started_at: plan.started_at || now,
      status: "running",
      updated_at: now,
    },
  });
  writeJSON(res, 200, { plan: bridgeExecutionPlan(updated || plan) });
}

async function handleBridgeExecutionPlanEvent(req, res, device, plan) {
  ensureExecutionPlanNotTerminal(plan);
  enforceRateLimit(
    "bridge_execution_events",
    `${device.id}:${plan.id}`,
    RATE_LIMITS.bridgeEvents,
  );
  const body = await readBody(req);
  const sequence = Number(body.sequence);
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new HTTPError(400, "sequence must be a positive integer");
  }
  const eventType = String(body.event_type || body.kind || "").trim();
  if (!eventType) throw new HTTPError(400, "event_type is required");
  const payload = redactSensitiveValue(body.payload || {});
  assertJSONByteSize(payload, MAX_EXECUTION_EVENT_PAYLOAD_BYTES, "event payload");
  const [event] = await rest("execution_events", {
    method: "POST",
    body: {
      created_at: nowISO(),
      event_type: eventType,
      payload,
      plan_id: plan.id,
      redacted: true,
      sequence,
      task_id: plan.task_id || null,
      team_id: device.team_id,
    },
  });
  writeJSON(res, 200, { event: publicExecutionEvent(event) });
}

async function handleBridgeExecutionPlanComplete(req, res, device, plan) {
  const body = await readBody(req);
  const status = normalizeExecutionTerminalStatus(body.status);
  if (["completed", "failed", "cancelled"].includes(plan.status)) {
    const existingReceipt = await findExecutionReceipt(plan.id);
    if (!existingReceipt) {
      throw new HTTPError(409, `execution plan is already terminal (${plan.status})`);
    }
    writeJSON(res, 200, {
      plan: bridgeExecutionPlan(plan),
      receipt: publicExecutionReceipt(existingReceipt),
    });
    return;
  }
  ensureExecutionPlanNotTerminal(plan);
  const now = nowISO();
  const [updated] = await rest("execution_plans", {
    method: "PATCH",
    query: {
      device_id: `eq.${device.id}`,
      id: `eq.${plan.id}`,
      status: "not.in.(completed,failed,cancelled,expired)",
      team_id: `eq.${device.team_id}`,
    },
    body: {
      completed_at: now,
      last_error: status === "failed" ? redactSensitiveText(body.error || body.summary || "") : "",
      lease_until: null,
      status,
      updated_at: now,
    },
  });
  const { created: receiptCreated, receipt } = await ensureExecutionReceipt(
    updated || { ...plan, status, completed_at: now },
    body,
  );
  const finalPlan = updated || { ...plan, status, completed_at: now };
  if (receiptCreated) {
    await ensureExecutionDeliveryReceipt(finalPlan, receipt);
    await ensureExecutionTaskThreadReceiptEvent(finalPlan, receipt);
  }
  await ensureExecutionHomeReplyMessage(finalPlan, receipt);
  writeJSON(res, 200, {
    plan: bridgeExecutionPlan(updated || { ...plan, status, completed_at: now }),
    receipt: publicExecutionReceipt(receipt),
  });
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

async function requireBridgeDevice(req) {
  const token =
    bearer(req) ||
    req.headers["x-laf-bridge-token"] ||
    "";
  if (!token) throw new HTTPError(401, "bridge token required");
  const rows = await rest("bridge_devices", {
    query: {
      limit: "1",
      select: "*",
      token_hash: `eq.${hashToken(token)}`,
    },
  });
  const device = rows?.[0];
  if (!device || device.status === "revoked" || device.revoked_at) {
    throw new HTTPError(401, "bridge device unauthorized");
  }
  return device;
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

async function findExecutionPlan(teamID, planID) {
  const rows = await rest("execution_plans", {
    query: {
      id: `eq.${String(planID || "").trim()}`,
      limit: "1",
      select: "*",
      team_id: `eq.${teamID}`,
    },
  });
  if (!rows?.length) throw new HTTPError(404, "execution plan not found");
  return rows[0];
}

async function findExecutionPlanForBridge(device, planID) {
  const rows = await rest("execution_plans", {
    query: {
      device_id: `eq.${device.id}`,
      id: `eq.${String(planID || "").trim()}`,
      limit: "1",
      select: "*",
      team_id: `eq.${device.team_id}`,
    },
  });
  const plan = rows?.[0];
  if (!plan) throw new HTTPError(404, "execution plan not found");
  if (plan.executor_user_id && plan.executor_user_id !== device.user_id) {
    throw new HTTPError(403, "bridge device cannot execute this plan");
  }
  return plan;
}

async function findExecutionReceipt(planID) {
  const rows = await rest("execution_receipts", {
    query: {
      limit: "1",
      plan_id: `eq.${String(planID || "").trim()}`,
      select: "*",
    },
  }).catch(() => []);
  return rows?.[0] || null;
}

async function ensureExecutionReceipt(plan, body) {
  const existing = await findExecutionReceipt(plan.id);
  if (existing) return { created: false, receipt: existing };
  const now = nowISO();
  const [receipt] = await rest("execution_receipts", {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=representation",
    query: { on_conflict: "plan_id" },
    body: {
      actor_user_id: plan.actor_user_id || null,
      artifacts: redactSensitiveValue(arrayOrEmpty(body.artifacts)),
      changed_files: redactSensitiveValue(arrayOrEmpty(body.changed_files)),
      completed_at: plan.completed_at || now,
      created_at: now,
      device_id: plan.device_id || null,
      executor_user_id: plan.executor_user_id || null,
      mode: plan.mode,
      plan_id: plan.id,
      project_id: plan.project_id || null,
      provider: plan.provider,
      provider_version: truncateText(body.provider_version || "", 80),
      started_at: plan.started_at || body.started_at || null,
      status: normalizeExecutionTerminalStatus(plan.status),
      summary: truncateText(redactSensitiveText(body.summary || body.message || ""), 2000),
      task_id: plan.task_id || null,
      team_id: plan.team_id,
      test_results: redactSensitiveValue(arrayOrEmpty(body.test_results)),
      usage: redactSensitiveValue(
        body.usage && typeof body.usage === "object" && !Array.isArray(body.usage)
          ? body.usage
          : {},
      ),
    },
  });
  return { created: true, receipt };
}

async function ensureExecutionDeliveryReceipt(plan, receipt) {
  if (!plan?.task_id || !plan?.team_id) return;
  await rest("delivery_receipts", {
    method: "POST",
    body: {
      delivery_checked_at: receipt.completed_at || nowISO(),
      delivery_checks_status: "",
      delivery_draft: false,
      delivery_merge_state: "",
      delivery_review_decision: "",
      delivery_status: receipt.status || "",
      delivery_summary: redactSensitiveText(receipt.summary || ""),
      delivery_url: deliveryURLFromReceipt(receipt),
      project_id: plan.project_id || null,
      task_id: plan.task_id,
      team_id: plan.team_id,
    },
  });
}

function deliveryURLFromReceipt(receipt) {
  for (const artifact of arrayOrEmpty(receipt?.artifacts)) {
    const item = artifact && typeof artifact === "object" ? artifact : {};
    const url = String(item.url || item.href || "").trim();
    if (!url || !/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/pull\/[0-9]+\/?$/.test(url)) {
      continue;
    }
    return truncateText(redactSensitiveText(url.replace(/\/$/, "")), 500);
  }
  return "";
}

async function ensureExecutionTaskThreadReceiptEvent(plan, receipt) {
  if (!plan?.id || !plan?.task_id || !plan?.team_id) return;
  const events = await rest("execution_events", {
    query: {
      plan_id: `eq.${plan.id}`,
      select: "*",
      team_id: `eq.${plan.team_id}`,
    },
  }).catch(() => []);
  const maxSequence = (events || []).reduce((max, row) => {
    const sequence = Number(row?.sequence);
    return Number.isInteger(sequence) && sequence > max ? sequence : max;
  }, 0);
  const taskRows = await rest("tasks", {
    query: {
      id: `eq.${plan.task_id}`,
      limit: "1",
      select: "id,local_id,thread_id",
      team_id: `eq.${plan.team_id}`,
    },
  }).catch(() => []);
  const task = taskRows?.[0] || null;
  await rest("execution_events", {
    method: "POST",
    body: {
      created_at: nowISO(),
      event_type: "receipt.appended",
      payload: redactSensitiveValue({
        summary: redactSensitiveText(receipt?.summary || ""),
        task_id: plan.task_id,
        task_local_id: task?.local_id || "",
        thread_id: task?.thread_id || "",
      }),
      plan_id: plan.id,
      redacted: true,
      sequence: maxSequence + 1,
      task_id: plan.task_id,
      team_id: plan.team_id,
    },
  }).catch(() => null);
}

async function ensureExecutionHomeReplyMessage(plan, receipt) {
  if (!plan?.id || !plan?.team_id) return;
  const policy = objectValue(plan.policy);
  if (policy.source !== "home_message") return;
  const threadID = String(policy.home_session_thread_id || "").trim();
  if (!threadID) return;
  const existing = await rest("channel_messages", {
    query: {
      limit: "1",
      run_id: `eq.${plan.id}`,
      select: "id",
      team_id: `eq.${plan.team_id}`,
    },
  }).catch((err) => {
    if (isMissingChannelMessagesError(err)) return [];
    throw err;
  });
  if (existing?.length) return;
  const summary =
    truncateText(redactSensitiveText(receipt?.summary || ""), 4000) ||
    (receipt?.status === "failed"
      ? "LAF Bridge 실행이 실패했습니다."
      : "LAF Bridge 실행이 완료되었습니다.");
  await rest("channel_messages", {
    method: "POST",
    body: {
      audience: [],
      channel: policy.channel || "general",
      content: summary,
      created_at: nowISO(),
      home_session_thread_id: threadID,
      kind: "message",
      metadata: {
        execution_status: receipt?.status || plan.status || "",
        provider: receipt?.provider || plan.provider || "",
      },
      model_mode: plan.mode || "my_bridge",
      project_id: null,
      public_reply_to: policy.message_id || null,
      reply_to: policy.message_id || null,
      run_id: plan.id,
      scope: "home_orchestration",
      sender_slug: policy.agent_slug || "ceo",
      tagged: [],
      task_id: null,
      team_id: plan.team_id,
      thread_id: threadID,
      updated_at: nowISO(),
      visibility: "team",
    },
  }).catch((err) => {
    if (isMissingChannelMessagesError(err)) return null;
    throw err;
  });
}

async function closeExecutionPlansForTask(task, status) {
  const plans = await rest("execution_plans", {
    query: {
      select: "*",
      status: "in.(pending,acknowledged,running)",
      task_id: `eq.${task.id}`,
      team_id: `eq.${task.team_id}`,
    },
  }).catch(() => []);
  for (const plan of plans || []) {
    await rest("execution_plans", {
      method: "PATCH",
      query: { id: `eq.${plan.id}` },
      body: {
        completed_at: nowISO(),
        status,
        updated_at: nowISO(),
      },
    }).catch(() => null);
  }
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

function publicBridgeDevice(row) {
  const device = { ...row };
  delete device.token_hash;
  device.capabilities = sanitizeBridgeCapabilities(device.capabilities || {});
  return device;
}

function publicExecutionPlan(row) {
  const plan = { ...row };
  plan.prompt = "[REDACTED]";
  return plan;
}

function bridgeExecutionPlan(row) {
  return { ...row };
}

function publicExecutionEvent(row) {
  return { ...row };
}

function publicExecutionReceipt(row) {
  return { ...row };
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

function sanitizeBridgeCapabilities(value) {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const out = {};
  for (const key of [
    "arch",
    "bridge_version",
    "cli_details",
    "git_available",
    "git_version",
    "gh_authenticated",
    "gh_available",
    "hostname",
    "os",
    "provider_runtimes",
  ]) {
    if (raw[key] !== undefined) out[key] = raw[key];
  }
  if (Array.isArray(out.provider_runtimes)) {
    out.provider_runtimes = sanitizeProviderRuntimes(out.provider_runtimes);
  }
  if (out.cli_details && typeof out.cli_details === "object" && !Array.isArray(out.cli_details)) {
    out.cli_details = sanitizeCLIDetails(out.cli_details);
  }
  return out;
}

function normalizeProviderKind(value) {
  const kind = String(value || "").trim().toLowerCase().replace(/_/g, "-");
  if (kind === "claude" || kind === "claude-code") return "claude-code";
  if (kind === "codex") return kind;
  return "";
}

function sanitizeProviderRuntimes(values) {
  return [
    ...new Set(normalizeStringList(values).map(normalizeProviderKind).filter(Boolean)),
  ];
}

function sanitizeCLIDetails(value) {
  const out = {};
  for (const [rawKind, rawDetail] of Object.entries(value)) {
    const kind = normalizeProviderKind(rawKind);
    if (!kind || !rawDetail || typeof rawDetail !== "object" || Array.isArray(rawDetail)) {
      continue;
    }
    out[kind] = { ...rawDetail };
  }
  return out;
}

function normalizeBridgePublicKey(value) {
  const text = String(value || "").trim();
  if (!text) throw new HTTPError(400, "public_key is required");
  if (/BEGIN PUBLIC KEY/.test(text)) {
    try {
      const key = crypto.createPublicKey(text);
      if (key.asymmetricKeyType !== "ed25519") {
        throw new Error("public key is not Ed25519");
      }
      return key.export({ format: "pem", type: "spki" }).trim();
    } catch {
      throw new HTTPError(400, "public_key must be an Ed25519 public key");
    }
  }
  const normalized = text.replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(normalized) || normalized.length % 4 !== 0) {
    throw new HTTPError(400, "public_key must be an Ed25519 public key");
  }
  const decoded = Buffer.from(normalized, "base64");
  if (decoded.length !== 32 || decoded.toString("base64") !== normalized) {
    throw new HTTPError(400, "public_key must be an Ed25519 public key");
  }
  return normalized;
}

function normalizeExecutionProvider(value, mode) {
  const raw = String(value || "").trim();
  const provider = raw.toLowerCase().replace(/-/g, "_");
  if (!provider) {
    return mode === "laf_model" ? "laf_model" : "codex";
  }
  if (mode === "laf_model") {
    if (provider === "laf_model") return "laf_model";
    throw new HTTPError(400, "provider must be laf_model for laf_model mode");
  }
  if (provider === "codex" || provider === "claude_code") {
    return provider;
  }
  throw new HTTPError(400, "provider must be codex or claude_code for LAF Bridge execution");
}

function normalizeExecutionTerminalStatus(value) {
  const status = String(value || "").trim().toLowerCase();
  if (status === "completed" || status === "succeeded" || status === "success") {
    return "completed";
  }
  if (status === "cancelled" || status === "canceled") return "cancelled";
  if (status === "failed" || status === "error") return "failed";
  throw new HTTPError(400, "status must be completed, failed, or cancelled");
}

async function resolveExecutionTarget({ deviceID, membership, mode, project, provider }) {
  if (mode !== "my_bridge") return { binding: null, device: null };
  const deviceQuery = {
    limit: "10",
    select: "*",
    status: "not.in.(revoked)",
    team_id: `eq.${membership.team_id}`,
    user_id: `eq.${membership.user_id}`,
  };
  if (deviceID) deviceQuery.id = `eq.${deviceID}`;
  const devices = (await rest("bridge_devices", { query: deviceQuery })) || [];
  const device = selectBridgeExecutionDevice(devices, provider);
  if (!normalizeGitHubRepoURL(project?.github_repo_url || "")) {
    throw new HTTPError(
      400,
      "my_bridge requires a GitHub repo for managed checkout",
    );
  }
  return { device };
}

let cachedSigningKeyPair = null;
let cachedSigningKeyMaterial = "";

function signingKeyPair() {
  const privateKeyPEM = String(process.env.LAF_EXECUTION_PLAN_SIGNING_PRIVATE_KEY || "").trim();
  const publicKeyPEM = String(process.env.LAF_EXECUTION_PLAN_SIGNING_PUBLIC_KEY || "").trim();
  const rawKeyID = String(process.env.LAF_EXECUTION_PLAN_SIGNING_KEY_ID || "").trim();
  const keyID = rawKeyID || "execution-plan-ed25519";
  const material = [keyID, privateKeyPEM, publicKeyPEM].join("\n");
  const production = process.env.NODE_ENV === "production";
  if (!privateKeyPEM && !publicKeyPEM && production) {
    throw new HTTPError(503, "execution plan signing keys are not configured");
  }
  if ((privateKeyPEM || publicKeyPEM) && production && !rawKeyID) {
    throw new HTTPError(503, "execution plan signing key id is not configured");
  }
  if (cachedSigningKeyPair && cachedSigningKeyMaterial === material) {
    return cachedSigningKeyPair;
  }
  if ((privateKeyPEM || publicKeyPEM) && !(privateKeyPEM && publicKeyPEM)) {
    throw new HTTPError(500, "execution plan signing key pair is incomplete");
  }
  if (privateKeyPEM && publicKeyPEM) {
    const privateKey = crypto.createPrivateKey(privateKeyPEM);
    const publicKey = crypto.createPublicKey(publicKeyPEM);
    const selfTest = Buffer.from("laf execution plan signing self-test");
    const selfTestSignature = crypto.sign(null, selfTest, privateKey);
    if (!crypto.verify(null, selfTest, publicKey, selfTestSignature)) {
      throw new HTTPError(500, "execution plan signing key pair is invalid");
    }
    cachedSigningKeyPair = {
      key_id: keyID,
      privateKey,
      publicKey,
    };
    cachedSigningKeyMaterial = material;
    return cachedSigningKeyPair;
  }
  const generated = crypto.generateKeyPairSync("ed25519");
  cachedSigningKeyPair = {
    key_id: "execution-plan-dev-ephemeral",
    privateKey: generated.privateKey,
    publicKey: generated.publicKey,
  };
  cachedSigningKeyMaterial = material;
  return cachedSigningKeyPair;
}

function executionPlanSigningPublicKeyPEM() {
  return signingKeyPair().publicKey.export({ format: "pem", type: "spki" });
}

function signExecutionPlan(plan) {
  const fields = [
    "id",
    "team_id",
    "project_id",
    "task_id",
    "actor_user_id",
    "executor_user_id",
    "device_id",
    "mode",
    "provider",
    "required_permissions",
    "effective_permissions",
    "context_refs",
    "prompt",
    "policy",
    "expires_at",
  ];
  const payload = {};
  for (const field of fields) payload[field] = canonicalPlanValue(plan[field] ?? null);
  const nonce = crypto.randomBytes(16).toString("hex");
  payload.nonce = nonce;
  const canonical = JSON.stringify(payload);
  const payloadHash = crypto.createHash("sha256").update(canonical).digest("hex");
  const keyPair = signingKeyPair();
  const signature = crypto.sign(null, Buffer.from(canonical), keyPair.privateKey).toString("base64");
  return {
    nonce,
    payload_hash: payloadHash,
    signature,
    signature_alg: "ed25519",
    signature_key_id: keyPair.key_id,
  };
}

function canonicalPlanValue(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (Array.isArray(value)) return value.map((entry) => canonicalPlanValue(entry) ?? null);
  if (typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      const entry = canonicalPlanValue(value[key]);
      if (entry !== undefined) out[key] = entry;
    }
    return out;
  }
  return value;
}

function ensureExecutionPlanNotTerminal(plan) {
  if (["completed", "failed", "cancelled", "expired"].includes(plan.status)) {
    throw new HTTPError(409, `execution plan is already terminal (${plan.status})`);
  }
  if (plan.expires_at && Date.parse(plan.expires_at) <= Date.now()) {
    throw new HTTPError(410, "execution plan expired");
  }
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
    .replace(/laf_bridge_[A-Fa-f0-9]{20,}/g, "laf_bridge_[REDACTED]")
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

function generatePairingCode() {
  const raw = crypto.randomBytes(6).toString("hex").toUpperCase();
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}

function normalizePairingCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function normalizePairingAPIURL(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function pairingRequestAPIURL(req) {
  try {
    return trustedPublicAPIURL(req);
  } catch (err) {
    if (
      err instanceof HTTPError &&
      err.message !== "LAF_OFFICE_PUBLIC_HOST is not configured for production" &&
      err.message !== "canonical hosted API URL is not configured"
    ) {
      throw err;
    }
    return "";
  }
}

function pairingCommandAPIURL(req, requestedAPIURL) {
  const canonicalAPIURL = pairingRequestAPIURL(req);
  if (process.env.NODE_ENV === "production") {
    if (!canonicalAPIURL) {
      throw new HTTPError(503, "canonical hosted API URL is not configured");
    }
    return canonicalAPIURL;
  }
  return normalizePairingAPIURL(requestedAPIURL) || canonicalAPIURL;
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

function bridgePairingStartResponse(apiURL, code, teamID, expiresAt) {
  const normalizedAPIURL = normalizePairingAPIURL(apiURL);
  const setupCode = bridgeSetupCode(normalizedAPIURL, code);
  const pairCommand = "npx laf-bridge pair";
  return {
    api_url: normalizedAPIURL,
    pairing: {
      expires_at: expiresAt,
      setup_code: setupCode,
      team_id: teamID,
    },
    commands: {
      pair: pairCommand,
    },
  };
}

function bridgeSetupCode(apiURL, code) {
  const payload = JSON.stringify({ v: 1, api_url: apiURL, code });
  return Buffer.from(payload, "utf8")
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/g, "");
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
// (invite links, pairing URLs, etc.). It never trusts request headers in
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
