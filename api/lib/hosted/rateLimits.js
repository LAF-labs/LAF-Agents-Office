const { HOSTED_ACTION_RATE_LIMITS } = require("./actionRateLimitRules");

function matchHostedActionRateLimit(method, path, limits = HOSTED_ACTION_RATE_LIMITS) {
  const normalizedMethod = String(method || "GET").toUpperCase();
  const normalizedPath = String(path || "").replace(/^\/+|\/+$/g, "");
  return limits.find(
    (candidate) =>
      candidate.method === normalizedMethod && candidate.pattern.test(normalizedPath),
  );
}

function createHostedActionRateLimiter({
  claimPersistentRateLimit,
  createRateLimitError,
  enforceRateLimit,
  keyForRequest,
  limits = HOSTED_ACTION_RATE_LIMITS,
  windowMs = 60 * 1000,
}) {
  return async function enforceHostedActionRateLimit(req, path) {
    const rule = matchHostedActionRateLimit(req.method, path, limits);
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
  matchHostedActionRateLimit,
};
