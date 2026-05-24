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

module.exports = {
  startupOfficeWikiPromotionDraft,
};
