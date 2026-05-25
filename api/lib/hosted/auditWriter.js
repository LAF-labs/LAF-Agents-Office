function createHostedAuditWriter(deps = {}) {
  const createHTTPError = deps.createHTTPError || defaultHTTPError;
  const redactSensitiveValue = deps.redactSensitiveValue || ((value) => value);
  const rest = deps.rest;

  async function writeAuditEvent(membership, action, targetType, targetID, metadata = {}, options = {}) {
    return await writeTeamAuditEvent(
      membership?.team_id,
      membership?.user_id,
      action,
      targetType,
      targetID,
      metadata,
      options,
    );
  }

  async function writeTeamAuditEvent(
    teamID,
    actorUserID,
    action,
    targetType,
    targetID,
    metadata = {},
    options = {},
  ) {
    if (!teamID) return null;
    try {
      const [event] = await rest("audit_events", {
        method: "POST",
        body: {
          action,
          actor_user_id: actorUserID || null,
          metadata: redactSensitiveValue(metadata),
          target_id: targetID || "",
          target_type: targetType || "",
          team_id: teamID,
        },
      });
      return event;
    } catch {
      if (options.required) throw createHTTPError(500, "audit write failed");
      return null;
    }
  }

  return {
    writeAuditEvent,
    writeTeamAuditEvent,
  };
}

function defaultHTTPError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

module.exports = {
  createHostedAuditWriter,
};
