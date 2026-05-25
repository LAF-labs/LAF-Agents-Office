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
    limit: 30,
    method: "PATCH",
    pattern: /^(?:auth\/me|company\/profile|startup-office\/policy|startup-office\/billing)$/,
    scope: "hosted_profile_write",
  },
]);

function createHostedActionRateLimiter({
  enforceRateLimit,
  keyForRequest,
  limits = HOSTED_ACTION_RATE_LIMITS,
}) {
  return function enforceHostedActionRateLimit(req, path) {
    const method = String(req.method || "GET").toUpperCase();
    const normalizedPath = String(path || "").replace(/^\/+|\/+$/g, "");
    const limit = limits.find(
      (candidate) =>
        candidate.method === method && candidate.pattern.test(normalizedPath),
    );
    if (!limit) return;
    enforceRateLimit(limit.scope, keyForRequest(req), limit.limit);
  };
}

module.exports = {
  HOSTED_ACTION_RATE_LIMITS,
  createHostedActionRateLimiter,
};
