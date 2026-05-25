const {
  STARTUP_OFFICE_EXPORT_ROW_LIMIT,
  startupOfficeExportLimitReport,
  startupOfficeExportManifest,
} = require("./exportManifest");

function createStartupOfficeExportHandlers(deps) {
  const {
    companyProfileSnapshot,
    nowISO,
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
    writeJSON,
  } = deps;
  const exportManifest = startupOfficeExportManifest();

  async function handleStartupOfficeExport(req, res) {
    const { membership, team, user } = await requireUser(req);
    requirePermission(membership, "workspace:read");
    const [
      auditEvents, channelMessages, assets, artifacts, activationEvents,
      customers, deletionRequests, invites, loops, memberships, metrics,
      notifications, orchestrationIntents, signals, skills, supportAccessEvents,
      termsAcceptances, runs, approvals, receipts, memoryPages, usageEvents,
      wikiArticleIndex, wikiWriteRequests, betaOps, profile, workspaceSettingsRows,
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
    const exportBundle = {
      activation_events: activationEvents, audit_events: auditEvents, approvals,
      artifacts, assets, beta_ops: betaOps,
      billing_documents: betaOps.billing_documents || [],
      channel_messages: channelMessages, company_profile: profile, customers,
      deletion_requests: deletionRequests, export_manifest: exportManifest,
      generated_at: nowISO(), loops, memory_pages: memoryPages, memberships,
      metrics, notifications, orchestration_intents: orchestrationIntents, receipts,
      restore_notes: "Restore into another workspace must preserve team-scoped IDs, loop slugs, approval decisions, receipt traces, memory page slugs, and legal acceptance evidence.",
      runs, schema_version: exportManifest.schema_version, signals, skills,
      support_access_events: supportAccessEvents, team, team_invites: invites,
      terms_acceptances: termsAcceptances, usage_events: usageEvents,
      wiki_article_index: wikiArticleIndex, wiki_write_requests: wikiWriteRequests,
      workspace_billing: betaOps.billing, workspace_settings: workspaceSettingsRows[0] || null,
    };
    exportBundle.export_limits = startupOfficeExportLimitReport(exportBundle);
    writeJSON(res, 200, { export: exportBundle });
  }

  function teamRows(table, teamID, options = {}) {
    return safeStartupOfficeRest(table, { query: {
      limit: String(options.limit || STARTUP_OFFICE_EXPORT_ROW_LIMIT),
      order: options.order || "created_at.desc",
      select: options.select || "*",
      team_id: `eq.${teamID}`,
    } });
  }

  return { export: handleStartupOfficeExport };
}

module.exports = { createStartupOfficeExportHandlers };
