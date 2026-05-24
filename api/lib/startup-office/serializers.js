function objectValue(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

function publicCompanyProfile({ row, settings, team, user }) {
  const settingsProfile = objectValue(settings?.company_profile);
  const rowMetadata = objectValue(row?.metadata);
  return {
    description: row?.description || settingsProfile.description || "",
    email: user?.email || "",
    goals: row?.goals || settingsProfile.goals || "",
    icp: row?.icp || settingsProfile.icp || "",
    metadata: {
      ...objectValue(settingsProfile.metadata),
      ...rowMetadata,
    },
    name: row?.name || settingsProfile.name || team?.name || "",
    offer: row?.offer || settingsProfile.offer || "",
    positioning: row?.positioning || settingsProfile.positioning || "",
    priority: row?.priority || settingsProfile.priority || "",
    size: row?.size || settingsProfile.size || "",
    stage: row?.stage || settingsProfile.stage || "",
    team_id: team?.id || row?.team_id || settings?.team_id || "",
    updated_at: row?.updated_at || settings?.updated_at || null,
    workspace_slug: team?.slug || "",
  };
}

function publicStartupOfficeLoop(row) {
  if (!row) return null;
  return {
    cadence: row.cadence || "manual",
    department: row.department || "Operations",
    id: row.id || row.slug || "",
    name: row.name || row.slug || "Operating loop",
    objective: row.objective || "",
    policy: objectValue(row.policy),
    slug: row.slug || row.id || "",
    status: normalizeStartupOfficeLoopStatus(row.status),
  };
}

function publicStartupOfficeRun(row) {
  if (!row) return null;
  return {
    completed_at: row.completed_at || null,
    created_at: row.created_at || null,
    id: row.id || "",
    inputs: objectValue(row.inputs),
    loop_id: row.loop_id || null,
    metadata: objectValue(row.metadata),
    objective: row.objective || "",
    started_at: row.started_at || null,
    status: normalizeStartupOfficeRunStatus(row.status),
    summary: row.summary || "",
    title: row.title || "",
    updated_at: row.updated_at || null,
  };
}

function publicStartupOfficeArtifact(row) {
  if (!row) return null;
  return {
    content: row.content || "",
    created_at: row.created_at || null,
    id: row.id || "",
    kind: normalizeStartupOfficeArtifactKind(row.kind),
    metadata: objectValue(row.metadata),
    run_id: row.run_id || null,
    title: row.title || "",
  };
}

function publicStartupOfficeApproval(row) {
  if (!row) return null;
  return {
    action: row.action || "",
    artifact_id: row.artifact_id || null,
    decided_at: row.decided_at || null,
    decided_by: row.decided_by || null,
    decision_note: row.decision_note || "",
    details: row.details || "",
    id: row.id || "",
    metadata: objectValue(row.metadata),
    requested_at: row.requested_at || row.created_at || null,
    requested_by: row.requested_by || null,
    risk_level: normalizeStartupOfficeRiskLevel(row.risk_level),
    run_id: row.run_id || null,
    status: normalizeStartupOfficeApprovalStatus(row.status),
    title: row.title || "",
  };
}

function publicStartupOfficeReceipt(row) {
  if (!row) return null;
  return {
    actor_slug: row.actor_slug || "",
    approval_id: row.approval_id || null,
    created_at: row.created_at || null,
    event_type: row.event_type || "",
    id: row.id || "",
    run_id: row.run_id || null,
    summary: row.summary || "",
    trace: objectValue(row.trace),
  };
}

function publicStartupOfficeMemoryPage(row) {
  if (!row) return null;
  return {
    assumptions: arrayValue(row.assumptions),
    body: row.body || "",
    id: row.id || "",
    last_verified_at: row.last_verified_at || null,
    provenance: objectValue(row.provenance),
    slug: row.slug || "",
    sources: arrayValue(row.sources),
    status: row.status || "approved",
    summary: row.summary || "",
    title: row.title || row.slug || "Memory page",
    updated_at: row.updated_at || null,
  };
}

function publicStartupOfficeAsset(row) {
  if (!row) return null;
  return {
    body: row.body || "",
    created_at: row.created_at || null,
    id: row.id || "",
    kind: row.kind || "document",
    metadata: objectValue(row.metadata),
    name: row.name || "",
    run_id: row.run_id || null,
    updated_at: row.updated_at || null,
  };
}

function publicStartupOfficeCustomer(row) {
  if (!row) return null;
  return {
    created_at: row.created_at || null,
    id: row.id || "",
    name: row.name || "",
    notes: row.notes || "",
    profile: objectValue(row.profile),
    status: row.status || "lead",
    updated_at: row.updated_at || null,
  };
}

function publicStartupOfficeMetric(row) {
  if (!row) return null;
  return {
    created_at: row.created_at || null,
    id: row.id || "",
    metadata: objectValue(row.metadata),
    metric_key: row.metric_key || "",
    metric_value: row.metric_value === undefined ? null : row.metric_value,
    period_end: row.period_end || null,
    period_start: row.period_start || null,
    unit: row.unit || "",
  };
}

function publicStartupOfficeSignal(row) {
  if (!row) return null;
  return {
    body: row.body || "",
    created_at: row.created_at || null,
    id: row.id || "",
    metadata: objectValue(row.metadata),
    source: row.source || "",
    status: row.status || "new",
    title: row.title || "",
    updated_at: row.updated_at || null,
  };
}

function normalizeStartupOfficeCadence(value) {
  const raw = String(value || "").trim().toLowerCase();
  return ["manual", "daily", "weekly", "monthly"].includes(raw)
    ? raw
    : "manual";
}

function normalizeStartupOfficeLoopStatus(value) {
  const raw = String(value || "").trim().toLowerCase();
  return ["active", "paused", "archived"].includes(raw) ? raw : "active";
}

function normalizeStartupOfficeRunStatus(value) {
  const raw = String(value || "").trim().toLowerCase();
  return [
    "queued",
    "running",
    "waiting_approval",
    "completed",
    "failed",
    "canceled",
  ].includes(raw)
    ? raw
    : "queued";
}

function normalizeStartupOfficeArtifactKind(value) {
  const raw = String(value || "").trim().toLowerCase();
  return ["plan", "draft", "asset", "wiki_update", "report", "message"].includes(
    raw,
  )
    ? raw
    : "draft";
}

function normalizeStartupOfficeApprovalStatus(value) {
  const raw = String(value || "").trim().toLowerCase();
  return ["pending", "approved", "rejected", "revision_requested"].includes(raw)
    ? raw
    : "pending";
}

function normalizeStartupOfficeRiskLevel(value) {
  const raw = String(value || "").trim().toLowerCase();
  return ["low", "medium", "high"].includes(raw) ? raw : "medium";
}

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

module.exports = {
  normalizeStartupOfficeApprovalStatus,
  normalizeStartupOfficeCadence,
  normalizeStartupOfficeLoopStatus,
  objectValue,
  publicCompanyProfile,
  publicStartupOfficeApproval,
  publicStartupOfficeArtifact,
  publicStartupOfficeAsset,
  publicStartupOfficeCustomer,
  publicStartupOfficeLoop,
  publicStartupOfficeMemoryPage,
  publicStartupOfficeMetric,
  publicStartupOfficeReceipt,
  publicStartupOfficeRun,
  publicStartupOfficeSignal,
};
