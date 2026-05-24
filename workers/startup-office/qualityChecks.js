function evaluateStartupOfficeOutput({ output }) {
  const issues = [];
  if (!nonEmpty(output?.summary)) issues.push("summary is required");
  if (!Array.isArray(output?.next_actions) || output.next_actions.length === 0) {
    issues.push("next action is required");
  }
  const riskLevel = normalizeRiskLevel(output?.risk_level);
  if (!riskLevel) issues.push("risk level must be low, medium, or high");
  const sources = Array.isArray(output?.sources) ? output.sources : [];
  const assumptions = Array.isArray(output?.assumptions) ? output.assumptions : [];
  const hasDraftSections =
    Array.isArray(output?.draft_sections) && output.draft_sections.length > 0;
  if (!sources.length && !assumptions.length && !hasDraftSections) {
    issues.push("claims need sources or explicit assumptions");
  }
  for (const action of output?.next_actions || []) {
    if (looksExternalExecution(action)) {
      issues.push("next actions must not imply an external action was executed");
      break;
    }
  }
  return {
    issues,
    passed: issues.length === 0,
    risk_level: riskLevel || "medium",
  };
}

function normalizeRiskLevel(value) {
  const raw = String(value || "").trim().toLowerCase();
  return ["low", "medium", "high"].includes(raw) ? raw : "";
}

function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function looksExternalExecution(value) {
  const raw = String(value || "").toLowerCase();
  return [
    "already sent",
    "sent to",
    "charged",
    "published",
    "launched ads",
    "transferred",
  ].some((phrase) => raw.includes(phrase));
}

module.exports = {
  evaluateStartupOfficeOutput,
};
