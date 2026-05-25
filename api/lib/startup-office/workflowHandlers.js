const {
  createStartupOfficeValidation,
} = require("./validation");

function createStartupOfficeWorkflowHandlers(deps) {
  const {
    applyStartupOfficeMemoryPromotion,
    companyProfileSnapshot,
    createHTTPError,
    createStartupOfficeReceipt,
    ensureStartupOfficeLoop,
    findStartupOfficeApproval,
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
    startupOfficeApprovals,
    startupOfficeArtifacts,
    startupOfficeBetaOpsSnapshot,
    startupOfficeModelClient,
    startupOfficeReceipts,
    startupOfficeRepository,
    truncateText,
    writeAuditEvent,
    writeJSON,
  } = deps;
  const validation = createStartupOfficeValidation({
    createHTTPError,
    objectValue,
    truncateText,
  });

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
    await enforceStartupOfficeRunLimit(membership.team_id);
    const loop = await ensureStartupOfficeLoop(membership, loopID);
    const profile = await companyProfileSnapshot(membership.team_id, team, user);
    const objective = truncateText(
      body.objective || loop.objective || profile.priority || "Run this operating loop.",
      2000,
    );
    const now = nowISO();
    const modelClient = startupOfficeModelClient();
    const run = await repository.createRun(membership, {
      idempotency_key: idempotencyKey,
      inputs: body.inputs,
      loop_id: loop.id || null,
      metadata: {
        company_name: profile.name || "",
        loop_slug: loop.slug,
        provider: modelClient.provider,
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
        objective,
        provider: modelClient.provider,
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
        worker_job_id: workerJob?.id || null,
      },
    });
    await writeAuditEvent(membership, "startup_office.run_created", "run", runID, {
      loop_slug: loop.slug,
      worker_job_id: workerJob?.id || "",
    });
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
      inputs: body.inputs,
      loop,
      membership,
      modelClient,
      nowISO,
      objective,
      profile,
      repository,
      run: queuedRun,
      truncateText,
      workerJob,
    });
    await recordStartupOfficeRunOutcome(membership, result);
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
          ...objectValue(run.metadata),
          canceled_by: membership.user_id,
        },
        status: "canceled",
        summary: "Founder canceled the Startup Office run.",
        updated_at: now,
      });
      const receipt = await createStartupOfficeReceipt(membership, {
        actor_slug: "founder",
        approval_id: pendingApproval?.id || null,
        event_type: "run.canceled",
        run_id: run.id,
        summary: "Founder canceled the Startup Office run.",
        trace: { run_id: run.id },
      });
      await writeAuditEvent(membership, "startup_office.run_canceled", "run", run.id);
      writeJSON(res, 200, {
        receipt,
        run: publicStartupOfficeRun(updatedRun || run),
        status: "canceled",
      });
      return;
    }

    if (action === "retry" && req.method === "POST") {
      requirePermission(membership, "memory:write_draft");
      await enforceStartupOfficeRunLimit(membership.team_id);
      if (!["failed", "canceled"].includes(run.status)) {
        throw createHTTPError(409, `run is ${run.status}; only failed or canceled runs can be retried`);
      }
      const body = validation.loopRunBody(await readBody(req));
      const loop = await ensureStartupOfficeLoop(membership, run.loop_id || run.metadata?.loop_slug);
      const profile = await companyProfileSnapshot(membership.team_id, team, user);
      const objective = truncateText(
        body.objective || run.objective || loop.objective || "Retry this operating loop.",
        2000,
      );
      const inputs = body.inputsProvided ? body.inputs : objectValue(run.inputs);
      const now = nowISO();
      const retryRun = await repository.updateRun(membership.team_id, run.id, {
        completed_at: null,
        inputs,
        metadata: {
          ...objectValue(run.metadata),
          retry_requested_at: now,
          retry_requested_by: membership.user_id,
        },
        objective,
        status: "queued",
        updated_at: now,
      });
      const modelClient = startupOfficeModelClient();
      const workerJob = await repository.createWorkerJob(membership, {
        loop_slug: loop.slug,
        metadata: {
          objective,
          provider: modelClient.provider,
          retry: true,
        },
        run_id: run.id,
        status: "queued",
      });
      await createStartupOfficeReceipt(membership, {
        actor_slug: "founder",
        event_type: "run.retry_queued",
        run_id: run.id,
        summary: `${loop.name} retry queued for AI execution.`,
        trace: { worker_job_id: workerJob?.id || null },
      });
      const result = await runStartupOfficeLoop({
        inputs,
        loop,
        membership,
        modelClient,
        nowISO,
        objective,
        profile,
        repository,
        run: retryRun || run,
        truncateText,
        workerJob,
      });
      await recordStartupOfficeRunOutcome(membership, result);
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
    const now = nowISO();
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
    if (approval.run_id) {
      const existingRun = await startupOfficeRepository().findRun(
        membership.team_id,
        approval.run_id,
      );
      const existingRunMetadata = objectValue(existingRun?.metadata);
      const [run] = await safeStartupOfficeRest("startup_office_runs", {
        method: "PATCH",
        query: {
          id: `eq.${approval.run_id}`,
          team_id: `eq.${membership.team_id}`,
        },
        body: {
          completed_at: revisionRequested ? null : now,
          metadata: revisionRequested
            ? {
                ...existingRunMetadata,
                revision_note: body.decisionNote,
                revision_requested_at: now,
                revision_requested_by: membership.user_id,
              }
            : existingRunMetadata,
          status: approved ? "completed" : revisionRequested ? "queued" : "canceled",
          summary: approved
            ? "Founder approved the drafted loop output."
            : revisionRequested
              ? "Founder requested a revision before approval."
              : "Founder rejected the drafted loop output.",
          updated_at: now,
        },
      });
      updatedRun = run;
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
        memory_pages: memoryPromotion?.pages?.map((page) => page.slug) || [],
      },
    });
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
    writeJSON(res, 200, {
      approval: publicStartupOfficeApproval(updatedApproval || approval),
      memory_diff: memoryPromotion?.diff || null,
      memory_pages: memoryPromotion?.pages || [],
      receipt,
      run: publicStartupOfficeRun(updatedRun),
      status: "ok",
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

  async function enforceStartupOfficeRunLimit(teamID) {
    const { billing, usage } = await startupOfficeBetaOpsSnapshot(teamID);
    if (["past_due", "paused", "canceled"].includes(billing.billing_state)) {
      throw createHTTPError(402, `billing state blocks AI runs: ${billing.billing_state}`);
    }
    if (usage.runs >= billing.monthly_run_limit) {
      throw createHTTPError(402, "monthly Startup Office run limit reached");
    }
    if (usage.model_spend_cents >= billing.monthly_model_spend_cents) {
      throw createHTTPError(402, "monthly Startup Office model spend limit reached");
    }
  }

  async function recordStartupOfficeRunOutcome(membership, result) {
    const cost = objectValue(result?.run?.metadata?.cost);
    await safeStartupOfficeRest("startup_office_usage_events", {
      method: "POST",
      body: {
        cost_cents: Number(cost.estimated_cents || 0),
        created_by: membership.user_id,
        event_type: "model_run",
        input_tokens: Number(cost.input_tokens || 0),
        metadata: {
          status: result?.status || "",
        },
        model: cost.model || result?.run?.metadata?.model || "",
        output_tokens: Number(cost.output_tokens || 0),
        provider: cost.provider || result?.run?.metadata?.provider || "",
        run_id: result?.run?.id || null,
        team_id: membership.team_id,
        total_tokens: Number(cost.total_tokens || 0),
      },
    });
    await safeStartupOfficeRest("startup_office_notifications", {
      method: "POST",
      body: {
        event_type: result?.status === "failed" ? "run_failed" : "approval_waiting",
        payload: {
          run_id: result?.run?.id || null,
          status: result?.status || "",
        },
        recipient_user_id: membership.user_id,
        status: "pending",
        team_id: membership.team_id,
      },
    });
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
