const crypto = require("node:crypto");

const ACTIVE_JOB_STATUSES = ["queued", "leased", "running", "expired"];
const TERMINAL_TASK_STATUSES = ["done", "canceled"];
const SUPPORTED_LOCAL_CLI_RUNTIMES = ["codex", "claude-code", "opencode"];
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
  "runner:read",
  "runner:manage",
  "model:use_laf",
  "model:use_local_cli",
  "bridge:pair_own",
  "bridge:read_own",
  "bridge:execute_own",
  "bridge:manage_own",
  "bridge:read_team",
  "bridge:execute_team",
  "bridge:manage_team",
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
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

module.exports = async function handler(req, res) {
  try {
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    assertSupabaseEnv();

    const path = requestPath(req);
    if (path === "auth/session" && req.method === "GET") {
      await handleAuthSession(req, res);
      return;
    }
    if (path === "auth/users") {
      await handleAuthUsers(req, res);
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
      clearAuthCookies(res);
      writeJSON(res, 200, { status: "ok" });
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
    const bridgeDeviceActionMatch = path.match(/^bridge\/devices\/([^/]+)\/(heartbeat|revoke)$/);
    if (bridgeDeviceActionMatch && req.method === "POST") {
      const [, deviceID, action] = bridgeDeviceActionMatch;
      if (action === "heartbeat") {
        await handleBridgeDeviceHeartbeat(req, res, decodeURIComponent(deviceID));
      } else {
        await handleBridgeDeviceRevoke(req, res, decodeURIComponent(deviceID));
      }
      return;
    }
    const localBindingMatch = path.match(
      /^projects\/([^/]+)\/local-bindings(?:\/([^/]+))?$/,
    );
    if (localBindingMatch) {
      const projectID = decodeURIComponent(localBindingMatch[1]);
      const bindingID = localBindingMatch[2]
        ? decodeURIComponent(localBindingMatch[2])
        : "";
      if (req.method === "GET" && !bindingID) {
        await handleProjectLocalBindings(req, res, projectID);
        return;
      }
      if (req.method === "POST" && !bindingID) {
        await handleProjectLocalBindingCreate(req, res, projectID);
        return;
      }
      if (req.method === "DELETE" && bindingID) {
        await handleProjectLocalBindingDelete(req, res, projectID, bindingID);
        return;
      }
    }
    if (path === "execution/plans" && req.method === "POST") {
      await handleExecutionPlanCreate(req, res);
      return;
    }
    const executionPlanMatch = path.match(/^execution\/plans\/([^/]+)(?:\/(cancel))?$/);
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
    if (path === "runner/status" && req.method === "GET") {
      await handleRunnerStatus(req, res);
      return;
    }
    if (path === "runner/pairing/start" && req.method === "POST") {
      await handleRunnerPairingStart(req, res);
      return;
    }
    if (path === "runner/pairing/claim" && req.method === "POST") {
      await handleRunnerPairingClaim(req, res);
      return;
    }
    if (path === "runner/register" && req.method === "POST") {
      await handleRunnerRegister(req, res);
      return;
    }
    if (path === "runner/revoke" && req.method === "POST") {
      await handleRunnerRevoke(req, res);
      return;
    }
    if (path === "runner/heartbeat" && req.method === "POST") {
      await handleRunnerHeartbeat(req, res);
      return;
    }
    if (path === "runner/capabilities" && req.method === "POST") {
      await handleRunnerCapabilities(req, res);
      return;
    }
    if (path === "runner/jobs/lease" && req.method === "POST") {
      await handleRunnerJobLease(req, res);
      return;
    }
    const jobEventMatch = path.match(/^runner\/jobs\/([^/]+)\/events$/);
    if (jobEventMatch && req.method === "POST") {
      await handleRunnerJobEvent(req, res, jobEventMatch[1]);
      return;
    }
    const jobCompleteMatch = path.match(/^runner\/jobs\/([^/]+)\/complete$/);
    if (jobCompleteMatch && req.method === "POST") {
      await handleRunnerJobComplete(req, res, jobCompleteMatch[1]);
      return;
    }
    const jobRenewMatch = path.match(/^runner\/jobs\/([^/]+)\/renew$/);
    if (jobRenewMatch && req.method === "POST") {
      await handleRunnerJobRenew(req, res, jobRenewMatch[1]);
      return;
    }
    if (path === "runner/wiki/write-result" && req.method === "POST") {
      await handleRunnerWikiWriteResult(req, res);
      return;
    }

    writeJSON(res, 404, { error: "hosted API route not found" });
  } catch (err) {
    const status = err instanceof HTTPError ? err.status : 500;
    const message =
      err instanceof HTTPError ? err.message : "hosted API internal error";
    writeJSON(res, status, { error: message });
  }
};

function assertSupabaseEnv() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new HTTPError(
      503,
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required",
    );
  }
}

function requestPath(req) {
  const raw = req.query?.path;
  if (Array.isArray(raw)) return raw.join("/");
  return String(raw || "").replace(/^\/+|\/+$/g, "");
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string" && req.body.trim()) {
    try {
      return JSON.parse(req.body);
    } catch {
      throw new HTTPError(400, "invalid JSON body");
    }
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new HTTPError(400, "invalid JSON body");
  }
}

function writeJSON(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
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
    throw new HTTPError(
      response.status,
      responseErrorMessage(text, response.statusText),
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

function setAuthCookies(res, session) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  const accessMaxAge = Number(session.expires_in || 3600);
  const cookies = [
    `laf_access=${encodeURIComponent(session.access_token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${accessMaxAge}${secure}`,
  ];
  if (session.refresh_token) {
    cookies.push(
      `laf_refresh=${encodeURIComponent(session.refresh_token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${secure}`,
    );
  }
  res.setHeader("Set-Cookie", cookies);
}

function clearAuthCookies(res) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", [
    `laf_access=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`,
    `laf_refresh=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`,
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
    permissions: normalizePermissionOverride(membership.permissions),
    team_id: membership.team_id,
    role: normalizeRole(membership.role),
    status: membership.status || "active",
    created_at: user.created_at,
    updated_at: user.updated_at,
    last_login_at: user.last_sign_in_at,
  };
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
        "runner:read",
        "model:use_laf",
        "model:use_local_cli",
        "bridge:execute_own",
        "bridge:read_team",
        "bridge:execute_team",
        "bridge:manage_team",
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
        "runner:read",
        "model:use_local_cli",
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
      return ["workspace:read", "skill:read", "memory:read", "runner:read", "execution:receipt_read"];
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
  return ["laf_model", "my_bridge", "team_bridge", "record_only"].includes(value)
    ? value
    : "record_only";
}

