const {
  normalizePermissionOverride,
  normalizeRole,
} = require("./permissions");

const DEFAULT_PROFILE_AVATAR_ID = "human";
const PROFILE_AVATAR_IDS = new Set([
  "human",
  "ceo",
  "pm",
  "fe",
  "be",
  "designer",
  "cmo",
  "cro",
  "qa",
  "content",
]);

function publicUser(user, membership) {
  return {
    id: user.id,
    email: user.email || "",
    name: user.user_metadata?.name || user.email || "User",
    avatar_id: normalizeProfileAvatarID(user.user_metadata?.avatar_id),
    permissions: normalizePermissionOverride(membership.permissions),
    team_id: membership.team_id,
    role: normalizeRole(membership.role),
    status: membership.status || "active",
    created_at: user.created_at,
    updated_at: user.updated_at,
    last_login_at: user.last_sign_in_at,
  };
}

function normalizeProfileAvatarID(value) {
  const id = String(value || "").trim().toLowerCase();
  return PROFILE_AVATAR_IDS.has(id) ? id : DEFAULT_PROFILE_AVATAR_ID;
}

module.exports = {
  DEFAULT_PROFILE_AVATAR_ID,
  PROFILE_AVATAR_IDS,
  normalizeProfileAvatarID,
  publicUser,
};
