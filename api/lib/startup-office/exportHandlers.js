const {
  STARTUP_OFFICE_EXPORT_CHUNK_COLLECTIONS,
  STARTUP_OFFICE_EXPORT_CHUNK_LIMIT,
  STARTUP_OFFICE_EXPORT_SCHEMA_VERSION,
} = require("./exportManifest");
const {
  createStartupOfficeExportBundleBuilder,
} = require("./exportBundleBuilder");
const {
  startupOfficePageRequest,
  startupOfficePageResult,
} = require("./pagination");

function createStartupOfficeExportHandlers(deps) {
  const {
    createHTTPError,
    nowISO,
    requirePermission,
    requireUser,
    writeJSON,
  } = deps;
  const exportBuilder = createStartupOfficeExportBundleBuilder(deps);

  async function handleStartupOfficeExport(req, res) {
    const { membership, team, user } = await requireUser(req);
    requirePermission(membership, "workspace:read");
    const chunkCollection = queryValue(req.query?.collection);
    if (chunkCollection) {
      await handleStartupOfficeExportChunk(req, res, membership, chunkCollection);
      return;
    }
    writeJSON(res, 200, {
      export: await exportBuilder.startupOfficeExportBundle({ membership, team, user }),
    });
  }

  async function handleStartupOfficeExportChunk(req, res, membership, collection) {
    const descriptor = STARTUP_OFFICE_EXPORT_CHUNK_COLLECTIONS[collection];
    if (!descriptor) {
      throw httpError(400, `collection must be one of: ${Object.keys(STARTUP_OFFICE_EXPORT_CHUNK_COLLECTIONS).join(", ")}`);
    }
    const page = startupOfficePageRequest(req.query, {
      createHTTPError: httpError,
      defaultLimit: STARTUP_OFFICE_EXPORT_CHUNK_LIMIT,
      maxLimit: STARTUP_OFFICE_EXPORT_CHUNK_LIMIT,
    });
    const rows = await exportBuilder.startupOfficeExportChunkRows(
      collection,
      membership.team_id,
      page,
      descriptor,
    );
    const { items, pagination } = startupOfficePageResult(rows, page, descriptor.cursor_field);
    writeJSON(res, 200, {
      export_chunk: {
        collection,
        cursor_field: descriptor.cursor_field,
        generated_at: nowISO(),
        items,
        pagination,
        schema_version: STARTUP_OFFICE_EXPORT_SCHEMA_VERSION,
        source_table: descriptor.source_table,
      },
    });
  }

  function queryValue(value) {
    return String(Array.isArray(value) ? value[0] : value || "").trim();
  }

  function httpError(status, message) {
    if (typeof createHTTPError === "function") return createHTTPError(status, message);
    const err = new Error(message);
    err.status = status;
    return err;
  }

  return { export: handleStartupOfficeExport };
}

module.exports = { createStartupOfficeExportHandlers };
