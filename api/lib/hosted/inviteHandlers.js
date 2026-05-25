const crypto = require("node:crypto");
const {
  assertStartupOfficeSeatLimit,
} = require("../startup-office/planLimits");

function createHostedInviteHandlers(deps) {
  const {
    createHTTPError,
    normalizeRole,
    nowISO,
    originFor,
    readBody,
    requirePermission,
    requireUser,
    rest,
    sendInviteEmail,
    startupOfficeBetaOpsSnapshot,
    writeAuditEvent,
    writeJSON,
  } = deps;

  async function inviteByToken(token) {
    const raw = String(token || "").trim();
    if (!raw) return null;
    const rows = await rest("team_invites", {
      query: {
        limit: "1",
        select: "*",
        token_hash: `eq.${hashToken(raw)}`,
      },
    });
    return rows?.[0] || null;
  }

  function publicInvite(row, req) {
    const token = row.token || "";
    let inviteURL = "";
    if (token) {
      try {
        inviteURL = `${originFor(req)}/invite/${encodeURIComponent(token)}`;
      } catch {
        inviteURL = "";
      }
    }
    const mailtoURL = inviteMailtoURL(row, inviteURL);
    const result = {
      accepted_at: row.accepted_at,
      accepted_by: row.accepted_by,
      channel: row.channel,
      created_at: row.created_at,
      created_by: row.created_by,
      email: row.email,
      expires_at: row.expires_at,
      id: row.id,
      invite_url: inviteURL,
      mailto_url: mailtoURL,
      name: row.name,
      role: row.role,
      send_error: row.send_error,
      send_status: row.send_status,
      sent_at: row.sent_at,
      status: row.status,
    };
    if (token) result.token = token;
    return result;
  }

  async function handleInvites(req, res) {
    const { membership, team } = await requireUser(req);
    if (req.method === "GET") {
      const rows = await rest("team_invites", {
        query: {
          order: "created_at.desc",
          select: "*",
          team_id: `eq.${membership.team_id}`,
        },
      });
      writeJSON(res, 200, {
        human_members: [],
        invites: rows.map((invite) => publicInvite(invite, req)),
      });
      return;
    }
    if (req.method !== "POST") throw createHTTPError(405, "method not allowed");
    requirePermission(membership, "member:invite");
    await assertStartupOfficeSeatLimit({
      createHTTPError,
      membership,
      startupOfficeBetaOpsSnapshot,
    });
    const body = await readBody(req);
    const token = `laf_invite_${crypto.randomBytes(18).toString("hex")}`;
    const role = normalizeRole(body.role || "member");
    const [invite] = await rest("team_invites", {
      method: "POST",
      body: {
        channel: body.channel || "",
        created_by: membership.user_id,
        email: String(body.email || "").trim().toLowerCase(),
        name: body.name || "",
        role: role === "owner" ? "member" : role,
        status: "pending",
        team_id: membership.team_id,
        token_hash: hashToken(token),
      },
    });
    const withToken = publicInvite({ ...invite, token }, req);
    const oneTimeURL = withToken.invite_url;
    const inviteForBody = { ...withToken };
    delete inviteForBody.token;
    let emailDelivery = null;
    let emailError = "";
    if (typeof sendInviteEmail === "function") {
      try {
        emailDelivery = await sendInviteEmail(inviteEmail({
          invite: inviteForBody,
          invite_url: oneTimeURL,
          team_name: team?.name || "",
        }));
      } catch (err) {
        emailError = String(err?.message || "invite email failed").slice(0, 1000);
      }
      await rest("team_invites", {
        method: "PATCH",
        query: { id: `eq.${invite.id}`, team_id: `eq.${membership.team_id}` },
        body: emailDelivery
          ? {
              send_error: "",
              send_status: "sent",
              sent_at: nowISO(),
            }
          : {
              send_error: emailError,
              send_status: emailError ? "failed" : "manual_fallback",
            },
      });
    }
    await writeAuditEvent(membership, "invite.created", "invite", invite.id, {
      email: invite.email,
      role: invite.role,
    });
    writeJSON(res, 200, {
      email_delivery: emailDelivery || null,
      email_error: emailError,
      email_sent: Boolean(emailDelivery),
      invite: inviteForBody,
      invite_url: oneTimeURL,
      one_time_invite_url: oneTimeURL,
    });
  }

  async function handleInviteLookup(req, res) {
    const invite = await inviteByToken(req.query.token);
    if (!invite || invite.status !== "pending") {
      throw createHTTPError(404, "invite not found");
    }
    writeJSON(res, 200, { invite: publicInvite(invite, req) });
  }

  async function handleInviteAccept(req, res) {
    const body = await readBody(req);
    const { membership, team, user } = await requireUser(req);
    const invite = await inviteByToken(body.token);
    if (!invite || invite.status !== "pending") {
      throw createHTTPError(404, "invite not found");
    }
    if (invite.team_id !== membership.team_id) {
      throw createHTTPError(403, "active session is for a different team");
    }
    await rest("team_invites", {
      method: "PATCH",
      query: { id: `eq.${invite.id}` },
      body: {
        accepted_at: nowISO(),
        accepted_by: user.id,
        status: "accepted",
      },
    });
    writeJSON(res, 200, {
      invite: publicInvite({ ...invite, status: "accepted" }, req),
      member: {
        email: user.email,
        joined_at: membership.created_at,
        name: body.name || user.user_metadata?.name || user.email,
        role: membership.role,
        slug: user.email,
        team_id: team.id,
      },
    });
  }

  return {
    inviteAccept: handleInviteAccept,
    inviteByToken,
    inviteLookup: handleInviteLookup,
    invites: handleInvites,
    publicInvite,
  };
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token).trim()).digest("hex");
}

function inviteEmail({ invite, invite_url: inviteURL, team_name: teamName = "" }) {
  const to = String(invite?.email || "").trim();
  if (!to) throw new Error("invite email recipient is missing");
  const teamLabel = String(teamName || "LAF Startup Office").trim();
  const subject = `You're invited to ${teamLabel}`;
  const lines = [
    `Hi ${invite?.name || to},`,
    "",
    `You have been invited to join ${teamLabel}.`,
    inviteURL ? `Accept invite: ${inviteURL}` : "",
    "",
    "LAF Startup Office",
  ].filter(Boolean);
  return {
    html: lines.map((line) => `<p>${escapeHTML(line)}</p>`).join(""),
    subject,
    text: lines.join("\n"),
    to,
  };
}

function inviteMailtoURL(invite, inviteURL) {
  const email = String(invite?.email || "").trim();
  if (!email || !inviteURL) return "";
  const subject = encodeURIComponent("You're invited to LAF Startup Office");
  const body = encodeURIComponent(`Join the workspace: ${inviteURL}`);
  return `mailto:${encodeURIComponent(email)}?subject=${subject}&body=${body}`;
}

function escapeHTML(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

module.exports = {
  createHostedInviteHandlers,
  inviteEmail,
};
