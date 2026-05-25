const CANONICAL_MEMORY_PAGES = Object.freeze([
  { slug: "company-profile", title: "Company Profile" },
  { slug: "icp", title: "ICP" },
  { slug: "offer", title: "Offer" },
  { slug: "validation-log", title: "Validation Log" },
  { slug: "customer-discovery-log", title: "Customer Discovery Log" },
  { slug: "decisions", title: "Decisions" },
  { slug: "risks", title: "Risks" },
]);
const CONFLICT_CHECKED_MEMORY_SLUGS = new Set(["company-profile", "icp", "offer"]);

function startupOfficeWikiPromotionDraft({ artifact, context, output }) {
  return {
    artifact_id: artifact?.id || null,
    body: [
      `# ${context.loop?.name || "Startup Office"} Memory Draft`,
      "",
      output?.summary || artifact?.title || "",
      "",
      "## Provenance",
      `- Run: ${context.run?.id || ""}`,
      `- Artifact: ${artifact?.id || ""}`,
      "- Status: pending founder approval",
    ].join("\n"),
    source: "startup_office_run",
    title: `${context.loop?.name || "Startup Office"} Memory Draft`,
  };
}

function startupOfficeMemoryPromotionPreview({
  approval,
  artifact,
  currentPages = [],
  profile,
  run,
}) {
  const output = objectValue(artifact?.metadata?.structured_output);
  const quality = objectValue(artifact?.metadata?.quality);
  const sources = arrayValue(output.sources);
  const assumptions = arrayValue(output.assumptions);
  const nowEntry = [
    `## ${new Date().toISOString()}`,
    run?.summary || output.summary || artifact?.title || "",
    "",
    `- Run: ${run?.id || ""}`,
    `- Artifact: ${artifact?.id || ""}`,
    `- Approval: ${approval?.id || ""}`,
  ].join("\n");
  const pages = [
    page("company-profile", "Company Profile", profileSummary(profile), [
      `Name: ${profile?.name || ""}`,
      `Stage: ${profile?.stage || ""}`,
      `Priority: ${profile?.priority || profile?.goals || ""}`,
    ].join("\n")),
    page("icp", "ICP", profile?.icp || output.customer_segment || "", profile?.icp || output.customer_segment || ""),
    page("offer", "Offer", profile?.offer || "", profile?.offer || ""),
    appendPage(currentPages, "validation-log", "Validation Log", nowEntry),
    appendPage(
      currentPages,
      "customer-discovery-log",
      "Customer Discovery Log",
      output.customer_segment
        ? [`## Segment Update`, output.customer_segment, "", nowEntry].join("\n")
        : nowEntry,
    ),
    appendPage(
      currentPages,
      "decisions",
      "Decisions",
      [`## Approved Artifact`, approval?.title || artifact?.title || "", nowEntry].join("\n"),
    ),
    appendPage(
      currentPages,
      "risks",
      "Risks",
      arrayValue(output.risks).length
        ? [`## Run Risks`, ...arrayValue(output.risks).map((risk) => `- ${risk}`)].join("\n")
        : `Risk level: ${quality.risk_level || approval?.risk_level || "medium"}`,
    ),
  ];
  return pages.map((item) => ({
    ...item,
    assumptions,
    last_verified_at: null,
    provenance: {
      approval_id: approval?.id || null,
      artifact_id: artifact?.id || null,
      run_id: run?.id || null,
      source: "startup_office_approval",
    },
    sources,
    status: "approved",
  }));
}

function buildStartupOfficeMemoryDiff({ approval = null, currentPages = [], nextPages = [] }) {
  const currentBySlug = new Map(currentPages.map((page) => [page.slug, page]));
  const changed_pages = nextPages
    .filter((page) => {
      const current = currentBySlug.get(page.slug);
      return !current || current.summary !== page.summary || current.body !== page.body;
    })
    .map((page) => {
      const current = currentBySlug.get(page.slug);
      return {
        after_summary: page.summary || "",
        before_summary: current?.summary || "",
        slug: page.slug,
        title: page.title,
      };
    });
  const conflicts = memoryDiffConflicts({ approval, changedPages: changed_pages });
  return {
    changed_pages,
    conflicts,
    has_unresolved_conflicts: conflicts.some(
      (conflict) => conflict.resolution_status !== "founder_approved",
    ),
    page_count: nextPages.length,
  };
}

async function applyStartupOfficeMemoryPromotion({
  approval,
  artifact,
  membership,
  profile,
  repository,
  run,
}) {
  const currentPages = await repository.memoryPages(membership.team_id, {
    status: "approved",
    limit: 50,
  });
  const nextPages = startupOfficeMemoryPromotionPreview({
    approval,
    artifact,
    currentPages,
    profile,
    run,
  });
  const written = [];
  const diff = buildStartupOfficeMemoryDiff({ approval, currentPages, nextPages });
  assertStartupOfficeMemoryConflictsResolved({ approval, diff });
  for (const nextPage of nextPages) {
    written.push(await repository.upsertMemoryPage(membership, nextPage));
  }
  return {
    diff,
    pages: written,
  };
}

function memoryDiffConflicts({ approval, changedPages }) {
  return changedPages
    .filter(
      (page) =>
        CONFLICT_CHECKED_MEMORY_SLUGS.has(page.slug) &&
        page.before_summary &&
        page.after_summary &&
        normalizeForConflict(page.before_summary) !== normalizeForConflict(page.after_summary),
    )
    .map((page) => ({
      after_summary: page.after_summary,
      before_summary: page.before_summary,
      resolution_required: true,
      resolution_status: founderApproved(approval)
        ? "founder_approved"
        : "founder_approval_required",
      slug: page.slug,
      title: page.title || page.slug,
    }));
}

function assertStartupOfficeMemoryConflictsResolved({ approval, diff }) {
  if (!diff?.has_unresolved_conflicts) return;
  if (founderApproved(approval)) return;
  const err = new Error("memory conflicts require founder approval before promotion");
  err.status = 409;
  err.details = { conflicts: diff.conflicts || [] };
  throw err;
}

function founderApproved(approval) {
  return approval?.status === "approved" && Boolean(approval.decided_by || approval.decided_at);
}

function normalizeForConflict(value) {
  return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function appendPage(currentPages, slug, title, entry) {
  const current = currentPages.find((page) => page.slug === slug);
  const body = [current?.body || "", entry].filter(Boolean).join("\n\n");
  return page(slug, title, compact(entry), body);
}

function page(slug, title, summary, body) {
  return {
    body: body || "",
    slug,
    summary: compact(summary),
    title,
  };
}

function profileSummary(profile) {
  return [profile?.name, profile?.stage, profile?.priority || profile?.goals]
    .filter(Boolean)
    .join(" - ");
}

function compact(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 600);
}

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

module.exports = {
  CANONICAL_MEMORY_PAGES,
  applyStartupOfficeMemoryPromotion,
  assertStartupOfficeMemoryConflictsResolved,
  buildStartupOfficeMemoryDiff,
  startupOfficeMemoryPromotionPreview,
  startupOfficeWikiPromotionDraft,
};
