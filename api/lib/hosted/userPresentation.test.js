const assert = require("node:assert/strict");
const test = require("node:test");

const {
  DEFAULT_PROFILE_AVATAR_ID,
  normalizeProfileAvatarID,
  publicUser,
} = require("./userPresentation");

test("normalizeProfileAvatarID accepts known avatars and falls back to human", () => {
  assert.equal(DEFAULT_PROFILE_AVATAR_ID, "human");
  assert.equal(normalizeProfileAvatarID(" CEO "), "ceo");
  assert.equal(normalizeProfileAvatarID("unknown"), "human");
  assert.equal(normalizeProfileAvatarID(""), "human");
});

test("publicUser serializes hosted auth user with normalized role and permissions", () => {
  assert.deepEqual(
    publicUser(
      {
        created_at: "2026-05-25T00:00:00.000Z",
        email: "founder@example.com",
        id: "user-1",
        last_sign_in_at: "2026-05-26T00:00:00.000Z",
        updated_at: "2026-05-25T01:00:00.000Z",
        user_metadata: {
          avatar_id: " CMO ",
          name: "Founder",
        },
      },
      {
        permissions: { allow: ["workspace:read", "", "workspace:read"] },
        role: "OWNER",
        status: "",
        team_id: "team-1",
      },
    ),
    {
      avatar_id: "cmo",
      created_at: "2026-05-25T00:00:00.000Z",
      email: "founder@example.com",
      id: "user-1",
      last_login_at: "2026-05-26T00:00:00.000Z",
      name: "Founder",
      permissions: { allow: ["workspace:read"], deny: [] },
      role: "owner",
      status: "active",
      team_id: "team-1",
      updated_at: "2026-05-25T01:00:00.000Z",
    },
  );
});

test("publicUser falls back to email/name defaults", () => {
  const user = publicUser(
    {
      email: "member@example.com",
      id: "user-2",
      user_metadata: {},
    },
    {
      role: "bad-role",
      team_id: "team-1",
    },
  );

  assert.equal(user.name, "member@example.com");
  assert.equal(user.avatar_id, "human");
  assert.equal(user.role, "member");
  assert.deepEqual(user.permissions, { allow: [], deny: [] });
});
