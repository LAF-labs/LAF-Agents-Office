const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildStartupOfficeContext,
  contextSearchTerms,
  pickContext,
  rankByRelevance,
  STARTUP_OFFICE_CONTEXT_RETRIEVAL_BUDGET,
  STARTUP_OFFICE_CONTEXT_SELECTS,
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
        calls.push(["artifacts", options.limit, options.select]);
        return [
          { id: "artifact-noise", title: "Monthly finance admin", content: "Runway update" },
          { id: "artifact-match", title: "Agency operators interview draft", content: "Buyer pain" },
        ];
      },
      async memoryPages(_teamID, options) {
        calls.push(["memory", options.limit, options.select]);
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
        calls.push([table, options.query.limit, options.query.select]);
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
    [
      "artifacts",
      STARTUP_OFFICE_CONTEXT_RETRIEVAL_BUDGET.artifact_candidate_limit,
      STARTUP_OFFICE_CONTEXT_SELECTS.artifacts,
    ],
    [
      "startup_office_assets",
      String(STARTUP_OFFICE_CONTEXT_RETRIEVAL_BUDGET.asset_candidate_limit),
      STARTUP_OFFICE_CONTEXT_SELECTS.assets,
    ],
    [
      "startup_office_customers",
      String(STARTUP_OFFICE_CONTEXT_RETRIEVAL_BUDGET.customer_candidate_limit),
      STARTUP_OFFICE_CONTEXT_SELECTS.customers,
    ],
    [
      "startup_office_signals",
      String(STARTUP_OFFICE_CONTEXT_RETRIEVAL_BUDGET.signal_candidate_limit),
      STARTUP_OFFICE_CONTEXT_SELECTS.signals,
    ],
    [
      "memory",
      STARTUP_OFFICE_CONTEXT_RETRIEVAL_BUDGET.memory_candidate_limit,
      STARTUP_OFFICE_CONTEXT_SELECTS.memoryPages,
    ],
  ]);
});

test("context builder keeps retrieved text and structured fields within budget", () => {
  const longText = "x".repeat(STARTUP_OFFICE_CONTEXT_RETRIEVAL_BUDGET.max_body_chars + 100);
  const picked = pickContext(
    {
      body: longText,
      id: "asset-1",
      metadata: { large: "m".repeat(STARTUP_OFFICE_CONTEXT_RETRIEVAL_BUDGET.max_metadata_chars + 100) },
      name: "Large asset",
    },
    ["id", "name", "body", "metadata"],
  );

  assert.equal(picked.id, "asset-1");
  assert.equal(picked.body.length, STARTUP_OFFICE_CONTEXT_RETRIEVAL_BUDGET.max_body_chars);
  assert.match(picked.body, /\.\.\.\[truncated\]$/);
  assert.equal(picked.metadata.truncated, true);
  assert.equal(
    picked.metadata.preview.length,
    STARTUP_OFFICE_CONTEXT_RETRIEVAL_BUDGET.max_metadata_chars,
  );
});
