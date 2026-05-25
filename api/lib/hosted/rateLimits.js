const HOSTED_ACTION_RATE_LIMITS = Object.freeze([
  {
    limit: 6,
    method: "GET",
    pattern: /^startup-office\/export$/,
    scope: "startup_office_export",
  },
  {
    limit: 20,
    method: "POST",
    pattern: /^(?:startup-office\/)?loops\/[^/]+\/run$/,
    scope: "startup_office_loop_run",
  },
  {
    limit: 20,
    method: "POST",
    pattern: /^(?:startup-office\/)?runs\/[^/]+\/(?:retry|cancel)$/,
    scope: "startup_office_run_mutation",
  },
  {
    limit: 40,
    method: "POST",
    pattern: /^(?:startup-office\/)?approvals\/[^/]+\/(?:approve|reject|revise)$/,
    scope: "startup_office_approval_action",
  },
  {
    limit: 20,
    method: "POST",
    pattern: /^invites$/,
    scope: "hosted_invite_create",
  },
  {
    limit: 60,
    method: "POST",
    pattern: /^client-errors$/,
    scope: "hosted_client_error_report",
  },
  {
    limit: 30,
    method: "PATCH",
    pattern: /^(?:auth\/me|company\/profile|startup-office\/policy|startup-office\/billing)$/,
    scope: "hosted_profile_write",
  },
  {
    limit: 30,
    method: "POST",
    pattern: /^(?:config|onboarding\/complete)$/,
    scope: "hosted_workspace_config_write",
  },
]);

function createHostedActionRateLimiter({
  claimPersistentRateLimit,
  createRateLimitError,
  enforceRateLimit,
  keyForRequest,
  limits = HOSTED_ACTION_RATE_LIMITS,
  windowMs = 60 * 1000,
}) {
  return async function enforceHostedActionRateLimit(req, path) {
    const method = String(req.method || "GET").toUpperCase();
    const normalizedPath = String(path || "").replace(/^\/+|\/+$/g, "");
    const rule = limits.find(
      (candidate) =>
        candidate.method === method && candidate.pattern.test(normalizedPath),
    );
    if (!rule) return;
    const key = keyForRequest(req);
    if (claimPersistentRateLimit) {
      const result = await claimPersistentRateLimit({
        key,
        limit: rule.limit,
        scope: rule.scope,
        windowMs,
      });
      if (result?.allowed === false) {
        throw createRateLimitError();
      }
      return;
    }
    enforceRateLimit(rule.scope, key, rule.limit, windowMs);
  };
}

module.exports = {
  HOSTED_ACTION_RATE_LIMITS,
  createHostedActionRateLimiter,
};
