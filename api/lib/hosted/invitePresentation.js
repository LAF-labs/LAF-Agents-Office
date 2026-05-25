function publicInvite(row, req, originFor) {
  const token = row.token || "";
  let inviteURL = "";
  if (token) {
    try {
      inviteURL = `${originFor(req)}/invite/${encodeURIComponent(token)}`;
    } catch {
      inviteURL = "";
    }
  }
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
    mailto_url: inviteMailtoURL(row, inviteURL),
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
  inviteEmail,
  publicInvite,
};
