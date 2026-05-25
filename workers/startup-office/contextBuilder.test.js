const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildStartupOfficeContext,
  contextSearchTerms,
  rankByRelevance,
} = require("./contextBuilder");

test("context search terms derive retrieval terms from loop, run, inputs, and profile", () => {
  const terms = contextSearchTerms({
    loop: { name: "Customer Discovery", objective: "Interview AI operations buyers" },
    profile: { icp: "solo B2B founders", offer: "AI startup office" },
    run: { inputs: { segment: "agency operators" }, objective: "Find urgent buyer pain" },
  });

  assert.equal(terms.includes("customer"), true);
  assert.equal(terms.includes("operators"), true);
  assert.equal(terms.includes("buyer"), true);
  assert.equal(terms.includes("startup"), false);
});

test("rankByRelevance prefers semantically matching records over recent noise", () => {
  const rows = [
    { id: "recent-noise", title: "Generic weekly update", body: "Payroll and admin notes" },
    { id: "older-match", title: "Agency operators buyer pain", body: "AI operations budget urgency" },
  ];

  const ranked = rankByRelevance(rows, ["agency", "operators", "buyer"], ["title", "body"]);

  assert.equal(ranked[0].id, "older-match");
});

test("startup office context retrieves relevant wiki and assets before recency-only items", async () => {
  const calls = [];
  const context = await buildStartupOfficeContext({
    loop: { name: "Customer Discovery", objective: "Find agency operator pain" },
    membership: { team_id: "team-1" },
    profile: { icp: "agency operators" },
    repository: {
      async artifacts(_teamID, options) {
        calls.push(["artifacts", options.limit]);
        return [
          { id: "artifact-noise", title: "Monthly finance admin", content: "Runway update" },
          { id: "artifact-match", title: "Agency operators interview draft", content: "Buyer pain" },
        ];
      },
      async memoryPages(_teamID, options) {
        calls.push(["memory", options.limit]);
        return [
          { id: "memory-noise", slug: "payroll", title: "Payroll notes", body: "Admin" },
          { id: "memory-match", slug: "agency-operators", title: "Agency operator ICP", body: "Pain around AI operations" },
        ];
      },
      async receipts() {
        return [];
      },
      async runs() {
        return [];
      },
      async safeRest(table, options) {
        calls.push([table, options.query.limit]);
        if (table === "startup_office_assets") {
          return [
            { id: "asset-noise", name: "Finance checklist", body: "Bookkeeping" },
            { id: "asset-match", name: "Agency operator interviews", body: "Customer discovery notes" },
          ];
        }
        if (table === "startup_office_customers") return [];
        if (table === "startup_office_signals") return [];
        return [];
      },
    },
    run: {
      id: "run-1",
      inputs: { segment: "agency operators" },
      objective: "Prioritize agency operator buyer pain",
      title: "Agency operator discovery",
    },
  });

  assert.equal(context.relevant_assets[0].id, "asset-match");
  assert.equal(context.recent_artifacts[0].id, "artifact-match");
  assert.equal(context.wiki_memory[0].id, "memory-match");
  assert.deepEqual(calls, [
    ["artifacts", 24],
    ["startup_office_assets", "50"],
    ["startup_office_customers", "50"],
    ["startup_office_signals", "50"],
    ["memory", 50],
  ]);
});
