const assert = require("node:assert/strict");
const test = require("node:test");

const {
  HOSTED_ACTION_RATE_LIMITS,
  createHostedActionRateLimiter,
} = require("./rateLimits");

test("hosted action rate limits cover expensive founder actions", () => {
  const scopes = new Set(HOSTED_ACTION_RATE_LIMITS.map((limit) => limit.scope));
  for (const scope of [
    "startup_office_approval_action",
    "startup_office_export",
    "startup_office_loop_run",
    "startup_office_run_mutation",
    "hosted_client_error_report",
    "hosted_invite_create",
    "hosted_profile_write",
    "hosted_workspace_config_write",
  ]) {
    assert.ok(scopes.has(scope), scope);
  }
});

test("hosted action rate limiter applies only matching methods and paths", async () => {
  const calls = [];
  const enforceHostedActionRateLimit = createHostedActionRateLimiter({
    enforceRateLimit(scope, key, limit) {
      calls.push({ key, limit, scope });
    },
    keyForRequest(req) {
      return req.key || "unknown";
    },
  });

  for (const [method, path, scope] of [
    ["GET", "startup-office/export", "startup_office_export"],
    ["POST", "startup-office/loops/idea-validation/run", "startup_office_loop_run"],
    ["POST", "loops/customer-discovery/run", "startup_office_loop_run"],
    ["POST", "startup-office/runs/run-1/retry", "startup_office_run_mutation"],
    ["POST", "startup-office/approvals/approval-1/approve", "startup_office_approval_action"],
    ["POST", "client-errors", "hosted_client_error_report"],
    ["POST", "invites", "hosted_invite_create"],
    ["PATCH", "company/profile", "hosted_profile_write"],
    ["POST", "config", "hosted_workspace_config_write"],
    ["POST", "onboarding/complete", "hosted_workspace_config_write"],
  ]) {
    await enforceHostedActionRateLimit({ key: "ip-1", method }, path);
    assert.equal(calls.at(-1).scope, scope);
  }

  const count = calls.length;
  await enforceHostedActionRateLimit({ key: "ip-1", method: "GET" }, "startup-office/loops");
  await enforceHostedActionRateLimit({ key: "ip-1", method: "POST" }, "startup-office/export");
  await enforceHostedActionRateLimit({ key: "ip-1", method: "PATCH" }, "startup-office/runs/run-1/retry");
  assert.equal(calls.length, count);
});

test("hosted action rate limiter can use a persistent claim store", async () => {
  const calls = [];
  const enforceHostedActionRateLimit = createHostedActionRateLimiter({
    async claimPersistentRateLimit(claim) {
      calls.push(claim);
      return { allowed: calls.length < 2 };
    },
    createRateLimitError() {
      const err = new Error("rate limit exceeded");
      err.status = 429;
      return err;
    },
    enforceRateLimit() {
      throw new Error("local fallback should not run");
    },
    keyForRequest() {
      return "ip-1";
    },
    windowMs: 1234,
  });

  await enforceHostedActionRateLimit({ method: "GET" }, "startup-office/export");
  assert.deepEqual(calls[0], {
    key: "ip-1",
    limit: 6,
    scope: "startup_office_export",
    windowMs: 1234,
  });
  await assert.rejects(
    () => enforceHostedActionRateLimit({ method: "GET" }, "startup-office/export"),
    /rate limit exceeded/,
  );
});
