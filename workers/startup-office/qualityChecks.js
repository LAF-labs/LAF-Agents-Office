function evaluateStartupOfficeOutput({ context = null, output, template = null }) {
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
  for (const source of sources) {
    if (!nonEmpty(source?.label) || !nonEmpty(source?.url)) {
      issues.push("sources need label and url");
      break;
    }
  }
  const citationSources = Array.isArray(context?.citation_sources)
    ? context.citation_sources
    : [];
  if (citationSources.length) {
    if (!sources.length) {
      issues.push("externally informed outputs require source citations");
    } else {
      const allowedURLs = new Set(citationSources.map((source) => normalizeURL(source.url)));
      for (const source of sources) {
        if (!allowedURLs.has(normalizeURL(source?.url))) {
          issues.push("output sources must cite attached source metadata");
          break;
        }
      }
    }
  }
  for (const assumption of assumptions) {
    if (!nonEmpty(assumption?.claim) || !nonEmpty(assumption?.evidence_needed)) {
      issues.push("assumptions need claim and evidence needed");
      break;
    }
  }
  for (const field of template?.qualityRules?.requiredStrings || []) {
    if (!nonEmpty(output?.[field])) issues.push(`${field} is required`);
  }
  for (const field of template?.qualityRules?.requiredArrays || []) {
    if (!Array.isArray(output?.[field]) || output[field].length === 0) {
      issues.push(`${field} is required`);
    }
  }
  for (const field of template?.qualityRules?.requiredObjects || []) {
    if (!isObject(output?.[field]) || Object.keys(output[field]).length === 0) {
      issues.push(`${field} is required`);
    }
  }
  const claimText = outputClaimText(output);
  if (looksExternalExecution(claimText)) {
    issues.push("outputs must not imply an external action was executed");
  }
  if (unsupportedExternalClaim(claimText, sources)) {
    issues.push("external factual claims need attached source citations");
  }
  if (guaranteesOutcome(claimText)) {
    issues.push("outputs must not guarantee business, legal, financial, or medical outcomes");
  }
  if (regulatedAdviceWithoutReview(claimText)) {
    issues.push("regulated legal, financial, tax, or medical advice requires expert review language");
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

function normalizeURL(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function isObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function looksExternalExecution(value) {
  const raw = String(value || "").toLowerCase();
  return /\b(already sent|sent to|charged|published|launched ads|transferred|went live|is live)\b/.test(raw);
}

function unsupportedExternalClaim(value, sources) {
  if (Array.isArray(sources) && sources.length > 0) return false;
  const raw = String(value || "").toLowerCase();
  return /\b(according to|research shows|market data shows|verified from|web search confirms|gartner|forrester|mckinsey|crunchbase)\b/.test(raw);
}

function guaranteesOutcome(value) {
  const raw = String(value || "").toLowerCase();
  return [
    "100% guaranteed",
    "guaranteed outcome",
    "guaranteed revenue",
    "guaranteed customers",
    "guaranteed acquisition",
    "guaranteed compliance",
    "risk-free",
    "will definitely",
  ].some((phrase) => raw.includes(phrase));
}

function regulatedAdviceWithoutReview(value) {
  const raw = String(value || "").toLowerCase();
  const hasRegulatedAdvice = [
    "legal advice",
    "tax advice",
    "investment advice",
    "financial advice",
    "medical advice",
    "diagnosis",
    "contract is enforceable",
  ].some((phrase) => raw.includes(phrase));
  if (!hasRegulatedAdvice) return false;
  return ![
    "expert review",
    "lawyer review",
    "attorney review",
    "accountant review",
    "doctor review",
    "clinician review",
    "professional review",
    "not legal advice",
    "not tax advice",
    "not financial advice",
    "not medical advice",
  ].some((phrase) => raw.includes(phrase));
}

function outputClaimText(output) {
  return [
    output?.summary,
    output?.customer_promise,
    output?.icp_hypothesis,
    output?.positioning,
    output?.sales_copy,
    output?.draft_sections,
    output?.copy_variants,
    output?.outreach_drafts,
    output?.follow_up_drafts,
    output?.channel_plan,
    output?.experiments,
    output?.next_actions,
  ]
    .map(flattenText)
    .join(" ");
}

function flattenText(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) return value.map(flattenText).join(" ");
  if (typeof value === "object") return Object.values(value).map(flattenText).join(" ");
  return "";
}

module.exports = {
  evaluateStartupOfficeOutput,
};
