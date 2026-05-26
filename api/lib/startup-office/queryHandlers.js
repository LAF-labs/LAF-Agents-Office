const { createStartupOfficeValidation } = require("./validation");
const {
  startupOfficePageRequest,
  startupOfficePageResult,
} = require("./pagination");
const { createStartupOfficeExportHandlers } = require("./exportHandlers");

const STARTUP_OFFICE_GROWTH_SUMMARY_QUERY_BUDGET = Object.freeze({
  activation_events: 20,
  approvals: 10,
  artifacts: 10,
  assets: 5,
  billing_documents: 3,
  customers: 5,
  invites: 50,
  loops: 50,
  memberships: 50,
  memory_pages: 10,
  metrics: 50,
  notifications: 10,
  receipts: 10,
  runs: 10,
  signals: 5,
  storage_rows_per_table: 50,
  terms_acceptances: 3,
  usage_events: 200,
});

const STARTUP_OFFICE_GROWTH_SUMMARY_SELECTS = Object.freeze({
  approvals:
    "id,run_id,artifact_id,status,title,action,details,risk_level,metadata,requested_by,requested_at,decided_by,decided_at,decision_note,created_at",
  artifacts: "id,run_id,kind,title,content,metadata,created_at",
  assets:
    "id,name,kind,status,body,metadata,run_id,checksum_sha256,content_type,size_bytes,storage_path,updated_at,upload_status",
  customers: "id,name,status,notes,profile,loop_id,created_at,updated_at",
  loops: "id,slug,name,objective,department,cadence,policy,status,created_at",
  memoryPages:
    "id,slug,title,summary,body,status,provenance,sources,assumptions,last_verified_at,updated_at",
  metrics:
    "id,metric_key,metric_value,unit,metadata,period_start,period_end,created_at,updated_at",
  notifications: "id,event_type,status,payload,created_at",
  receipts: "id,run_id,approval_id,actor_slug,event_type,summary,trace,created_at",
  runs:
    "id,loop_id,status,title,objective,summary,inputs,metadata,created_at,updated_at,started_at,completed_at",
  signals:
    "id,title,body,source,status,signal_type,metadata,loop_id,run_id,created_at,updated_at",
});

