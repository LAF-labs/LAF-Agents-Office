function createHostedOrchestrationHandlers(deps) {
  const {
    createHTTPError,
    nowISO,
    randomID,
    readBody,
    requirePermission,
    requireUser,
    rest,
    writeAuditEvent,
    writeJSON,
  } = deps;

  async function handleOrchestrationIntent(req, res) {
    const { membership } = await requireUser(req);
    const body = await readBody(req);
    const message = String(body.message || "").trim();
    if (!message) throw createHTTPError(400, "message is required");
    const intent = buildOrchestrationIntent({ nowISO, randomID });
    for (const permission of intent.required_permissions) {
      requirePermission(membership, permission);
    }
    await persistOrchestrationIntent(membership, intent);
    await writeAuditEvent(membership, "orchestration.intent", "intent", intent.id, {
      type: intent.type,
    });
    writeJSON(res, 200, { intent });
  }

  async function persistOrchestrationIntent(membership, intent) {
    if (!intent.requires_confirmation || intent.status !== "pending") return null;
    const [row] = await rest("orchestration_intents", {
      method: "POST",
      body: {
        id: intent.id,
        team_id: membership.team_id,
        requested_by: membership.user_id,
        type: intent.type,
        risk: intent.risk || "low",
        summary: intent.summary || "",
        proposed_actions: Array.isArray(intent.proposed_actions) ? intent.proposed_actions : [],
        required_permissions: Array.isArray(intent.required_permissions)
          ? intent.required_permissions
          : [],
        status: "pending",
        created_at: intent.created_at || nowISO(),
      },
    });
    return row || null;
  }

  async function handleOrchestrationConfirm(req, res) {
    const { membership } = await requireUser(req);
    const body = await readBody(req);
    const intentID = String(body.intent_id || "").trim();
    if (!intentID) {
      throw createHTTPError(400, "intent_id is required");
    }
    const [intent] = await rest("orchestration_intents", {
      query: {
        id: `eq.${intentID}`,
        select: "*",
        team_id: `eq.${membership.team_id}`,
        limit: "1",
      },
    });
    if (!intent) {
      throw createHTTPError(404, "orchestration intent not found");
    }
    if (intent.status !== "pending") {
      throw createHTTPError(409, `orchestration intent is ${intent.status}`);
    }
    if (!Array.isArray(intent.proposed_actions) || intent.proposed_actions.length === 0) {
      throw createHTTPError(400, "orchestration intent has no proposed actions");
    }
    for (const permission of intent.required_permissions || []) {
      requirePermission(membership, permission);
    }
    const applied = [];
    for (const action of intent.proposed_actions) {
      applied.push(await applyOrchestrationAction(membership, action));
    }
    const confirmationID = randomID();
    await rest("orchestration_intents", {
      method: "PATCH",
      query: {
        id: `eq.${intent.id}`,
        team_id: `eq.${membership.team_id}`,
      },
      body: {
        confirmed_at: nowISO(),
        confirmation_id: confirmationID,
        status: "applied",
      },
    });
    await writeAuditEvent(membership, "orchestration.confirmed", "intent", intent.id, {
      confirmation_id: confirmationID,
      type: intent.type,
    });
    writeJSON(res, 200, {
      confirmation_id: confirmationID,
      intent_id: intent.id,
      applied,
      status: "applied",
    });
  }

  return {
    orchestrationConfirm: handleOrchestrationConfirm,
    orchestrationIntent: handleOrchestrationIntent,
  };

  async function applyOrchestrationAction(membership, action) {
    const method = String(action?.method || "").toUpperCase();
    void membership;
    if (method !== "POST") throw createHTTPError(400, "unsupported orchestration action");
    throw createHTTPError(400, "unsupported orchestration action");
  }
}

function buildOrchestrationIntent({ nowISO, randomID }) {
  return {
    id: randomID(),
    type: "chat",
    risk: "low",
    summary: "Route as normal home chat",
    proposed_actions: [],
    required_permissions: [],
    status: "routed",
    requires_confirmation: false,
    created_at: nowISO(),
  };
}

module.exports = {
  buildOrchestrationIntent,
  createHostedOrchestrationHandlers,
};
