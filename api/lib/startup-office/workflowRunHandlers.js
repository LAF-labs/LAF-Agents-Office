const { createStartupOfficeValidation } = require("./validation");
const {
  enforceStartupOfficeRunEntitlements,
} = require("./workflowEntitlements");
const { recordStartupOfficeRunOutcome } = require("./runOutcomeRecorder");

function createStartupOfficeRunHandlers(deps) {
  const {
    companyProfileSnapshot,
    createHTTPError,
    createStartupOfficeReceipt,
    enforceStartupOfficeRateLimit,
    ensureStartupOfficeLoop,
    nowISO,
    objectValue,
    publicStartupOfficeApproval,
    publicStartupOfficeArtifact,
    publicStartupOfficeRun,
    readBody,
    requirePermission,
    requireUser,
    runStartupOfficeLoop,
    safeStartupOfficeRest,
    startupOfficeApprovalPolicy,
    startupOfficeApprovals,
    startupOfficeArtifacts,
    startupOfficeBetaOpsSnapshot,
    startupOfficeBillingBlockReason,
    startupOfficeEntitlementBlock,
    startupOfficeLoopSkillInvocations,
    startupOfficeModelClient,
    startupOfficeReceipts,
    startupOfficeRepository,
    truncateText,
    workspaceSettings,
    writeAuditEvent,
    writeJSON,
  } = deps;
  const validation = createStartupOfficeValidation({ createHTTPError, objectValue, truncateText });

  async function handleStartupOfficeRun(req, res, runID, action) {
    const { membership, team, user } = await requireUser(req);
    const repository = startupOfficeRepository();
    const run = await repository.findRun(membership.team_id, runID);
    if (!run) throw createHTTPError(404, "run not found");
    const rawBody = req.method === "POST" ? await readBody(req) : {};
    const idempotencyKey = req.method === "POST" ? validation.idempotencyKey(req, rawBody) : "";
    const runMetadata = objectValue(run.metadata);

    if (!action && req.method === "GET") {
      requirePermission(membership, "workspace:read");
      const [artifacts, approvals, receipts] = await Promise.all([
        startupOfficeArtifacts(membership.team_id, { run_id: run.id, limit: 50 }),
        startupOfficeApprovals(membership.team_id, { run_id: run.id, limit: 50 }),
        startupOfficeReceipts(membership.team_id, { run_id: run.id, limit: 50 }),
      ]);
      writeJSON(res, 200, { approvals, artifacts, receipts, run: publicStartupOfficeRun(run) });
      return;
    }

    if (action === "cancel" && req.method === "POST") {
      requirePermission(membership, "memory:write_draft");
      if (["completed", "canceled"].includes(run.status)) {
        if (run.status === "canceled" && idempotencyKey && runMetadata.cancellation_idempotency_key === idempotencyKey) {
          writeIdempotentRunResponse(res, run);
          return;
        }
        throw createHTTPError(409, `run is already ${run.status}`);
      }
      const now = nowISO();
      const [pendingApproval] = await safeStartupOfficeRest("startup_office_approvals", {
        method: "PATCH",
        query: { run_id: `eq.${run.id}`, status: "eq.pending", team_id: `eq.${membership.team_id}` },
        body: {
          decided_at: now,
          decided_by: membership.user_id,
          decision_note: "Run canceled before founder approval.",
          status: "rejected",
          updated_at: now,
        },
      });
      const updatedRun = await repository.updateRun(membership.team_id, run.id, {
        completed_at: now,
        metadata: { ...runMetadata, canceled_by: membership.user_id, cancellation_idempotency_key: idempotencyKey || "" },
        status: "canceled",
        summary: "Founder canceled the Startup Office run.",
        updated_at: now,
      });
      const canceledWorkerJobs = await cancelOpenWorkerJobs(membership, run.id, now);
      const receipt = await createStartupOfficeReceipt(membership, {
        actor_slug: "founder",
        approval_id: pendingApproval?.id || null,
        event_type: "run.canceled",
        run_id: run.id,
        summary: "Founder canceled the Startup Office run.",
        trace: {
          canceled_worker_job_count: canceledWorkerJobs.length,
          canceled_worker_job_ids: canceledWorkerJobs.map((job) => job.id).filter(Boolean).slice(0, 10),
          run_id: run.id,
        },
      });
      await writeAuditEvent(membership, "startup_office.run_canceled", "run", run.id, {
        canceled_worker_job_count: canceledWorkerJobs.length,
      });
      writeJSON(res, 200, { receipt, run: publicStartupOfficeRun(updatedRun || run), status: "canceled" });
      return;
    }

    if (action === "retry" && req.method === "POST") {
      requirePermission(membership, "memory:write_draft");
      if (idempotencyKey && runMetadata.retry_idempotency_key === idempotencyKey) {
        writeIdempotentRunResponse(res, run);
        return;
      }
      await enforceWorkflowRateLimit(membership, "loop_run");
      await enforceStartupOfficeRunLimit(membership.team_id);
      if (!["failed", "canceled"].includes(run.status)) {
        throw createHTTPError(409, `run is ${run.status}; only failed or canceled runs can be retried`);
      }
      const body = validation.loopRunBody(rawBody);
      const loop = await ensureStartupOfficeLoop(membership, run.loop_id || run.metadata?.loop_slug);
      const profile = await companyProfileSnapshot(membership.team_id, team, user);
      const objective = truncateText(body.objective || run.objective || loop.objective || "Retry this operating loop.", 2000);
      const inputs = body.inputsProvided ? body.inputs : objectValue(run.inputs);
      const now = nowISO();
      const modelClient = startupOfficeModelClient();
      const approvalPolicy = await approvalPolicyForMembership(membership.team_id);
      const skillInvocations = startupOfficeLoopSkillInvocations({ inputs, loop, objective, profile, truncateText });
      const retryRun = await repository.updateRun(membership.team_id, run.id, {
        completed_at: null,
        inputs,
        metadata: { ...runMetadata, approval_policy: approvalPolicy, retry_idempotency_key: idempotencyKey || "", retry_requested_at: now, retry_requested_by: membership.user_id, skill_invocations: skillInvocations },
        objective,
        status: "queued",
        updated_at: now,
      });
      const workerJob = await repository.createWorkerJob(membership, {
        loop_slug: loop.slug,
        metadata: { objective, approval_policy: approvalPolicy, provider: modelClient.provider, retry: true, skill_invocations: skillInvocations },
        run_id: run.id,
        status: "queued",
      });
      await createStartupOfficeReceipt(membership, {
        actor_slug: "founder",
        event_type: "run.retry_queued",
        run_id: run.id,
        summary: `${loop.name} retry queued for AI execution.`,
        trace: { skill_invocations: skillInvocations, worker_job_id: workerJob?.id || null },
      });
      await writeAuditEvent(membership, "startup_office.run_retry_queued", "run", run.id, {
        previous_status: run.status,
        worker_job_id: workerJob?.id || "",
      });
      const result = await runStartupOfficeLoop({
        approvalPolicy, inputs, loop, membership, modelClient, nowISO, objective,
        profile, repository, run: retryRun || run, skillInvocations, truncateText, workerJob,
      });
      await recordStartupOfficeRunOutcome({ membership, objectValue, result, safeStartupOfficeRest });
      writeJSON(res, 200, {
        approval: publicStartupOfficeApproval(result.approval),
        artifact: publicStartupOfficeArtifact(result.artifact),
        error: result.error,
        receipt: result.receipt,
        run: publicStartupOfficeRun(result.run),
        status: result.status,
        worker_job: workerJob,
      });
      return;
    }

    throw createHTTPError(405, "method not allowed");
  }

  async function cancelOpenWorkerJobs(membership, runID, now) {
    const rows = await safeStartupOfficeRest("startup_office_worker_jobs", {
      method: "PATCH",
      query: { run_id: `eq.${runID}`, status: "in.(queued,running,failed)", team_id: `eq.${membership.team_id}` },
      body: {
        completed_at: now,
        last_error: "Run canceled by founder.",
        locked_at: null,
        status: "canceled",
        updated_at: now,
      },
    });
    return Array.isArray(rows) ? rows : [];
  }

  function writeIdempotentRunResponse(res, run) {
    writeJSON(res, ["queued", "running"].includes(run.status) ? 202 : 200, {
      idempotent: true,
      receipt: null,
      run: publicStartupOfficeRun(run),
      status: run.status,
      worker_job: null,
    });
  }

  async function enforceStartupOfficeRunLimit(teamID) {
    await enforceStartupOfficeRunEntitlements({
      createHTTPError,
      startupOfficeBetaOpsSnapshot,
      startupOfficeBillingBlockReason,
      startupOfficeEntitlementBlock,
      teamID,
    });
  }

  async function approvalPolicyForMembership(teamID) {
    if (typeof startupOfficeApprovalPolicy !== "function") return null;
    const settings = typeof workspaceSettings === "function" ? await workspaceSettings(teamID) : null;
    return startupOfficeApprovalPolicy(settings);
  }

  async function enforceWorkflowRateLimit(membership, action) {
    if (typeof enforceStartupOfficeRateLimit === "function") {
      await enforceStartupOfficeRateLimit(membership, action);
    }
  }

  return { run: handleStartupOfficeRun };
}

module.exports = { createStartupOfficeRunHandlers };
