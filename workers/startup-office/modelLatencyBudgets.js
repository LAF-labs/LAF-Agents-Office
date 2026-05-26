const STARTUP_OFFICE_MODEL_LATENCY_BUDGET_VERSION =
  "startup-office-model-latency-budget.v1";

const STARTUP_OFFICE_MODEL_LATENCY_BUDGETS = Object.freeze({
  "customer-discovery": Object.freeze({
    target_ms: 60000,
    timeout_ms: 150000,
    warning_ms: 90000,
  }),
  "idea-validation": Object.freeze({
    target_ms: 45000,
    timeout_ms: 120000,
    warning_ms: 75000,
  }),
  "launch-campaign": Object.freeze({
    target_ms: 75000,
    timeout_ms: 180000,
    warning_ms: 120000,
  }),
  "offer-package": Object.freeze({
    target_ms: 60000,
    timeout_ms: 150000,
    warning_ms: 90000,
  }),
  "weekly-operator-review": Object.freeze({
    target_ms: 45000,
    timeout_ms: 120000,
    warning_ms: 75000,
  }),
});

function startupOfficeModelLatencyBudget(loopSlug, options = {}) {
  const slug = String(loopSlug || "idea-validation").trim() || "idea-validation";
  const base =
    STARTUP_OFFICE_MODEL_LATENCY_BUDGETS[slug] ||
    STARTUP_OFFICE_MODEL_LATENCY_BUDGETS["idea-validation"];
  const effectiveTimeoutMs = positiveInteger(options.timeoutMs, base.timeout_ms);
  return {
    effective_timeout_ms: effectiveTimeoutMs,
    loop_slug: slug,
    target_ms: base.target_ms,
    timeout_ms: base.timeout_ms,
    overridden: effectiveTimeoutMs !== base.timeout_ms,
    version: STARTUP_OFFICE_MODEL_LATENCY_BUDGET_VERSION,
    warning_ms: base.warning_ms,
  };
}

function startupOfficeModelLatencyRecord(budget, options = {}) {
  const startedAtMs = Number(options.startedAtMs);
  const completedAtMs = Number(options.completedAtMs);
  const durationMs =
    Number.isFinite(startedAtMs) && Number.isFinite(completedAtMs)
      ? Math.max(0, Math.trunc(completedAtMs - startedAtMs))
      : null;
  return {
    ...budget,
    duration_ms: durationMs,
    over_target: durationMs !== null && durationMs > budget.target_ms,
    over_timeout:
      durationMs !== null && durationMs > budget.effective_timeout_ms,
    over_warning: durationMs !== null && durationMs > budget.warning_ms,
    status: options.status || "completed",
  };
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.trunc(number) : fallback;
}

module.exports = {
  STARTUP_OFFICE_MODEL_LATENCY_BUDGET_VERSION,
  STARTUP_OFFICE_MODEL_LATENCY_BUDGETS,
  startupOfficeModelLatencyBudget,
  startupOfficeModelLatencyRecord,
};
