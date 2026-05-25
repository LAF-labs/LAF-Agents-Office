const { buildCitationSources } = require("./citationSources");

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
    repository.receipts(teamID, { limit: 8 }),
    repository.runs(teamID, { limit: 6 }),
    repository.artifacts(teamID, { limit: 24 }),
    repository.safeRest("startup_office_assets", {
      query: {
        limit: "50",
        order: "updated_at.desc",
        select: "*",
        team_id: `eq.${teamID}`,
      },
    }),
    repository.safeRest("startup_office_customers", {
      query: {
        limit: "50",
        order: "updated_at.desc",
        select: "*",
        status: "not.in.(archived)",
        team_id: `eq.${teamID}`,
      },
    }),
    repository.safeRest("startup_office_signals", {
      query: {
        limit: "50",
        order: "created_at.desc",
        select: "*",
        status: "not.in.(archived)",
        team_id: `eq.${teamID}`,
      },
    }),
    repository.memoryPages(teamID, { status: "approved", limit: 50 }),
  ]);
  const runMetadata = objectValue(run?.metadata);
  const relevantAssets = rankByRelevance(assetCandidates, searchTerms, [
    "name",
    "kind",
    "body",
    "metadata",
  ]).slice(0, 8);
  const relevantCustomers = rankByRelevance(customerCandidates, searchTerms, [
    "name",
    "status",
    "profile",
    "notes",
  ]).slice(0, 8);
  const relevantSignals = rankByRelevance(signalCandidates, searchTerms, [
    "source",
    "title",
    "body",
    "metadata",
  ]).slice(0, 8);
  const wikiMemory = rankByRelevance(memoryCandidates, searchTerms, [
    "slug",
    "title",
    "summary",
    "body",
    "sources",
    "assumptions",
  ]).slice(0, 8);
  const artifacts = rankByRelevance(relevantArtifacts, searchTerms, [
    "kind",
    "title",
    "content",
    "metadata",
  ]).slice(0, 6);

  const context = {
    loop,
    previous_runs: previousRuns
      .filter((item) => item.id !== run?.id)
      .map((item) => pick(item, ["id", "title", "status", "summary", "updated_at"])),
    profile,
    recent_artifacts: artifacts.map((item) =>
      pick(item, ["id", "kind", "title", "created_at"]),
    ),
    recent_receipts: recentReceipts.map((item) =>
      pick(item, ["id", "actor_slug", "event_type", "summary", "created_at"]),
    ),
    relevant_assets: relevantAssets.map((item) =>
      pick(item, ["id", "name", "kind", "body", "metadata", "updated_at"]),
    ),
    relevant_customers: relevantCustomers.map((item) =>
      pick(item, ["id", "name", "status", "profile", "notes", "updated_at"]),
    ),
    relevant_signals: relevantSignals.map((item) =>
      pick(item, ["id", "source", "title", "body", "metadata", "created_at"]),
    ),
    revision_request: objectValue(runMetadata.revision_request),
    run,
    wiki_memory: wikiMemory.map((item) =>
      pick(item, ["id", "slug", "title", "summary", "body", "sources", "assumptions", "updated_at"]),
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
  return [...new Set(terms)].filter((term) => !stop.has(term)).slice(0, 40);
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

function pick(object, keys) {
  const out = {};
  for (const key of keys) {
    if (object?.[key] !== undefined) out[key] = object[key];
  }
  return out;
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
  rankByRelevance,
};
