function createStartupOfficeServices({ objectValue, truncateText }) {
  function companyProfilePatch(body) {
    const profile = objectValue(body.company_profile);
    const out = { ...profile };
    const companyName = body.company_name ?? body.company;
    if (companyName !== undefined) out.name = truncateText(companyName, 160);
    const companyDescription = body.company_description ?? body.description;
    if (companyDescription !== undefined) {
      out.description = truncateText(companyDescription, 2000);
    }
    if (body.company_goals !== undefined) out.goals = truncateText(body.company_goals, 2000);
    if (body.company_size !== undefined) out.size = truncateText(body.company_size, 120);
    const priority = body.company_priority ?? body.priority;
    if (priority !== undefined) out.priority = truncateText(priority, 1000);
    return out;
  }

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

  return {
    companyProfileRowPayload,
    startupOfficeCompanyProfilePatch,
  };
}

module.exports = {
  createStartupOfficeServices,
};
