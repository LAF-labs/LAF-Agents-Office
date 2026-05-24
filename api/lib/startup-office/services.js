function createStartupOfficeServices({ companyProfilePatch, objectValue, truncateText }) {
  function startupOfficeCompanyProfilePatch(body) {
    const profile = companyProfilePatch(body);
    const nested = objectValue(body.company_profile);
    for (const key of ["icp", "offer", "positioning", "stage"]) {
      const value = body[key] ?? nested[key];
      if (value !== undefined) {
        profile[key] = truncateText(value, key === "stage" ? 120 : 4000);
      }
    }
    if (body.metadata !== undefined || nested.metadata !== undefined) {
      profile.metadata = objectValue(body.metadata ?? nested.metadata);
    }
    return profile;
  }

  function companyProfileRowPayload(profile) {
    const out = {};
    for (const key of [
      "description",
      "goals",
      "icp",
      "metadata",
      "name",
      "offer",
      "positioning",
      "priority",
      "size",
      "stage",
    ]) {
      if (profile[key] !== undefined) out[key] = profile[key];
    }
    return out;
  }

  function startupOfficeRunDraft({ loop, objective, profile }) {
    return [
      `Loop: ${loop.name}`,
      `Company: ${profile.name || "Unnamed company"}`,
      `Objective: ${objective}`,
      "",
      "Draft output:",
      `- Primary customer: ${profile.icp || "Needs founder confirmation."}`,
      `- Offer hypothesis: ${profile.offer || "Needs founder confirmation."}`,
      "- Operating next step: Review this draft, approve it, or reject with revision notes.",
      "",
      "Founder control:",
      "- No public, customer-facing, financial, or irreversible action has been taken.",
      "- This run is waiting for explicit approval before promotion.",
    ].join("\n");
  }

  return {
    companyProfileRowPayload,
    startupOfficeCompanyProfilePatch,
    startupOfficeRunDraft,
  };
}

module.exports = {
  createStartupOfficeServices,
};
