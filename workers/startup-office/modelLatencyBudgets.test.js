const assert = require("node:assert/strict");
const test = require("node:test");

const {
  STARTUP_OFFICE_LOOP_DEFINITIONS,
} = require("../../api/lib/startup-office/loopDefinitions");
const {
  STARTUP_OFFICE_MODEL_LATENCY_BUDGET_VERSION,
  STARTUP_OFFICE_MODEL_LATENCY_BUDGETS,
  startupOfficeModelLatencyBudget,
  startupOfficeModelLatencyRecord,
} = require("./modelLatencyBudgets");

test("model latency budgets cover every Startup Office loop", () => {
  assert.deepEqual(
    STARTUP_OFFICE_LOOP_DEFINITIONS.map((loop) => loop.slug).sort(),
    Object.keys(STARTUP_OFFICE_MODEL_LATENCY_BUDGETS).sort(),
  );
  for (const loop of STARTUP_OFFICE_LOOP_DEFINITIONS) {
    const budget = startupOfficeModelLatencyBudget(loop.slug);
    assert.equal(budget.version, STARTUP_OFFICE_MODEL_LATENCY_BUDGET_VERSION);
    assert.equal(budget.loop_slug, loop.slug);
    assert.equal(budget.target_ms > 0, true);
    assert.equal(budget.warning_ms >= budget.target_ms, true);
    assert.equal(budget.timeout_ms >= budget.warning_ms, true);
  }
});

test("model latency records flag target, warning, and timeout breaches", () => {
  const budget = startupOfficeModelLatencyBudget("idea-validation", {
    timeoutMs: 100,
  });
  const record = startupOfficeModelLatencyRecord(budget, {
    completedAtMs: 220,
    startedAtMs: 0,
    status: "timed_out",
  });

  assert.equal(budget.overridden, true);
  assert.equal(record.duration_ms, 220);
  assert.equal(record.over_target, false);
  assert.equal(record.over_warning, false);
  assert.equal(record.over_timeout, true);
  assert.equal(record.status, "timed_out");
});
