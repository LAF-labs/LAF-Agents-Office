function createHostedMemoryHandlers(deps) {
  const {
    createHTTPError,
    objectValue,
    readBody,
    requirePermission,
    requireUser,
    shortID,
    slugify,
    startupOfficeRepository,
    truncateText,
    writeAuditEvent,
    writeJSON,
  } = deps;

  async function handleHostedMemory(req, res) {
    const { membership } = await requireUser(req);
    const repository = startupOfficeRepository();
    if (req.method === "GET") {
      requirePermission(membership, "workspace:read");
      const pages = await repository.memoryPages(membership.team_id, {
        limit: Number(req.query?.limit) || 100,
        status: "approved",
      });
      writeJSON(res, 200, {
        memory: memoryMapFromPages(pages),
        namespaces: namespacesFromPages(pages),
        pages,
      });
      return;
    }
    if (req.method === "POST") {
      requirePermission(membership, "memory:write_draft");
      const note = memoryNotePayload(await readBody(req));
      const page = await repository.upsertMemoryPage(membership, note);
      await writeAuditEvent(membership, "memory.note_saved", "memory_page", page?.id || note.slug, {
        key: note.provenance.key,
        namespace: note.provenance.namespace,
      });
      writeJSON(res, 200, { memory_page: page, ok: true });
      return;
    }
    throw createHTTPError(405, "method not allowed");
  }

  function memoryNotePayload(body) {
    const value = objectValue(body);
    const namespace = truncateText(String(value.namespace || "human-notes").trim() || "human-notes", 80);
    const key = truncateText(String(value.key || `note-${shortID()}`).trim() || `note-${shortID()}`, 120);
    const note = truncateText(value.value ?? value.body ?? value.note ?? "", 30000);
    if (!note) throw createHTTPError(400, "memory value is required");
    const slug = truncateText(slugify(`${namespace}-${key}`) || `memory-${shortID()}`, 120);
    return {
      body: note,
      provenance: {
        key,
        namespace,
        source: "hosted_memory_endpoint",
      },
      slug,
      status: "approved",
      summary: truncateText(note, 300),
      title: truncateText(`${namespace}: ${key}`, 180),
    };
  }

  function memoryMapFromPages(pages) {
    const memory = {};
    for (const page of pages || []) {
      const provenance = objectValue(page.provenance);
      const namespace = provenance.namespace || "startup-office";
      const key = provenance.key || page.slug || page.id;
      if (!memory[namespace]) memory[namespace] = {};
      memory[namespace][key] = page.body || page.summary || "";
    }
    return memory;
  }

  function namespacesFromPages(pages) {
    return [...new Set((pages || []).map((page) =>
      objectValue(page.provenance).namespace || "startup-office",
    ))].sort();
  }

  return {
    memory: handleHostedMemory,
  };
}

module.exports = {
  createHostedMemoryHandlers,
};
