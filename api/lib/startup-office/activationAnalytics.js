const ACTIVATION_MILESTONES = Object.freeze([
  ["first_loop_run", "First loop run"],
  ["first_approval_decision", "First approval decision"],
  ["second_loop_run", "Second loop run"],
  ["first_export", "First export"],
]);

function publicStartupOfficeActivationEvent(row = {}) {
  return {
    created_by: row.created_by || null,
    first_seen_at: row.first_seen_at || row.created_at || null,
    id: row.id || "",
    metadata: objectValue(row.metadata),
    milestone: normalizeActivationMilestone(row.milestone),
    source_id: row.source_id || "",
    source_table: row.source_table || "",
    updated_at: row.updated_at || null,
  };
}

function startupOfficeActivationSnapshot(rows = []) {
  const events = rows.map(publicStartupOfficeActivationEvent);
  const byMilestone = new Map(events.map((event) => [event.milestone, event]));
  const milestones = ACTIVATION_MILESTONES.map(([milestone, label]) => ({
    completed: byMilestone.has(milestone),
    event: byMilestone.get(milestone) || null,
    label,
    milestone,
  }));
  return {
    activated: milestones.every((item) => item.completed),
    completed_count: milestones.filter((item) => item.completed).length,
    milestones,
    next_milestone: milestones.find((item) => !item.completed)?.milestone || "",
    required_count: milestones.length,
  };
}

async function recordStartupOfficeRunActivation({ membership, runID, safeStartupOfficeRest }) {
  const [events, runs] = await Promise.all([
    activationEventsForTeam(membership.team_id, safeStartupOfficeRest),
    safeStartupOfficeRest("startup_office_runs", {
      query: {
        limit: "2",
        order: "created_at.asc",
        select: "id,created_at",
        team_id: `eq.${membership.team_id}`,
      },
    }),
  ]);
  const completed = new Set(events.map((event) => event.milestone));
  if (!completed.has("first_loop_run") && runs[0]) {
    await upsertActivationEvent({ membership, milestone: "first_loop_run", row: runs[0], safeStartupOfficeRest });
  }
  if (!completed.has("second_loop_run") && runs.length >= 2) {
    await upsertActivationEvent({ membership, milestone: "second_loop_run", row: runs[1] || { id: runID }, safeStartupOfficeRest });
  }
}

async function recordStartupOfficeApprovalActivation({ approval, membership, safeStartupOfficeRest }) {
  await upsertActivationEvent({
    membership,
    metadata: { status: approval?.status || "" },
    milestone: "first_approval_decision",
    row: { id: approval?.id || "", source_table: "startup_office_approvals" },
    safeStartupOfficeRest,
  });
}

async function recordStartupOfficeExportActivation({ membership, nowISO, safeStartupOfficeRest }) {
  await upsertActivationEvent({
    membership,
    milestone: "first_export",
    row: { id: `export:${nowISO()}`, source_table: "startup_office_export" },
    safeStartupOfficeRest,
  });
}

async function activationEventsForTeam(teamID, safeStartupOfficeRest, options = {}) {
  const rows = await safeStartupOfficeRest("startup_office_activation_events", {
    query: {
      limit: String(Math.min(Math.max(Number(options.limit) || 20, 1), 100)),
      order: "first_seen_at.asc",
      select: "id,milestone,source_table,source_id,metadata,created_by,created_at,first_seen_at,updated_at",
      team_id: `eq.${teamID}`,
    },
  });
  return rows.map(publicStartupOfficeActivationEvent);
}

async function upsertActivationEvent({
  membership,
  metadata = {},
  milestone,
  row,
  safeStartupOfficeRest,
}) {
  const [event] = await safeStartupOfficeRest("startup_office_activation_events", {
    method: "POST",
    prefer: "resolution=ignore-duplicates,return=representation",
    query: { on_conflict: "team_id,milestone" },
    body: {
      created_by: membership.user_id || null,
      metadata: objectValue(metadata),
      milestone: normalizeActivationMilestone(milestone),
      source_id: String(row?.id || ""),
      source_table: row?.source_table || "startup_office_runs",
      team_id: membership.team_id,
    },
  });
  return publicStartupOfficeActivationEvent(event || { milestone, ...row });
}

function normalizeActivationMilestone(value) {
  const raw = String(value || "").trim().toLowerCase();
  return ACTIVATION_MILESTONES.some(([milestone]) => milestone === raw)
    ? raw
    : "first_loop_run";
}

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

module.exports = {
  activationEventsForTeam,
  publicStartupOfficeActivationEvent,
  recordStartupOfficeApprovalActivation,
  recordStartupOfficeExportActivation,
  recordStartupOfficeRunActivation,
  startupOfficeActivationSnapshot,
};
