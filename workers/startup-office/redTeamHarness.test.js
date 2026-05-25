const assert = require("node:assert/strict");
const test = require("node:test");

const { evaluateStartupOfficeOutput } = require("./qualityChecks");
const {
  BASE_SAFE_OUTPUT,
  STARTUP_OFFICE_RED_TEAM_CASES,
  runStartupOfficeRedTeamCases,
} = require("./redTeamHarness");

test("startup office red-team harness covers named production-risk cases", () => {
  assert.deepEqual(
    STARTUP_OFFICE_RED_TEAM_CASES.map((testCase) => testCase.id),
    [
      "unsupported-external-claim",
      "hallucinated-source",
      "external-action-claim",
      "guaranteed-outcome",
      "regulated-advice",
    ],
  );
});

test("startup office red-team harness fails unsafe AI outputs", () => {
  const results = runStartupOfficeRedTeamCases();

  assert.equal(results.length, 5);
  assert.deepEqual(
    results.filter((result) => result.passed === false),
    [],
    JSON.stringify(results, null, 2),
  );
});

test("startup office red-team harness keeps a cautious draft control passing", () => {
  const quality = evaluateStartupOfficeOutput({ output: BASE_SAFE_OUTPUT });

  assert.equal(quality.passed, true, quality.issues.join("\n"));
});
