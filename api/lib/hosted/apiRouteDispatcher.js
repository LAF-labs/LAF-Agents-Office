function createHostedAPIRouteDispatcher(deps) {
  const {
    activityHandlers,
    agentLogHandlers,
    auditHandlers,
    authHandlers,
    authorizeStartupOfficeAccess,
    clearAuthCookies,
    clientTelemetryHandlers,
    commandHandlers,
    conversationHandlers,
    dispatchStartupOfficeRoute,
    healthHandlers,
    inviteHandlers,
    memberHandlers,
    memoryHandlers,
    modelAccess,
    orchestrationHandlers,
    requireAdminRole,
    requirePermission,
    requireUser,
    requestHandlers,
    rosterHandlers,
    schedulerHandlers,
    signupHandlers,
    skillHandlers,
    startupOfficeRouteHandlers,
    usageHandlers,
    workspaceConfigHandlers,
    writeJSON,
  } = deps;

  async function dispatch(req, res, path) {
    if (path === "health" && req.method === "GET") return call(healthHandlers.health, req, res);
    if (path === "health/dependencies" && req.method === "GET") return call(healthHandlers.dependencies, req, res);
    if (path === "auth/session" && req.method === "GET") return call(authHandlers.session, req, res);
    if (path === "auth/users") return call(memberHandlers.authUsers, req, res);
    if (path === "auth/me" && req.method === "PATCH") return call(authHandlers.me, req, res);
    if (path === "auth/me/password" && req.method === "PATCH") return call(authHandlers.password, req, res);
    if (path === "auth/login" && req.method === "POST") return call(authHandlers.login, req, res);
    if (path === "auth/signup" && req.method === "POST") return call(signupHandlers.signup, req, res);
    if (path === "auth/logout" && req.method === "POST") {
      clearAuthCookies(req, res);
      writeJSON(res, 200, { status: "ok" });
      return true;
    }
    if (path === "config") return call(workspaceConfigHandlers.config, req, res);
    if (path === "onboarding/state" && req.method === "GET") {
      return call(workspaceConfigHandlers.onboardingState, req, res);
    }
    if (path === "onboarding/complete" && req.method === "POST") {
      return call(workspaceConfigHandlers.onboardingComplete, req, res);
    }
    if (path === "onboarding/prereqs" && req.method === "GET") {
      writeJSON(res, 200, { prereqs: [] });
      return true;
    }
    if (path === "onboarding/blueprints" && req.method === "GET") {
      writeJSON(res, 200, { templates: [] });
      return true;
    }
    if (await dispatchStartupOfficeRoute({
      authorize: (access, request) => authorizeStartupOfficeAccess({
        access,
        req: request,
        requireAdminRole,
        requirePermission,
        requireUser,
      }),
      handlers: startupOfficeRouteHandlers,
      path,
      req,
      res,
    })) {
      return true;
    }
    if (path === "humans" && req.method === "GET") return call(rosterHandlers.humans, req, res);
    if (path === "teams" && req.method === "GET") return call(rosterHandlers.teams, req, res);
    if (path === "office-members") return call(rosterHandlers.officeMembers, req, res);
    if (path === "office-members/generate" && req.method === "POST") {
      return call(rosterHandlers.officeMemberGenerate, req, res);
    }
    if (path === "members" && req.method === "GET") return call(rosterHandlers.channelMembers, req, res);
    if (path === "channels") return call(conversationHandlers.channels, req, res);
    if (path === "channels/generate" && req.method === "POST") {
      return call(conversationHandlers.channelGenerate, req, res);
    }
    if (path === "channels/dm" && req.method === "POST") {
      return call(conversationHandlers.dmChannel, req, res);
    }
    if (path === "messages") return call(conversationHandlers.messages, req, res);
    if (path === "messages/react" && req.method === "POST") {
      return call(conversationHandlers.messageReaction, req, res);
    }
    if (path === "home-sessions") return call(conversationHandlers.homeSessions, req, res);
    if (path === "commands" && req.method === "GET") return call(commandHandlers.commands, req, res);
    if (path === "commands/run" && req.method === "POST") return call(commandHandlers.commandRun, req, res);
    if (path === "requests" && req.method === "GET") return call(requestHandlers.requests, req, res);
    if (path === "requests/answer" && req.method === "POST") {
      return call(requestHandlers.requestAnswer, req, res);
    }
    if (path === "actions" && req.method === "GET") return call(activityHandlers.actions, req, res);
    if (path === "signals") return call(activityHandlers.signals, req, res);
    if (path === "decisions" && req.method === "GET") return call(activityHandlers.decisions, req, res);
    if (path === "watchdogs" && req.method === "GET") return call(activityHandlers.watchdogs, req, res);
    if (path === "scheduler" && req.method === "GET") return call(schedulerHandlers.scheduler, req, res);
    if (path === "usage" && req.method === "GET") return call(usageHandlers.usage, req, res);
    if (path === "client-errors") return call(clientTelemetryHandlers.clientError, req, res);
    if (path === "agent-logs" && req.method === "GET") return call(agentLogHandlers.agentLogs, req, res);
    if (path === "memory") return call(memoryHandlers.memory, req, res);
    if (path === "invites/lookup" && req.method === "GET") return call(inviteHandlers.inviteLookup, req, res);
    if (path === "invites/accept" && req.method === "POST") return call(inviteHandlers.inviteAccept, req, res);
    if (path === "invites") return call(inviteHandlers.invites, req, res);
    if (path === "permissions") return call(memberHandlers.permissions, req, res);
    if (path === "audit" && req.method === "GET") return call(auditHandlers.auditEvents, req, res);
    if (path === "model/availability" && req.method === "GET") {
      return call(modelAccess.availability, req, res);
    }
    if (path === "orchestration/intent" && req.method === "POST") {
      return call(orchestrationHandlers.orchestrationIntent, req, res);
    }
    if (path === "orchestration/confirm" && req.method === "POST") {
      return call(orchestrationHandlers.orchestrationConfirm, req, res);
    }
    if (path === "skills") return call(skillHandlers.skills, req, res);
    const skillInvokeMatch = path.match(/^skills\/([^/]+)\/invoke$/);
    if (skillInvokeMatch && req.method === "POST") {
      await skillHandlers.skillInvoke(req, res, decodeURIComponent(skillInvokeMatch[1]));
      return true;
    }
    return false;
  }

  return { dispatch };
}

async function call(handler, req, res) {
  await handler(req, res);
  return true;
}

module.exports = {
  createHostedAPIRouteDispatcher,
};
