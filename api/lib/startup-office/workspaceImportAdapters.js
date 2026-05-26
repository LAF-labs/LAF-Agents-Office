const {
  assertStartupOfficeStorageLimit,
  startupOfficeStorageBytes,
} = require("./planLimits");

const STARTUP_OFFICE_WORKSPACE_IMPORT_LIMIT = 500;
const STARTUP_OFFICE_WORKSPACE_IMPORT_KINDS = Object.freeze([
  "assets",
  "customers",
  "metrics",
  "signals",
]);

function createStartupOfficeWorkspaceImportHandler(deps) {
  const {
    createHTTPError,
    nowISO,
    objectValue,
    readBody,
    requirePermission,
    requireUser,
    safeStartupOfficeRest,
    startupOfficeBetaOpsSnapshot,
    startupOfficeObjectDefinition,
    startupOfficeObjectPayload,
    truncateText,
    writeAuditEvent,
    writeJSON,
  } = deps;

  return async function handleStartupOfficeWorkspaceImport(req, res) {
    const { membership } = await requireUser(req);
    if (req.method !== "POST") throw createHTTPError(405, "method not allowed");
    requirePermission(membership, "memory:promote");

    const { imported, schemaVersion, total } = await importStartupOfficeWorkspaceObjects({
      body: await readBody(req),
      createHTTPError,
      importedAt: nowISO(),
      membership,
      objectValue,
      safeStartupOfficeRest,
      startupOfficeBetaOpsSnapshot,
      startupOfficeObjectDefinition,
      startupOfficeObjectPayload,
      truncateText,
    });
    await writeAuditEvent(
      membership,
      "startup_office.workspace_imported",
      "workspace",
      "operating-objects",
      { imported_count: total, schema_version: schemaVersion },
    );
    writeJSON(res, 200, {
      imported_count: total,
      objects: imported,
      status: "imported",
    });
  };
}

async function importStartupOfficeWorkspaceObjects({
  body = {},
  createHTTPError,
  importedAt,
  membership,
  objectValue,
  safeStartupOfficeRest,
  startupOfficeBetaOpsSnapshot,
  startupOfficeObjectDefinition,
  startupOfficeObjectPayload,
  truncateText,
}) {
  const source = objectValue(body.export) || {};
  const direct = objectValue(body.objects);
  const schemaVersion = truncateText(body.schema_version || source.schema_version || "", 80);
  const payloads = [];
  for (const kind of STARTUP_OFFICE_WORKSPACE_IMPORT_KINDS) {
    const rows = Array.isArray(body[kind])
      ? body[kind]
      : Array.isArray(direct[kind])
        ? direct[kind]
        : Array.isArray(source[kind])
          ? source[kind]
          : [];
    for (const row of rows) {
      payloads.push({
        kind,
        payload: startupOfficeObjectPayload(
          kind,
          membership,
          importObjectBody(kind, objectValue(row), { importedAt, objectValue, schemaVersion }),
        ),
      });
    }
  }
  if (!payloads.length) throw createHTTPError(400, "workspace operating objects are required");
  if (payloads.length > STARTUP_OFFICE_WORKSPACE_IMPORT_LIMIT) {
    throw createHTTPError(413, "workspace import exceeds 500 objects");
  }
  await assertStartupOfficeStorageLimit({
    additionalBytes: startupOfficeStorageBytes(payloads.map((item) => item.payload)),
    createHTTPError,
    membership,
    startupOfficeBetaOpsSnapshot,
  });
  const imported = Object.fromEntries(STARTUP_OFFICE_WORKSPACE_IMPORT_KINDS.map((kind) => [kind, []]));
  for (const item of payloads) {
    const definition = startupOfficeObjectDefinition(item.kind);
    const [row] = await safeStartupOfficeRest(definition.table, {
      method: "POST",
      body: item.payload,
    });
    imported[item.kind].push(definition.public(row));
  }
  return { imported, schemaVersion, total: payloads.length };
}

function importObjectBody(kind, source, { importedAt, objectValue, schemaVersion }) {
  const metadata = {
    ...objectValue(source.metadata),
    imported_at: importedAt,
    imported_from_id: source.id || "",
    imported_from_loop_id: source.loop_id || source.discovery_loop_id || "",
    imported_from_run_id: source.run_id || "",
    imported_from_schema_version: schemaVersion,
    source: "startup-office-workspace-import",
  };
  if (kind === "assets") return { ...source, metadata, run_id: null };
  if (kind === "customers") return { ...source, loop_id: null };
  if (kind === "metrics") return { ...source, metadata };
  if (kind === "signals") return { ...source, loop_id: null, metadata, run_id: null };
  return source;
}

module.exports = {
  STARTUP_OFFICE_WORKSPACE_IMPORT_KINDS,
  STARTUP_OFFICE_WORKSPACE_IMPORT_LIMIT,
  createStartupOfficeWorkspaceImportHandler,
  importStartupOfficeWorkspaceObjects,
};
