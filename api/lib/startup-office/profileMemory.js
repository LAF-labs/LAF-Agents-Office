const COMPANY_PROFILE_MEMORY_SLUG = "company-profile";

async function materializeCompanyProfileMemory({
  changedFields,
  membership,
  profile,
  repository,
  updatedAt,
}) {
  if (!repository?.upsertMemoryPage) return null;
  return repository.upsertMemoryPage(membership, {
    assumptions: [],
    body: companyProfileMemoryBody(profile, changedFields, updatedAt, membership.user_id),
    last_verified_at: updatedAt,
    provenance: {
      changed_fields: changedFields,
      event: "company_profile.updated",
      source: "company_profile",
      updated_at: updatedAt,
      updated_by: membership.user_id,
    },
    slug: COMPANY_PROFILE_MEMORY_SLUG,
    sources: [
      {
        actor_user_id: membership.user_id,
        event: "company_profile.updated",
        fields: changedFields,
        type: "founder_profile_edit",
        updated_at: updatedAt,
      },
    ],
    status: "approved",
    summary: companyProfileMemorySummary(profile),
    title: "Company Profile",
    updated_at: updatedAt,
  });
}

function companyProfileMemoryBody(profile, changedFields, updatedAt, userID) {
  const lines = [
    "# Company Profile",
    "",
    "## Snapshot",
    profileLine("Name", profile?.name),
    profileLine("Stage", profile?.stage),
    profileLine("Size", profile?.size),
    profileLine("Priority", profile?.priority),
    profileLine("Goals", profile?.goals),
    profileLine("ICP", profile?.icp),
    profileLine("Offer", profile?.offer),
    profileLine("Positioning", profile?.positioning),
    profileLine("Description", profile?.description),
    "",
    "## Provenance",
    "- Source: company_profile.updated",
    `- Updated at: ${updatedAt}`,
    `- Updated by: ${userID || ""}`,
    `- Changed fields: ${changedFields.length ? changedFields.join(", ") : "none"}`,
  ];
  return lines.filter((line) => line !== null).join("\n");
}

function profileLine(label, value) {
  const text = String(value || "").trim();
  return text ? `- ${label}: ${text}` : null;
}

function companyProfileMemorySummary(profile) {
  return [
    profile?.name,
    profile?.stage,
    profile?.priority || profile?.goals,
  ]
    .filter(Boolean)
    .join(" - ")
    .slice(0, 600) || "Company profile";
}

module.exports = {
  COMPANY_PROFILE_MEMORY_SLUG,
  materializeCompanyProfileMemory,
};
