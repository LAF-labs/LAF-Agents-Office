const assert = require("node:assert/strict");
const test = require("node:test");

const {
  STARTUP_OFFICE_RECEIPT_MEMORY_PAGE_SLUGS,
  materializeStartupOfficeReceiptMemory,
} = require("./receiptMemory");

test("receipt memory materialization appends structured receipt and learning pages", async () => {
  const written = [];
  const membership = { team_id: "team-1", user_id: "user-1" };
  const result = await materializeStartupOfficeReceiptMemory({
    approval: { id: "approval-1" },
    membership,
    receipt: {
      approval_id: "approval-1",
      created_at: "2026-05-25T00:00:00.000Z",
      event_type: "approval.approved",
      id: "receipt-1",
      run_id: "run-1",
      summary: "Founder approved the pending Startup Office action.",
      trace: { memory_pages: ["company-profile"] },
    },
    repository: {
      async memoryPages(teamID, options) {
        assert.equal(teamID, "team-1");
        assert.deepEqual(options, { limit: 50, status: "approved" });
        return [{ body: "Existing receipt", slug: "loop-receipts" }];
      },
      async upsertMemoryPage(value, page) {
        assert.equal(value, membership);
        written.push(page);
        return { id: `memory-${written.length}`, ...page };
      },
    },
    run: {
      id: "run-1",
      objective: "Validate idea",
      status: "completed",
      summary: "Founder approved the drafted loop output.",
    },
  });

  assert.deepEqual(STARTUP_OFFICE_RECEIPT_MEMORY_PAGE_SLUGS, [
    "loop-receipts",
    "learning-updates",
  ]);
  assert.equal(written.length, 2);
  assert.equal(written[0].slug, "loop-receipts");
  assert.match(written[0].body, /Existing receipt/);
  assert.match(written[0].body, /Receipt: receipt-1/);
  assert.equal(written[1].slug, "learning-updates");
  assert.match(written[1].body, /Memory pages updated: company-profile/);
  assert.deepEqual(written[0].provenance, {
    approval_id: "approval-1",
    receipt_id: "receipt-1",
    run_id: "run-1",
    source: "startup_office_receipt",
  });
  assert.deepEqual(result.pages.map((page) => page.slug), [
    "loop-receipts",
    "learning-updates",
  ]);
});