function isSupportedLocalCLIRuntime(raw) {
  const value = String(raw || "").trim().toLowerCase();
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

function runnerHasSupportedLocalCLI(runner, capabilitiesByRunnerID) {
  if (!runner || runner.revoked_at) return false;
  return (
    capabilitiesHaveSupportedLocalCLI(runner.capabilities) ||
    capabilitiesHaveSupportedLocalCLI(capabilitiesByRunnerID[runner.id])
  );
}

async function runnerModelAvailability(teamID) {
  const runners = await rest("runners", {
    query: {
      select: "id,status,revoked_at,capabilities",
      status: "eq.connected",
      team_id: `eq.${teamID}`,
    },
  }).catch(() => []);
  const activeRunners = (runners || []).filter((runner) => !runner.revoked_at);
  const runnerIDs = activeRunners.map((runner) => runner.id).filter(Boolean);
  const capabilitiesRows = runnerIDs.length > 0
    ? await rest("runner_capabilities", {
        query: {
          runner_id: `in.(${runnerIDs.join(",")})`,
          select: "runner_id,provider_runtimes,cli_details",
        },
      }).catch(() => [])
    : [];
  const capabilitiesByRunnerID = Object.fromEntries(
    (capabilitiesRows || []).map((row) => [row.runner_id, row]),
  );
  return {
    hasRunner: activeRunners.length > 0,
    hasSupportedLocalCLI: activeRunners.some((runner) =>
      runnerHasSupportedLocalCLI(runner, capabilitiesByRunnerID),
    ),
  };
}

async function bridgeDevicesForMembership(membership, { includeTeam = false } = {}) {
  const query = {
    select: "*",
    status: "not.in.(revoked)",
    team_id: `eq.${membership.team_id}`,
    order: "updated_at.desc",
  };
  if (!includeTeam) query.user_id = `eq.${membership.user_id}`;
  return await rest("bridge_devices", { query }).catch(() => []);
}

function bridgeAvailabilityFromDevices(membership, devices) {
  const usable = (devices || []).filter((device) => !device.revoked_at && device.status !== "revoked");
  const online = usable.filter((device) => device.status === "online");
  const canExecute = hasPermission(membership, "bridge:execute_own");
  const available = canExecute && online.length > 0;
  const reason = available
    ? ""
    : !canExecute
      ? "permission required: bridge:execute_own"
      : usable.length === 0
        ? "no paired desktop bridge detected"
        : "no online desktop bridge detected";
  return {
    available,
    default_device_id: online[0]?.id || "",
    device_count: usable.length,
    online_device_count: online.length,
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
  const runnerState = await runnerModelAvailability(membership.team_id);
  const bridgeState = bridgeAvailabilityFromDevices(
    membership,
    await bridgeDevicesForMembership(membership),
  );
  const lafAllowed = paid && hasPermission(membership, "model:use_laf");
  const myBridgeAllowed = bridgeState.available;
  const teamBridgeAllowed =
    runnerState.hasSupportedLocalCLI && hasPermission(membership, "bridge:execute_team");
  const allowedModes = ["record_only"];
  if (lafAllowed) allowedModes.unshift("laf_model");
  if (myBridgeAllowed) allowedModes.push("my_bridge");
  if (teamBridgeAllowed) allowedModes.push("team_bridge");
  const defaultMode = lafAllowed ? "laf_model" : myBridgeAllowed ? "my_bridge" : "record_only";
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
    },
    team_bridge: {
      available: teamBridgeAllowed,
      reason: teamBridgeAllowed
        ? ""
        : !runnerState.hasRunner
          ? "no connected local runner detected"
          : !runnerState.hasSupportedLocalCLI
            ? "no supported local CLI detected"
            : "permission required: bridge:execute_team",
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

async function writeAuditEvent(membership, action, targetType, targetID, metadata = {}) {
  if (!membership?.team_id) return null;
  try {
    const [event] = await rest("audit_events", {
      method: "POST",
      body: {
        action,
        actor_user_id: membership.user_id,
        metadata,
        target_id: targetID || "",
        target_type: targetType || "",
        team_id: membership.team_id,
      },
    });
    return event;
  } catch {
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

async function adminUsersByID() {
  try {
    const adminUsers = await authFetch("admin/users", {
      headers: { Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` },
    });
    return Object.fromEntries((adminUsers?.users || []).map((user) => [user.id, user]));
  } catch {
    return {};
  }
}

async function listTeamAuthUsers(teamID) {
  const memberships = await rest("memberships", {
    query: {
      order: "created_at.asc",
      select: "*",
      team_id: `eq.${teamID}`,
    },
  });
  const usersByID = await adminUsersByID();
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

async function handleAuthLogin(req, res) {
  const body = await readBody(req);
  const session = await authFetch("token?grant_type=password", {
    method: "POST",
    body: { email: body.email, password: body.password },
  });
  setAuthCookies(res, session);
  const membership = await activeMembership(session.user.id);
  if (!membership) throw new HTTPError(403, "active team membership required");
  const team = await getTeam(membership.team_id);
  writeJSON(res, 200, {
    team: publicTeam(team),
    user: publicUser(session.user, membership),
  });
}

async function handleAuthSignup(req, res) {
  const body = await readBody(req);
  const session = await authFetch("signup", {
    method: "POST",
    body: {
      email: body.email,
      password: body.password,
      data: { name: body.name || "" },
    },
  });
  const user = session.user;
  if (!user?.id) throw new HTTPError(400, "signup did not return a user");

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
    if (session.access_token) setAuthCookies(res, session);
    writeJSON(res, 200, {
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
  if (session.access_token) setAuthCookies(res, session);
  writeJSON(res, 200, {
    team: publicTeam(team),
    user: publicUser(user, membership),
  });
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
    const usersByID = await adminUsersByID();
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
  const publicRow = publicInvite({ ...invite, token }, req);
  await writeAuditEvent(membership, "invite.created", "invite", invite.id, {
    email: invite.email,
    role: invite.role,
  });
  writeJSON(res, 200, {
    email_sent: false,
    invite: publicRow,
    invite_url: publicRow.invite_url,
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
  let job = null;
  if (TERMINAL_TASK_STATUSES.includes(updated.status)) {
    await closeJobsForTask(updated, updated.status === "canceled" ? "canceled" : "succeeded");
  } else {
    job = await ensureRunnerJobForTask(updated, project);
  }
  const projects = await projectMap(membership.team_id);
  writeJSON(res, 200, {
    runner_job: job ? publicRunnerJob(job, projects, { [updated.id]: updated }) : null,
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
  const executionMode =
    body.execution_mode || (project?.github_repo_url ? "local_worktree" : "office");
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
  const job = await ensureRunnerJobForTask(task, project);
  const projects = await projectMap(membership.team_id);
  return {
    runner_job: job ? publicRunnerJob(job, projects, { [task.id]: task }) : null,
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
    "execution_mode",
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
  const devices = await bridgeDevicesForMembership(membership);
  writeJSON(res, 200, {
    my_bridge: bridgeAvailabilityFromDevices(membership, devices),
    devices: devices.map(publicBridgeDevice),
  });
}

async function handleBridgeDevices(req, res) {
  const { membership } = await requireUser(req);
  const includeTeam = hasPermission(membership, "bridge:read_team");
  requirePermission(membership, includeTeam ? "bridge:read_team" : "bridge:read_own");
  const devices = await bridgeDevicesForMembership(membership, { includeTeam });
  writeJSON(res, 200, { devices: devices.map(publicBridgeDevice) });
}

async function handleBridgePairingStart(req, res) {
  const { membership } = await requireUser(req);
  requirePermission(membership, "bridge:pair_own");
  const body = await readBody(req);
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
  const apiURL = normalizeRunnerPairingAPIURL(body.api_url) || runnerPairingRequestAPIURL(req);
  writeJSON(res, 200, {
    api_url: apiURL,
    pairing: {
      code,
      expires_at: expiresAt,
      team_id: membership.team_id,
    },
    commands: {
      pair: `laf-bridge pair --api-url ${apiURL} --code ${code}`,
    },
  });
}

async function handleBridgePairingClaim(req, res) {
  const body = await readBody(req);
  const code = normalizePairingCode(body.code || body.pairing_code || "");
  if (!code) throw new HTTPError(400, "pairing code is required");
  const publicKey = String(body.public_key || "").trim();
  if (!publicKey) throw new HTTPError(400, "public_key is required");
  const deviceLabel = String(body.device_label || body.name || "").trim();
  if (!deviceLabel) throw new HTTPError(400, "device_label is required");
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
        device_kind: body.device_kind === "team_bridge" ? "team_bridge" : "desktop",
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
  writeJSON(res, 200, { bridge_token: bridgeToken, device: publicBridgeDevice(device) });
}

async function handleBridgeDeviceHeartbeat(req, res, deviceID) {
  const device = await requireBridgeDevice(req);
  if (device.id !== deviceID) throw new HTTPError(403, "bridge device token mismatch");
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
    },
  });
  const device = rows?.[0];
  if (!device) throw new HTTPError(404, "bridge device not found");
  if (device.user_id === membership.user_id) {
    requirePermission(membership, "bridge:manage_own");
  } else {
    requirePermission(membership, "bridge:manage_team");
  }
  const now = nowISO();
  const [updated] = await rest("bridge_devices", {
    method: "PATCH",
    query: { id: `eq.${device.id}`, team_id: `eq.${membership.team_id}` },
    body: {
      revoked_at: now,
      revoked_by: membership.user_id,
      status: "revoked",
      updated_at: now,
    },
  });
  await writeAuditEvent(membership, "bridge.device_revoked", "bridge_device", device.id, {
    device_kind: device.device_kind,
  });
  writeJSON(res, 200, { device: publicBridgeDevice(updated) });
}

async function handleProjectLocalBindings(req, res, projectExternalID) {
  const { membership } = await requireUser(req);
  requirePermission(membership, "bridge:read_own");
  const project = await findProject(membership.team_id, projectExternalID);
  const rows = await rest("project_local_bindings", {
    query: {
      order: "last_used_at.desc",
      project_id: `eq.${project.id}`,
      select: "*",
      team_id: `eq.${membership.team_id}`,
      user_id: `eq.${membership.user_id}`,
    },
  }).catch(() => []);
  writeJSON(res, 200, { bindings: (rows || []).map(publicProjectLocalBinding) });
}

async function handleProjectLocalBindingCreate(req, res, projectExternalID) {
  const { membership } = await requireUser(req);
  requirePermission(membership, "bridge:manage_own");
  const project = await findProject(membership.team_id, projectExternalID);
  const body = await readBody(req);
  const deviceID = String(body.device_id || "").trim();
  if (!deviceID) throw new HTTPError(400, "device_id is required");
  const localPath = String(body.local_path || "").trim();
  if (!localPath) throw new HTTPError(400, "local_path is required");
  const devices = await rest("bridge_devices", {
    query: {
      id: `eq.${deviceID}`,
      limit: "1",
      select: "*",
      status: "not.in.(revoked)",
      team_id: `eq.${membership.team_id}`,
      user_id: `eq.${membership.user_id}`,
    },
  });
  const device = devices?.[0];
  if (!device) throw new HTTPError(404, "bridge device not found");
  const now = nowISO();
  const [binding] = await rest("project_local_bindings", {
    method: "POST",
    query: { on_conflict: "team_id,project_id,user_id,device_id,local_path_hash" },
    body: {
      created_at: now,
      device_id: device.id,
      display_name: truncateText(String(body.display_name || "").trim() || basename(localPath), 128),
      git_remote_hash: hashOrNull(body.git_remote_url || body.git_remote_hash),
      git_root_hash: hashOrNull(body.git_root || body.git_root_hash),
      last_used_at: now,
      local_path_hash: hashToken(localPath),
      project_id: project.id,
      team_id: membership.team_id,
      trusted: body.trusted === true,
      trusted_at: body.trusted === true ? now : null,
      user_id: membership.user_id,
    },
  });
  writeJSON(res, 200, { binding: publicProjectLocalBinding(binding) });
}

async function handleProjectLocalBindingDelete(req, res, projectExternalID, bindingID) {
  const { membership } = await requireUser(req);
  requirePermission(membership, "bridge:manage_own");
  const project = await findProject(membership.team_id, projectExternalID);
  const rows = await rest("project_local_bindings", {
    method: "DELETE",
    query: {
      id: `eq.${bindingID}`,
      project_id: `eq.${project.id}`,
      team_id: `eq.${membership.team_id}`,
      user_id: `eq.${membership.user_id}`,
    },
  });
  const binding = rows?.[0];
  if (!binding) throw new HTTPError(404, "local binding not found");
  writeJSON(res, 200, { binding: publicProjectLocalBinding(binding), deleted: true });
}

async function handleExecutionPlanCreate(req, res) {
  const { membership } = await requireUser(req);
  requirePermission(membership, "execution:plan_create");
  requirePermission(membership, "task:execute_agent");
  const body = await readBody(req);
  const mode = normalizeModelMode(body.mode);
  if (mode === "record_only") throw new HTTPError(400, "record_only mode cannot create execution plans");
  if (mode === "my_bridge") requirePermission(membership, "bridge:execute_own");
  if (mode === "team_bridge") requirePermission(membership, "bridge:execute_team");
  const provider = normalizeExecutionProvider(body.provider, mode);
  const task = await findTask(membership.team_id, body.task_id || body.taskID || body.taskId);
  const project = task.project_id ? await getProjectByID(membership.team_id, task.project_id) : null;
  const prompt = String(body.message || body.prompt || "").trim();
  if (!prompt) throw new HTTPError(400, "message is required");
  const bindingID = String(body.binding_id || "").trim();
  const deviceID = String(body.device_id || "").trim();
  const binding = await resolveExecutionBinding({
    bindingID,
    deviceID,
    membership,
    mode,
    project,
  });
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
    binding_id: binding?.id || null,
    cancel_requested_at: null,
    completed_at: null,
    context_refs: [],
    created_at: nowISO(),
    device_id: deviceID || binding?.device_id || null,
    dispatched_at: null,
    effective_permissions: effective,
    executor_user_id: membership.user_id,
    expires_at: expiresAt,
    id: planID,
    mode,
    policy: body.policy && typeof body.policy === "object" ? body.policy : {},
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
  writeJSON(res, 200, { plan: publicExecutionPlan(created) });
}

async function handleExecutionPlanGet(req, res, planID) {
  const { membership } = await requireUser(req);
  requirePermission(membership, "execution:read");
  const plan = await findExecutionPlan(membership.team_id, planID);
  writeJSON(res, 200, { plan: publicExecutionPlan(plan) });
}

async function handleExecutionPlanCancel(req, res, planID) {
  const { membership } = await requireUser(req);
  requirePermission(membership, "execution:cancel");
  const plan = await findExecutionPlan(membership.team_id, planID);
  if (["completed", "failed", "cancelled", "expired"].includes(plan.status)) {
    throw new HTTPError(409, `execution plan is already terminal (${plan.status})`);
  }
  const now = nowISO();
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

async function handleRunnerStatus(req, res) {
  const { membership } = await requireUser(req);
  requirePermission(membership, "runner:read");
  const jobQuery = {
    team_id: `eq.${membership.team_id}`,
    select: "*",
    order: "updated_at.desc",
  };
  if (req.query.project_id) {
    const project = await findProject(membership.team_id, req.query.project_id);
    jobQuery.project_id = `eq.${project.id}`;
  }
  if (req.query.task_id) {
    const task = await findTask(membership.team_id, req.query.task_id);
    jobQuery.task_id = `eq.${task.id}`;
  }
  const [runners, jobs] = await Promise.all([
    rest("runners", {
      query: {
        team_id: `eq.${membership.team_id}`,
        select: "*",
        order: "updated_at.desc",
      },
    }),
    rest("runner_jobs", { query: jobQuery }),
  ]);
  const [projects, tasks] = await Promise.all([
    projectMap(
      membership.team_id,
      jobs.map((job) => job.project_id),
    ),
    taskMap(
      membership.team_id,
      jobs.map((job) => job.task_id),
    ),
  ]);
  writeJSON(res, 200, {
    jobs: jobs.map((job) => publicRunnerJob(job, projects, tasks)),
    runners: runners.map(publicRunner),
  });
}

async function handleRunnerPairingStart(req, res) {
  const { membership, user } = await requireUser(req);
  requirePermission(membership, "runner:manage");
  const body = await readBody(req);
  const code = generatePairingCode();
  const now = nowISO();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  await rest("runner_pairing_codes", {
    method: "POST",
    body: {
      code_hash: hashToken(normalizePairingCode(code)),
      created_at: now,
      created_by: user.id,
      expires_at: expiresAt,
      status: "pending",
      team_id: membership.team_id,
    },
  });
  const apiURL =
    normalizeRunnerPairingAPIURL(body.api_url) || runnerPairingRequestAPIURL(req);
  writeJSON(res, 200, runnerPairingStartResponse(apiURL, code, membership.team_id, expiresAt));
}

async function handleRunnerPairingClaim(req, res) {
  const body = await readBody(req);
  const code = normalizePairingCode(body.code || body.pairing_code || "");
  if (!code) throw new HTTPError(400, "pairing code is required");
  const now = nowISO();
  const rows = await rest("runner_pairing_codes", {
    query: {
      code_hash: `eq.${hashToken(code)}`,
      limit: "1",
      select: "*",
      status: "eq.pending",
    },
  });
  const pairing = rows?.[0];
  if (!pairing) {
    throw new HTTPError(410, "pairing code expired or already used");
  }
  if (pairing.expires_at && new Date(pairing.expires_at).getTime() <= Date.now()) {
    await rest("runner_pairing_codes", {
      method: "PATCH",
      query: { id: `eq.${pairing.id}`, status: "eq.pending" },
      body: { status: "expired" },
    });
    throw new HTTPError(410, "pairing code expired or already used");
  }
  const claimed = await rest("runner_pairing_codes", {
    method: "PATCH",
    query: { id: `eq.${pairing.id}`, status: "eq.pending" },
    body: {
      claimed_at: now,
      status: "claimed",
    },
  });
  if (!claimed?.length) {
    throw new HTTPError(409, "pairing code was already claimed");
  }
  const token = `laf_runner_${crypto.randomBytes(24).toString("hex")}`;
  let runner;
  try {
    [runner] = await rest("runners", {
      method: "POST",
      body: {
        capabilities: body.capabilities || {},
        created_at: now,
        last_seen_at: now,
        name: body.name || "Local runner",
        runner_type: body.runner_type || "local",
        status: "connected",
        team_id: pairing.team_id,
        token_hash: hashToken(token),
        updated_at: now,
      },
    });
  } catch (err) {
    await rest("runner_pairing_codes", {
      method: "PATCH",
      query: { id: `eq.${pairing.id}`, status: "eq.claimed" },
      body: {
        claimed_at: null,
        status: "pending",
      },
    }).catch(() => {});
    throw err;
  }
  await rest("runner_pairing_codes", {
    method: "PATCH",
    query: { id: `eq.${pairing.id}` },
    body: { claimed_runner_id: runner.id },
  });
  writeJSON(res, 200, { runner: publicRunner(runner), runner_token: token });
}

async function handleRunnerRegister(req, res) {
  const { membership } = await requireUser(req);
  requirePermission(membership, "runner:manage");
  const body = await readBody(req);
  const teamID = body.team_id || membership.team_id;
  if (teamID !== membership.team_id) {
    throw new HTTPError(403, "runner registration must use your active team");
  }
  const token = `laf_runner_${crypto.randomBytes(24).toString("hex")}`;
  const now = nowISO();
  const [runner] = await rest("runners", {
    method: "POST",
    body: {
      capabilities: body.capabilities || {},
      created_at: now,
      last_seen_at: now,
      name: body.name || "Local runner",
      runner_type: body.runner_type || "local",
      status: "connected",
      team_id: teamID,
      token_hash: hashToken(token),
      updated_at: now,
    },
  });
  writeJSON(res, 200, { runner: publicRunner(runner), runner_token: token });
}

async function handleRunnerRevoke(req, res) {
  const { membership } = await requireUser(req);
  requirePermission(membership, "runner:manage");
  const body = await readBody(req);
  const runnerID = String(body.runner_id || body.id || "").trim();
  if (!runnerID) throw new HTTPError(400, "runner_id is required");

  const existing = await rest("runners", {
    query: {
      id: `eq.${runnerID}`,
      limit: "1",
      select: "*",
      team_id: `eq.${membership.team_id}`,
    },
  });
  if (!existing?.length) throw new HTTPError(404, "runner not found");

  const now = nowISO();
  const [runner] = await rest("runners", {
    method: "PATCH",
    query: {
      id: `eq.${runnerID}`,
      team_id: `eq.${membership.team_id}`,
    },
    body: {
      revoked_at: now,
      status: "revoked",
      updated_at: now,
    },
  });
  await rest("runner_jobs", {
    method: "PATCH",
    query: {
      runner_id: `eq.${runnerID}`,
      status: "in.(leased,running)",
      team_id: `eq.${membership.team_id}`,
    },
    body: {
      last_error: "runner revoked",
      lease_expires_at: null,
      runner_id: null,
      status: "expired",
      updated_at: now,
    },
  });
  writeJSON(res, 200, { runner: publicRunner(runner) });
}

async function handleRunnerHeartbeat(req, res) {
  const runner = await requireRunner(req);
  const body = await readBody(req);
  const [updated] = await rest("runners", {
    method: "PATCH",
    query: { id: `eq.${runner.id}` },
    body: {
      last_seen_at: nowISO(),
      status: body.status === "disconnected" ? "disconnected" : "connected",
      updated_at: nowISO(),
    },
  });
  writeJSON(res, 200, { runner: publicRunner(updated) });
}

async function handleRunnerCapabilities(req, res) {
  const runner = await requireRunner(req);
  const body = await readBody(req);
  const capabilities = body.capabilities || body || {};
  const [updated] = await rest("runners", {
    method: "PATCH",
    query: { id: `eq.${runner.id}` },
    body: {
      capabilities,
      last_seen_at: nowISO(),
      status: "connected",
      updated_at: nowISO(),
    },
  });
  await rest("runner_capabilities", {
    method: "POST",
    query: { on_conflict: "runner_id" },
    prefer: "resolution=merge-duplicates,return=representation",
    body: {
      arch: capabilities.arch || "",
      cli_details: capabilities.cli_details || {},
      execution_modes: capabilities.execution_modes || [],
      gh_authenticated: Boolean(capabilities.gh_authenticated),
      gh_available: Boolean(capabilities.gh_available),
      git_available: Boolean(capabilities.git_available),
      hostname: capabilities.hostname || "",
      os: capabilities.os || "",
      provider_runtimes: capabilities.provider_runtimes || [],
      reported_at: nowISO(),
      runner_id: runner.id,
      team_id: runner.team_id,
      workspace_root: capabilities.workspace_root || "",
    },
  });
  writeJSON(res, 200, { runner: publicRunner(updated) });
}

async function handleRunnerJobLease(req, res) {
  const runner = await requireRunner(req);
  const body = await readBody(req);
  const capabilities = runner.capabilities || {};
  const leaseSeconds = clamp(Number(body.lease_seconds || 300), 30, 1800);
  const claimed = await rpc("claim_runner_job", {
    p_execution_modes: normalizeStringList(
      body.execution_modes || capabilities.execution_modes || [],
    ),
    p_lease_seconds: leaseSeconds,
    p_provider_runtimes: normalizeProviderList(
      body.provider_runtimes || capabilities.provider_runtimes || [],
    ),
    p_runner_id: runner.id,
    p_team_id: runner.team_id,
  });
  const job = Array.isArray(claimed) ? claimed[0] : claimed;
  if (!job) {
    writeJSON(res, 200, { job: null });
    return;
  }
  await appendJobEvent(job, runner.id, "leased", "info", "runner leased job");
  const [projects, tasks] = await Promise.all([
    projectMap(runner.team_id, [job.project_id]),
    taskMap(runner.team_id, [job.task_id]),
  ]);
  writeJSON(res, 200, { job: publicRunnerJob(job, projects, tasks) });
}

async function handleRunnerJobEvent(req, res, jobID) {
  const runner = await requireRunner(req);
  const job = await findRunnerJob(runner.team_id, jobID);
  ensureRunnerOwnsJob(runner, job);
  const body = await readBody(req);
  const now = nowISO();
  const patch = { updated_at: now };
  if (body.status === "running" || body.kind === "running") {
    patch.runner_id = runner.id;
    patch.started_at = job.started_at || now;
    patch.status = "running";
  }
  const updated = requireRunnerJobMutation(
    await rest("runner_jobs", {
      method: "PATCH",
      query: activeRunnerJobMutationQuery(job, runner, now),
      body: patch,
    }),
  );
  const event = await appendJobEvent(
    updated,
    runner.id,
    body.kind || body.status || "event",
    body.level || "info",
    body.message || "",
    body.payload || {},
  );
  writeJSON(res, 200, { event });
}

async function handleRunnerJobComplete(req, res, jobID) {
  const runner = await requireRunner(req);
  const job = await findRunnerJob(runner.team_id, jobID);
  ensureRunnerOwnsJob(runner, job);
  const body = await readBody(req);
  const status = normalizeJobStatus(body.status);
  if (!["succeeded", "failed", "canceled"].includes(status)) {
    throw new HTTPError(400, "status must be succeeded, failed, or canceled");
  }
  const now = nowISO();
  const updatedJob = requireRunnerJobMutation(
    await rest("runner_jobs", {
      method: "PATCH",
      query: activeRunnerJobMutationQuery(job, runner, now),
      body: {
        completed_at: now,
        last_error: redactSensitiveText(body.error || ""),
        lease_expires_at: null,
        runner_id: runner.id,
        status,
        updated_at: now,
      },
    }),
  );
  const event = await appendJobEvent(
    updatedJob,
    runner.id,
    status,
    status === "failed" ? "error" : status === "canceled" ? "warn" : "info",
    body.message || body.error || "",
    body.payload || {},
  );
  let task = null;
  if (updatedJob.task_id) {
    const taskPatch = {
      delivery_checked_at: body.delivery_checked_at || nowISO(),
      delivery_checks_status: body.delivery_checks_status || "",
      delivery_draft: Boolean(body.delivery_draft),
      delivery_merge_state: body.delivery_merge_state || "",
      delivery_review_decision: body.delivery_review_decision || "",
      delivery_status: body.delivery_status || "",
      delivery_summary: redactSensitiveText(body.delivery_summary || body.message || ""),
      delivery_url: body.delivery_url || "",
      updated_at: nowISO(),
      worktree_branch: body.worktree_branch || undefined,
      worktree_path: body.worktree_path || undefined,
    };
    const [updatedTask] = await rest("tasks", {
      method: "PATCH",
      query: { id: `eq.${updatedJob.task_id}` },
      body: compactObject(taskPatch),
    });
    task = updatedTask;
    await rest("delivery_receipts", {
      method: "POST",
      body: {
        delivery_checked_at: taskPatch.delivery_checked_at,
        delivery_checks_status: taskPatch.delivery_checks_status,
        delivery_draft: taskPatch.delivery_draft,
        delivery_merge_state: taskPatch.delivery_merge_state,
        delivery_review_decision: taskPatch.delivery_review_decision,
        delivery_status: taskPatch.delivery_status,
        delivery_summary: redactSensitiveText(taskPatch.delivery_summary),
        delivery_url: taskPatch.delivery_url,
        project_id: updatedJob.project_id,
        task_id: updatedJob.task_id,
        team_id: updatedJob.team_id,
      },
    });
  }
  const projects = await projectMap(runner.team_id, [
    updatedJob.project_id,
    task?.project_id,
  ]);
  const tasks = task ? { [task.id]: task } : await taskMap(runner.team_id, [updatedJob.task_id]);
  writeJSON(res, 200, {
    event,
    job: publicRunnerJob(updatedJob, projects, tasks),
    task: task ? publicTask(task, projects) : null,
  });
}

async function handleRunnerJobRenew(req, res, jobID) {
  const runner = await requireRunner(req);
  const job = await findRunnerJob(runner.team_id, jobID);
  ensureRunnerOwnsJob(runner, job);
  const body = await readBody(req);
  const leaseSeconds = clamp(Number(body.lease_seconds || 300), 30, 1800);
  const now = nowISO();
  const updated = requireRunnerJobMutation(
    await rest("runner_jobs", {
      method: "PATCH",
      query: activeRunnerJobMutationQuery(job, runner, now),
      body: {
        lease_expires_at: new Date(Date.now() + leaseSeconds * 1000).toISOString(),
        updated_at: now,
      },
    }),
  );
  const event = await appendJobEvent(
    updated,
    runner.id,
    "renewed",
    "info",
    "runner renewed job lease",
    { lease_seconds: leaseSeconds },
  );
  writeJSON(res, 200, { event, job: publicRunnerJob(updated) });
}

async function handleRunnerWikiWriteResult(req, res) {
  const runner = await requireRunner(req);
  const body = await readBody(req);
  if (body.team_id && body.team_id !== runner.team_id) {
    throw new HTTPError(403, "runner cannot write results for another team");
  }
  const project = body.project_id
    ? await findProject(runner.team_id, body.project_id)
    : null;
  if (body.request_id) {
    await rest("wiki_write_requests", {
      method: "PATCH",
      query: { id: `eq.${body.request_id}`, team_id: `eq.${runner.team_id}` },
      body: {
        commit_sha: body.commit_sha || "",
        completed_at: nowISO(),
        error: body.error || "",
        runner_id: runner.id,
        status: body.status || "succeeded",
        updated_at: nowISO(),
      },
    });
  }
  const rows = await rest("wiki_article_index", {
    method: "POST",
    query: { on_conflict: "team_id,project_id,article_path" },
    prefer: "resolution=merge-duplicates,return=representation",
    body: {
      article_path: body.article_path,
      decisions: body.decisions || [],
      excerpt: body.excerpt || "",
      last_commit: body.commit_sha || "",
      open_questions: body.open_questions || [],
      project_id: project?.id || null,
      risks: body.risks || [],
      team_id: runner.team_id,
      title: body.title || "",
      updated_at: nowISO(),
    },
  });
  writeJSON(res, 200, { article: rows?.[0] || null });
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

async function requireRunner(req) {
  const token =
    bearer(req) ||
    req.headers["x-laf-runner-token"] ||
    "";
  if (!token) throw new HTTPError(401, "runner token required");
  const rows = await rest("runners", {
    query: {
      select: "*",
      token_hash: `eq.${hashToken(token)}`,
      limit: "1",
    },
  });
  const runner = rows?.[0];
  if (!runner || runner.status === "revoked" || runner.revoked_at) {
    throw new HTTPError(401, "runner unauthorized");
  }
  return runner;
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

async function findRunnerJob(teamID, jobID) {
  const rows = await rest("runner_jobs", {
    query: { id: `eq.${jobID}`, select: "*", team_id: `eq.${teamID}`, limit: "1" },
  });
  if (!rows?.length) throw new HTTPError(404, "runner job not found");
  return rows[0];
}

async function ensureRunnerJobForTask(task, project) {
  if (!taskNeedsRunnerJob(task)) return null;
  const active = await rest("runner_jobs", {
    query: {
      select: "*",
      status: `in.(${ACTIVE_JOB_STATUSES.join(",")})`,
      task_id: `eq.${task.id}`,
      team_id: `eq.${task.team_id}`,
      limit: "1",
    },
  });
  if (active?.length) return active[0];
  const requestedBy =
    task.human_owner_user_id || (isUUID(task.created_by) ? task.created_by : null);
  const effective = requestedBy
    ? await effectivePermissionsForUser(task.team_id, requestedBy)
    : [];
  const [job] = await rest("runner_jobs", {
    method: "POST",
    body: {
      agent_memory_packet: await buildAgentMemoryPacket(task, project),
      agent_slug: task.owner || "",
      effective_permissions: effective,
      execution_mode: task.execution_mode || "office",
      model_mode: normalizeModelMode(task.model_mode),
      project_id: project?.id || null,
      provider_kind: normalizeProviderKind(task.provider_kind || task.required_provider || ""),
      repo_url: normalizeGitHubRepoURL(project?.github_repo_url || ""),
      requested_by: requestedBy,
      status: "queued",
      task_id: task.id,
      team_id: task.team_id,
      wiki_path: project ? `team/projects/${project.local_id || project.id}.md` : "",
    },
  });
  await appendJobEvent(job, "", "queued", "info", "runner job queued for task execution");
  return job;
}

async function effectivePermissionsForUser(teamID, userID) {
  const rows = await rest("memberships", {
    query: {
      limit: "1",
      select: "*",
      status: "eq.active",
      team_id: `eq.${teamID}`,
      user_id: `eq.${userID}`,
    },
  });
  return rows?.[0] ? effectivePermissions(rows[0]) : [];
}

async function closeJobsForTask(task, status) {
  const jobs = await rest("runner_jobs", {
    query: {
      select: "*",
      status: `in.(${ACTIVE_JOB_STATUSES.join(",")})`,
      task_id: `eq.${task.id}`,
      team_id: `eq.${task.team_id}`,
    },
  });
  for (const job of jobs || []) {
    const [closed] = await rest("runner_jobs", {
      method: "PATCH",
      query: { id: `eq.${job.id}` },
      body: {
        completed_at: nowISO(),
        last_error: status === "succeeded" ? "" : `task closed as ${task.status}`,
        lease_expires_at: null,
        status,
        updated_at: nowISO(),
      },
    });
    await appendJobEvent(closed, job.runner_id || "", status, "info", "task closed runner job");
  }
}

async function appendJobEvent(job, runnerID, kind, level, message, payload = {}) {
  const [event] = await rest("runner_job_events", {
    method: "POST",
    body: {
      job_id: job.id,
      kind,
      level,
      message: redactSensitiveText(message),
      payload: redactSensitiveValue(payload),
      runner_id: runnerID || null,
      task_id: job.task_id || null,
      team_id: job.team_id,
    },
  });
  return event;
}

function taskNeedsRunnerJob(task) {
  return (
    task.owner &&
    !isHuman(task.owner) &&
    !task.blocked &&
    normalizeModelMode(task.model_mode) === "team_bridge" &&
    ["in_progress", "review"].includes(task.status)
  );
}

function ensureRunnerOwnsJob(runner, job) {
  if (runner.team_id !== job.team_id) {
    throw new HTTPError(403, "runner cannot access another team job");
  }
  if (!job.runner_id || job.runner_id !== runner.id) {
    throw new HTTPError(409, "job is not leased by this runner");
  }
  if (!["leased", "running"].includes(job.status)) {
    throw new HTTPError(409, "job is not active");
  }
  const expiresAt = Date.parse(job.lease_expires_at || "");
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    throw new HTTPError(409, "job lease expired");
  }
}

function activeRunnerJobMutationQuery(job, runner, now = nowISO()) {
  return {
    id: `eq.${job.id}`,
    lease_expires_at: `gt.${now}`,
    runner_id: `eq.${runner.id}`,
    status: "in.(leased,running)",
    team_id: `eq.${runner.team_id}`,
  };
}

function requireRunnerJobMutation(rows) {
  const row = rows?.[0] || null;
  if (!row) {
    throw new HTTPError(409, "job lease expired or no longer owned by this runner");
  }
  return row;
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
  return {
    ...row,
    id: row.local_id || row.id,
    project_id: row.project_id
      ? projects[row.project_id]?.local_id || row.project_id
      : "",
  };
}

function publicRunner(row) {
  const runner = { ...row };
  delete runner.token_hash;
  return runner;
}

function publicBridgeDevice(row) {
  const device = { ...row };
  delete device.token_hash;
  return device;
}

function publicProjectLocalBinding(row) {
  return { ...row };
}

function publicExecutionPlan(row) {
  const plan = { ...row };
  plan.prompt = "[REDACTED]";
  return plan;
}

function publicRunnerJob(row, projects = {}, tasks = {}) {
  return {
    ...row,
    id: row.id,
    job_id: row.id,
    project_id: row.project_id
      ? projects[row.project_id]?.local_id || row.project_id
      : "",
    required_provider: row.provider_kind || "",
    task_id: row.task_id ? tasks[row.task_id]?.local_id || row.task_id : "",
  };
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

function publicInvite(row, req) {
  const token = row.token || "";
  const inviteURL = token ? `${originFor(req)}/invite/${encodeURIComponent(token)}` : "";
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

async function buildAgentMemoryPacket(task, project) {
  const wikiPath = project ? `team/projects/${project.local_id || project.id}.md` : "";
  const unavailable = [];
  const wikiRows = project
    ? await rest("wiki_article_index", {
        query: {
          order: "updated_at.desc",
          project_id: `eq.${project.id}`,
          select: "*",
          team_id: `eq.${task.team_id}`,
        },
      })
    : [];
  if (!project) {
    unavailable.push("No project is attached to this task.");
  } else if (!wikiRows?.length) {
    unavailable.push(`No hosted wiki index entries are available for ${wikiPath}.`);
  }
  const receipts = project
    ? await rest("delivery_receipts", {
        query: {
          order: "created_at.desc",
          project_id: `eq.${project.id}`,
          select: "*",
          team_id: `eq.${task.team_id}`,
        },
      })
    : [];
  const recentTasks = project
    ? await rest("tasks", {
        query: {
          order: "updated_at.desc",
          project_id: `eq.${project.id}`,
          select: "*",
          status: "in.(done,canceled,review)",
          team_id: `eq.${task.team_id}`,
        },
      })
    : [];
  const indexedRows = (wikiRows || []).slice(0, 5);
  const packet = {
    decisions: memoryItemsFromRows(indexedRows, "decisions"),
    loaded_context: indexedRows.map((row) => ({
      chars: String(row.excerpt || "").length,
      kind: "project_wiki_index",
      path: row.article_path || wikiPath,
      status: row.excerpt ? "loaded" : "metadata_only",
      truncated: String(row.excerpt || "").length > 1200,
    })),
    must_obey: [
      "Treat this packet as the first memory read for the task; do not re-ask for context already loaded here.",
      "Hosted control plane queues work only; local runners own filesystem, git, GitHub, and provider CLI execution.",
    ],
    must_read: project
      ? [
          {
            kind: "project_wiki",
            path: wikiPath,
            reason: "canonical shared memory for this project",
            status: indexedRows.length ? "loaded" : "unavailable",
          },
        ]
      : [],
    open_questions: memoryItemsFromRows(indexedRows, "open_questions"),
    packet_id: `agent-memory-${shortID()}`,
    project: project
      ? {
          github_repo: project.github_repo_url || "",
          id: project.local_id || project.id,
          name: project.name,
          repo_url: project.github_repo_url || "",
          wiki_path: wikiPath,
        }
      : null,
    recent_work: recentWorkFromRows(receipts || [], recentTasks || [], task.id).slice(0, 5),
    risks: memoryItemsFromRows(indexedRows, "risks"),
    start_here: [
      "Treat this packet as the canonical task context for this runner job.",
      "Read loaded project memory before broad repository search or new architecture planning.",
      "Use the runner protocol to report progress and completion.",
    ],
    task: {
      channel: task.channel || "general",
      details: task.details || task.human_details || "",
      execution_mode: task.execution_mode || "",
      id: task.local_id || task.id,
      owner: task.owner || "",
      project_id: project?.local_id || project?.id || task.project_id || "",
      status: task.status,
      task_type: task.task_type || "",
      title: task.title,
    },
    unavailable,
    version: "agent-memory/v1",
    write_back: [
      "Return compact progress events.",
      "Write durable wiki conclusions through the runner wiki write flow.",
      "Return delivery receipt metadata when code or PR work is produced.",
    ],
  };
  if (packet.decisions.length) {
    packet.start_here.push("Apply the decisions array before inventing new workflow policy.");
  }
  if (packet.risks.length || packet.open_questions.length) {
    packet.start_here.push("Check risks and open_questions before marking work complete.");
  }
  if (packet.recent_work.length) {
    packet.start_here.push("Use recent_work receipts to avoid duplicating delivered work.");
  }
  return packet;
}

function memoryItemsFromRows(rows, key) {
  const items = [];
  for (const row of rows || []) {
    for (const text of normalizeStringList(row[key] || [])) {
      items.push({
        source: row.article_path || "",
        text: truncateText(text, 280),
      });
      if (items.length >= 8) return items;
    }
  }
  return items;
}

function recentWorkFromRows(receipts, tasks, currentTaskID) {
  const seen = new Set();
  const work = [];
  for (const row of receipts) {
    if (row.task_id && row.task_id === currentTaskID) continue;
    const key = `receipt:${row.id || row.task_id || work.length}`;
    if (seen.has(key)) continue;
    seen.add(key);
    work.push({
      delivery_summary: truncateText(redactSensitiveText(row.delivery_summary || ""), 320),
      delivery_url: row.delivery_url || "",
      status: row.delivery_status || "",
      task_id: row.task_id || "",
      updated_at: row.delivered_at || row.updated_at || row.created_at || "",
    });
  }
  for (const row of tasks) {
    if (row.id && row.id === currentTaskID) continue;
    const key = `task:${row.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    work.push({
      delivery_summary: truncateText(
        redactSensitiveText(row.delivery_summary || row.details || ""),
        320,
      ),
      delivery_url: row.delivery_url || "",
      owner: row.owner || "",
      status: row.status || "",
      task_id: row.local_id || row.id || "",
      title: row.title || "",
      updated_at: row.updated_at || row.delivered_at || "",
    });
  }
  return work;
}

function normalizeStringList(values) {
  if (!Array.isArray(values)) return [];
  return values.map((value) => String(value || "").trim()).filter(Boolean);
}

function normalizeProviderList(values) {
  return normalizeStringList(values).map(normalizeProviderKind).filter(Boolean);
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
    out.provider_runtimes = normalizeStringList(out.provider_runtimes);
  }
  return out;
}

function normalizeProviderKind(value) {
  const kind = String(value || "").trim().toLowerCase().replace(/_/g, "-");
  if (kind === "claude" || kind === "claude-code") return "claude-code";
  if (
    kind === "codex" ||
    kind === "opencode" ||
    kind === "openclaw" ||
    kind === "laf-cloud"
  ) {
    return kind;
  }
  return "";
}

function normalizeExecutionProvider(value, mode) {
  const provider = String(value || "").trim().toLowerCase().replace(/-/g, "_");
  if (provider === "codex" || provider === "claude_code" || provider === "laf_model") {
    return provider;
  }
  if (mode === "laf_model") return "laf_model";
  return "codex";
}

async function resolveExecutionBinding({ bindingID, deviceID, membership, mode, project }) {
  if (mode !== "my_bridge") return null;
  if (!bindingID) throw new HTTPError(400, "binding_id is required for my_bridge mode");
  if (!deviceID) throw new HTTPError(400, "device_id is required for my_bridge mode");
  const devices = await rest("bridge_devices", {
    query: {
      id: `eq.${deviceID}`,
      limit: "1",
      select: "*",
      status: "eq.online",
      team_id: `eq.${membership.team_id}`,
      user_id: `eq.${membership.user_id}`,
    },
  });
  const device = devices?.[0];
  if (!device || device.revoked_at || device.status === "revoked") {
    throw new HTTPError(400, "my_bridge requires an online non-revoked device");
  }
  const rows = await rest("project_local_bindings", {
    query: {
      id: `eq.${bindingID}`,
      limit: "1",
      project_id: `eq.${project?.id || ""}`,
      select: "*",
      team_id: `eq.${membership.team_id}`,
      trusted: "eq.true",
      user_id: `eq.${membership.user_id}`,
      device_id: `eq.${deviceID}`,
    },
  });
  const binding = rows?.[0];
  if (!binding) throw new HTTPError(400, "my_bridge requires a trusted binding for project/device");
  return binding;
}

function signingKeyPair() {
  const privateKeyPEM = String(process.env.LAF_EXECUTION_PLAN_SIGNING_PRIVATE_KEY || "").trim();
  const publicKeyPEM = String(process.env.LAF_EXECUTION_PLAN_SIGNING_PUBLIC_KEY || "").trim();
  if (privateKeyPEM && publicKeyPEM) {
    return {
      key_id: String(process.env.LAF_EXECUTION_PLAN_SIGNING_KEY_ID || "execution-plan-ed25519"),
      privateKey: crypto.createPrivateKey(privateKeyPEM),
      publicKey: crypto.createPublicKey(publicKeyPEM),
    };
  }
  const generated = crypto.generateKeyPairSync("ed25519");
  return {
    key_id: "execution-plan-dev-ephemeral",
    privateKey: generated.privateKey,
    publicKey: generated.publicKey,
  };
}

function signExecutionPlan(plan) {
  const fields = [
    "id",
    "team_id",
    "project_id",
    "task_id",
    "binding_id",
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
  for (const field of fields) payload[field] = plan[field] ?? null;
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
    .replace(/laf_runner_[A-Fa-f0-9]{20,}/g, "laf_runner_[REDACTED]")
    .replace(/lafr_[A-Za-z0-9_-]{20,}/g, "lafr_[REDACTED]")
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

function normalizeJobStatus(status) {
  return [
    "queued",
    "leased",
    "running",
    "succeeded",
    "failed",
    "canceled",
    "expired",
  ].includes(status)
    ? status
    : "queued";
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

function normalizeRunnerPairingAPIURL(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function runnerPairingRequestAPIURL(req) {
  const proto = String(req.headers["x-forwarded-proto"] || "https").split(",")[0].trim();
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").trim();
  return host ? `${proto}://${host}/api` : "";
}

function runnerPairingStartResponse(apiURL, code, teamID, expiresAt) {
  const normalizedAPIURL = normalizeRunnerPairingAPIURL(apiURL);
  return {
    api_url: normalizedAPIURL,
    pairing: {
      code,
      expires_at: expiresAt,
      team_id: teamID,
    },
    commands: {
      connect: `laf-runner pair --api-url ${normalizedAPIURL} --code ${code} --connect`,
    },
  };
}

function hashOrNull(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  return hashToken(text);
}

function basename(localPath) {
  const normalized = String(localPath || "").trim().replace(/[\\/]+$/, "");
  if (!normalized) return "Local Binding";
  const parts = normalized.split(/[\\/]/);
  return parts[parts.length - 1] || "Local Binding";
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

function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  );
}

function originFor(req) {
  const proto =
    req.headers["x-forwarded-proto"] ||
    (process.env.NODE_ENV === "production" ? "https" : "http");
  const host = req.headers["x-forwarded-host"] || req.headers.host || "";
  return `${proto}://${host}`;
}
