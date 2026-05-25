const assert = require("node:assert/strict");
const test = require("node:test");

const { publicStartupOfficeMemoryPage } = require("./serializers");

test("memory page serializer exposes freshness review metadata", () => {
  const page = publicStartupOfficeMemoryPage({
    id: "memory-1",
    last_verified_at: null,
    slug: "company-profile",
    status: "approved",
    summary: "Company profile",
    title: "Company Profile",
  });

  assert.equal(page.freshness.status, "needs_review");
  assert.equal(page.freshness.risk_level, "high");
  assert.equal(page.freshness.reason, "never_verified");
});
