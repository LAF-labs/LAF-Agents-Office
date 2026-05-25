function createHostedSignupHandlers(deps) {
  const {
    authAdminFetch,
    authFetch,
    createHTTPError,
    defaultProfileAvatarID,
    enforceSignupRateLimit,
    getTeam,
    inviteByToken,
    nowISO,
    publicTeam,
    publicUser,
    readBody,
    rest,
    setAuthCookies,
    shortID,
    slugify,
    writeJSON,
  } = deps;

  async function handleAuthSignup(req, res) {
    enforceSignupRateLimit(req);
    const body = await readBody(req);
    const session = await createConfirmedSignupSession(body);
    const authenticated = Boolean(session?.access_token);
    const user = session.user;
    if (!user?.id) throw createHTTPError(400, "signup did not return a user");
    const emailConfirmationRequired = !authenticated;

    if (body.team_action === "join") {
      const invite = await inviteByToken(body.invite_token);
      if (!invite || invite.status !== "pending") {
        throw createHTTPError(404, "invite not found");
      }
      const [membership] = await rest("memberships", {
        method: "POST",
        query: { on_conflict: "team_id,user_id" },
        prefer: "resolution=merge-duplicates,return=representation",
        body: {
          role: invite.role || "member",
          status: "active",
          team_id: invite.team_id,
          user_id: user.id,
        },
      });
      await rest("team_invites", {
        method: "PATCH",
        query: { id: `eq.${invite.id}` },
        body: {
          accepted_at: nowISO(),
          accepted_by: user.id,
          status: "accepted",
        },
      });
      const team = await getTeam(invite.team_id);
      if (authenticated) setAuthCookies(req, res, session);
      writeJSON(res, 200, {
        authenticated,
        email_confirmation_required: emailConfirmationRequired,
        team: publicTeam(team),
        user: publicUser(user, membership),
      });
      return;
    }

    const teamName = body.team_name || `${body.name || "My"} Team`;
    const [team] = await rest("teams", {
      method: "POST",
      body: {
        created_by: user.id,
        name: teamName,
        slug: await uniqueTeamSlug(teamName),
      },
    });
    const [membership] = await rest("memberships", {
      method: "POST",
      body: {
        role: "owner",
        status: "active",
        team_id: team.id,
        user_id: user.id,
      },
    });
    if (authenticated) setAuthCookies(req, res, session);
    writeJSON(res, 200, {
      authenticated,
      email_confirmation_required: emailConfirmationRequired,
      team: publicTeam(team),
      user: publicUser(user, membership),
    });
  }

  async function createConfirmedSignupSession(body) {
    const email = String(body.email || "").trim();
    const password = String(body.password || "");
    const name = String(body.name || "").trim();
    try {
      await authAdminFetch("admin/users", {
        method: "POST",
        body: {
          email,
          password,
          email_confirm: true,
          user_metadata: {
            avatar_id: defaultProfileAvatarID,
            name,
          },
        },
      });
    } catch (err) {
      if (isDuplicateSignupError(err)) {
        throw createHTTPError(409, "account already exists");
      }
      throw err;
    }

    const session = await authFetch("token?grant_type=password", {
      method: "POST",
      body: { email, password },
    });
    if (!session?.access_token || !session?.user?.id) {
      throw createHTTPError(502, "signup session was not issued");
    }
    return session;
  }

  function isDuplicateSignupError(err) {
    if (!err || ![400, 409, 422].includes(err.status)) return false;
    const message = String(err.message || "").toLowerCase();
    return (
      message.includes("already") ||
      message.includes("registered") ||
      message.includes("exists")
    );
  }

  async function uniqueTeamSlug(name) {
    const base = slugify(name) || "team";
    const candidate = base;
    const existing = await rest("teams", {
      query: { slug: `eq.${candidate}`, select: "id", limit: "1" },
    });
    return existing?.length ? `${base}-${shortID()}` : candidate;
  }

  return {
    createConfirmedSignupSession,
    signup: handleAuthSignup,
    uniqueTeamSlug,
  };
}

module.exports = {
  createHostedSignupHandlers,
};
