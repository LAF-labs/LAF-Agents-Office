const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createHostedSignupHandlers,
} = require("./signupHandlers");
const { normalizePermissionOverride, normalizeRole } = require("./permissions");

function createHTTPError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function baseDeps(overrides = {}) {
  const calls = {
    adminFetch: [],
    authFetch: [],
    cookies: [],
    rateLimits: [],
    rest: [],
    writes: [],
  };
  const user = {
    email: "founder@example.com",
    id: "user-1",
    user_metadata: { name: "Founder" },
  };
  const deps = {
    calls,
    async authAdminFetch(path, options) {
      calls.adminFetch.push({ options, path });
      return { id: "created-user" };
    },
    async authFetch(path, options) {
      calls.authFetch.push({ options, path });
      return {
        access_token: "access-token",
        expires_in: 3600,
        refresh_token: "refresh-token",
        user,
      };
    },
    createHTTPError,
    defaultProfileAvatarID: "human",
    enforceSignupRateLimit(req) {
      calls.rateLimits.push(req);
    },
    async getTeam(teamID) {
      return { id: teamID, name: "Joined Co", slug: "joined-co" };
    },
    async inviteByToken() {
      return null;
    },
    nowISO: () => "2026-05-25T12:00:00.000Z",
    publicTeam(row) {
      return { id: row.id, name: row.name, slug: row.slug };
    },
    publicUser(value, membership) {
      return {
        email: value.email,
        id: value.id,
        permissions: normalizePermissionOverride(membership.permissions),
        role: normalizeRole(membership.role),
        team_id: membership.team_id,
      };
    },
    async readBody() {
      return {};
    },
    async rest(table, options) {
      calls.rest.push({ options, table });
      return [];
    },
    setAuthCookies(_req, _res, session) {
      calls.cookies.push(session);
    },
    shortID: () => "abc123",
    slugify(value) {
      return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
    },
    writeJSON(_res, status, body) {
      calls.writes.push({ body, status });
      _res.status = status;
      _res.body = body;
    },
    ...overrides,
  };
  return deps;
}

test("signup creates a confirmed Supabase auth user and a new owner workspace", async () => {
  const deps = baseDeps({
    async readBody() {
      return {
        email: " founder@example.com ",
        name: "Founder",
        password: "correct-password",
        team_name: "Founder Office",
      };
    },
    async rest(table, options) {
      deps.calls.rest.push({ options, table });
      if (table === "teams" && options.method === "POST") {
        return [{ ...options.body, id: "team-1" }];
      }
      if (table === "memberships" && options.method === "POST") {
        return [{ ...options.body, id: "membership-1" }];
      }
      return [];
    },
  });
  const handlers = createHostedSignupHandlers(deps);

  const res = {};
  await handlers.signup({ method: "POST" }, res);

  assert.equal(deps.calls.rateLimits.length, 1);
  assert.deepEqual(deps.calls.adminFetch[0], {
    path: "admin/users",
    options: {
      method: "POST",
      body: {
        email: "founder@example.com",
        password: "correct-password",
        email_confirm: true,
        user_metadata: {
          avatar_id: "human",
          name: "Founder",
        },
      },
    },
  });
  assert.deepEqual(deps.calls.authFetch[0].options.body, {
    email: "founder@example.com",
    password: "correct-password",
  });
  const teamInsert = deps.calls.rest.find(
    (call) => call.table === "teams" && call.options.method === "POST",
  );
  const membershipInsert = deps.calls.rest.find(
    (call) => call.table === "memberships" && call.options.method === "POST",
  );
  assert.equal(teamInsert.options.body.slug, "founder-office");
  assert.equal(membershipInsert.options.body.role, "owner");
  assert.equal(deps.calls.cookies.length, 1);
  assert.equal(res.body.authenticated, true);
  assert.equal(res.body.team.slug, "founder-office");
  assert.equal(res.body.user.role, "owner");
});

test("signup joins an invited workspace and marks the invite accepted", async () => {
  const deps = baseDeps({
    async inviteByToken(token) {
      assert.equal(token, "laf_invite_known");
      return {
        id: "invite-1",
        role: "manager",
        status: "pending",
        team_id: "team-join",
      };
    },
    async readBody() {
      return {
        email: "founder@example.com",
        invite_token: "laf_invite_known",
        name: "Founder",
        password: "correct-password",
        team_action: "join",
      };
    },
    async rest(table, options) {
      deps.calls.rest.push({ options, table });
      if (table === "memberships") return [{ ...options.body, id: "membership-1" }];
      if (table === "team_invites") return [{ id: "invite-1" }];
      return [];
    },
  });
  const handlers = createHostedSignupHandlers(deps);

  const res = {};
  await handlers.signup({ method: "POST" }, res);

  assert.deepEqual(deps.calls.rest[0].options.body, {
    role: "manager",
    status: "active",
    team_id: "team-join",
    user_id: "user-1",
  });
  assert.deepEqual(deps.calls.rest[1].options.body, {
    accepted_at: "2026-05-25T12:00:00.000Z",
    accepted_by: "user-1",
    status: "accepted",
  });
  assert.equal(res.body.team.id, "team-join");
  assert.equal(res.body.user.role, "manager");
});

test("signup converts duplicate auth errors into a stable conflict response", async () => {
  const deps = baseDeps({
    async authAdminFetch() {
      throw createHTTPError(422, "User already registered");
    },
  });
  const handlers = createHostedSignupHandlers(deps);

  await assert.rejects(
    () => handlers.createConfirmedSignupSession({
      email: "founder@example.com",
      password: "correct-password",
    }),
    (err) => err.status === 409 && err.message === "account already exists",
  );
});

test("signup rejects missing auth sessions from the provider", async () => {
  const deps = baseDeps({
    async authFetch() {
      return { user: { id: "user-1" } };
    },
  });
  const handlers = createHostedSignupHandlers(deps);

  await assert.rejects(
    () => handlers.createConfirmedSignupSession({
      email: "founder@example.com",
      password: "correct-password",
    }),
    (err) => err.status === 502 && err.message === "signup session was not issued",
  );
});

test("unique team slug appends a short id when the desired slug exists", async () => {
  const deps = baseDeps({
    async rest(table, options) {
      deps.calls.rest.push({ options, table });
      return [{ id: "existing-team" }];
    },
  });
  const handlers = createHostedSignupHandlers(deps);

  assert.equal(await handlers.uniqueTeamSlug("Founder Office"), "founder-office-abc123");
  assert.equal(deps.calls.rest[0].options.query.slug, "eq.founder-office");
});
