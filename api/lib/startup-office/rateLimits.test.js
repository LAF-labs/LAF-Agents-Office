const assert = require("node:assert/strict");
const test = require("node:test");

const {
  STARTUP_OFFICE_WORKFLOW_RATE_LIMITS,
  createStartupOfficeRateLimiter,
  startupOfficeRateLimitKey,
} = require("./rateLimits");

test("startup office rate limit keys are scoped to workspace and user", () => {
  assert.equal(
    startupOfficeRateLimitKey({ team_id: "team-1", user_id: "user-1" }),
    "team:team-1:user:user-1",
  );
});

test("startup office rate limiter covers loop runs and approval actions", async () => {
  const calls = [];
  const enforceStartupOfficeRateLimit = createStartupOfficeRateLimiter({
    enforceRateLimit(scope, key, limit, windowMs) {
      calls.push({ key, limit, scope, windowMs });
    },
  });

  await enforceStartupOfficeRateLimit({ team_id: "team-1", user_id: "user-1" }, "loop_run");
  await enforceStartupOfficeRateLimit(
    { team_id: "team-1", user_id: "user-1" },
    "approval_action",
  );

  assert.deepEqual(calls, [
    {
      key: "team:team-1:user:user-1",
      limit: 20,
      scope: "startup_office_loop_run",
      windowMs: STARTUP_OFFICE_WORKFLOW_RATE_LIMITS.loop_run.windowMs,
    },
    {
      key: "team:team-1:user:user-1",
      limit: 40,
      scope: "startup_office_approval_action",
      windowMs: STARTUP_OFFICE_WORKFLOW_RATE_LIMITS.approval_action.windowMs,
    },
  ]);
});

test("startup office rate limiter can use a persistent claim store", async () => {
  const calls = [];
  const enforceStartupOfficeRateLimit = createStartupOfficeRateLimiter({
    async claimPersistentRateLimit(claim) {
      calls.push(claim);
      return { allowed: false };
    },
    createRateLimitError() {
      const err = new Error("rate limit exceeded");
      err.status = 429;
      return err;
    },
    enforceRateLimit() {
      throw new Error("local fallback should not run");
    },
  });

  await assert.rejects(
    () => enforceStartupOfficeRateLimit({ team_id: "team-1", user_id: "user-1" }, "loop_run"),
    (err) => err.status === 429 && err.message === "rate limit exceeded",
  );
  assert.equal(calls[0].scope, "startup_office_loop_run");
  assert.equal(calls[0].key, "team:team-1:user:user-1");
});
