const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createHostedAuthHandlers,
} = require("./authHandlers");

const membership = Object.freeze({
  role: "owner",
  status: "active",
  team_id: "team-1",
  user_id: "user-1",
});
const team = Object.freeze({ id: "team-1", name: "Acme", slug: "acme" });
const user = Object.freeze({
  email: "founder@example.com",
  id: "user-1",
  user_metadata: { avatar_id: "human", name: "Founder" },
});

function createHTTPError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function baseDeps(overrides = {}) {
  const calls = {
    audits: [],
    authFetch: [],
    cookies: [],
    writes: [],
  };
  const deps = {
    calls,
    async activeMembership(userID) {
      return { ...membership, user_id: userID };
    },
    async authFetch(path, options) {
      calls.authFetch.push({ options, path });
      if (path.startsWith("token?")) {
        return {
          access_token: "access-token",
          expires_in: 3600,
          refresh_token: "refresh-token",
          user,
        };
      }
      return user;
    },
    createHTTPError,
    async getTeam() {
      return team;
    },
    normalizeProfileAvatarID(value) {
      return String(value || "human").toLowerCase();
    },
    publicTeam(row) {
      return { id: row.id, name: row.name, slug: row.slug };
    },
    publicUser(value, row) {
      return {
        avatar_id: value.user_metadata?.avatar_id || "human",
        email: value.email,
        id: value.id,
        name: value.user_metadata?.name || value.email,
        role: row.role,
        team_id: row.team_id,
      };
    },
    async readBody() {
      return {};
    },
    async requireUser() {
      return {
        membership,
        team,
        token: "access-token",
        user,
      };
    },
    setAuthCookies(_req, _res, session) {
      calls.cookies.push(session);
    },
    async writeAuditEvent(...args) {
      calls.audits.push(args);
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

test("session returns authenticated user and team", async () => {
  const deps = baseDeps();
  const handlers = createHostedAuthHandlers(deps);

  const res = {};
  await handlers.session({ method: "GET" }, res);

  assert.equal(res.status, 200);
  assert.equal(res.body.authenticated, true);
  assert.deepEqual(res.body.team, { id: "team-1", name: "Acme", slug: "acme" });
  assert.equal(res.body.user.email, "founder@example.com");
});

test("session reports unauthenticated for missing auth without throwing", async () => {
  const deps = baseDeps({
    async requireUser() {
      throw createHTTPError(401, "authentication required");
    },
  });
  const handlers = createHostedAuthHandlers(deps);

  const res = {};
  await handlers.session({ method: "GET" }, res);

  assert.deepEqual(res.body, { authenticated: false });
});

test("login issues cookies only after active workspace membership is found", async () => {
  const deps = baseDeps({
    async readBody() {
      return { email: "founder@example.com", password: "correct-password" };
    },
  });
  const handlers = createHostedAuthHandlers(deps);

  const res = {};
  await handlers.login({ method: "POST" }, res);

  assert.equal(deps.calls.authFetch[0].path, "token?grant_type=password");
  assert.deepEqual(deps.calls.authFetch[0].options.body, {
    email: "founder@example.com",
    password: "correct-password",
  });
  assert.equal(deps.calls.cookies.length, 1);
  assert.equal(res.body.user.team_id, "team-1");
});

test("profile update validates name, writes metadata, and records audit", async () => {
  const deps = baseDeps({
    async authFetch(path, options) {
      deps.calls.authFetch.push({ options, path });
      return {
        ...user,
        user_metadata: options.body.data,
      };
    },
    async readBody() {
      return { avatar_id: "CEO", name: "New Founder" };
    },
  });
  const handlers = createHostedAuthHandlers(deps);

  const res = {};
  await handlers.me({ method: "PATCH" }, res);

  assert.equal(deps.calls.authFetch[0].path, "user");
  assert.equal(deps.calls.authFetch[0].options.headers.Authorization, "Bearer access-token");
  assert.deepEqual(deps.calls.authFetch[0].options.body.data, {
    avatar_id: "ceo",
    name: "New Founder",
  });
  assert.equal(deps.calls.audits[0][1], "profile.updated");
  assert.equal(res.body.user.name, "New Founder");
});

test("password change verifies the current password before updating credentials", async () => {
  const deps = baseDeps({
    async readBody() {
      return {
        current_password: "old-password",
        new_password: "new-password",
      };
    },
  });
  const handlers = createHostedAuthHandlers(deps);

  const res = {};
  await handlers.password({ method: "PATCH" }, res);

  assert.equal(deps.calls.authFetch[0].path, "token?grant_type=password");
  assert.deepEqual(deps.calls.authFetch[0].options.body, {
    email: "founder@example.com",
    password: "old-password",
  });
  assert.equal(deps.calls.authFetch[1].path, "user");
  assert.deepEqual(deps.calls.authFetch[1].options.body, {
    password: "new-password",
  });
  assert.equal(deps.calls.cookies.length, 1);
  assert.equal(deps.calls.audits[0][1], "profile.password_changed");
  assert.deepEqual(res.body, { status: "ok" });
});