function createStartupOfficeQueryHandlers(deps) {
  const {
    createHTTPError,
    companyProfileSnapshot,
    normalizeStartupOfficeCadence,
    normalizeStartupOfficeLoopStatus,
    objectValue,
    publicStartupOfficeLoop,
    readBody,
    requirePermission,
    requireUser,
    safeStartupOfficeRest,
    startupOfficeApprovals,
    startupOfficeArtifacts,
    startupOfficeBetaOpsSnapshot,
    startupOfficeLoops,
    startupOfficeObjectRows,
    startupOfficeReceipts,
    startupOfficeRepository,
    startupOfficeRuns,
    truncateText,
    writeAuditEvent,
    writeJSON,
  } = deps;
  const validation = createStartupOfficeValidation({
    createHTTPError,
    objectValue,
    truncateText,
  });
  const exportHandlers = createStartupOfficeExportHandlers(deps);

  async function handleStartupOfficeGrowthSummary(req, res) {
    const { membership, team, user } = await requireUser(req);
    requirePermission(membership, "workspace:read");
    const [
      loops,
      runs,
      artifacts,
      approvals,
      receipts,
      memoryPages,
      objectSummary,
      betaOps,
      notifications,
      profile,
    ] = await Promise.all([
      startupOfficeLoops(membership.team_id, {
        limit: STARTUP_OFFICE_GROWTH_SUMMARY_QUERY_BUDGET.loops,
        select: STARTUP_OFFICE_GROWTH_SUMMARY_SELECTS.loops,
      }),
      startupOfficeRuns(membership.team_id, {
        limit: STARTUP_OFFICE_GROWTH_SUMMARY_QUERY_BUDGET.runs,
        select: STARTUP_OFFICE_GROWTH_SUMMARY_SELECTS.runs,
      }),
      startupOfficeArtifacts(membership.team_id, {
        limit: STARTUP_OFFICE_GROWTH_SUMMARY_QUERY_BUDGET.artifacts,
        select: STARTUP_OFFICE_GROWTH_SUMMARY_SELECTS.artifacts,
      }),
      startupOfficeApprovals(membership.team_id, {
        limit: STARTUP_OFFICE_GROWTH_SUMMARY_QUERY_BUDGET.approvals,
        select: STARTUP_OFFICE_GROWTH_SUMMARY_SELECTS.approvals,
        status: "pending",
      }),
      startupOfficeReceipts(membership.team_id, {
        limit: STARTUP_OFFICE_GROWTH_SUMMARY_QUERY_BUDGET.receipts,
        select: STARTUP_OFFICE_GROWTH_SUMMARY_SELECTS.receipts,
      }),
      startupOfficeRepository().memoryPages(membership.team_id, {
        limit: STARTUP_OFFICE_GROWTH_SUMMARY_QUERY_BUDGET.memory_pages,
        select: STARTUP_OFFICE_GROWTH_SUMMARY_SELECTS.memoryPages,
        status: "approved",
      }),
      startupOfficeObjectSummary(membership.team_id),
      startupOfficeBetaOpsSnapshot(membership.team_id, {
        activation_event_limit: STARTUP_OFFICE_GROWTH_SUMMARY_QUERY_BUDGET.activation_events,
        billing_documents_limit: STARTUP_OFFICE_GROWTH_SUMMARY_QUERY_BUDGET.billing_documents,
        invite_limit: STARTUP_OFFICE_GROWTH_SUMMARY_QUERY_BUDGET.invites,
        membership_limit: STARTUP_OFFICE_GROWTH_SUMMARY_QUERY_BUDGET.memberships,
        storage_row_limit: STARTUP_OFFICE_GROWTH_SUMMARY_QUERY_BUDGET.storage_rows_per_table,
        terms_acceptances_limit: STARTUP_OFFICE_GROWTH_SUMMARY_QUERY_BUDGET.terms_acceptances,
        usage_event_limit: STARTUP_OFFICE_GROWTH_SUMMARY_QUERY_BUDGET.usage_events,
      }),
      safeStartupOfficeRest("startup_office_notifications", {
        query: {
          limit: String(STARTUP_OFFICE_GROWTH_SUMMARY_QUERY_BUDGET.notifications),
          order: "created_at.desc",
          select: STARTUP_OFFICE_GROWTH_SUMMARY_SELECTS.notifications,
          team_id: `eq.${membership.team_id}`,
        },
      }),
      companyProfileSnapshot(membership.team_id, team, user),
    ]);
    writeJSON(res, 200, {
      activity_notifications: notifications,
      company_profile: profile,
      beta_ops: betaOps,
      loops,
      pulse: {
        active_loops: loops.filter((loop) => loop.status === "active").length,
        pending_approvals: approvals.length,
        recent_receipts: receipts.length,
        recent_runs: runs.length,
      },
      memory_pages: memoryPages,
      operating_objects: objectSummary,
      recent_artifacts: artifacts,
      recent_receipts: receipts,
      recent_runs: runs,
      pending_approvals: approvals,
    });
  }

  async function handleStartupOfficeLoops(req, res) {
    const { membership } = await requireUser(req);
    if (req.method === "GET") {
      requirePermission(membership, "workspace:read");
      writeJSON(res, 200, { loops: await startupOfficeLoops(membership.team_id) });
      return;
    }
    if (req.method !== "POST") throw createHTTPError(405, "method not allowed");
    requirePermission(membership, "workspace:manage");
    const body = validation.loopCreateBody(await readBody(req));
    const slug = await startupOfficeRepository().uniqueLoopSlug(
      membership.team_id,
      body.slugSeed,
    );
    const [loop] = await safeStartupOfficeRest("startup_office_loops", {
      method: "POST",
      body: {
        cadence: normalizeStartupOfficeCadence(body.cadence),
        created_by: membership.user_id,
        department: body.department,
        name: body.name,
        objective: body.objective,
        policy: body.policy,
        slug,
        status: normalizeStartupOfficeLoopStatus(body.status),
        team_id: membership.team_id,
      },
    });
    await writeAuditEvent(membership, "startup_office.loop_created", "loop", loop?.id || slug, {
      slug,
    });
    writeJSON(res, 200, { loop: publicStartupOfficeLoop(loop || { ...body, slug }) });
  }

  async function handleStartupOfficeApprovals(req, res) {
    const { membership } = await requireUser(req);
    if (req.method !== "GET") throw createHTTPError(405, "method not allowed");
    requirePermission(membership, "workspace:read");
    const page = startupOfficePageRequest(req.query, { createHTTPError });
    const rows = await startupOfficeApprovals(membership.team_id, {
      cursor: page.cursor,
      limit: page.request_limit,
      status: req.query?.status,
    });
    const { items, pagination } = startupOfficePageResult(rows, page, "requested_at");
    writeJSON(res, 200, {
      approvals: items,
      pagination,
    });
  }

  async function handleStartupOfficeReceipts(req, res) {
    const { membership } = await requireUser(req);
    if (req.method !== "GET") throw createHTTPError(405, "method not allowed");
    requirePermission(membership, "workspace:read");
    const page = startupOfficePageRequest(req.query, { createHTTPError });
    const rows = await startupOfficeReceipts(membership.team_id, {
      cursor: page.cursor,
      limit: page.request_limit,
    });
    const { items, pagination } = startupOfficePageResult(rows, page);
    writeJSON(res, 200, {
      pagination,
      receipts: items,
    });
  }

  async function startupOfficeObjectSummary(teamID) {
    const [assets, customers, metrics, signals] = await Promise.all([
      startupOfficeObjectRows(teamID, "assets", {
        limit: STARTUP_OFFICE_GROWTH_SUMMARY_QUERY_BUDGET.assets,
        select: STARTUP_OFFICE_GROWTH_SUMMARY_SELECTS.assets,
      }),
      startupOfficeObjectRows(teamID, "customers", {
        limit: STARTUP_OFFICE_GROWTH_SUMMARY_QUERY_BUDGET.customers,
        select: STARTUP_OFFICE_GROWTH_SUMMARY_SELECTS.customers,
      }),
      startupOfficeObjectRows(teamID, "metrics", {
        limit: STARTUP_OFFICE_GROWTH_SUMMARY_QUERY_BUDGET.metrics,
        select: STARTUP_OFFICE_GROWTH_SUMMARY_SELECTS.metrics,
      }),
      startupOfficeObjectRows(teamID, "signals", {
        limit: STARTUP_OFFICE_GROWTH_SUMMARY_QUERY_BUDGET.signals,
        select: STARTUP_OFFICE_GROWTH_SUMMARY_SELECTS.signals,
      }),
    ]);
    return {
      assets,
      counts: {
        assets: assets.length,
        customers: customers.length,
        metrics: metrics.length,
        signals: signals.length,
      },
      customers,
      metrics,
      metrics_summary: startupOfficeMetricSummary(metrics),
      signals,
    };
  }

  function startupOfficeMetricSummary(metrics) {
    const rowsByKey = new Map();
    for (const metric of metrics || []) {
      const key = String(metric?.metric_key || "").trim();
      if (!key) continue;
      if (!rowsByKey.has(key)) rowsByKey.set(key, []);
      rowsByKey.get(key).push(metric);
    }
    return [...rowsByKey.entries()].map(([metricKey, rows]) => {
      const latest = rows[0] || {};
      const previous = rows[1] || {};
      const latestValue = numericMetricValue(latest.metric_value);
      const previousValue = numericMetricValue(previous.metric_value);
      return {
        change:
          latestValue === null || previousValue === null
            ? null
            : latestValue - previousValue,
        latest_value: latestValue,
        metric_key: metricKey,
        previous_value: previousValue,
        unit: latest.unit || "",
        updated_at: latest.updated_at || latest.created_at || null,
      };
    });
  }

  function numericMetricValue(value) {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  return {
    approvals: handleStartupOfficeApprovals,
    export: exportHandlers.export,
    growthSummary: handleStartupOfficeGrowthSummary,
    loops: handleStartupOfficeLoops,
    receipts: handleStartupOfficeReceipts,
  };
}

module.exports = {
  createStartupOfficeQueryHandlers,
  STARTUP_OFFICE_GROWTH_SUMMARY_QUERY_BUDGET,
  STARTUP_OFFICE_GROWTH_SUMMARY_SELECTS,
};
