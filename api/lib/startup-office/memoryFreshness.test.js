const assert = require("node:assert/strict");
const test = require("node:test");

const { startupOfficeMemoryFreshness } = require("./memoryFreshness");

const now = "2026-05-25T00:00:00.000Z";

test("memory freshness marks never verified canonical pages for review", () => {
  assert.deepEqual(
    startupOfficeMemoryFreshness({ slug: "icp" }, { now }),
    {
      days_since_verification: null,
      reason: "never_verified",
      review_due_at: null,
      review_interval_days: 30,
      risk_level: "high",
      status: "needs_review",
    },
  );
});

test("memory freshness grades stale, review-soon, and fresh pages by risk", () => {
  assert.equal(
    startupOfficeMemoryFreshness(
      { last_verified_at: "2026-04-20T00:00:00.000Z", slug: "offer" },
      { now },
    ).status,
    "stale",
  );
  const soon = startupOfficeMemoryFreshness(
    { last_verified_at: "2026-04-01T00:00:00.000Z", slug: "risks" },
    { now },
  );
  assert.equal(soon.status, "review_soon");
  assert.equal(soon.risk_level, "medium");
  assert.equal(soon.review_due_at, "2026-05-31T00:00:00.000Z");

  const fresh = startupOfficeMemoryFreshness(
    { last_verified_at: "2026-05-01T00:00:00.000Z", slug: "learning-updates" },
    { now },
  );
  assert.equal(fresh.status, "fresh");
  assert.equal(fresh.risk_level, "low");
  assert.equal(fresh.review_interval_days, 90);
});
