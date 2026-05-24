async function buildStartupOfficeContext({
  loop,
  membership,
  profile,
  repository,
  run,
}) {
  const teamID = membership.team_id;
  const [
    recentReceipts,
    previousRuns,
    relevantArtifacts,
    relevantAssets,
    relevantCustomers,
    relevantSignals,
    wikiMemory,
  ] = await Promise.all([
    repository.receipts(teamID, { limit: 8 }),
    repository.runs(teamID, { limit: 6 }),
    repository.artifacts(teamID, { limit: 6 }),
    repository.safeRest("startup_office_assets", {
      query: {
        limit: "8",
        order: "updated_at.desc",
        select: "*",
        team_id: `eq.${teamID}`,
      },
    }),
    repository.safeRest("startup_office_customers", {
      query: {
        limit: "8",
        order: "updated_at.desc",
        select: "*",
        status: "not.in.(archived)",
        team_id: `eq.${teamID}`,
      },
    }),
    repository.safeRest("startup_office_signals", {
      query: {
        limit: "8",
        order: "created_at.desc",
        select: "*",
        status: "not.in.(archived)",
        team_id: `eq.${teamID}`,
      },
    }),
    repository.memoryPages(teamID, { status: "approved", limit: 8 }),
  ]);

  return {
    loop,
    previous_runs: previousRuns
      .filter((item) => item.id !== run?.id)
      .map((item) => pick(item, ["id", "title", "status", "summary", "updated_at"])),
    profile,
    recent_artifacts: relevantArtifacts.map((item) =>
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
    run,
    wiki_memory: wikiMemory.map((item) =>
      pick(item, ["id", "slug", "title", "summary", "body", "sources", "assumptions", "updated_at"]),
    ),
  };
}

function pick(object, keys) {
  const out = {};
  for (const key of keys) {
    if (object?.[key] !== undefined) out[key] = object[key];
  }
  return out;
}

module.exports = {
  buildStartupOfficeContext,
};
