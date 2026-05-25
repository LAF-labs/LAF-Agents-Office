const STARTUP_OFFICE_RECEIPT_MEMORY_PAGE_SLUGS = Object.freeze([
  "loop-receipts",
  "learning-updates",
]);

async function materializeStartupOfficeReceiptMemory({
  approval,
  membership,
  receipt,
  repository,
  run,
}) {
  if (!repository?.memoryPages || !repository?.upsertMemoryPage) return null;
  const currentPages = await repository.memoryPages(membership.team_id, {
    limit: 50,
    status: "approved",
  });
  const pages = nextReceiptMemoryPages({ approval, currentPages, receipt, run });
  const written = [];
  for (const page of pages) {
    written.push(await repository.upsertMemoryPage(membership, page));
  }
  return { pages: written };
}

function nextReceiptMemoryPages({ approval, currentPages, receipt, run }) {
  const createdAt = receipt?.created_at || new Date().toISOString();
  const entry = receiptEntry({ approval, createdAt, receipt, run });
  return [
    appendPage(currentPages, "loop-receipts", "Loop Receipts", entry, {
      summary: `Latest completed receipt: ${receipt?.summary || run?.summary || ""}`,
    }),
    appendPage(currentPages, "learning-updates", "Learning Updates", learningEntry({
      approval,
      createdAt,
      receipt,
      run,
    }), {
      summary: `Latest learning from ${run?.title || run?.objective || "Startup Office run"}`,
    }),
  ].map((page) => ({
    ...page,
    assumptions: [],
    last_verified_at: createdAt,
    provenance: {
      approval_id: approval?.id || null,
      receipt_id: receipt?.id || null,
      run_id: run?.id || receipt?.run_id || null,
      source: "startup_office_receipt",
    },
    sources: [
      {
        approval_id: approval?.id || null,
        receipt_id: receipt?.id || null,
        run_id: run?.id || receipt?.run_id || null,
        type: "startup_office_receipt",
      },
    ],
    status: "approved",
    updated_at: createdAt,
  }));
}

function receiptEntry({ approval, createdAt, receipt, run }) {
  return [
    `## ${createdAt} - ${receipt?.event_type || "run.completed"}`,
    "",
    `- Run: ${run?.id || receipt?.run_id || ""}`,
    `- Approval: ${approval?.id || receipt?.approval_id || ""}`,
    `- Receipt: ${receipt?.id || ""}`,
    `- Outcome: ${run?.status || "completed"}`,
    `- Summary: ${receipt?.summary || run?.summary || ""}`,
  ].join("\n");
}

function learningEntry({ approval, createdAt, receipt, run }) {
  const trace = objectValue(receipt?.trace);
  const memoryPages = Array.isArray(trace.memory_pages) ? trace.memory_pages : [];
  return [
    `## ${createdAt} - ${run?.title || run?.objective || "Completed loop"}`,
    "",
    run?.summary || receipt?.summary || "",
    "",
    `- Run: ${run?.id || receipt?.run_id || ""}`,
    `- Approval: ${approval?.id || receipt?.approval_id || ""}`,
    `- Memory pages updated: ${memoryPages.length ? memoryPages.join(", ") : "none"}`,
  ].join("\n");
}

function appendPage(currentPages, slug, title, entry, options = {}) {
  const current = currentPages.find((page) => page.slug === slug);
  return {
    body: [current?.body || "", entry].filter(Boolean).join("\n\n"),
    slug,
    summary: compact(options.summary || entry),
    title,
  };
}

function compact(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 600);
}

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

module.exports = {
  STARTUP_OFFICE_RECEIPT_MEMORY_PAGE_SLUGS,
  materializeStartupOfficeReceiptMemory,
  nextReceiptMemoryPages,
};
