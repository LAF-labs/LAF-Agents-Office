const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createHostedHandlerBundle,
} = require("./handlerBundle");

test("hosted handler bundle wires route handler factories with shared dependencies", () => {
  const calls = [];
  const inviteByToken = async () => ({ id: "invite-1" });
  const bundle = createHostedHandlerBundle({
    ...deps(),
    createActivityHandlers: factory(calls, "activity"),
    createAgentLogHandlers: factory(calls, "agentLog"),
    createAuditHandlers: factory(calls, "audit"),
    createAuthHandlers: factory(calls, "auth"),
    createClientTelemetryHandlers: factory(calls, "clientTelemetry"),
    createCommandHandlers: factory(calls, "command"),
    createConversationHandlers: factory(calls, "conversation"),
    createHealthHandlers: factory(calls, "health"),
    createInviteHandlers: factory(calls, "invite", { inviteByToken }),
    createMemberHandlers: factory(calls, "member"),
    createMemoryHandlers: factory(calls, "memory"),
    createModelAccess: factory(calls, "model"),
    createOrchestrationHandlers: factory(calls, "orchestration"),
    createRequestHandlers: factory(calls, "request"),
    createRosterHandlers: factory(calls, "roster"),
    createSchedulerHandlers: factory(calls, "scheduler"),
    createSignupHandlers: factory(calls, "signup"),
    createSkillHandlers: factory(calls, "skill"),
    createUsageHandlers: factory(calls, "usage"),
  });

  assert.equal(Object.isFrozen(bundle), true);
  assert.deepEqual(Object.keys(bundle).sort(), [
    "activityHandlers",
    "agentLogHandlers",
    "auditHandlers",
    "authHandlers",
    "clientTelemetryHandlers",
    "commandHandlers",
    "conversationHandlers",
    "healthHandlers",
    "inviteHandlers",
    "memberHandlers",
    "memoryHandlers",
    "modelAccess",
    "orchestrationHandlers",
    "requestHandlers",
    "rosterHandlers",
    "schedulerHandlers",
    "signupHandlers",
    "skillHandlers",
    "usageHandlers",
  ]);
  assert.equal(calls.find(([name]) => name === "signup")[1].inviteByToken, inviteByToken);
  assert.equal(calls.find(([name]) => name === "model")[1].managedModelEnabled(), true);
  assert.equal(calls.find(([name]) => name === "request")[1].approvalAction.name, "approvalAction");
});

function factory(calls, name, extra = {}) {
  return (factoryDeps) => {
    calls.push([name, factoryDeps]);
    return { name, ...extra };
  };
}

function deps() {
  return {
    WORKSPACE_PERMISSIONS: Object.freeze(["workspace:read"]),
    WORKSPACE_ROLES: Object.freeze(["owner"]),
    RATE_LIMITS: { authSignup: { limit: 1, windowMs: 1000 } },
    activeMembership: marker("activeMembership"),
    approvalAction: marker("approvalAction"),
    authAdminFetch: marker("authAdminFetch"),
    authFetch: marker("authFetch"),
    clamp: marker("clamp"),
    clientRateLimitKey: marker("clientRateLimitKey"),
    createHTTPError: marker("createHTTPError"),
    effectivePermissions: marker("effectivePermissions"),
    enforceRateLimit: marker("enforceRateLimit"),
    env: {
      LAF_OFFICE_MANAGED_MODEL_ENABLED: "1",
      LAF_OFFICE_WORKSPACE_PAID: "",
    },
    getTeam: marker("getTeam"),
    hasPermission: marker("hasPermission"),
    isHuman: marker("isHuman"),
    normalizePermissionOverride: marker("normalizePermissionOverride"),
    normalizeRole: marker("normalizeRole"),
    nowISO: marker("nowISO"),
    objectValue: marker("objectValue"),
    originFor: marker("originFor"),
    randomID: marker("randomID"),
    readBody: marker("readBody"),
    requirePermission: marker("requirePermission"),
    requireUser: marker("requireUser"),
    rest: marker("rest"),
    rpc: marker("rpc"),
    safeStartupOfficeRest: marker("safeStartupOfficeRest"),
    sendInviteEmail: marker("sendInviteEmail"),
    setAuthCookies: marker("setAuthCookies"),
    shortID: marker("shortID"),
    slugify: marker("slugify"),
    startupOfficeApprovals: marker("startupOfficeApprovals"),
    startupOfficeBetaOpsSnapshot: marker("startupOfficeBetaOpsSnapshot"),
    startupOfficeReceipts: marker("startupOfficeReceipts"),
    startupOfficeRepository: marker("startupOfficeRepository"),
    truncateText: marker("truncateText"),
    truthy: (value) => value === "1",
    writeAuditEvent: marker("writeAuditEvent"),
    writeJSON: marker("writeJSON"),
  };
}

function marker(name) {
  const fn = () => name;
  Object.defineProperty(fn, "name", { value: name });
  return fn;
}
