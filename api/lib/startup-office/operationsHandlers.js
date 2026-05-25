const {
  createStartupOfficeWorkerJobRecoveryHandlers,
} = require("./workerJobRecoveryHandlers");
const {
  mergeStartupOfficeApprovalPolicyPatch,
} = require("./approvalPolicy");
const {
  createStartupOfficeSupportTimelineHandlers,
} = require("./supportTimeline");
const {
  startupOfficeSupportPlaybooks,
} = require("./supportPlaybooks");
const {
  assertStartupOfficePaidBetaEvidence,
  startupOfficeBillingPatch,
  startupOfficeBillingDocumentPayload,
} = require("./commercialBilling");

function createStartupOfficeOperationsHandlers(deps) {
  const {
    clamp,
    createHTTPError,
    nowISO,
    objectValue,
    readBody,
    requireAdminRole,
    requirePermission,
    requireUser,
    safeStartupOfficeRest,
    startupOfficeApprovalPolicy,
    startupOfficeApprovals,
    startupOfficeBetaOpsSnapshot,
    startupOfficeRuns,
    startupOfficeStuckJobs,
    truncateText,
    upsertStartupOfficeBilling,
    upsertStartupOfficeBillingDocument,
    upsertWorkspaceSettings,
    workspaceSettings,
    writeAuditEvent,
    writeJSON,
  } = deps;
  const recoveryHandlers = createStartupOfficeWorkerJobRecoveryHandlers(deps);
  const supportTimelineHandlers = createStartupOfficeSupportTimelineHandlers(deps);

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
    const currentBetaOps = await startupOfficeBetaOpsSnapshot(membership.team_id);
    const currentBilling = currentBetaOps.billing || {};
    const billingPatch = startupOfficeBillingPatch({ body, clamp, currentBilling, truncateText });
    assertStartupOfficePaidBetaEvidence({
      billing: billingPatch,
      body,
      createHTTPError,
      currentBilling,
      currentDocuments: currentBetaOps.billing_documents,
      objectValue,
    });
    const billing = await upsertStartupOfficeBilling(membership.team_id, billingPatch);
    const billingDocument = startupOfficeBillingDocumentPayload({
      billing,
      body,
      currentBilling,
      membership,
      nowISO,
      objectValue,
      truncateText,
    });
    if (billingDocument) {
      await upsertStartupOfficeBillingDocument(membership, billingDocument);
    }
    await writeAuditEvent(membership, "startup_office.billing_updated", "team", membership.team_id, {
      billing_state: billing.billing_state,
      billing_document_type: billingDocument?.document_type || "",
      monthly_run_limit: billing.monthly_run_limit,
      payment_status: billing.payment_status,
      seat_limit: billing.seat_limit,
    });
    writeJSON(res, 200, await startupOfficeBetaOpsSnapshot(membership.team_id));
  }

  async function handleStartupOfficeBetaDashboard(req, res) {
    const { membership, team } = await requireUser(req);
    requireAdminRole(membership, "owner or admin role required for beta dashboard");
    const [betaOps, runs, approvals, notifications, outboxEvents, stuckJobs] = await Promise.all([
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
      startupOfficeStuckJobs(membership.team_id),
    ]);
    const runFailures = runs.filter((run) => run.status === "failed");
    writeJSON(res, 200, {
      dashboard: {
        billing: betaOps.billing,
        notifications,
        outbox_events: outboxEvents,
        pending_approvals: approvals,
        run_failures: runFailures,
        stuck_jobs: stuckJobs,
        support_playbooks: startupOfficeSupportPlaybooks({
          approvals,
          betaOps,
          outboxEvents,
          runFailures,
          stuckJobs,
        }),
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
    supportTimeline: supportTimelineHandlers.supportTimeline,
    workerJobAction: recoveryHandlers.workerJobAction,
  };
}

module.exports = {
  createStartupOfficeOperationsHandlers,
};
