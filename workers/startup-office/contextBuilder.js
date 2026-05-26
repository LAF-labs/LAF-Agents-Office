const { buildCitationSources } = require("./citationSources");

const STARTUP_OFFICE_CONTEXT_RETRIEVAL_BUDGET = Object.freeze({
  artifact_candidate_limit: 24,
  artifact_output_limit: 6,
  asset_candidate_limit: 40,
  customer_candidate_limit: 40,
  memory_candidate_limit: 40,
  previous_run_limit: 6,
  recent_receipt_limit: 8,
  signal_candidate_limit: 40,
  top_k_per_collection: 8,
  max_search_terms: 40,
  max_body_chars: 2400,
  max_metadata_chars: 1200,
  max_notes_chars: 1200,
  max_summary_chars: 1000,
});

const STARTUP_OFFICE_CONTEXT_SELECTS = Object.freeze({
  artifacts: "id,kind,title,content,metadata,created_at",
  assets: "id,name,kind,body,metadata,updated_at",
  customers: "id,name,status,profile,notes,updated_at",
  memoryPages: "id,slug,title,summary,body,sources,assumptions,updated_at",
  receipts: "id,actor_slug,event_type,summary,created_at",
  runs: "id,title,status,summary,updated_at",
  signals: "id,source,title,body,metadata,created_at",
});

async function buildStartupOfficeContext({
  loop,
  membership,
  profile,
  repository,
  run,
}) {
  const teamID = membership.team_id;
  const searchTerms = contextSearchTerms({ loop, profile, run });
  const [
    recentReceipts,
    previousRuns,
    relevantArtifacts,
    assetCandidates,
    customerCandidates,
    signalCandidates,
    memoryCandidates,
  ] = await Promise.all([
    repository.receipts(teamID, {
      limit: STARTUP_OFFICE_CONTEXT_RETRIEVAL_BUDGET.recent_receipt_limit,
      select: STARTUP_OFFICE_CONTEXT_SELECTS.receipts,
    }),
    repository.runs(teamID, {
      limit: STARTUP_OFFICE_CONTEXT_RETRIEVAL_BUDGET.previous_run_limit,
      select: STARTUP_OFFICE_CONTEXT_SELECTS.runs,
    }),
    repository.artifacts(teamID, {
      limit: STARTUP_OFFICE_CONTEXT_RETRIEVAL_BUDGET.artifact_candidate_limit,
      select: STARTUP_OFFICE_CONTEXT_SELECTS.artifacts,
    }),
    repository.safeRest("startup_office_assets", {
      query: {
        limit: String(STARTUP_OFFICE_CONTEXT_RETRIEVAL_BUDGET.asset_candidate_limit),
        order: "updated_at.desc",
        select: STARTUP_OFFICE_CONTEXT_SELECTS.assets,
        team_id: `eq.${teamID}`,
      },
    }),
    repository.safeRest("startup_office_customers", {
      query: {
        limit: String(STARTUP_OFFICE_CONTEXT_RETRIEVAL_BUDGET.customer_candidate_limit),
        order: "updated_at.desc",
        select: STARTUP_OFFICE_CONTEXT_SELECTS.customers,
        status: "not.in.(archived)",
        team_id: `eq.${teamID}`,
      },
    }),
    repository.safeRest("startup_office_signals", {
      query: {
        limit: String(STARTUP_OFFICE_CONTEXT_RETRIEVAL_BUDGET.signal_candidate_limit),
        order: "created_at.desc",
        select: STARTUP_OFFICE_CONTEXT_SELECTS.signals,
        status: "not.in.(archived)",
        team_id: `eq.${teamID}`,
      },
    }),
    repository.memoryPages(teamID, {
      limit: STARTUP_OFFICE_CONTEXT_RETRIEVAL_BUDGET.memory_candidate_limit,
      select: STARTUP_OFFICE_CONTEXT_SELECTS.memoryPages,
      status: "approved",
    }),
  ]);
  const runMetadata = objectValue(run?.metadata);
  const relevantAssets = rankByRelevance(assetCandidates, searchTerms, [
    "name",
    "kind",
    "body",
    "metadata",
  ]).slice(0, STARTUP_OFFICE_CONTEXT_RETRIEVAL_BUDGET.top_k_per_collection);
  const relevantCustomers = rankByRelevance(customerCandidates, searchTerms, [
    "name",
    "status",
    "profile",
    "notes",
  ]).slice(0, STARTUP_OFFICE_CONTEXT_RETRIEVAL_BUDGET.top_k_per_collection);
  const relevantSignals = rankByRelevance(signalCandidates, searchTerms, [
    "source",
    "title",
    "body",
    "metadata",
  ]).slice(0, STARTUP_OFFICE_CONTEXT_RETRIEVAL_BUDGET.top_k_per_collection);
  const wikiMemory = rankByRelevance(memoryCandidates, searchTerms, [
    "slug",
    "title",
    "summary",
    "body",
    "sources",
    "assumptions",
  ]).slice(0, STARTUP_OFFICE_CONTEXT_RETRIEVAL_BUDGET.top_k_per_collection);
  const artifacts = rankByRelevance(relevantArtifacts, searchTerms, [
    "kind",
    "title",
    "content",
    "metadata",
  ]).slice(0, STARTUP_OFFICE_CONTEXT_RETRIEVAL_BUDGET.artifact_output_limit);

  const context = {
    loop,
    previous_runs: previousRuns
      .filter((item) => item.id !== run?.id)
      .map((item) => pickContext(item, ["id", "title", "status", "summary", "updated_at"])),
    profile,
    recent_artifacts: artifacts.map((item) =>
      pickContext(item, ["id", "kind", "title", "created_at"]),
    ),
    recent_receipts: recentReceipts.map((item) =>
      pickContext(item, ["id", "actor_slug", "event_type", "summary", "created_at"]),
    ),
    relevant_assets: relevantAssets.map((item) =>
      pickContext(item, ["id", "name", "kind", "body", "metadata", "updated_at"]),
    ),
    relevant_customers: relevantCustomers.map((item) =>
      pickContext(item, ["id", "name", "status", "profile", "notes", "updated_at"]),
    ),
    relevant_signals: relevantSignals.map((item) =>
      pickContext(item, ["id", "source", "title", "body", "metadata", "created_at"]),
    ),
    revision_request: objectValue(runMetadata.revision_request),
    run,
    wiki_memory: wikiMemory.map((item) =>
      pickContext(item, ["id", "slug", "title", "summary", "body", "sources", "assumptions", "updated_at"]),
    ),
  };
  context.citation_sources = buildCitationSources({
    assets: context.relevant_assets,
    customers: context.relevant_customers,
    signals: context.relevant_signals,
    wikiMemory: context.wiki_memory,
  });
  return context;
}

