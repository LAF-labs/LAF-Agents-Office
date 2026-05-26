const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createHostedIdentityHandlerBundle,
} = require("./identityHandlerBundle");

test("hosted identity handler bundle wires auth, member, invite, and signup handlers", () => {
  const calls = [];
  const inviteByToken = async () => ({ id: "invite-1" });
  const bundle = createHostedIdentityHandlerBundle({
    ...deps(),
    createAuthHandlers: factory(calls, "auth"),
    createInviteHandlers: factory(calls, "invite", { inviteByToken }),
    createMemberHandlers: factory(calls, "member"),
    createSignupHandlers: factory(calls, "signup"),
  });

  assert.equal(Object.isFrozen(bundle), true);
  assert.deepEqual(Object.keys(bundle).sort(), [
    "authHandlers",
    "inviteHandlers",
    "memberHandlers",
    "signupHandlers",
  ]);
  assert.equal(calls.find(([name]) => name === "signup")[1].inviteByToken, inviteByToken);
  assert.equal(calls.find(([name]) => name === "invite")[1].originFor.name, "originFor");
  assert.equal(calls.find(([name]) => name === "member")[1].normalizeRole.name, "normalizeRole");
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
    authAdminFetch: marker("authAdminFetch"),
    authFetch: marker("authFetch"),
    clientRateLimitKey: marker("clientRateLimitKey"),
    createHTTPError: marker("createHTTPError"),
    effectivePermissions: marker("effectivePermissions"),
    enforceRateLimit: marker("enforceRateLimit"),
    getTeam: marker("getTeam"),
    normalizePermissionOverride: marker("normalizePermissionOverride"),
    normalizeRole: marker("normalizeRole"),
    nowISO: marker("nowISO"),
    originFor: marker("originFor"),
    readBody: marker("readBody"),
    requirePermission: marker("requirePermission"),
    requireUser: marker("requireUser"),
    rest: marker("rest"),
    sendInviteEmail: marker("sendInviteEmail"),
    setAuthCookies: marker("setAuthCookies"),
    shortID: marker("shortID"),
    slugify: marker("slugify"),
    startupOfficeBetaOpsSnapshot: marker("startupOfficeBetaOpsSnapshot"),
    writeAuditEvent: marker("writeAuditEvent"),
    writeJSON: marker("writeJSON"),
  };
}

function marker(name) {
  const fn = () => name;
  Object.defineProperty(fn, "name", { value: name });
  return fn;
}
