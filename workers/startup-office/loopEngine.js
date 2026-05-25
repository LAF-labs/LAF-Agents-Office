const { buildStartupOfficeContext } = require("./contextBuilder");
const { startupOfficeLoopTemplate } = require("./loopTemplates");
const { evaluateStartupOfficeOutput } = require("./qualityChecks");
const { writeStartupOfficeRunReceipt } = require("./receiptWriter");
const {
  buildStartupOfficeMemoryDiff,
  startupOfficeMemoryPromotionPreview,
  startupOfficeWikiPromotionDraft,
} = require("./wikiWriter");

async function runStartupOfficeLoop({
  inputs = {},
  loop,
  membership,
  modelClient,
  nowISO,
  objective,
  profile,
  repository,
  run,
  truncateText,
  workerJob = null,
}) {
  const template = startupOfficeLoopTemplate(loop.slug);
  const startedAt = nowISO();
  const claimedAttempt = Number(workerJob?.attempts || 0);
  const attempt = claimedAttempt > 0 ? claimedAttempt : Number(run?.metadata?.attempt || 0) + 1;
  let modelResult = null;

  try {
    if (workerJob?.id) {
      await repository.updateWorkerJob(membership.team_id, workerJob.id, {
        attempts: attempt,
        locked_at: startedAt,
        started_at: workerJob.started_at || startedAt,
        status: "running",
        updated_at: startedAt,
      });
    }
    const runningRun = await repository.updateRun(membership.team_id, run.id, {
      metadata: mergeMetadata(run.metadata, {
        attempt,
        loop_slug: loop.slug,
        provider: modelClient.provider,
        worker_job_id: workerJob?.id || null,
      }),
      started_at: run.started_at || startedAt,
      status: "running",
      updated_at: startedAt,
    });
    await writeStartupOfficeRunReceipt(repository, membership, {
      actor_slug: "agent",
      event_type: "run.started",
      run_id: run.id,
      summary: `${loop.name} AI run started.`,
      trace: {
        attempt,
        loop_slug: loop.slug,
        model: modelClient.model,
        provider: modelClient.provider,
        worker_job_id: workerJob?.id || null,
      },
    });

    const context = await buildStartupOfficeContext({
      loop,
      membership,
      profile,
      repository,
      run: runningRun || run,
    });
    modelResult = await modelClient.generateStructured({
      input: template.userPrompt({ context, inputs, objective }),
      instructions: template.instructions,
      metadata: {
        loop_name: loop.name,
        loop_slug: loop.slug,
        run_id: run.id,
        team_id: membership.team_id,
      },
      purpose: "startup_office_loop",
      schema: template.schema,
      schemaDescription: template.schemaDescription,
      schemaName: template.schemaName,
    });
    const quality = evaluateStartupOfficeOutput({
      output: modelResult.data,
      template,
    });
    if (!quality.passed) {
      throw new Error(`AI output failed quality checks: ${quality.issues.join("; ")}`);
    }

    const sideEffectKey = `${run.id}:${workerJob?.id || "direct"}`;
    const artifactContent = template.toArtifact(modelResult.data, context);
    const artifact = await repository.createArtifact(membership, {
      content: truncateText(artifactContent, 20000),
      idempotency_key: `${sideEffectKey}:artifact`,
      kind: template.artifactKind,
      metadata: {
        cost: modelResult.cost,
        context: {
          memory_page_count: context.wiki_memory.length,
          receipt_count: context.recent_receipts.length,
        },
        loop_slug: loop.slug,
        model: modelClient.model,
        provider: modelClient.provider,
        quality,
        structured_output: modelResult.data,
        wiki_promotion: startupOfficeWikiPromotionDraft({
          artifact: null,
          context,
          output: modelResult.data,
        }),
      },
      run_id: run.id,
      title: truncateText(template.artifactTitle, 180),
    });
    const currentMemoryPages = await repository.memoryPages(membership.team_id, {
      status: "approved",
      limit: 50,
    });
    const nextMemoryPages = startupOfficeMemoryPromotionPreview({
      approval: null,
      artifact,
      currentPages: currentMemoryPages,
      profile,
      run: {
        ...runningRun,
        id: run.id,
        summary: template.summary(modelResult.data),
      },
    });
    const memoryDiff = buildStartupOfficeMemoryDiff({
      currentPages: currentMemoryPages,
      nextPages: nextMemoryPages,
    });
    const approval = await repository.createApproval(membership, {
      action: "approve_loop_draft",
      artifact_id: artifact?.id || null,
      details: truncateText(artifactContent, 4000),
      idempotency_key: `${sideEffectKey}:approval`,
      metadata: {
        cost: modelResult.cost,
        loop_slug: loop.slug,
        memory_diff: memoryDiff,
        model: modelClient.model,
        provider: modelClient.provider,
        quality,
      },
      requested_by: membership.user_id,
      risk_level: quality.risk_level,
      run_id: run.id,
      status: "pending",
      title: truncateText(`Approve ${loop.name} AI draft`, 180),
    });
    const completedAt = nowISO();
    const updatedRun = await repository.updateRun(membership.team_id, run.id, {
      completed_at: null,
      metadata: mergeMetadata(run.metadata, {
        attempt,
        cost: modelResult.cost,
        loop_slug: loop.slug,
        model: modelClient.model,
        provider: modelClient.provider,
        quality,
        worker_job_id: workerJob?.id || null,
      }),
      status: "waiting_approval",
      summary: truncateText(template.summary(modelResult.data), 2000),
      updated_at: completedAt,
    });
    if (workerJob?.id) {
      await repository.updateWorkerJob(membership.team_id, workerJob.id, {
        completed_at: completedAt,
        locked_at: null,
        metadata: {
          artifact_id: artifact?.id || null,
          approval_id: approval?.id || null,
          cost: modelResult.cost,
          run_id: run.id,
        },
        status: "completed",
        updated_at: completedAt,
      });
    }
    const receipt = await writeStartupOfficeRunReceipt(repository, membership, {
      actor_slug: "agent",
      approval_id: approval?.id || null,
      event_type: "run.ai_draft_ready",
      run_id: run.id,
      summary: `${loop.name} AI draft is ready for founder approval.`,
      trace: {
        artifact_id: artifact?.id || null,
        cost: modelResult.cost,
        loop_slug: loop.slug,
        quality,
      },
    });
    return {
      approval,
      artifact,
      receipt,
      run: updatedRun || run,
      status: "waiting_approval",
    };
  } catch (err) {
    const failedAt = nowISO();
    const message = truncateText(err.message || "Startup Office AI run failed", 2000);
    const cost = modelResult?.cost || {
      currency: "USD",
      estimated_usd: null,
      input_tokens: 0,
      model: modelClient.model,
      output_tokens: 0,
      pricing_source: "not_billed",
      provider: modelClient.provider,
      total_tokens: 0,
    };
    const failedRun = await repository.updateRun(membership.team_id, run.id, {
      completed_at: failedAt,
      metadata: mergeMetadata(run.metadata, {
        attempt,
        cost,
        error: message,
        loop_slug: loop.slug,
        model: modelClient.model,
        provider: modelClient.provider,
        worker_job_id: workerJob?.id || null,
      }),
      status: "failed",
      summary: message,
      updated_at: failedAt,
    });
    if (workerJob?.id) {
      await repository.updateWorkerJob(membership.team_id, workerJob.id, {
        attempts: attempt,
        completed_at: failedAt,
        last_error: message,
        locked_at: null,
        metadata: { cost, run_id: run.id },
        status: "failed",
        updated_at: failedAt,
      });
    }
    const receipt = await writeStartupOfficeRunReceipt(repository, membership, {
      actor_slug: "agent",
      event_type: "run.failed",
      run_id: run.id,
      summary: message,
      trace: {
        attempt,
        cost,
        loop_slug: loop.slug,
        provider: modelClient.provider,
      },
    });
    return {
      error: message,
      receipt,
      run: failedRun || run,
      status: "failed",
    };
  }
}

function mergeMetadata(current, patch) {
  return {
    ...(isObject(current) ? current : {}),
    ...patch,
  };
}

function isObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

module.exports = {
  runStartupOfficeLoop,
};