function rankByRelevance(rows, terms, keys) {
  return array(rows)
    .map((row, index) => ({
      index,
      row,
      score: relevanceScore(row, terms, keys),
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map((entry) => entry.row);
}

function relevanceScore(row, terms, keys) {
  const haystack = keys.map((key) => searchableText(row?.[key])).join(" ");
  if (!terms.length || !haystack.trim()) return 0;
  let score = 0;
  for (const term of terms) {
    if (haystack.includes(term)) score += term.length > 5 ? 3 : 1;
  }
  return score;
}

function contextSearchTerms({ loop, profile, run }) {
  return uniqueTerms([
    searchableText(loop?.name),
    searchableText(loop?.department),
    searchableText(loop?.objective),
    searchableText(profile),
    searchableText(run?.title),
    searchableText(run?.objective),
    searchableText(run?.inputs),
  ].join(" "));
}

function uniqueTerms(value) {
  const stop = new Set([
    "about",
    "after",
    "before",
    "company",
    "founder",
    "office",
    "startup",
    "that",
    "their",
    "there",
    "this",
    "with",
  ]);
  const terms = String(value || "")
    .toLowerCase()
    .match(/[a-z0-9가-힣]{3,}/g) || [];
  return [...new Set(terms)]
    .filter((term) => !stop.has(term))
    .slice(0, STARTUP_OFFICE_CONTEXT_RETRIEVAL_BUDGET.max_search_terms);
}

function searchableText(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value).toLowerCase();
  }
  if (Array.isArray(value)) return value.map(searchableText).join(" ");
  if (typeof value === "object") return Object.values(value).map(searchableText).join(" ");
  return "";
}

function pickContext(object, keys) {
  const fieldLimits = {
    assumptions: STARTUP_OFFICE_CONTEXT_RETRIEVAL_BUDGET.max_metadata_chars,
    body: STARTUP_OFFICE_CONTEXT_RETRIEVAL_BUDGET.max_body_chars,
    metadata: STARTUP_OFFICE_CONTEXT_RETRIEVAL_BUDGET.max_metadata_chars,
    notes: STARTUP_OFFICE_CONTEXT_RETRIEVAL_BUDGET.max_notes_chars,
    profile: STARTUP_OFFICE_CONTEXT_RETRIEVAL_BUDGET.max_metadata_chars,
    sources: STARTUP_OFFICE_CONTEXT_RETRIEVAL_BUDGET.max_metadata_chars,
    summary: STARTUP_OFFICE_CONTEXT_RETRIEVAL_BUDGET.max_summary_chars,
  };
  const out = {};
  for (const key of keys) {
    if (object?.[key] === undefined) continue;
    out[key] = boundedContextValue(object[key], fieldLimits[key]);
  }
  return out;
}

function boundedContextValue(value, maxChars) {
  if (!maxChars) return value;
  if (typeof value === "string") return truncateContextText(value, maxChars);
  const serialized = JSON.stringify(value || {});
  if (serialized.length <= maxChars) return value;
  return {
    preview: truncateContextText(serialized, maxChars),
    truncated: true,
  };
}

function truncateContextText(value, maxChars) {
  const text = String(value || "");
  if (text.length <= maxChars) return text;
  const suffix = "...[truncated]";
  return `${text.slice(0, Math.max(maxChars - suffix.length, 0))}${suffix}`;
}

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

module.exports = {
  buildStartupOfficeContext,
  contextSearchTerms,
  pickContext,
  rankByRelevance,
  STARTUP_OFFICE_CONTEXT_RETRIEVAL_BUDGET,
  STARTUP_OFFICE_CONTEXT_SELECTS,
};
