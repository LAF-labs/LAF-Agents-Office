const HIGH_RISK_SLUGS = new Set(["company-profile", "icp", "offer", "decisions"]);
const MEDIUM_RISK_SLUGS = new Set(["risks", "validation-log", "customer-discovery-log"]);
const REVIEW_SOON_DAYS = 7;

function startupOfficeMemoryFreshness(page, options = {}) {
  const now = parseDate(options.now || new Date());
  const riskLevel = memoryFreshnessRiskLevel(page);
  const intervalDays = options.intervalDays || memoryFreshnessIntervalDays(riskLevel);
  const verifiedAt = parseDate(page?.last_verified_at);
  if (!verifiedAt) {
    return {
      days_since_verification: null,
      reason: "never_verified",
      review_due_at: null,
      review_interval_days: intervalDays,
      risk_level: riskLevel,
      status: "needs_review",
    };
  }

  const daysSinceVerification = Math.max(
    0,
    Math.floor((now.getTime() - verifiedAt.getTime()) / 86_400_000),
  );
  const dueAt = new Date(verifiedAt.getTime() + intervalDays * 86_400_000);
  const daysUntilDue = Math.ceil((dueAt.getTime() - now.getTime()) / 86_400_000);
  const status = daysUntilDue < 0
    ? "stale"
    : daysUntilDue <= REVIEW_SOON_DAYS
      ? "review_soon"
      : "fresh";

  return {
    days_since_verification: daysSinceVerification,
    reason: freshnessReason(status),
    review_due_at: dueAt.toISOString(),
    review_interval_days: intervalDays,
    risk_level: riskLevel,
    status,
  };
}

function memoryFreshnessRiskLevel(page = {}) {
  const slug = String(page.slug || "").trim();
  if (HIGH_RISK_SLUGS.has(slug)) return "high";
  if (MEDIUM_RISK_SLUGS.has(slug)) return "medium";
  return "low";
}

function memoryFreshnessIntervalDays(riskLevel) {
  if (riskLevel === "high") return 30;
  if (riskLevel === "medium") return 60;
  return 90;
}

function freshnessReason(status) {
  if (status === "stale") return "verification_overdue";
  if (status === "review_soon") return "verification_due_soon";
  if (status === "needs_review") return "never_verified";
  return "verified";
}

function parseDate(value) {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  const date = new Date(value || "");
  return Number.isFinite(date.getTime()) ? date : null;
}

module.exports = {
  startupOfficeMemoryFreshness,
};
