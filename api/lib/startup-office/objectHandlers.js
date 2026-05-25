function createStartupOfficeObjectHandlers(deps) {
  const {
    createHTTPError,
    nowISO,
    publicStartupOfficeAsset,
    publicStartupOfficeSignal,
    readBody,
    requirePermission,
    requireUser,
    safeStartupOfficeRest,
    startupOfficeObjectDefinition,
    startupOfficeObjectPatch,
    startupOfficeObjectPayload,
    startupOfficeObjectRows,
    startupOfficeRepository,
    truncateText,
    writeAuditEvent,
    writeJSON,
  } = deps;

  async function handleStartupOfficeObjectCollection(req, res, kind) {
    const { membership } = await requireUser(req);
    const definition = startupOfficeObjectDefinition(kind);
    if (req.method === "GET") {
      requirePermission(membership, "workspace:read");
      const rows = await startupOfficeObjectRows(membership.team_id, kind, {
        limit: Number(req.query?.limit) || 100,
        status: req.query?.status,
      });
      writeJSON(res, 200, { [definition.responseKey]: rows });
      return;
    }
    if (req.method !== "POST") throw createHTTPError(405, "method not allowed");
    requirePermission(membership, "memory:write_draft");
    const body = await readBody(req);
    const [row] = await safeStartupOfficeRest(definition.table, {
      method: "POST",
      body: startupOfficeObjectPayload(kind, membership, body),
    });
    const item = definition.public(row);
    await writeAuditEvent(membership, `startup_office.${kind}.created`, kind, item?.id || "");
    writeJSON(res, 200, { [definition.singularKey]: item });
  }

  async function handleStartupOfficeObjectItem(req, res, kind, objectID) {
    const { membership } = await requireUser(req);
    if (req.method !== "PATCH") throw createHTTPError(405, "method not allowed");
    requirePermission(membership, "memory:write_draft");
    const definition = startupOfficeObjectDefinition(kind);
    const body = await readBody(req);
    const [row] = await safeStartupOfficeRest(definition.table, {
      method: "PATCH",
      query: {
        id: `eq.${objectID}`,
        team_id: `eq.${membership.team_id}`,
      },
      body: startupOfficeObjectPatch(kind, body),
    });
    const item = definition.public(row);
    await writeAuditEvent(membership, `startup_office.${kind}.updated`, kind, objectID);
    writeJSON(res, 200, { [definition.singularKey]: item });
  }

  async function handleStartupOfficeArtifactObjectAction(req, res, artifactID, action) {
    const { membership } = await requireUser(req);
    requirePermission(membership, "memory:write_draft");
    const artifact = await startupOfficeRepository().findArtifact(membership.team_id, artifactID);
    if (!artifact) throw createHTTPError(404, "artifact not found");
    const body = await readBody(req);
    if (action === "save-as-asset") {
      const [asset] = await safeStartupOfficeRest("startup_office_assets", {
        method: "POST",
        body: {
          body: truncateText(artifact.content || "", 30000),
          created_by: membership.user_id,
          kind: truncateText(body.kind || artifact.kind || "document", 80),
          metadata: {
            artifact_id: artifact.id,
            source: "artifact",
          },
          name: truncateText(body.name || artifact.title || "Startup Office asset", 180),
          run_id: artifact.run_id || null,
          team_id: membership.team_id,
          updated_at: nowISO(),
        },
      });
      await writeAuditEvent(membership, "startup_office.asset.created_from_artifact", "artifact", artifact.id);
      writeJSON(res, 200, { asset: publicStartupOfficeAsset(asset) });
      return;
    }
    if (action === "record-signal") {
      const [signal] = await safeStartupOfficeRest("startup_office_signals", {
        method: "POST",
        body: {
          body: truncateText(body.body || artifact.content || "", 6000),
          created_by: membership.user_id,
          metadata: {
            artifact_id: artifact.id,
            run_id: artifact.run_id || null,
            source: "artifact",
          },
          source: truncateText(body.source || "artifact", 120),
          status: "new",
          team_id: membership.team_id,
          title: truncateText(body.title || artifact.title || "Artifact signal", 180),
          updated_at: nowISO(),
        },
      });
      await writeAuditEvent(membership, "startup_office.signal.created_from_artifact", "artifact", artifact.id);
      writeJSON(res, 200, { signal: publicStartupOfficeSignal(signal) });
      return;
    }
    throw createHTTPError(400, "unsupported artifact action");
  }

  return {
    artifactObjectAction: handleStartupOfficeArtifactObjectAction,
    objectCollection: handleStartupOfficeObjectCollection,
    objectItem: handleStartupOfficeObjectItem,
  };
}

module.exports = {
  createStartupOfficeObjectHandlers,
};
