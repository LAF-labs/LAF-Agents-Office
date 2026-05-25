const {
  createStartupOfficeWorkerJobRecoveryHandlers,
} = require("./workerJobRecoveryHandlers");
const {
  mergeStartupOfficeApprovalPolicyPatch,
} = require("./approvalPolicy");

function createStartupOfficeOperationsHandlers(deps) {
  const {
    clamp,
    createHTTPError,
    objectValue,
    readBody,
    requireAdminRole,
    requirePermission,
    requireUser,
    safeStartupOfficeRest,
    startupOfficeApprovalPolicy,
    startupOfficeApprovals,
    startupOfficeBetaOpsSnapshot,
    startupOfficeBillingStateValue,
    startupOfficeRuns,
    startupOfficeStuckJobs,
    truncateText,
    upsertStartupOfficeBilling,
    upsertWorkspaceSettings,
    workspaceSettings,
    writeAuditEvent,
    writeJSON,
  } = deps;
  const recoveryHandlers = createStartupOfficeWorkerJobRecoveryHandlers(deps);

  async function handleStartupOfficePolicy(req, res) {
    const { membership } = await requireUser(req);
    const settings = await workspaceSettings(membership.team_id);
    if (req.method === "GET") {
      requirePermission(membership, "workspace:read");
      writeJSON(res, 200, {
        policy: startupOfficeApprovalPolicy(settings),
      });
      return;
    }
    if (req.method !== "PATCH") throw createHTTPError(405, "method not allowed");
    requirePermission(membership, "workspace:manage");
    const body = await readBody(req);
    const currentPreferences = objectValue(settings?.preferences);
    const incomingPolicy = body.policy || body;
    const policyPatch = mergeStartupOfficeApprovalPolicyPatch(
      currentPreferences.startup_office_approval_policy,
      incomingPolicy,
    );
    const policy = startupOfficeApprovalPolicy({
      preferences: {
        ...currentPreferences,
        startup_office_approval_policy: policyPatch,
      },
    });
    const updated = await upsertWorkspaceSettings(membership.team_id, {
      preferences: {
        ...currentPreferences,
        startup_office_approval_policy: policy,
      },
    });
    await writeAuditEvent(membership, "startup_office.policy_updated", "team", membership.team_id, {
      action_modes: policy.action_modes,
      require_citations_for_public_claims: policy.require_citations_for_public_claims,
    });
    writeJSON(res, 200, {
      policy: startupOfficeApprovalPolicy(updated),
      status: "ok",
    });
  }

  async function handleStartupOfficeBilling(req, res) {
    const { membership } = await requireUser(req);
    if (req.method === "GET") {
      requirePermission(membership, "workspace:read");
      writeJSON(res, 200, await startupOfficeBetaOpsSnapshot(membership.team_id));
      return;
    }
    if (req.method !== "PATCH") throw createHTTPError(405, "method not allowed");
    requireAdminRole(membership, "owner or admin role required for billing changes");
    const body = await readBody(req);
    const billing = await upsertStartupOfficeBilling(membership.team_id, {
      billing_state: startupOfficeBillingStateValue(body.billing_state || body.state),
      laf_model_enabled: body.laf_model_enabled === undefined ? true : Boolean(body.laf_model_enabled),
      monthly_model_spend_cents: clamp(Number(body.monthly_model_spend_cents || 20000), 0, 10000000),
      monthly_run_limit: clamp(Number(body.monthly_run_limit || 50), 0, 100000),
      plan: truncateText(body.plan || "founder_beta", 80),
      storage_mb_limit: clamp(Number(body.storage_mb_limit || 1024), 0, 1000000),
      support_notes: truncateText(body.support_notes || "", 4000),
    });
    await writeAuditEvent(membership, "startup_office.billing_updated", "team", membership.team_id, {
      billing_state: billing.billing_state,
      monthly_run_limit: billing.monthly_run_limit,
    });
    writeJSON(res, 200, await startupOfficeBetaOpsSnapshot(membership.team_id));
  }

  async function handleStartupOfficeBetaDashboard(req, res) {
    const { membership, team } = await requireUser(req);
    requireAdminRole(membership, "owner or admin role required for beta dashboard");
    const [betaOps, runs, approvals, notifications, outboxEvents] = await Promise.all([
      startupOfficeBetaOpsSnapshot(membership.team_id),
      startupOfficeRuns(membership.team_id, { limit: 20 }),
      startupOfficeApprovals(membership.team_id, { status: "pending", limit: 20 }),
      safeStartupOfficeRest("startup_office_notifications", {
        query: {
          limit: "20",
          order: "created_at.desc",
          select: "*",
          team_id: `eq.${membership.team_id}`,
        },
      }),
      safeStartupOfficeRest("startup_office_outbox_events", {
        query: {
          limit: "20",
          order: "created_at.desc",
          select: "*",
          status: "in.(queued,failed,dead_letter)",
          team_id: `eq.${membership.team_id}`,
        },
      }),
    ]);
    writeJSON(res, 200, {
      dashboard: {
        billing: betaOps.billing,
        notifications,
        outbox_events: outboxEvents,
        pending_approvals: approvals,
        run_failures: runs.filter((run) => run.status === "failed"),
        stuck_jobs: await startupOfficeStuckJobs(membership.team_id),
        support_notes: betaOps.billing.support_notes || "",
        team: {
          id: team.id,
          name: team.name,
          slug: team.slug,
        },
        usage: betaOps.usage,
      },
    });
  }

  return {
    betaDashboard: handleStartupOfficeBetaDashboard,
    billing: handleStartupOfficeBilling,
    policy: handleStartupOfficePolicy,
    workerJobAction: recoveryHandlers.workerJobAction,
  };
}

module.exports = {
  createStartupOfficeOperationsHandlers,
};
