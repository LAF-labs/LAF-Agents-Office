const { createStartupOfficeValidation } = require("./validation");
const {
  startupOfficePageRequest,
  startupOfficePageResult,
} = require("./pagination");
const { createStartupOfficeExportHandlers } = require("./exportHandlers");

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
      startupOfficeLoops(membership.team_id),
      startupOfficeRuns(membership.team_id, { limit: 10 }),
      startupOfficeArtifacts(membership.team_id, { limit: 10 }),
      startupOfficeApprovals(membership.team_id, { status: "pending", limit: 10 }),
      startupOfficeReceipts(membership.team_id, { limit: 10 }),
      startupOfficeRepository().memoryPages(membership.team_id, {
        status: "approved",
        limit: 10,
      }),
      startupOfficeObjectSummary(membership.team_id),
      startupOfficeBetaOpsSnapshot(membership.team_id),
      safeStartupOfficeRest("startup_office_notifications", {
        query: {
          limit: "10",
          order: "created_at.desc",
          select: "*",
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
      startupOfficeObjectRows(teamID, "assets", { limit: 5 }),
      startupOfficeObjectRows(teamID, "customers", { limit: 5 }),
      startupOfficeObjectRows(teamID, "metrics", { limit: 50 }),
      startupOfficeObjectRows(teamID, "signals", { limit: 5 }),
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
};
