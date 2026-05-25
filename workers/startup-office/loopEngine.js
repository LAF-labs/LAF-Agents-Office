const { buildStartupOfficeContext } = require("./contextBuilder");
const { approvalGatesFor, approvalRiskLevel } = require("./approvalGates");
const {
  startupOfficeApprovalDecision,
} = require("../../api/lib/startup-office/approvalPolicy");
const {
  STARTUP_OFFICE_PAYLOAD_LIMITS,
  assertStartupOfficePayloadSize,
} = require("../../api/lib/startup-office/payloadLimits");
const { buildCitationSources, mergeCitationSources } = require("./citationSources");
const { startupOfficeLoopTemplate } = require("./loopTemplates");
const { evaluateStartupOfficeOutput } = require("./qualityChecks");
const { writeStartupOfficeRunReceipt } = require("./receiptWriter");
const {
  startupOfficeLoopToolPolicy,
  startupOfficeToolPolicyAllows,
} = require("./toolPolicy");
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
  browserResearchClient = null,
  skillInvocations = [],
  truncateText,
  workerJob = null,
  approvalPolicy = null,
}) {
  const createHTTPError = (status, message) => {
    const err = new Error(message);
    err.status = status;
    return err;
  };
  const template = startupOfficeLoopTemplate(loop.slug);
  const startedAt = nowISO();
  const claimedAttempt = Number(workerJob?.attempts || 0);
  const attempt = claimedAttempt > 0 ? claimedAttempt : Number(run?.metadata?.attempt || 0) + 1;
  const recordedSkillInvocations = normalizedSkillInvocations(skillInvocations, run);
  const toolPolicy = startupOfficeLoopToolPolicy({ approvalPolicy, loop });
  let modelResult = null;

  try {
    const canceledBeforeStart = await finishCanceledRun({
      membership,
      nowISO,
      repository,
      run,
      stage: "before_start",
      workerJob,
    });
    if (canceledBeforeStart) return canceledBeforeStart;

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
        skill_invocations: recordedSkillInvocations,
        tool_policy: toolPolicy,
        worker_job_id: workerJob?.id || null,
      }),
      started_at: run.started_at || startedAt,
      status: "running",
      updated_at: startedAt,
    });
    await auditStartupOfficeWrite(repository, membership, {
      action: "startup_office.run_started",
      metadata: { attempt, loop_slug: loop.slug, worker_job_id: workerJob?.id || "" },
      target_id: run.id,
      target_type: "run",
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
        skill_invocations: recordedSkillInvocations,
        tool_policy: toolPolicy,
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
    context.tool_policy = toolPolicy;
    context.citation_sources = buildCitationSources({
      assets: context.relevant_assets,
      customers: context.relevant_customers,
      inputs,
      signals: context.relevant_signals,
      wikiMemory: context.wiki_memory,
    });
    const browserResearch = await gatherBrowserResearch({
      browserResearchClient,
      context,
      inputs,
      loop,
      toolPolicy,
    });
    if (browserResearch.sources.length) {
      context.citation_sources = mergeCitationSources(
        context.citation_sources,
        browserResearch.sources,
      );
    }
    context.browser_research = browserResearch.findings;
    const canceledBeforeModel = await finishCanceledRun({
      membership,
      nowISO,
      repository,
      run,
      stage: "before_model",
      workerJob,
    });
    if (canceledBeforeModel) return canceledBeforeModel;

    modelResult = await modelClient.generateStructured({
      input: template.userPrompt({ context, inputs, objective }),
      instructions: template.instructions,
      metadata: {
        loop_name: loop.name,
        loop_slug: loop.slug,
        run_id: run.id,
        skill_names: recordedSkillInvocations.map((item) => item.skill_name),
        team_id: membership.team_id,
        tool_policy_version: toolPolicy.version,
        tools_allowed: toolPolicy.allowed_tools,
      },
      purpose: "startup_office_loop",
      schema: template.schema,
      schemaDescription: template.schemaDescription,
      schemaName: template.schemaName,
    });
    const canceledAfterModel = await finishCanceledRun({
      membership,
      nowISO,
      repository,
      run,
      stage: "after_model",
      workerJob,
    });
    if (canceledAfterModel) return canceledAfterModel;

    const quality = evaluateStartupOfficeOutput({
      context,
      output: modelResult.data,
      template,
    });
    if (!quality.passed) {
      throw new Error(`AI output failed quality checks: ${quality.issues.join("; ")}`);
    }
    const approvalGates = approvalGatesFor({
      output: modelResult.data,
      template,
    });
    const approvalDecision = startupOfficeApprovalDecision(approvalPolicy, approvalGates);
    const effectiveApprovalGates = approvalDecision.approval_gates;
    const approvalRequired = approvalDecision.approval_required;
    const approvalRisk = approvalRiskLevel(quality.risk_level, approvalGates);
    const qualityMetadata = {
      ...quality,
      approval_risk_level: approvalRisk,
    };

    const sideEffectKey = `${run.id}:${workerJob?.id || "direct"}`;
    const artifactContent = template.toArtifact(modelResult.data, context);
    assertStartupOfficePayloadSize({
      createHTTPError,
      label: "model artifact content",
      maxBytes: STARTUP_OFFICE_PAYLOAD_LIMITS.artifactContentBytes,
      value: artifactContent,
    });
    assertStartupOfficePayloadSize({
      createHTTPError,
      label: "model structured output",
      maxBytes: STARTUP_OFFICE_PAYLOAD_LIMITS.modelOutputBytes,
      value: modelResult.data,
    });
    const artifact = await repository.createArtifact(membership, {
      content: truncateText(artifactContent, 20000),
      idempotency_key: `${sideEffectKey}:artifact`,
      kind: template.artifactKind,
      metadata: {
        cost: modelResult.cost,
        context: {
          browser_research_source_count: browserResearch.sources.length,
          memory_page_count: context.wiki_memory.length,
          receipt_count: context.recent_receipts.length,
        },
        browser_research: browserResearch,
        approval_gates: effectiveApprovalGates,
        approval_mode: approvalDecision.approval_mode,
        approval_policy: approvalDecision.approval_policy,
        approval_required: approvalRequired,
        approval_risk_level: approvalRisk,
        loop_slug: loop.slug,
        model: modelClient.model,
        provider: modelClient.provider,
        quality: qualityMetadata,
        skill_invocations: recordedSkillInvocations,
        structured_output: modelResult.data,
        tool_policy: toolPolicy,
        wiki_promotion: startupOfficeWikiPromotionDraft({
          artifact: null,
          context,
          output: modelResult.data,
        }),
      },
      run_id: run.id,
      title: truncateText(template.artifactTitle, 180),
    });
    await auditStartupOfficeWrite(repository, membership, {
      action: "startup_office.artifact.created",
      metadata: {
        approval_required: approvalRequired,
        artifact_kind: template.artifactKind,
        loop_slug: loop.slug,
        run_id: run.id,
      },
      target_id: artifact?.id || "",
      target_type: "artifact",
    });
    let approval = null;
    let memoryDiff = null;
    if (approvalRequired) {
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
      memoryDiff = buildStartupOfficeMemoryDiff({
        currentPages: currentMemoryPages,
        nextPages: nextMemoryPages,
      });
      approval = await repository.createApproval(membership, {
        action: "approve_loop_draft",
        artifact_id: artifact?.id || null,
        details: truncateText(artifactContent, 4000),
        idempotency_key: `${sideEffectKey}:approval`,
        metadata: {
          approval_gates: effectiveApprovalGates,
          approval_mode: approvalDecision.approval_mode,
          approval_policy: approvalDecision.approval_policy,
          approval_required: approvalRequired,
          approval_risk_level: approvalRisk,
          cost: modelResult.cost,
          browser_research: browserResearch,
          loop_slug: loop.slug,
          memory_diff: memoryDiff,
          model: modelClient.model,
          provider: modelClient.provider,
          quality: qualityMetadata,
          skill_invocations: recordedSkillInvocations,
          tool_policy: toolPolicy,
        },
        requested_by: membership.user_id,
        risk_level: approvalRisk,
        run_id: run.id,
        status: "pending",
        title: truncateText(`Approve ${loop.name} AI draft`, 180),
      });
      await auditStartupOfficeWrite(repository, membership, {
        action: "startup_office.approval.created",
        metadata: {
          approval_mode: approvalDecision.approval_mode,
          approval_required: approvalRequired,
          loop_slug: loop.slug,
          risk_level: approvalRisk,
          run_id: run.id,
        },
        target_id: approval?.id || "",
        target_type: "approval",
      });
    }
    const completedAt = nowISO();
    const updatedRun = await repository.updateRun(membership.team_id, run.id, {
      completed_at: approvalRequired ? null : completedAt,
      metadata: mergeMetadata(run.metadata, {
        attempt,
        cost: modelResult.cost,
        approval_gates: effectiveApprovalGates,
        approval_mode: approvalDecision.approval_mode,
        approval_policy: approvalDecision.approval_policy,
        approval_required: approvalRequired,
        approval_risk_level: approvalRisk,
        browser_research: {
          provider: browserResearch.provider,
          source_count: browserResearch.sources.length,
        },
        loop_slug: loop.slug,
        model: modelClient.model,
        provider: modelClient.provider,
        quality: qualityMetadata,
        skill_invocations: recordedSkillInvocations,
        tool_policy: toolPolicy,
        worker_job_id: workerJob?.id || null,
      }),
      status: approvalRequired ? "waiting_approval" : "completed",
      summary: truncateText(template.summary(modelResult.data), 2000),
      updated_at: completedAt,
    });
    await auditStartupOfficeWrite(repository, membership, {
      action: approvalRequired
        ? "startup_office.run_waiting_approval"
        : "startup_office.run_completed",
      metadata: {
        approval_id: approval?.id || "",
        approval_required: approvalRequired,
        artifact_id: artifact?.id || "",
        loop_slug: loop.slug,
      },
      target_id: run.id,
      target_type: "run",
    });
    if (workerJob?.id) {
      await repository.updateWorkerJob(membership.team_id, workerJob.id, {
        completed_at: completedAt,
        locked_at: null,
        metadata: {
          artifact_id: artifact?.id || null,
          approval_id: approval?.id || null,
          approval_gates: effectiveApprovalGates,
          approval_mode: approvalDecision.approval_mode,
          approval_policy: approvalDecision.approval_policy,
          approval_required: approvalRequired,
          approval_risk_level: approvalRisk,
          browser_research: {
            provider: browserResearch.provider,
            source_count: browserResearch.sources.length,
          },
          cost: modelResult.cost,
          run_id: run.id,
          skill_invocations: recordedSkillInvocations,
          tool_policy: toolPolicy,
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
      summary: approvalRequired
        ? `${loop.name} AI draft is ready for founder approval.`
        : `${loop.name} AI draft is complete under the workspace draft-only policy.`,
      trace: {
        artifact_id: artifact?.id || null,
        approval_gates: effectiveApprovalGates,
        approval_mode: approvalDecision.approval_mode,
        approval_policy: approvalDecision.approval_policy,
        approval_required: approvalRequired,
        approval_risk_level: approvalRisk,
        browser_research: {
          provider: browserResearch.provider,
          source_count: browserResearch.sources.length,
        },
        cost: modelResult.cost,
        loop_slug: loop.slug,
        quality: qualityMetadata,
        skill_invocations: recordedSkillInvocations,
        tool_policy: toolPolicy,
      },
    });
    return {
      approval,
      artifact,
      receipt,
      run: updatedRun || run,
      status: approvalRequired ? "waiting_approval" : "completed",
    };
  } catch (err) {
    const canceledDuringFailure = await finishCanceledRun({
      membership,
      nowISO,
      repository,
      run,
      stage: "failure",
      workerJob,
    });
    if (canceledDuringFailure) return canceledDuringFailure;

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
        skill_invocations: recordedSkillInvocations,
        tool_policy: toolPolicy,
        worker_job_id: workerJob?.id || null,
      }),
      status: "failed",
      summary: message,
      updated_at: failedAt,
    });
    await auditStartupOfficeWrite(repository, membership, {
      action: "startup_office.run_failed",
      metadata: {
        attempt,
        error: message,
        loop_slug: loop.slug,
        worker_job_id: workerJob?.id || "",
      },
      target_id: run.id,
      target_type: "run",
    });
    if (workerJob?.id) {
      await repository.updateWorkerJob(membership.team_id, workerJob.id, {
        attempts: attempt,
        completed_at: failedAt,
        last_error: message,
        locked_at: null,
        metadata: { cost, run_id: run.id, tool_policy: toolPolicy },
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
        skill_invocations: recordedSkillInvocations,
        tool_policy: toolPolicy,
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

function normalizedSkillInvocations(skillInvocations, run) {
  if (Array.isArray(skillInvocations) && skillInvocations.length) return skillInvocations;
  const metadataInvocations = run?.metadata?.skill_invocations;
  return Array.isArray(metadataInvocations) ? metadataInvocations : [];
}

async function auditStartupOfficeWrite(repository, membership, event) {
  if (typeof repository.createAuditEvent !== "function") return null;
  return repository.createAuditEvent(membership, event);
}

async function finishCanceledRun({
  membership,
  nowISO,
  repository,
  run,
  stage,
  workerJob,
}) {
  const latestRun = await canceledRun(repository, membership.team_id, run);
  if (!latestRun) return null;
  const canceledAt = nowISO();
  if (workerJob?.id && typeof repository.updateWorkerJob === "function") {
    await repository.updateWorkerJob(membership.team_id, workerJob.id, {
      completed_at: latestRun.completed_at || canceledAt,
      last_error: "",
      locked_at: null,
      metadata: mergeMetadata(workerJob.metadata, {
        cancellation_stage: stage,
        canceled_run_status: latestRun.status,
        run_id: run.id,
      }),
      status: "canceled",
      updated_at: canceledAt,
    });
  }
  return {
    approval: null,
    artifact: null,
    receipt: null,
    run: latestRun,
    status: "canceled",
  };
}

async function canceledRun(repository, teamID, run) {
  if (run?.status === "canceled") return run;
  if (typeof repository.findRun !== "function" || !run?.id) return null;
  try {
    const latestRun = await repository.findRun(teamID, run.id);
    return latestRun?.status === "canceled" ? latestRun : null;
  } catch {
    return null;
  }
}

async function gatherBrowserResearch({ browserResearchClient, context, inputs, loop, toolPolicy }) {
  if (!startupOfficeToolPolicyAllows(toolPolicy, "browser_research")) {
    return {
      enabled: false,
      findings: [],
      loop_slug: loop?.slug || "",
      provider: "policy_denied",
      skipped: requestedBrowserResearchInputs(inputs).map((url) => ({
        reason: "tool policy disallows browser_research",
        url,
      })),
      sources: [],
    };
  }
  if (!browserResearchClient?.research) {
    return {
      enabled: false,
      findings: [],
      loop_slug: loop?.slug || "",
      provider: "disabled",
      skipped: [],
      sources: [],
    };
  }
  const result = await browserResearchClient.research({
    context,
    inputs,
    loop,
  });
  return {
    enabled: Boolean(result?.enabled),
    findings: Array.isArray(result?.findings) ? result.findings : [],
    loop_slug: result?.loop_slug || loop?.slug || "",
    provider: result?.provider || browserResearchClient.provider || "unknown",
    skipped: Array.isArray(result?.skipped) ? result.skipped : [],
    sources: Array.isArray(result?.sources) ? result.sources : [],
  };
}

function requestedBrowserResearchInputs(inputs = {}) {
  const out = [];
  for (const key of ["research_urls", "researchUrls", "urls"]) {
    for (const item of arrayValue(inputs[key])) pushResearchURL(out, item);
  }
  for (const item of arrayValue(inputs.sources)) pushResearchURL(out, item);
  return [...new Set(out)].slice(0, 10);
}

function pushResearchURL(out, value) {
  const raw = typeof value === "object" && value ? value.url || value.source_url || value.href : value;
  const url = String(raw || "").trim();
  if (/^https?:\/\/[^\s]+$/i.test(url)) out.push(url);
}

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

module.exports = {
  runStartupOfficeLoop,
};
