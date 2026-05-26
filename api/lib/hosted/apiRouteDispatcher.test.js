const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createHostedAPIRouteDispatcher,
} = require("./apiRouteDispatcher");

test("hosted API route dispatcher handles logout without auth route leakage", async () => {
  const calls = [];
  const dispatcher = createHostedAPIRouteDispatcher(createDeps(calls));
  const req = { method: "POST" };
  const res = {};

  assert.equal(await dispatcher.dispatch(req, res, "auth/logout"), true);
  assert.deepEqual(callNames(calls), ["clearAuthCookies", "writeJSON"]);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { status: "ok" });
});

test("hosted API route dispatcher keeps static onboarding responses", async () => {
  const calls = [];
  const dispatcher = createHostedAPIRouteDispatcher(createDeps(calls));
  const res = {};

  assert.equal(await dispatcher.dispatch({ method: "GET" }, res, "onboarding/prereqs"), true);
  assert.deepEqual(res, { status: 200, body: { prereqs: [] } });
});

test("hosted API route dispatcher delegates Startup Office routes with authorization", async () => {
  const calls = [];
  const dispatcher = createHostedAPIRouteDispatcher(createDeps(calls));
  const req = { method: "GET" };
  const res = {};

  assert.equal(await dispatcher.dispatch(req, res, "startup-office/loops"), true);
  assert.deepEqual(callNames(calls), [
    "dispatchStartupOfficeRoute",
    "authorizeStartupOfficeAccess",
    "startupOffice.loops",
  ]);
  assert.equal(calls[0][1][0].path, "startup-office/loops");
});

test("hosted API route dispatcher decodes skill invocation ids", async () => {
  const calls = [];
  const dispatcher = createHostedAPIRouteDispatcher(createDeps(calls));
  const req = { method: "POST" };
  const res = {};

  assert.equal(await dispatcher.dispatch(req, res, "skills/growth%20audit/invoke"), true);
  assert.deepEqual(calls.at(-1), ["skills.skillInvoke", [req, res, "growth audit"]]);
});

test("hosted API route dispatcher returns false for unknown routes", async () => {
  const calls = [];
  const dispatcher = createHostedAPIRouteDispatcher(createDeps(calls));

  assert.equal(await dispatcher.dispatch({ method: "GET" }, {}, "missing"), false);
  assert.deepEqual(callNames(calls), ["dispatchStartupOfficeRoute"]);
});

function createDeps(calls) {
  return {
    activityHandlers: handlers(calls, "actions", "signals", "decisions", "watchdogs"),
    agentLogHandlers: handlers(calls, "agentLogs"),
    auditHandlers: handlers(calls, "auditEvents"),
    authHandlers: handlers(calls, "session", "me", "password", "login"),
    authorizeStartupOfficeAccess: (...args) => record(calls, "authorizeStartupOfficeAccess", args),
    clearAuthCookies: (...args) => record(calls, "clearAuthCookies", args),
    clientTelemetryHandlers: handlers(calls, "clientError"),
    commandHandlers: handlers(calls, "commands", "commandRun"),
    conversationHandlers: handlers(
      calls,
      "channels",
      "channelGenerate",
      "dmChannel",
      "messages",
      "messageReaction",
      "homeSessions",
    ),
    dispatchStartupOfficeRoute: async ({ authorize, handlers: routeHandlers, path, req, res }) => {
      calls.push(["dispatchStartupOfficeRoute", [{ path, req, res }]]);
      if (path !== "startup-office/loops") return false;
      await authorize("loops:read", req);
      await routeHandlers.loops(req, res);
      return true;
    },
    healthHandlers: handlers(calls, "health", "dependencies"),
    inviteHandlers: handlers(calls, "inviteLookup", "inviteAccept", "invites"),
    memberHandlers: handlers(calls, "authUsers", "permissions"),
    memoryHandlers: handlers(calls, "memory"),
    modelAccess: handlers(calls, "availability"),
    orchestrationHandlers: handlers(calls, "orchestrationIntent", "orchestrationConfirm"),
    requireAdminRole: "requireAdminRole",
    requirePermission: "requirePermission",
    requireUser: "requireUser",
    requestHandlers: handlers(calls, "requests", "requestAnswer"),
    rosterHandlers: handlers(calls, "humans", "teams", "officeMembers", "officeMemberGenerate", "channelMembers"),
    schedulerHandlers: handlers(calls, "scheduler"),
    signupHandlers: handlers(calls, "signup"),
    skillHandlers: handlers(calls, "skills", "skills.skillInvoke"),
    startupOfficeRouteHandlers: handlers(calls, "startupOffice.loops"),
    usageHandlers: handlers(calls, "usage"),
    workspaceConfigHandlers: handlers(calls, "config", "onboardingState", "onboardingComplete"),
    writeJSON: (res, status, body) => {
      record(calls, "writeJSON", [res, status, body]);
      res.status = status;
      res.body = body;
    },
  };
}

function handlers(calls, ...names) {
  return Object.fromEntries(names.map((name) => [
    name.split(".").at(-1),
    async (...args) => record(calls, name, args),
  ]));
}

function record(calls, name, args) {
  calls.push([name, args]);
  return { name, args };
}

function callNames(calls) {
  return calls.map(([name]) => name);
}
