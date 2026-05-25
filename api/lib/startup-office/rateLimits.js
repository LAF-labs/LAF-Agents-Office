const STARTUP_OFFICE_WORKFLOW_RATE_LIMITS = Object.freeze({
  approval_action: Object.freeze({
    limit: 40,
    scope: "startup_office_approval_action",
    windowMs: 60 * 1000,
  }),
  loop_run: Object.freeze({
    limit: 20,
    scope: "startup_office_loop_run",
    windowMs: 60 * 1000,
  }),
});

function createStartupOfficeRateLimiter({
  claimPersistentRateLimit,
  createRateLimitError,
  enforceRateLimit,
  limits = STARTUP_OFFICE_WORKFLOW_RATE_LIMITS,
}) {
  return async function enforceStartupOfficeRateLimit(membership, action) {
    const rule = limits[action];
    if (!rule) return;
    const key = startupOfficeRateLimitKey(membership);
    if (claimPersistentRateLimit) {
      const result = await claimPersistentRateLimit({
        key,
        limit: rule.limit,
        scope: rule.scope,
        windowMs: rule.windowMs,
      });
      if (result?.allowed === false) throw createRateLimitError();
      return;
    }
    enforceRateLimit(rule.scope, key, rule.limit, rule.windowMs);
  };
}

function startupOfficeRateLimitKey(membership) {
  return [
    "team",
    membership?.team_id || "unknown",
    "user",
    membership?.user_id || "unknown",
  ].join(":");
}

module.exports = {
  STARTUP_OFFICE_WORKFLOW_RATE_LIMITS,
  createStartupOfficeRateLimiter,
  startupOfficeRateLimitKey,
};
