function createStartupOfficeProfileHandlers(deps) {
  const {
    companyProfileRowPayload,
    createHTTPError,
    nowISO,
    objectValue,
    publicCompanyProfile,
    readBody,
    requirePermission,
    requireUser,
    safeStartupOfficeRest,
    startupOfficeCompanyProfilePatch,
    upsertWorkspaceSettings,
    workspaceSettings,
    workspaceSettingsPatch,
    writeAuditEvent,
    writeJSON,
  } = deps;

  async function companyProfileSnapshot(teamID, team, user) {
    const [settings, rows] = await Promise.all([
      workspaceSettings(teamID),
      safeStartupOfficeRest("company_profiles", {
        query: {
          limit: "1",
          select: "*",
          team_id: `eq.${teamID}`,
        },
      }),
    ]);
    return publicCompanyProfile({
      row: rows?.[0] || null,
      settings,
      team,
      user,
    });
  }

  async function handleCompanyProfile(req, res) {
    const { membership, team, user } = await requireUser(req);
    if (req.method === "GET") {
      requirePermission(membership, "workspace:read");
      writeJSON(res, 200, {
        profile: await companyProfileSnapshot(membership.team_id, team, user),
      });
      return;
    }
    if (req.method !== "PATCH") throw createHTTPError(405, "method not allowed");
    requirePermission(membership, "workspace:manage");
    const body = await readBody(req);
    const existing = await workspaceSettings(membership.team_id);
    const profilePatch = startupOfficeCompanyProfilePatch(body);
    const settings = await upsertWorkspaceSettings(membership.team_id, {
      ...workspaceSettingsPatch(existing, { company_profile: profilePatch }),
      company_profile: {
        ...objectValue(existing?.company_profile),
        ...profilePatch,
      },
    });
    const [row] = await safeStartupOfficeRest("company_profiles", {
      method: "POST",
      prefer: "resolution=merge-duplicates,return=representation",
      query: { on_conflict: "team_id" },
      body: {
        ...companyProfileRowPayload(profilePatch),
        team_id: membership.team_id,
        updated_at: nowISO(),
      },
    });
    await writeAuditEvent(membership, "company_profile.updated", "company", membership.team_id, {
      fields: Object.keys(profilePatch).sort(),
    });
    writeJSON(res, 200, {
      profile: publicCompanyProfile({
        row,
        settings,
        team,
        user,
      }),
      status: "ok",
    });
  }

  return {
    companyProfile: handleCompanyProfile,
    companyProfileSnapshot,
  };
}

module.exports = {
  createStartupOfficeProfileHandlers,
};
