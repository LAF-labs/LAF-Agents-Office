const startupOfficeRolloutPolicy = require("../../../shared/startup-office-rollout-policy.json");

function startupOfficeLoopRolloutDecision({ loop, settings } = {}) {
  const slug = String(loop?.slug || "").trim();
  const stableLoops = new Set(arrayValue(startupOfficeRolloutPolicy.stable_loops));
  if (stableLoops.has(slug)) {
    return rolloutDecision({
      allowed: true,
      reason: "Loop is enabled for the default closed beta stage.",
      slug,
      source: "stable_default",
      stage: startupOfficeRolloutPolicy.default_stage,
    });
  }

  const gatedLoop = arrayValue(startupOfficeRolloutPolicy.gated_loops)
    .find((item) => item?.slug === slug);
  const enabledLoops = enabledLoopSet(settings);
  if (enabledLoops.has(slug)) {
    return rolloutDecision({
      allowed: true,
      flag: gatedLoop?.flag,
      reason: gatedLoop?.reason || "Loop is enabled by workspace rollout settings.",
      slug,
      source: "workspace_flag",
      stage: gatedLoop?.stage || startupOfficeRolloutPolicy.default_stage,
    });
  }

  if (gatedLoop) {
    return rolloutDecision({
      allowed: false,
      flag: gatedLoop.flag,
      reason: gatedLoop.reason,
      slug,
      source: "workspace_flag_required",
      stage: gatedLoop.stage,
    });
  }

  return rolloutDecision({
    allowed: false,
    reason: "Loop is not listed in the Startup Office rollout policy.",
    slug,
    source: "policy_missing",
    stage: "blocked",
  });
}

function assertStartupOfficeLoopRollout({ createHTTPError, loop, settings } = {}) {
  const decision = startupOfficeLoopRolloutDecision({ loop, settings });
  if (decision.allowed) return decision;
  const errorFactory = typeof createHTTPError === "function"
    ? createHTTPError
    : defaultHTTPError;
  throw errorFactory(
    403,
    `Startup Office loop ${decision.slug || "unknown"} is not enabled for this workspace rollout`,
  );
}

function enabledLoopSet(settings) {
  const preferences = objectValue(settings?.preferences);
  const rollout = objectValue(preferences.startup_office_rollout);
  return new Set([
    ...arrayValue(rollout.enabled_loops),
    ...arrayValue(rollout.enabled_loop_slugs),
    ...arrayValue(preferences.startup_office_enabled_loops),
  ].map((value) => String(value || "").trim()).filter(Boolean));
}

function rolloutDecision({ allowed, flag, reason, slug, source, stage }) {
  return {
    allowed,
    flag: flag || startupOfficeRolloutPolicy.flag,
    reason: reason || "",
    slug,
    source,
    stage,
  };
}

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function defaultHTTPError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

module.exports = {
  assertStartupOfficeLoopRollout,
  startupOfficeLoopRolloutDecision,
  startupOfficeRolloutPolicy,
};
