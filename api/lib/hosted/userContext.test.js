const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createHostedUserContext,
} = require("./userContext");

const membership = Object.freeze({
  role: "owner",
  status: "active",
  team_id: "team-1",
  user_id: "user-1",
});
const team = Object.freeze({ id: "team-1", name: "Acme" });
const user = Object.freeze({ email: "founder@example.com", id: "user-1" });

function createHTTPError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function context(overrides = {}) {
  const calls = { authFetch: [], rest: [] };
  return {
    calls,
    userContext: createHostedUserContext({
      authFetch(path, options) {
        calls.authFetch.push({ options, path });
        return user;
      },
      authToken: () => "access-token",
      createHTTPError,
      rest(table, options) {
        calls.rest.push({ options, table });
        if (table === "memberships") return [membership];
        if (table === "teams") return [team];
        return [];
      },
      ...overrides,
    }),
  };
}

test("requireUser resolves user, active membership, team, and caches the context", async () => {
  const { calls, userContext } = context();
  const req = {};

  const first = await userContext.requireUser(req);
  const second = await userContext.requireUser(req);

  assert.equal(first, second);
  assert.deepEqual(first, {
    membership,
    team,
    token: "access-token",
    user,
  });
  assert.deepEqual(calls.authFetch, [
    {
      options: { headers: { Authorization: "Bearer access-token" } },
      path: "user",
    },
  ]);
  assert.equal(calls.rest.length, 2);
});

test("requireUser rejects missing auth tokens", async () => {
  const { userContext } = context({ authToken: () => "" });

  await assert.rejects(
    () => userContext.requireUser({}),
    (err) => err.status === 401 && /authentication required/.test(err.message),
  );
});

test("requireUser rejects users without an active team membership", async () => {
  const { userContext } = context({
    rest(table) {
      if (table === "memberships") return [];
      return [team];
    },
  });

  await assert.rejects(
    () => userContext.requireUser({}),
    (err) => err.status === 403 && /active team membership required/.test(err.message),
  );
});

test("activeMembership and getTeam emit the expected Supabase query contracts", async () => {
  const { calls, userContext } = context();

  assert.deepEqual(await userContext.activeMembership("user-1"), membership);
  assert.deepEqual(await userContext.getTeam("team-1"), team);
  assert.deepEqual(calls.rest, [
    {
      options: {
        query: {
          limit: "1",
          select: "*",
          status: "eq.active",
          user_id: "eq.user-1",
        },
      },
      table: "memberships",
    },
    {
      options: {
        query: { id: "eq.team-1", limit: "1", select: "*" },
      },
      table: "teams",
    },
  ]);
});
