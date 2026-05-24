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

  return {
    companyProfileRowPayload,
    startupOfficeCompanyProfilePatch,
  };
}

module.exports = {
  createStartupOfficeServices,
};
