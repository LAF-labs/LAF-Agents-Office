const assert = require("node:assert/strict");
const test = require("node:test");

const {
  applyStartupOfficeMemoryPromotion,
  assertStartupOfficeMemoryConflictsResolved,
  buildStartupOfficeMemoryDiff,
} = require("./wikiWriter");

test("memory diff flags canonical summary conflicts for founder resolution", () => {
  const diff = buildStartupOfficeMemoryDiff({
    currentPages: [
      { body: "Enterprise SaaS founders", slug: "icp", summary: "Enterprise SaaS founders" },
    ],
    nextPages: [
      { body: "Solo B2B founders", slug: "icp", summary: "Solo B2B founders", title: "ICP" },
    ],
  });

  assert.equal(diff.has_unresolved_conflicts, true);
  assert.deepEqual(diff.conflicts, [
    {
      after_summary: "Solo B2B founders",
      before_summary: "Enterprise SaaS founders",
      resolution_required: true,
      resolution_status: "founder_approval_required",
      slug: "icp",
      title: "ICP",
    },
  ]);
});

test("memory promotion blocks unresolved canonical conflicts before writing", async () => {
  const writes = [];
  await assert.rejects(
    () =>
      applyStartupOfficeMemoryPromotion({
        approval: { id: "approval-1", status: "pending" },
        artifact: artifactWithSegment("Solo B2B founders"),
        membership: { team_id: "team-1", user_id: "user-1" },
        profile: {},
        repository: conflictRepository(writes),
        run: { id: "run-1", summary: "Update ICP" },
      }),
    (err) =>
      err.status === 409 &&
      err.message === "memory conflicts require founder approval before promotion" &&
      err.details.conflicts[0].slug === "icp",
  );
  assert.equal(writes.length, 0);
});

test("founder-approved memory promotion resolves canonical conflicts", async () => {
  const writes = [];
  const result = await applyStartupOfficeMemoryPromotion({
    approval: {
      decided_at: "2026-05-25T00:00:00.000Z",
      decided_by: "user-1",
      id: "approval-1",
      status: "approved",
    },
    artifact: artifactWithSegment("Solo B2B founders"),
    membership: { team_id: "team-1", user_id: "user-1" },
    profile: {},
    repository: conflictRepository(writes),
    run: { id: "run-1", summary: "Update ICP" },
  });

  assert.equal(result.diff.has_unresolved_conflicts, false);
  assert.equal(result.diff.conflicts[0].resolution_status, "founder_approved");
  assert.equal(writes.some((page) => page.slug === "icp"), true);
});

test("conflict resolver fails closed without founder decision metadata", () => {
  assert.throws(
    () =>
      assertStartupOfficeMemoryConflictsResolved({
        approval: { status: "approved" },
        diff: {
          conflicts: [{ slug: "icp" }],
          has_unresolved_conflicts: true,
        },
      }),
    /memory conflicts require founder approval/,
  );
});

function artifactWithSegment(segment) {
  return {
    id: "artifact-1",
    metadata: {
      structured_output: {
        customer_segment: segment,
        summary: "Updated ICP.",
      },
    },
    title: "Idea Validation AI draft",
  };
}

function conflictRepository(writes) {
  return {
    async memoryPages(teamID, options) {
      assert.equal(teamID, "team-1");
      assert.deepEqual(options, { status: "approved", limit: 50 });
      return [
        {
          body: "Enterprise SaaS founders",
          slug: "icp",
          summary: "Enterprise SaaS founders",
          title: "ICP",
        },
      ];
    },
    async upsertMemoryPage(_membership, page) {
      writes.push(page);
      return { id: `memory-${writes.length}`, ...page };
    },
  };
}
