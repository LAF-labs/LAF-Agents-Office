function createStartupOfficeLifecycleHandlers(deps) {
  const {
    createHTTPError,
    nowISO,
    readBody,
    requireAdminRole,
    requireUser,
    safeStartupOfficeRest,
    truncateText,
    writeAuditEvent,
    writeJSON,
  } = deps;

  async function handleSupportAccess(req, res, eventID = "", action = "") {
    const { membership } = await requireUser(req);
    requireAdminRole(membership, "owner or admin role required for support access");
    if (req.method === "GET") {
      writeJSON(res, 200, {
        events: await supportAccessEvents(membership.team_id),
        policy: {
          explicit: true,
          logged: true,
          visible_to_owner: true,
        },
      });
      return;
    }
    if (req.method !== "POST") throw createHTTPError(405, "method not allowed");
    const body = await readBody(req);
    const eventType = action === "revoke" ? "revoked" : action === "log-access" ? "accessed" : "granted";
    const [event] = await safeStartupOfficeRest("startup_office_support_access_events", {
      method: "POST",
      body: {
        created_by: membership.user_id,
        event_type: eventType,
        expires_at: body.expires_at || null,
        metadata: {
          parent_event_id: eventID || "",
          visible_to_owner: true,
        },
        reason: truncateText(body.reason || body.note || "", 1000),
        support_user_id: body.support_user_id || null,
        team_id: membership.team_id,
      },
    });
    await writeAuditEvent(membership, `startup_office.support_access.${eventType}`, "team", membership.team_id, {
      event_id: event?.id || "",
      parent_event_id: eventID || "",
    });
    writeJSON(res, 200, { event, status: eventType });
  }

  async function handleDeletionRequest(req, res) {
    const { membership } = await requireUser(req);
    requireAdminRole(membership, "owner or admin role required for deletion");
    if (req.method === "GET") {
      writeJSON(res, 200, {
        deletion_requests: await deletionRequests(membership.team_id),
      });
      return;
    }
    if (req.method !== "POST") throw createHTTPError(405, "method not allowed");
    const body = await readBody(req);
    if (String(body.confirmation || "").trim() !== "DELETE STARTUP OFFICE") {
      throw createHTTPError(400, "confirmation must be DELETE STARTUP OFFICE");
    }
    const [request] = await safeStartupOfficeRest("startup_office_deletion_requests", {
      method: "POST",
      body: {
        created_at: nowISO(),
        metadata: { export_before_delete: body.export_before_delete !== false },
        reason: truncateText(body.reason || "", 1000),
        requested_by: membership.user_id,
        status: "queued",
        team_id: membership.team_id,
      },
    });
    await writeAuditEvent(membership, "startup_office.deletion_requested", "team", membership.team_id, {
      deletion_request_id: request?.id || "",
    });
    writeJSON(res, 202, {
      deletion_request: request,
      status: "queued",
    });
  }

  function supportAccessEvents(teamID) {
    return safeStartupOfficeRest("startup_office_support_access_events", {
      query: {
        limit: "50",
        order: "created_at.desc",
        select: "*",
        team_id: `eq.${teamID}`,
      },
    });
  }

  function deletionRequests(teamID) {
    return safeStartupOfficeRest("startup_office_deletion_requests", {
      query: {
        limit: "20",
        order: "created_at.desc",
        select: "*",
        team_id: `eq.${teamID}`,
      },
    });
  }

  return {
    deletionRequest: handleDeletionRequest,
    supportAccess: handleSupportAccess,
  };
}

module.exports = {
  createStartupOfficeLifecycleHandlers,
};
