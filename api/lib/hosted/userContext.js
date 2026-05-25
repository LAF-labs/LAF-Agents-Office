function createHostedUserContext(options = {}) {
  const authFetch = options.authFetch;
  const authToken = options.authToken || (() => "");
  const createHTTPError = options.createHTTPError || defaultHTTPError;
  const rest = options.rest;

  async function requireUser(req) {
    if (req.__lafOfficeUserContext) return req.__lafOfficeUserContext;
    const token = authToken(req);
    if (!token) throw createHTTPError(401, "authentication required");
    const user = await authFetch("user", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const membership = await activeMembership(user.id);
    if (!membership) throw createHTTPError(403, "active team membership required");
    const team = await getTeam(membership.team_id);
    return (req.__lafOfficeUserContext = { membership, team, token, user });
  }

  async function activeMembership(userID) {
    const rows = await rest("memberships", {
      query: {
        user_id: `eq.${userID}`,
        status: "eq.active",
        select: "*",
        limit: "1",
      },
    });
    return rows?.[0] || null;
  }

  async function getTeam(teamID) {
    const rows = await rest("teams", {
      query: { id: `eq.${teamID}`, select: "*", limit: "1" },
    });
    return rows?.[0] || null;
  }

  return {
    activeMembership,
    getTeam,
    requireUser,
  };
}

function defaultHTTPError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

module.exports = {
  createHostedUserContext,
};
