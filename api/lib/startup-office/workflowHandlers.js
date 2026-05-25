const { createStartupOfficeValidation } = require("./validation");
const {
  enforceStartupOfficeRunEntitlements,
} = require("./workflowEntitlements");
const {
  queueStartupOfficeApprovalRevision,
  startupOfficeRevisionRequest,
} = require("./approvalRevisions");
const { recordStartupOfficeRunOutcome } = require("./runOutcomeRecorder");

function createStartupOfficeWorkflowHandlers(deps) {
  const {
    applyStartupOfficeMemoryPromotion,
    companyProfileSnapshot,
    createHTTPError,
    createStartupOfficeReceipt,
    enforceStartupOfficeRateLimit,
    ensureStartupOfficeLoop,
    findStartupOfficeApproval,
    materializeStartupOfficeReceiptMemory,
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
    shortID,
    startupOfficeApprovalPolicy,
    startupOfficeApprovals,
    startupOfficeArtifacts,
    startupOfficeBetaOpsSnapshot,
    startupOfficeBillingBlockReason,
    startupOfficeEntitlementBlock,
    startupOfficeLoopSkillInvocations,
    startupOfficeModelClient,
    startupOfficeReceiptMemoryPageSlugs = [],
    startupOfficeReceipts,
    startupOfficeRepository,
    truncateText,
    workspaceSettings,
    writeAuditEvent,
    writeJSON,
  } = deps;
  const validation = createStartupOfficeValidation({ createHTTPError, objectValue, truncateText });

  async function handleStartupOfficeLoopRun(req, res, loopID) {
    const { membership, team, user } = await requireUser(req);
    requirePermission(membership, "memory:write_draft");
    const rawBody = await readBody(req);
    const body = validation.loopRunBody(rawBody);
    const idempotencyKey = validation.idempotencyKey(req, rawBody);
    const repository = startupOfficeRepository();
    if (idempotencyKey) {
      const existingRun = await repository.findRunByIdempotencyKey(
        membership.team_id,
        idempotencyKey,
      );
      if (existingRun) {
        writeJSON(res, ["queued", "running"].includes(existingRun.status) ? 202 : 200, {
          idempotent: true,
          receipt: null,
          run: publicStartupOfficeRun(existingRun),
          status: existingRun.status,
          worker_job: null,
        });
        return;
      }
    }
    await enforceWorkflowRateLimit(membership, "loop_run");
    await enforceStartupOfficeRunLimit(membership.team_id);
    const loop = await ensureStartupOfficeLoop(membership, loopID);
    const profile = await companyProfileSnapshot(membership.team_id, team, user);
    const objective = truncateText(body.objective || loop.objective || profile.priority || "Run this operating loop.", 2000);
    const now = nowISO();
    const modelClient = startupOfficeModelClient();
    const approvalPolicy = await approvalPolicyForMembership(membership.team_id);
    const skillInvocations = startupOfficeLoopSkillInvocations({ inputs: body.inputs, loop, objective, profile, truncateText });
    const run = await repository.createRun(membership, {
      idempotency_key: idempotencyKey,
      inputs: body.inputs,
      loop_id: loop.id || null,
      metadata: {
        approval_policy: approvalPolicy,
        company_name: profile.name || "",
        loop_slug: loop.slug,
        provider: modelClient.provider,
        skill_invocations: skillInvocations,
      },
      objective,
      status: "queued",
      title: body.title || truncateText(loop.name, 180),
      updated_at: now,
    });
    const runID = run?.id || `run-${shortID()}`;
    const workerJob = await repository.createWorkerJob(membership, {
      loop_slug: loop.slug,
      metadata: {
        approval_policy: approvalPolicy,
        objective,
        provider: modelClient.provider,
        skill_invocations: skillInvocations,
      },
      run_id: runID,
      status: "queued",
    });
    const receipt = await createStartupOfficeReceipt(membership, {
      actor_slug: "agent",
      event_type: "run.queued",
      run_id: runID,
      summary: `${loop.name} run queued for AI execution.`,
      trace: {
        loop_slug: loop.slug,
        skill_invocations: skillInvocations,
        worker_job_id: workerJob?.id || null,
      },
    });
    await writeAuditEvent(membership, "startup_office.run_created", "run", runID, {
      loop_slug: loop.slug,
      worker_job_id: workerJob?.id || "",
    });
    await deps.recordStartupOfficeRunActivation?.({ membership, runID });
    const queuedRun = run || {
      id: runID,
      inputs: body.inputs,
      loop_id: loop.id || null,
      metadata: { loop_slug: loop.slug },
      objective,
      status: "queued",
      title: loop.name,
    };
    if (body.defer === true) {
      writeJSON(res, 202, {
        receipt,
        run: publicStartupOfficeRun(queuedRun),
        status: "queued",
        worker_job: workerJob,
      });
      return;
    }
    const result = await runStartupOfficeLoop({
      approvalPolicy, inputs: body.inputs, loop, membership, modelClient, nowISO, objective,
      profile, repository, run: queuedRun, skillInvocations, truncateText, workerJob,
    });
    await recordStartupOfficeRunOutcome({ membership, objectValue, result, safeStartupOfficeRest });
    writeJSON(res, 200, {
      approval: publicStartupOfficeApproval(result.approval),
      artifact: publicStartupOfficeArtifact(result.artifact),
      error: result.error,
      receipt: result.receipt || receipt,
      run: publicStartupOfficeRun(result.run),
      status: result.status,
      worker_job: workerJob,
    });
  }

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
      writeJSON(res, 200, {
        approvals,
        artifacts,
        receipts,
        run: publicStartupOfficeRun(run),
      });
      return;
    }

    if (action === "cancel" && req.method === "POST") {
      requirePermission(membership, "memory:write_draft");
      if (["completed", "canceled"].includes(run.status)) {
        if (
          run.status === "canceled" &&
          idempotencyKey &&
          runMetadata.cancellation_idempotency_key === idempotencyKey
        ) {
          writeIdempotentRunResponse(res, run);
          return;
        }
        throw createHTTPError(409, `run is already ${run.status}`);
      }
      const now = nowISO();
      const [pendingApproval] = await safeStartupOfficeRest("startup_office_approvals", {
        method: "PATCH",
        query: {
          run_id: `eq.${run.id}`,
          status: "eq.pending",
          team_id: `eq.${membership.team_id}`,
        },
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
        metadata: {
          ...runMetadata,
          canceled_by: membership.user_id,
          cancellation_idempotency_key: idempotencyKey || "",
        },
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
      writeJSON(res, 200, {
        receipt,
        run: publicStartupOfficeRun(updatedRun || run),
        status: "canceled",
      });
      return;
    }

    if (action === "retry" && req.method === "POST") {
      requirePermission(membership, "memory:write_draft");
      if (
        idempotencyKey &&
        runMetadata.retry_idempotency_key === idempotencyKey
      ) {
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
        metadata: {
          ...runMetadata,
          approval_policy: approvalPolicy,
          retry_idempotency_key: idempotencyKey || "",
          retry_requested_at: now,
          retry_requested_by: membership.user_id,
          skill_invocations: skillInvocations,
        },
        objective,
        status: "queued",
        updated_at: now,
      });
      const workerJob = await repository.createWorkerJob(membership, {
        loop_slug: loop.slug,
        metadata: {
          objective,
          approval_policy: approvalPolicy,
          provider: modelClient.provider,
          retry: true,
          skill_invocations: skillInvocations,
        },
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
      query: {
        run_id: `eq.${runID}`,
        status: "in.(queued,running,failed)",
        team_id: `eq.${membership.team_id}`,
      },
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

  async function handleStartupOfficeApprovalAction(req, res, approvalID, action) {
    const { membership, team, user } = await requireUser(req);
    requirePermission(membership, "memory:promote");
    const rawBody = await readBody(req);
    const body = validation.approvalActionBody(rawBody);
    const idempotencyKey = validation.idempotencyKey(req, rawBody);
    const approval = await findStartupOfficeApproval(membership.team_id, approvalID);
    if (!approval) throw createHTTPError(404, "approval not found");
    if (approval.status !== "pending") {
      if (idempotencyKey && approval.idempotency_key === idempotencyKey) {
        writeIdempotentApprovalResponse(res, approval);
        return;
      }
      throw createHTTPError(409, "approval is already decided");
    }
    const approved = action === "approve";
    const revisionRequested = action === "revise";
    if (revisionRequested && !body.decisionNote) {
      throw createHTTPError(400, "revision_note is required");
    }
    await enforceWorkflowRateLimit(membership, "approval_action");
    const now = nowISO();
    const existingRun = approval.run_id
      ? await startupOfficeRepository().findRun(membership.team_id, approval.run_id)
      : null;
    const existingRunMetadata = objectValue(existingRun?.metadata);
    const revisionRequest = revisionRequested
      ? startupOfficeRevisionRequest({
          approval,
          decisionNote: body.decisionNote,
          membership,
          now,
        })
      : null;
    const [updatedApproval] = await safeStartupOfficeRest("startup_office_approvals", {
      method: "PATCH",
      query: {
        id: `eq.${approval.id}`,
        status: "eq.pending",
        team_id: `eq.${membership.team_id}`,
      },
      body: {
        decided_at: now,
        decided_by: membership.user_id,
        decision_note: body.decisionNote,
        idempotency_key: idempotencyKey,
        metadata: {
          ...objectValue(approval.metadata),
          decision_idempotency_key: idempotencyKey || "",
          ...(revisionRequest ? { revision_request: revisionRequest } : {}),
        },
        status: approved ? "approved" : revisionRequested ? "revision_requested" : "rejected",
        updated_at: now,
      },
    });
    if (!updatedApproval && idempotencyKey) {
      const currentApproval = await findStartupOfficeApproval(membership.team_id, approvalID);
      if (currentApproval?.idempotency_key === idempotencyKey) {
        writeIdempotentApprovalResponse(res, currentApproval);
        return;
      }
    }
    if (!updatedApproval) throw createHTTPError(409, "approval is already decided");
    let updatedRun = null;
    let memoryPromotion = null;
    let revisionWorkerJob = null;
    if (approval.run_id) {
      if (revisionRequested) {
        const queued = await queueStartupOfficeApprovalRevision({
          approval,
          companyProfileSnapshot,
          ensureStartupOfficeLoop,
          existingRun,
          membership,
          objectValue,
          revisionRequest,
          safeStartupOfficeRest,
          startupOfficeLoopSkillInvocations,
          startupOfficeModelClient,
          startupOfficeRepository,
          team,
          truncateText,
          user,
        });
        updatedRun = queued.run;
        revisionWorkerJob = queued.workerJob;
      } else {
        const [run] = await safeStartupOfficeRest("startup_office_runs", {
          method: "PATCH",
          query: {
            id: `eq.${approval.run_id}`,
            team_id: `eq.${membership.team_id}`,
          },
          body: {
            completed_at: now,
            metadata: existingRunMetadata,
            status: approved ? "completed" : "canceled",
            summary: approved
              ? "Founder approved the drafted loop output."
              : "Founder rejected the drafted loop output.",
            updated_at: now,
          },
        });
        updatedRun = run;
      }
    }
    if (approved && approval.artifact_id) {
      const repository = startupOfficeRepository();
      const [artifact, profile] = await Promise.all([
        repository.findArtifact(membership.team_id, approval.artifact_id),
        companyProfileSnapshot(membership.team_id, team, user),
      ]);
      if (artifact) {
        memoryPromotion = await applyStartupOfficeMemoryPromotion({
          approval,
          artifact,
          membership,
          profile,
          repository,
          run: updatedRun || (approval.run_id
            ? await repository.findRun(membership.team_id, approval.run_id)
            : null),
        });
      }
    }
    const receipt = await createStartupOfficeReceipt(membership, {
      actor_slug: "founder",
      approval_id: approval.id,
      event_type: approved
        ? "approval.approved"
        : revisionRequested
          ? "approval.revision_requested"
          : "approval.rejected",
      run_id: approval.run_id || null,
      summary: approved
        ? "Founder approved the pending Startup Office action."
        : revisionRequested
          ? "Founder requested a revised Startup Office artifact."
          : "Founder rejected the pending Startup Office action.",
      trace: {
        approval_id: approval.id,
        decision_note: body.traceNote,
        idempotency_key: idempotencyKey || "",
        memory_pages: [...(memoryPromotion?.pages?.map((page) => page.slug) || []), ...(approved ? startupOfficeReceiptMemoryPageSlugs : [])],
        revision_request: revisionRequest,
        worker_job_id: revisionWorkerJob?.id || null,
      },
    });
    const receiptMemory = approved && materializeStartupOfficeReceiptMemory
      ? await materializeStartupOfficeReceiptMemory({ approval, membership, receipt, repository: startupOfficeRepository(), run: updatedRun })
      : null;
    const memoryPages = [...(memoryPromotion?.pages || []), ...(receiptMemory?.pages || [])];
    await writeAuditEvent(
      membership,
      approved
        ? "startup_office.approved"
        : revisionRequested
          ? "startup_office.revision_requested"
          : "startup_office.rejected",
      "approval",
      approval.id,
    );
    await deps.recordStartupOfficeApprovalActivation?.({ approval: updatedApproval || approval, membership });
    writeJSON(res, 200, {
      approval: publicStartupOfficeApproval(updatedApproval || approval),
      memory_diff: memoryPromotion?.diff || null,
      memory_pages: memoryPages,
      receipt,
      run: publicStartupOfficeRun(updatedRun),
      status: revisionRequested ? "revision_queued" : "ok",
      worker_job: revisionWorkerJob,
    });
  }

  function writeIdempotentApprovalResponse(res, approval) {
    writeJSON(res, 200, {
      approval: publicStartupOfficeApproval(approval),
      idempotent: true,
      memory_diff: null,
      memory_pages: [],
      receipt: null,
      run: null,
      status: "ok",
    });
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

  return {
    approvalAction: handleStartupOfficeApprovalAction,
    loopRun: handleStartupOfficeLoopRun,
    run: handleStartupOfficeRun,
  };
}

module.exports = {
  createStartupOfficeWorkflowHandlers,
};
