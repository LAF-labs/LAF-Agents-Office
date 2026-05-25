function createHostedAuditHandlers(deps) {
  const {
    clamp,
    createHTTPError,
    requirePermission,
    requireUser,
    rest,
    writeJSON,
  } = deps;

  async function handleAuditEvents(req, res) {
    const { membership } = await requireUser(req);
    requirePermission(membership, "audit:read");
    const limit = clamp(Number(req.query?.limit) || 100, 1, 500);
    const beforeRaw = String(req.query?.before || "").trim();
    const query = {
      order: "created_at.desc",
      select: "*",
      team_id: `eq.${membership.team_id}`,
      limit: String(limit),
    };
    if (beforeRaw) query.created_at = `lt.${parseBeforeTimestamp(beforeRaw)}`;
    const rows = await rest("audit_events", { query });
    writeJSON(res, 200, { events: (rows || []).map(publicAuditEvent) });
  }

  function parseBeforeTimestamp(value) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw createHTTPError(400, "before must be an ISO-8601 timestamp");
    }
    return parsed.toISOString();
  }

  function publicAuditEvent(row) {
    return {
      action: row.action,
      actor_user_id: row.actor_user_id,
      created_at: row.created_at,
      id: row.id,
      metadata: row.metadata || {},
      target_id: row.target_id || "",
      target_type: row.target_type || "",
    };
  }

  return {
    auditEvents: handleAuditEvents,
  };
}

module.exports = {
  createHostedAuditHandlers,
};
