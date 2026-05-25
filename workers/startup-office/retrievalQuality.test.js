const assert = require("node:assert/strict");
const test = require("node:test");

const {
  assertStartupOfficeRetrievalQuality,
  startupOfficeRetrievalQualityReport,
  startupOfficeRetrievalQualityScenarios,
} = require("./retrievalQuality");

test("business-loop retrieval eval tracks recall and precision", () => {
  const report = assertStartupOfficeRetrievalQuality();

  assert.equal(report.passed, true);
  assert.equal(report.scenario_count, 3);
  assert.equal(report.macro_recall_at_k, 1);
  assert.equal(report.macro_precision_at_k >= 0.5, true);
  assert.deepEqual(
    report.scenarios.map((scenario) => scenario.business_loop_outcome),
    [
      "identify the first paid beta buyer segment",
      "turn trust positioning into a sellable offer",
      "draft approval-gated customer discovery",
    ],
  );
});

test("business-loop retrieval eval fails when expected evidence is not recovered", () => {
  const [scenario] = startupOfficeRetrievalQualityScenarios();
  assert.throws(
    () =>
      assertStartupOfficeRetrievalQuality({
        scenarios: [
          {
            ...scenario,
            expected: { memory: ["missing-memory"] },
          },
        ],
      }),
    /Startup Office retrieval quality failed/,
  );
});

test("retrieval quality report exposes selected and hit ids per category", () => {
  const report = startupOfficeRetrievalQualityReport({ topK: 2 });
  const memory = report.scenarios[0].categories.find((item) => item.kind === "memory");

  assert.equal(memory.hit_ids[0], "memory-agency-icp");
  assert.equal(memory.selected_ids.includes("memory-agency-icp"), true);
  assert.equal(Array.isArray(report.scenarios[0].search_terms), true);
});
