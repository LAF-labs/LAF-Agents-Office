function createHostedIngressRateLimits(options = {}) {
  const createHTTPError = options.createHTTPError || defaultHTTPError;
  const env = options.env || process.env;
  const rateLimitBuckets = new Map();
  const rateLimitWindowMs = Number(options.windowMs || 60 * 1000);
  const rpc = options.rpc || null;

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

  function enforceRateLimit(scope, key, limit, windowMs = rateLimitWindowMs) {
    const bucketKey = `${scope}:${key || "anonymous"}`;
    const now = Date.now();
    const bucket = rateLimitBuckets.get(bucketKey);
    if (!bucket || bucket.resetAt <= now) {
      rateLimitBuckets.set(bucketKey, { count: 1, resetAt: now + windowMs });
      return;
    }
    bucket.count += 1;
    if (bucket.count > limit) {
      throw createHTTPError(429, "rate limit exceeded");
    }
  }

  function persistentRateLimitsEnabled() {
    return (
      env.NODE_ENV === "production" ||
      env.LAF_OFFICE_PERSISTENT_RATE_LIMITS === "1"
    );
  }

  async function claimHostedRateLimit({ key, limit, scope, windowMs }) {
    return rpc("claim_hosted_rate_limit", {
      p_bucket_key: key || "anonymous",
      p_limit: limit,
      p_scope: scope,
      p_window_ms: windowMs,
    });
  }

  function resetRateLimits() {
    rateLimitBuckets.clear();
  }

  return {
    claimHostedRateLimit,
    clientRateLimitKey,
    enforceRateLimit,
    persistentRateLimitsEnabled,
    resetRateLimits,
  };
}

function defaultHTTPError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

module.exports = {
  createHostedIngressRateLimits,
};
