function createHostedAuthHandlers(deps) {
  const {
    activeMembership,
    authFetch,
    createHTTPError,
    getTeam,
    normalizeProfileAvatarID,
    publicTeam,
    publicUser,
    readBody,
    requireUser,
    setAuthCookies,
    writeAuditEvent,
    writeJSON,
  } = deps;

  async function handleAuthSession(req, res) {
    try {
      const { membership, team, user } = await requireUser(req);
      writeJSON(res, 200, {
        authenticated: true,
        team: publicTeam(team),
        user: publicUser(user, membership),
      });
    } catch (err) {
      if (err?.status === 401) {
        writeJSON(res, 200, { authenticated: false });
        return;
      }
      throw err;
    }
  }

  async function handleAuthMe(req, res) {
    const { membership, token, user } = await requireUser(req);
    const body = await readBody(req);
    const name = String(body.name || "").trim();
    if (!name) throw createHTTPError(400, "name is required");
    if (name.length > 80) {
      throw createHTTPError(400, "name must be 80 characters or fewer");
    }
    const avatarID = normalizeProfileAvatarID(body.avatar_id);
    const currentMetadata =
      user.user_metadata && typeof user.user_metadata === "object"
        ? user.user_metadata
        : {};
    const updated = await authFetch("user", {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}` },
      body: {
        data: {
          ...currentMetadata,
          avatar_id: avatarID,
          name,
        },
      },
    });
    await writeAuditEvent(membership, "profile.updated", "user", user.id, {
      avatar_id: avatarID,
    });
    writeJSON(res, 200, {
      user: publicUser(
        updated || {
          ...user,
          user_metadata: { ...currentMetadata, name, avatar_id: avatarID },
        },
        membership,
      ),
    });
  }

  async function handleAuthMePassword(req, res) {
    const { membership, user } = await requireUser(req);
    const body = await readBody(req);
    const currentPassword = String(body.current_password || "").trim();
    const newPassword = String(body.new_password || "").trim();
    if (!currentPassword) throw createHTTPError(400, "current_password is required");
    if (newPassword.length < 8) {
      throw createHTTPError(400, "new_password length >= 8 required");
    }
    let verifiedSession;
    try {
      verifiedSession = await authFetch("token?grant_type=password", {
        method: "POST",
        body: { email: user.email, password: currentPassword },
      });
    } catch {
      throw createHTTPError(403, "current password is incorrect");
    }
    const accessToken = verifiedSession?.access_token;
    if (!accessToken) throw createHTTPError(403, "current password is incorrect");
    await authFetch("user", {
      method: "PUT",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: { password: newPassword },
    });
    setAuthCookies(req, res, verifiedSession);
    await writeAuditEvent(membership, "profile.password_changed", "user", user.id);
    writeJSON(res, 200, { status: "ok" });
  }

  async function handleAuthLogin(req, res) {
    const body = await readBody(req);
    const session = await authFetch("token?grant_type=password", {
      method: "POST",
      body: { email: body.email, password: body.password },
    });
    const membership = await activeMembership(session.user.id);
    if (!membership) throw createHTTPError(403, "active team membership required");
    const team = await getTeam(membership.team_id);
    setAuthCookies(req, res, session);
    writeJSON(res, 200, {
      team: publicTeam(team),
      user: publicUser(session.user, membership),
    });
  }

  return {
    login: handleAuthLogin,
    me: handleAuthMe,
    password: handleAuthMePassword,
    session: handleAuthSession,
  };
}

module.exports = {
  createHostedAuthHandlers,
};
