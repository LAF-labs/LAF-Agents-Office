const STARTUP_OFFICE_MEMORY_IMPORT_LIMIT = 200;

function createStartupOfficeImportHandlers(deps) {
  const {
    createHTTPError,
    nowISO,
    objectValue,
    readBody,
    requirePermission,
    requireUser,
    startupOfficeRepository,
    truncateText,
    writeAuditEvent,
    writeJSON,
  } = deps;

  async function handleStartupOfficeMemoryImport(req, res) {
    const { membership } = await requireUser(req);
    if (req.method !== "POST") throw createHTTPError(405, "method not allowed");
    requirePermission(membership, "memory:promote");

    const body = await readBody(req);
    const importedAt = nowISO();
    const { pages, schemaVersion } = importMemoryPagesFromBody(body);
    if (pages.length === 0) throw createHTTPError(400, "memory_pages is required");
    if (pages.length > STARTUP_OFFICE_MEMORY_IMPORT_LIMIT) {
      throw createHTTPError(413, "memory import exceeds 200 pages");
    }

    const imported = [];
    for (const page of pages) {
      imported.push(
        await startupOfficeRepository().upsertMemoryPage(
          membership,
          normalizeImportedMemoryPage({
            importedAt,
            objectValue,
            page,
            schemaVersion,
            truncateText,
          }),
        ),
      );
    }

    await writeAuditEvent(
      membership,
      "startup_office.memory_imported",
      "memory",
      "company-memory",
      {
        imported_count: imported.length,
        schema_version: schemaVersion,
      },
    );
    writeJSON(res, 200, {
      imported_count: imported.length,
      memory_pages: imported,
      status: "imported",
    });
  }

  return {
    memoryImport: handleStartupOfficeMemoryImport,
  };

  function importMemoryPagesFromBody(body = {}) {
    const exportBundle = objectValue(body.export);
    const pages = Array.isArray(body.memory_pages)
      ? body.memory_pages
      : Array.isArray(exportBundle.memory_pages)
        ? exportBundle.memory_pages
        : [];
    return {
      pages,
      schemaVersion: truncateText(
        body.schema_version || exportBundle.schema_version || "",
        80,
      ),
    };
  }

  function normalizeImportedMemoryPage({
    importedAt,
    objectValue,
    page,
    schemaVersion,
    truncateText,
  }) {
    const source = objectValue(page);
    const slug = truncateText(String(source.slug || "").trim(), 120);
    if (!slug) throw createHTTPError(400, "memory page slug is required");
    return {
      assumptions: Array.isArray(source.assumptions) ? source.assumptions : [],
      body: source.body || "",
      last_verified_at: source.last_verified_at || null,
      provenance: {
        ...objectValue(source.provenance),
        imported_at: importedAt,
        imported_from_id: source.id || "",
        imported_from_schema_version: schemaVersion,
        source: "startup-office-memory-import",
      },
      slug,
      sources: Array.isArray(source.sources) ? source.sources : [],
      status: "approved",
      summary: source.summary || "",
      title: source.title || slug,
      updated_at: importedAt,
    };
  }
}

module.exports = {
  STARTUP_OFFICE_MEMORY_IMPORT_LIMIT,
  createStartupOfficeImportHandlers,
};
