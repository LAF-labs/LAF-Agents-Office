const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createHostedIngressRateLimits,
} = require("./ingressRateLimits");

function createHTTPError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

test("clientRateLimitKey prefers forwarded client IPs and trims proxy lists", () => {
  const limits = createHostedIngressRateLimits();

  assert.equal(
    limits.clientRateLimitKey({
      headers: { "x-forwarded-for": "203.0.113.10, 10.0.0.1" },
    }),
    "203.0.113.10",
  );
  assert.equal(
    limits.clientRateLimitKey({
      headers: { "x-real-ip": "198.51.100.2" },
      socket: { remoteAddress: "10.0.0.2" },
    }),
    "198.51.100.2",
  );
  assert.equal(
    limits.clientRateLimitKey({
      connection: { remoteAddress: "192.0.2.1" },
      headers: {},
    }),
    "192.0.2.1",
  );
});

test("enforceRateLimit tracks scoped in-memory buckets and can reset them", () => {
  const limits = createHostedIngressRateLimits({ createHTTPError, windowMs: 1000 });

  limits.enforceRateLimit("scope", "key", 2);
  limits.enforceRateLimit("scope", "key", 2);
  assert.throws(
    () => limits.enforceRateLimit("scope", "key", 2),
    (err) => err.status === 429 && /rate limit exceeded/.test(err.message),
  );

  limits.resetRateLimits();
  assert.doesNotThrow(() => limits.enforceRateLimit("scope", "key", 2));
});

test("persistentRateLimitsEnabled follows production and explicit env flags", () => {
  assert.equal(
    createHostedIngressRateLimits({
      env: { NODE_ENV: "production" },
    }).persistentRateLimitsEnabled(),
    true,
  );
  assert.equal(
    createHostedIngressRateLimits({
      env: { LAF_OFFICE_PERSISTENT_RATE_LIMITS: "1", NODE_ENV: "test" },
    }).persistentRateLimitsEnabled(),
    true,
  );
  assert.equal(
    createHostedIngressRateLimits({ env: { NODE_ENV: "test" } }).persistentRateLimitsEnabled(),
    false,
  );
});

test("claimHostedRateLimit delegates to the allowlisted Supabase RPC shape", async () => {
  const calls = [];
  const limits = createHostedIngressRateLimits({
    rpc(name, body) {
      calls.push({ body, name });
      return { allowed: true };
    },
  });

  assert.deepEqual(
    await limits.claimHostedRateLimit({
      key: "",
      limit: 10,
      scope: "startup_office",
      windowMs: 60000,
    }),
    { allowed: true },
  );
  assert.deepEqual(calls, [
    {
      body: {
        p_bucket_key: "anonymous",
        p_limit: 10,
        p_scope: "startup_office",
        p_window_ms: 60000,
      },
      name: "claim_hosted_rate_limit",
    },
  ]);
});
