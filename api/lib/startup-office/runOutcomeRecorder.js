async function recordStartupOfficeRunOutcome({
  membership,
  objectValue,
  result,
  safeStartupOfficeRest,
}) {
  await recordStartupOfficeUsageEvent({
    membership,
    objectValue,
    result,
    safeStartupOfficeRest,
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

async function recordStartupOfficeUsageEvent({
  membership,
  objectValue = defaultObjectValue,
  result,
  safeStartupOfficeRest,
}) {
  await safeStartupOfficeRest("startup_office_usage_events", {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=representation",
    query: { on_conflict: "team_id,idempotency_key" },
    body: startupOfficeUsageEventBody({ membership, objectValue, result }),
  });
}

function startupOfficeUsageEventBody({
  membership,
  objectValue = defaultObjectValue,
  result,
}) {
  const run = defaultObjectValue(result?.run);
  const runMetadata = objectValue(run.metadata);
  const cost = objectValue(runMetadata.cost);
  const toolCalls = startupOfficeToolCallBreakdown({ objectValue, result, runMetadata });
  const workerDurationMs = startupOfficeWorkerDurationMs(run);
  const eventType = result?.usage_event_type || "model_run";
  return {
    cost_cents: numberValue(cost.estimated_cents),
    created_by: membership.user_id,
    event_type: eventType,
    idempotency_key: usageEventIdempotencyKey(run.id, eventType),
    input_tokens: numberValue(cost.input_tokens),
    metadata: {
      cost_pricing_source: cost.pricing_source || "",
      run_status: run.status || "",
      status: result?.status || run.status || "",
      tool_calls: toolCalls,
      worker_job_id: runMetadata.worker_job_id || null,
    },
    model: cost.model || runMetadata.model || "",
    output_tokens: numberValue(cost.output_tokens),
    provider: cost.provider || runMetadata.provider || "",
    run_id: run.id || null,
    team_id: membership.team_id,
    tool_calls: toolCalls.total,
    total_tokens: numberValue(cost.total_tokens),
    worker_duration_ms: workerDurationMs,
  };
}

function startupOfficeToolCallBreakdown({ objectValue, result, runMetadata }) {
  const artifactMetadata = objectValue(result?.artifact?.metadata);
  const approvalMetadata = objectValue(result?.approval?.metadata);
  const receiptTrace = objectValue(result?.receipt?.trace);
  const skillInvocations = firstArray(
    runMetadata.skill_invocations,
    artifactMetadata.skill_invocations,
    approvalMetadata.skill_invocations,
    receiptTrace.skill_invocations,
  );
  const browserResearch = firstObject(
    runMetadata.browser_research,
    artifactMetadata.browser_research,
    approvalMetadata.browser_research,
    receiptTrace.browser_research,
  );
  const browserResearchSources = numberValue(
    browserResearch.source_count ?? firstArray(browserResearch.sources).length,
  );
  const explicitToolCalls = numberValue(runMetadata.tool_calls);
  const inferredTotal = skillInvocations.length + browserResearchSources;
  return {
    browser_research_sources: browserResearchSources,
    explicit: explicitToolCalls,
    skill_invocations: skillInvocations.length,
    total: explicitToolCalls || inferredTotal,
  };
}

function startupOfficeWorkerDurationMs(run) {
  const started = Date.parse(run.started_at || "");
  const finished = Date.parse(run.completed_at || run.updated_at || "");
  if (!Number.isFinite(started) || !Number.isFinite(finished)) return 0;
  return Math.max(0, finished - started);
}

function usageEventIdempotencyKey(runID, eventType) {
  return runID ? `${runID}:${eventType}` : "";
}

function numberValue(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function firstArray(...values) {
  return values.find((value) => Array.isArray(value)) || [];
}

function firstObject(...values) {
  return values.find((value) => value && typeof value === "object" && !Array.isArray(value)) || {};
}

function defaultObjectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

module.exports = {
  recordStartupOfficeRunOutcome,
  recordStartupOfficeUsageEvent,
  startupOfficeUsageEventBody,
};
