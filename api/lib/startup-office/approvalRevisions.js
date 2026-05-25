function startupOfficeRevisionRequest({ approval, decisionNote, membership, now }) {
  return {
    approval_id: approval.id,
    artifact_id: approval.artifact_id || null,
    note: decisionNote,
    requested_at: now,
    requested_by: membership.user_id,
    source: "approval_revision",
  };
}

async function queueStartupOfficeApprovalRevision({
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
}) {
  const existingRunMetadata = objectValue(existingRun?.metadata);
  const [run] = await safeStartupOfficeRest("startup_office_runs", {
    method: "PATCH",
    query: {
      id: `eq.${approval.run_id}`,
      team_id: `eq.${membership.team_id}`,
    },
    body: {
      completed_at: null,
      metadata: {
        ...existingRunMetadata,
        revision_request: revisionRequest,
        revision_note: revisionRequest.note,
        revision_requested_at: revisionRequest.requested_at,
        revision_requested_by: revisionRequest.requested_by,
      },
      status: "queued",
      summary: "Founder requested a revision before approval.",
      updated_at: revisionRequest.requested_at,
    },
  });
  const loop = await ensureStartupOfficeLoop(
    membership,
    existingRun?.loop_id || existingRunMetadata.loop_slug,
  );
  const profile = await companyProfileSnapshot(membership.team_id, team, user);
  const objective = truncateText(
    existingRun?.objective || loop.objective || "Revise this operating loop.",
    2000,
  );
  const inputs = objectValue(existingRun?.inputs);
  const skillInvocations = startupOfficeLoopSkillInvocations({
    inputs,
    loop,
    objective,
    profile,
    truncateText,
  });
  const modelClient = startupOfficeModelClient();
  const workerJob = await startupOfficeRepository().createWorkerJob(membership, {
    loop_slug: loop.slug,
    metadata: {
      objective,
      provider: modelClient.provider,
      revision: true,
      revision_request: revisionRequest,
      skill_invocations: skillInvocations,
    },
    run_id: approval.run_id,
    status: "queued",
  });
  return {
    run,
    workerJob,
  };
}

module.exports = {
  queueStartupOfficeApprovalRevision,
  startupOfficeRevisionRequest,
};
