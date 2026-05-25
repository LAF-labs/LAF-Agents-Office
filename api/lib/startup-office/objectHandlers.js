const { STARTUP_OFFICE_PAYLOAD_LIMITS, assertStartupOfficePayloadSize } = require("./payloadLimits");
const {
  assertStartupOfficeStorageLimit,
  startupOfficeStorageBytes,
} = require("./planLimits");
const {
  startupOfficePageRequest,
  startupOfficePageResult,
} = require("./pagination");
const { startupOfficeSignalType } = require("./objectInvariants");
const { startupOfficeObjectListOptions } = require("./objectQueries");

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
    startupOfficeBetaOpsSnapshot,
    truncateText,
    writeAuditEvent,
    writeJSON,
  } = deps;

  async function handleStartupOfficeObjectCollection(req, res, kind) {
    const { membership } = await requireUser(req);
    const definition = startupOfficeObjectDefinition(kind);
    if (req.method === "GET") {
      requirePermission(membership, "workspace:read");
      const page = startupOfficePageRequest(req.query, { createHTTPError });
      const options = startupOfficeObjectListOptions(kind, req.query, { createHTTPError, page });
      const rows = await startupOfficeObjectRows(membership.team_id, kind, options);
      const { items, pagination } = startupOfficePageResult(rows, page);
      writeJSON(res, 200, { [definition.responseKey]: items, pagination });
      return;
    }
    if (req.method !== "POST") throw createHTTPError(405, "method not allowed");
    requirePermission(membership, "memory:write_draft");
    const body = await readBody(req);
    assertObjectPayloadLimits({ body, createHTTPError, kind });
    const payload = startupOfficeObjectPayload(kind, membership, body);
    await enforceStorageLimit({ createHTTPError, membership, payload });
    const [row] = await safeStartupOfficeRest(definition.table, {
      method: "POST",
      body: payload,
    });
    const item = definition.public(row);
    await writeAuditEvent(membership, `startup_office.${kind}.created`, kind, item?.id || "");
    writeJSON(res, 200, { [definition.singularKey]: item });
  }

  async function handleStartupOfficeObjectItem(req, res, kind, objectID) {
    const { membership } = await requireUser(req);
    if (req.method !== "PATCH" && req.method !== "DELETE") {
      throw createHTTPError(405, "method not allowed");
    }
    requirePermission(membership, "memory:write_draft");
    const definition = startupOfficeObjectDefinition(kind);
    if (req.method === "DELETE") {
      const [row] = await safeStartupOfficeRest(definition.table, {
        method: "DELETE",
        query: {
          id: `eq.${objectID}`,
          team_id: `eq.${membership.team_id}`,
        },
      });
      await writeAuditEvent(membership, `startup_office.${kind}.deleted`, kind, objectID);
      writeJSON(res, 200, {
        [definition.singularKey]: row ? definition.public(row) : null,
        ok: true,
      });
      return;
    }
    const body = await readBody(req);
    assertObjectPayloadLimits({ body, createHTTPError, kind });
    const patch = startupOfficeObjectPatch(kind, body);
    await enforceStorageLimit({ createHTTPError, membership, payload: patch });
    const [row] = await safeStartupOfficeRest(definition.table, {
      method: "PATCH",
      query: {
        id: `eq.${objectID}`,
        team_id: `eq.${membership.team_id}`,
      },
      body: patch,
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
      assertStartupOfficePayloadSize({
        createHTTPError,
        label: "artifact asset body",
        maxBytes: STARTUP_OFFICE_PAYLOAD_LIMITS.assetBodyBytes,
        value: artifact.content || "",
      });
      const payload = {
        body: truncateText(artifact.content || "", 30000),
        created_by: membership.user_id,
        kind: truncateText(body.kind || artifact.kind || "document", 80),
        metadata: { artifact_id: artifact.id, source: "artifact" },
        name: truncateText(body.name || artifact.title || "Startup Office asset", 180),
        run_id: artifact.run_id || null,
        team_id: membership.team_id,
        updated_at: nowISO(),
      };
      await enforceStorageLimit({ createHTTPError, membership, payload });
      const [asset] = await safeStartupOfficeRest("startup_office_assets", {
        method: "POST",
        body: payload,
      });
      await writeAuditEvent(membership, "startup_office.asset.created_from_artifact", "artifact", artifact.id);
      writeJSON(res, 200, { asset: publicStartupOfficeAsset(asset) });
      return;
    }
    if (action === "record-signal") {
      const runID = artifact.run_id || body.run_id || null;
      const payload = {
        body: truncateText(body.body || artifact.content || "", 6000),
        created_by: membership.user_id,
        loop_id: body.loop_id || null,
        metadata: { artifact_id: artifact.id, run_id: runID, source: "artifact" },
        run_id: runID,
        signal_type: startupOfficeSignalType(body.signal_type || body.type || "internal"),
        source: truncateText(body.source || "artifact", 120),
        status: "new",
        team_id: membership.team_id,
        title: truncateText(body.title || artifact.title || "Artifact signal", 180),
        updated_at: nowISO(),
      };
      await enforceStorageLimit({ createHTTPError, membership, payload });
      const [signal] = await safeStartupOfficeRest("startup_office_signals", {
        method: "POST",
        body: payload,
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

  async function enforceStorageLimit({ createHTTPError, membership, payload }) {
    await assertStartupOfficeStorageLimit({
      additionalBytes: startupOfficeStorageBytes(payload),
      createHTTPError,
      membership,
      startupOfficeBetaOpsSnapshot,
    });
  }
}

function assertObjectPayloadLimits({ body, createHTTPError, kind }) {
  if (kind !== "assets") return;
  if (body.body !== undefined) {
    assertStartupOfficePayloadSize({
      createHTTPError,
      label: "asset body",
      maxBytes: STARTUP_OFFICE_PAYLOAD_LIMITS.assetBodyBytes,
      value: body.body,
    });
  }
  if (body.metadata !== undefined) {
    assertStartupOfficePayloadSize({
      createHTTPError,
      label: "asset metadata",
      maxBytes: STARTUP_OFFICE_PAYLOAD_LIMITS.assetBodyBytes,
      value: body.metadata,
    });
  }
}

module.exports = {
  createStartupOfficeObjectHandlers,
};
