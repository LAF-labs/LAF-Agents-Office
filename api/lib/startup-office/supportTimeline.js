function createStartupOfficeSupportTimelineHandlers(deps) {
  const {
    clamp,
    createHTTPError,
    requireAdminRole,
    requireUser,
    safeStartupOfficeRest,
    truncateText,
    writeJSON,
  } = deps;

  async function handleStartupOfficeSupportTimeline(req, res) {
    const { membership, team } = await requireUser(req);
    if (req.method !== "GET") throw createHTTPError(405, "method not allowed");
    requireAdminRole(membership, "owner or admin role required for support timeline");
    const limit = clamp(Number(req.query?.limit) || 50, 1, 100);
    const runID = truncateText(req.query?.run_id || "", 120);
    const teamQuery = { team_id: `eq.${membership.team_id}` };
    const runQuery = runID ? { run_id: `eq.${runID}` } : {};
    const [auditEvents, runs, workerJobs, approvals, receipts, notifications, outboxEvents] =
      await Promise.all([
        readRows("audit_events", safeStartupOfficeRest, teamQuery, { limit }),
        safeStartupOfficeRest("startup_office_runs", {
          query: {
            ...teamQuery,
            ...(runID ? { id: `eq.${runID}` } : {}),
            limit: String(limit),
            order: "created_at.desc",
            select: "id,title,status,summary,created_at,started_at,completed_at,updated_at",
          },
        }),
        readRows("startup_office_worker_jobs", safeStartupOfficeRest, teamQuery, {
          limit,
          runQuery,
          select: "id,run_id,loop_slug,status,attempts,last_error,created_at,started_at,completed_at,updated_at",
        }),
        readRows("startup_office_approvals", safeStartupOfficeRest, teamQuery, {
          limit,
          order: "requested_at.desc",
          runQuery,
          select: "id,run_id,title,action,risk_level,status,requested_at,decided_at,updated_at",
        }),
        readRows("startup_office_receipts", safeStartupOfficeRest, teamQuery, {
          limit,
          runQuery,
          select: "id,run_id,approval_id,event_type,summary,created_at",
        }),
        readRows("startup_office_notifications", safeStartupOfficeRest, teamQuery, {
          limit,
          select: "id,event_type,status,created_at,sent_at",
        }),
        readRows("startup_office_outbox_events", safeStartupOfficeRest, teamQuery, {
          limit,
          select: "id,source_table,source_id,event_type,status,attempts,created_at,processed_at,updated_at",
        }),
      ]);
    const entries = [
      ...timelineAuditEvents(auditEvents, runID, truncateText),
      ...timelineRows(runs, "run", runID, truncateText),
      ...timelineRows(workerJobs, "worker_job", runID, truncateText),
      ...timelineRows(approvals, "approval", runID, truncateText),
      ...timelineRows(receipts, "receipt", runID, truncateText),
      ...timelineRows(runID ? [] : notifications, "notification", runID, truncateText),
      ...timelineRows(runID ? [] : outboxEvents, "outbox", runID, truncateText),
    ]
      .sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")))
      .slice(0, limit);
    writeJSON(res, 200, {
      timeline: {
        entries,
        filters: { run_id: runID },
        team: { id: team.id, name: team.name, slug: team.slug },
      },
    });
  }

  return { supportTimeline: handleStartupOfficeSupportTimeline };
}

function readRows(table, safeStartupOfficeRest, teamQuery, options = {}) {
  return safeStartupOfficeRest(table, {
    query: {
      ...teamQuery,
      ...(options.runQuery || {}),
      limit: String(options.limit || 50),
      order: options.order || "created_at.desc",
      select: options.select || "*",
    },
  });
}

function timelineRows(rows, source, runID, truncateText) {
  return (rows || []).map((row) => ({
    at: row.decided_at || row.processed_at || row.completed_at || row.sent_at || row.started_at || row.updated_at || row.requested_at || row.created_at || "",
    event_type: row.event_type || row.action || row.status || source,
    id: `${source}:${row.id}`,
    reference_id: row.id,
    run_id: row.run_id || (source === "run" ? row.id : ""),
    source,
    status: row.status || "",
    summary: truncateText(row.summary || row.title || row.event_type || row.status || "", 240),
    target: row.source_table ? `${row.source_table}:${row.source_id || ""}` : "",
  })).filter((entry) => !runID || entry.run_id === runID);
}

function timelineAuditEvents(rows, runID, truncateText) {
  return (rows || [])
    .filter((row) => !runID || row.target_id === runID || row.metadata?.run_id === runID)
    .map((row) => ({
      at: row.created_at || "",
      event_type: row.action || "audit",
      id: `audit:${row.id}`,
      reference_id: row.id,
      run_id: row.metadata?.run_id || (row.target_type === "run" ? row.target_id : ""),
      source: "audit",
      status: "",
      summary: truncateText(row.action || "", 240),
      target: row.target_type ? `${row.target_type}:${row.target_id || ""}` : "",
    }));
}

module.exports = {
  createStartupOfficeSupportTimelineHandlers,
  timelineAuditEvents,
  timelineRows,
};
