const HOSTED_ACTION_RATE_LIMITS = Object.freeze([
  {
    limit: 6,
    method: "GET",
    pattern: /^startup-office\/export$/,
    scope: "startup_office_export",
  },
  {
    limit: 20,
    method: "POST",
    pattern: /^(?:startup-office\/)?loops\/[^/]+\/run$/,
    scope: "startup_office_loop_run",
  },
  {
    limit: 20,
    method: "POST",
    pattern: /^(?:startup-office\/)?runs\/[^/]+\/(?:retry|cancel)$/,
    scope: "startup_office_run_mutation",
  },
  {
    limit: 40,
    method: "POST",
    pattern: /^(?:startup-office\/)?approvals\/[^/]+\/(?:approve|reject|revise)$/,
    scope: "startup_office_approval_action",
  },
  {
    limit: 20,
    method: "POST",
    pattern: /^startup-office\/terms$/,
    scope: "startup_office_terms_acceptance",
  },
  {
    limit: 6,
    method: "POST",
    pattern: /^startup-office\/demo-seed$/,
    scope: "startup_office_admin_demo_seed",
  },
  {
    limit: 20,
    method: "POST",
    pattern: /^startup-office\/support-access$/,
    scope: "startup_office_support_access_write",
  },
  {
    limit: 30,
    method: "POST",
    pattern: /^startup-office\/support-access\/[^/]+\/(?:revoke|log-access)$/,
    scope: "startup_office_support_access_action",
  },
  {
    limit: 6,
    method: "POST",
    pattern: /^startup-office\/deletion-request$/,
    scope: "startup_office_deletion_request",
  },
  {
    limit: 30,
    method: "POST",
    pattern: /^startup-office\/admin\/worker-jobs\/[^/]+\/(?:retry|cancel)$/,
    scope: "startup_office_worker_job_action",
  },
  {
    limit: 20,
    method: "POST",
    pattern: /^(?:startup-office\/)?loops$/,
    scope: "startup_office_loop_config_write",
  },
  {
    limit: 30,
    method: "POST",
    pattern: /^startup-office\/assets\/upload-intent$/,
    scope: "startup_office_asset_upload_intent",
  },
  {
    limit: 60,
    method: "POST",
    pattern: /^startup-office\/(?:assets|customers|metrics|signals)$/,
    scope: "startup_office_object_write",
  },
  {
    limit: 60,
    method: "PATCH",
    pattern: /^startup-office\/(?:assets|customers|metrics|signals)\/[^/]+$/,
    scope: "startup_office_object_write",
  },
  {
    limit: 60,
    method: "DELETE",
    pattern: /^startup-office\/(?:assets|customers|metrics|signals)\/[^/]+$/,
    scope: "startup_office_object_write",
  },
  {
    limit: 40,
    method: "POST",
    pattern: /^startup-office\/artifacts\/[^/]+\/(?:save-as-asset|record-signal)$/,
    scope: "startup_office_artifact_action",
  },
  {
    limit: 20,
    method: "POST",
    pattern: /^invites$/,
    scope: "hosted_invite_create",
  },
  {
    limit: 60,
    method: "POST",
    pattern: /^client-errors$/,
    scope: "hosted_client_error_report",
  },
  {
    limit: 30,
    method: "PATCH",
    pattern: /^(?:auth\/me|company\/profile|startup-office\/policy|startup-office\/billing)$/,
    scope: "hosted_profile_write",
  },
  {
    limit: 30,
    method: "POST",
    pattern: /^(?:config|onboarding\/complete)$/,
    scope: "hosted_workspace_config_write",
  },
]);

function matchHostedActionRateLimit(method, path, limits = HOSTED_ACTION_RATE_LIMITS) {
  const normalizedMethod = String(method || "GET").toUpperCase();
  const normalizedPath = String(path || "").replace(/^\/+|\/+$/g, "");
  return limits.find(
    (candidate) =>
      candidate.method === normalizedMethod && candidate.pattern.test(normalizedPath),
  );
}

function createHostedActionRateLimiter({
  claimPersistentRateLimit,
  createRateLimitError,
  enforceRateLimit,
  keyForRequest,
  limits = HOSTED_ACTION_RATE_LIMITS,
  windowMs = 60 * 1000,
}) {
  return async function enforceHostedActionRateLimit(req, path) {
    const rule = matchHostedActionRateLimit(req.method, path, limits);
    if (!rule) return;
    const key = keyForRequest(req);
    if (claimPersistentRateLimit) {
      const result = await claimPersistentRateLimit({
        key,
        limit: rule.limit,
        scope: rule.scope,
        windowMs,
      });
      if (result?.allowed === false) {
        throw createRateLimitError();
      }
      return;
    }
    enforceRateLimit(rule.scope, key, rule.limit, windowMs);
  };
}

module.exports = {
  HOSTED_ACTION_RATE_LIMITS,
  createHostedActionRateLimiter,
  matchHostedActionRateLimit,
};
