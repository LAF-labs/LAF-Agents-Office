const { createStartupOfficeValidation } = require("./validation");
const {
  startupOfficePageRequest,
  startupOfficePageResult,
} = require("./pagination");
const { createStartupOfficeExportHandlers } = require("./exportHandlers");
const {
  STARTUP_OFFICE_GROWTH_SUMMARY_QUERY_BUDGET,
  STARTUP_OFFICE_GROWTH_SUMMARY_SELECTS,
  createStartupOfficeGrowthSummaryHandler,
} = require("./growthSummaryHandlers");

function createStartupOfficeQueryHandlers(deps) {
  const {
    createHTTPError,
    normalizeStartupOfficeCadence,
    normalizeStartupOfficeLoopStatus,
    objectValue,
    publicStartupOfficeLoop,
    readBody,
    requirePermission,
    requireUser,
    safeStartupOfficeRest,
    startupOfficeApprovals,
    startupOfficeLoops,
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
  const exportHandlers = createStartupOfficeExportHandlers(deps);
  const growthSummary = createStartupOfficeGrowthSummaryHandler(deps);

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

  return {
    approvals: handleStartupOfficeApprovals,
    export: exportHandlers.export,
    growthSummary,
    loops: handleStartupOfficeLoops,
    receipts: handleStartupOfficeReceipts,
  };
}

module.exports = {
  createStartupOfficeQueryHandlers,
  STARTUP_OFFICE_GROWTH_SUMMARY_QUERY_BUDGET,
  STARTUP_OFFICE_GROWTH_SUMMARY_SELECTS,
};
