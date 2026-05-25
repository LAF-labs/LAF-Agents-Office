const { createStartupOfficeValidation } = require("./validation");
const {
  startupOfficeExportManifest,
} = require("./exportManifest");

function createStartupOfficeQueryHandlers(deps) {
  const {
    createHTTPError,
    companyProfileSnapshot,
    normalizeStartupOfficeCadence,
    normalizeStartupOfficeLoopStatus,
    nowISO,
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
  const exportManifest = startupOfficeExportManifest();

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
    writeJSON(res, 200, {
      approvals: await startupOfficeApprovals(membership.team_id, {
        status: req.query?.status,
        limit: Number(req.query?.limit) || 100,
      }),
    });
  }

  async function handleStartupOfficeReceipts(req, res) {
    const { membership } = await requireUser(req);
    if (req.method !== "GET") throw createHTTPError(405, "method not allowed");
    requirePermission(membership, "workspace:read");
    writeJSON(res, 200, {
      receipts: await startupOfficeReceipts(membership.team_id, {
        limit: Number(req.query?.limit) || 100,
      }),
    });
  }

  async function handleStartupOfficeExport(req, res) {
    const { membership, team, user } = await requireUser(req);
    requirePermission(membership, "workspace:read");
    const [
      auditEvents,
      channelMessages,
      assets,
      artifacts,
      activationEvents,
      customers,
      deletionRequests,
      invites,
      loops,
      memberships,
      metrics,
      notifications,
      orchestrationIntents,
      signals,
      skills,
      supportAccessEvents,
      termsAcceptances,
      runs,
      approvals,
      receipts,
      memoryPages,
      usageEvents,
      wikiArticleIndex,
      wikiWriteRequests,
      betaOps,
      profile,
      workspaceSettingsRows,
    ] = await Promise.all([
      teamRows("audit_events", membership.team_id, {
        select: "id,actor_user_id,action,target_type,target_id,metadata,created_at",
      }),
      teamRows("channel_messages", membership.team_id),
      startupOfficeObjectRows(membership.team_id, "assets", { limit: 1000 }),
      startupOfficeArtifacts(membership.team_id, { limit: 1000 }),
      teamRows("startup_office_activation_events", membership.team_id),
      startupOfficeObjectRows(membership.team_id, "customers", { limit: 1000 }),
      teamRows("startup_office_deletion_requests", membership.team_id),
      teamRows("team_invites", membership.team_id, {
        select: "id,team_id,email,name,role,channel,status,created_by,created_at,expires_at,accepted_at,accepted_by,sent_at,send_status,send_error",
      }),
      startupOfficeLoops(membership.team_id),
      teamRows("memberships", membership.team_id, {
        select: "id,team_id,user_id,role,status,created_at,updated_at,permissions",
      }),
      startupOfficeObjectRows(membership.team_id, "metrics", { limit: 1000 }),
      teamRows("startup_office_notifications", membership.team_id),
      teamRows("orchestration_intents", membership.team_id),
      startupOfficeObjectRows(membership.team_id, "signals", { limit: 1000 }),
      teamRows("skills", membership.team_id),
      teamRows("startup_office_support_access_events", membership.team_id),
      teamRows("startup_office_terms_acceptances", membership.team_id),
      startupOfficeRuns(membership.team_id, { limit: 1000 }),
      startupOfficeApprovals(membership.team_id, { limit: 1000 }),
      startupOfficeReceipts(membership.team_id, { limit: 1000 }),
      startupOfficeRepository().memoryPages(membership.team_id, { limit: 1000 }),
      teamRows("startup_office_usage_events", membership.team_id),
      teamRows("wiki_article_index", membership.team_id, { order: "updated_at.desc" }),
      teamRows("wiki_write_requests", membership.team_id),
      startupOfficeBetaOpsSnapshot(membership.team_id),
      companyProfileSnapshot(membership.team_id, team, user),
      teamRows("workspace_settings", membership.team_id, { limit: 1, order: "updated_at.desc" }),
    ]);
    await deps.recordStartupOfficeExportActivation?.({ membership });
    writeJSON(res, 200, {
      export: {
        activation_events: activationEvents,
        audit_events: auditEvents,
        approvals,
        artifacts,
        assets,
        beta_ops: betaOps,
        billing_documents: betaOps.billing_documents || [],
        channel_messages: channelMessages,
        company_profile: profile,
        customers,
        deletion_requests: deletionRequests,
        export_manifest: exportManifest,
        generated_at: nowISO(),
        loops,
        memory_pages: memoryPages,
        memberships,
        metrics,
        notifications,
        orchestration_intents: orchestrationIntents,
        receipts,
        restore_notes: "Restore into another workspace must preserve team-scoped IDs, loop slugs, approval decisions, receipt traces, memory page slugs, and legal acceptance evidence.",
        runs,
        schema_version: exportManifest.schema_version,
        signals,
        skills,
        support_access_events: supportAccessEvents,
        team,
        team_invites: invites,
        terms_acceptances: termsAcceptances,
        usage_events: usageEvents,
        wiki_article_index: wikiArticleIndex,
        wiki_write_requests: wikiWriteRequests,
        workspace_billing: betaOps.billing,
        workspace_settings: workspaceSettingsRows[0] || null,
      },
    });
  }

  function teamRows(table, teamID, options = {}) {
    const query = {
      limit: String(options.limit || 1000),
      order: options.order || "created_at.desc",
      select: options.select || "*",
      team_id: `eq.${teamID}`,
    };
    return safeStartupOfficeRest(table, { query });
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
    export: handleStartupOfficeExport,
    growthSummary: handleStartupOfficeGrowthSummary,
    loops: handleStartupOfficeLoops,
    receipts: handleStartupOfficeReceipts,
  };
}

module.exports = {
  createStartupOfficeQueryHandlers,
};
