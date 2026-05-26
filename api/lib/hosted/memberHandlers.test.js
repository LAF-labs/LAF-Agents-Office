const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createHostedMemberHandlers,
} = require("./memberHandlers");
const {
  WORKSPACE_PERMISSIONS,
  WORKSPACE_ROLES,
  effectivePermissions,
  normalizePermissionOverride,
  normalizeRole,
} = require("./permissions");

const membership = Object.freeze({
  role: "admin",
  status: "active",
  team_id: "team-1",
  user_id: "admin-1",
});

function createHTTPError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function baseDeps(overrides = {}) {
  const calls = {
    adminFetch: [],
    audits: [],
    permissions: [],
    rest: [],
    writes: [],
  };
  const deps = {
    WORKSPACE_PERMISSIONS,
    WORKSPACE_ROLES,
    calls,
    async authAdminFetch(path) {
      calls.adminFetch.push(path);
      const id = decodeURIComponent(String(path).split("/").pop() || "");
      return {
        email: `${id}@example.com`,
        id,
        user_metadata: { name: `User ${id}` },
      };
    },
    createHTTPError,
    effectivePermissions,
    normalizePermissionOverride,
    normalizeRole,
    nowISO: () => "2026-05-25T00:00:00.000Z",
    publicUser(user, row) {
      return {
        email: user.email,
        id: user.id,
        name: user.user_metadata?.name || user.email,
        role: normalizeRole(row.role),
        team_id: row.team_id,
      };
    },
    async readBody() {
      return {};
    },
    requirePermission(value, permission) {
      calls.permissions.push({ membership: value, permission });
    },
    async requireUser() {
      return { membership };
    },
    async rest(table, options) {
      calls.rest.push({ options, table });
      if (table !== "memberships") return [];
      return [
        { role: "owner", status: "active", team_id: "team-1", user_id: "owner-1" },
        { role: "member", status: "active", team_id: "team-1", user_id: "member-1" },
      ];
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

test("auth users handler lists workspace members with auth profile data", async () => {
  const deps = baseDeps();
  const handlers = createHostedMemberHandlers(deps);

  const res = {};
  await handlers.authUsers({ method: "GET" }, res);

  assert.equal(res.status, 200);
  assert.equal(res.body.users.length, 2);
  assert.deepEqual(res.body.users[0], {
    email: "owner-1@example.com",
    id: "owner-1",
    name: "User owner-1",
    role: "owner",
    team_id: "team-1",
  });
  assert.deepEqual(deps.calls.adminFetch, [
    "admin/users/owner-1",
    "admin/users/member-1",
  ]);
});

test("auth users handler updates roles and protects the last owner", async () => {
  const deps = baseDeps({
    async readBody() {
      return { role: "manager", user_id: "member-1" };
    },
    async rest(table, options) {
      deps.calls.rest.push({ options, table });
      if (options.method === "PATCH") {
        return [{ role: options.body.role, team_id: "team-1", user_id: "member-1" }];
      }
      if (options.query?.user_id === "eq.member-1") {
        return [{ role: "member", status: "active", team_id: "team-1", user_id: "member-1" }];
      }
      return [
        { role: "owner", status: "active", team_id: "team-1", user_id: "owner-1" },
        { role: "manager", status: "active", team_id: "team-1", user_id: "member-1" },
      ];
    },
  });
  const handlers = createHostedMemberHandlers(deps);

  const res = {};
  await handlers.authUsers({ method: "PATCH" }, res);

  assert.deepEqual(deps.calls.permissions[0].permission, "member:manage_roles");
  assert.equal(deps.calls.audits[0][1], "member.role_updated");
  assert.equal(res.body.user.role, "manager");
});

test("permissions handler lists role metadata and effective member permissions", async () => {
  const deps = baseDeps({
    async rest(table, options) {
      deps.calls.rest.push({ options, table });
      return [
        {
          permissions: { allow: ["model:use_laf"], deny: ["skill:invoke"] },
          role: "member",
          status: "active",
          team_id: "team-1",
          user_id: "member-1",
        },
      ];
    },
  });
  const handlers = createHostedMemberHandlers(deps);

  const res = {};
  await handlers.permissions({ method: "GET" }, res);

  assert.deepEqual(res.body.roles, WORKSPACE_ROLES);
  assert.deepEqual(res.body.members[0].overrides, {
    allow: ["model:use_laf"],
    deny: ["skill:invoke"],
  });
  assert.ok(res.body.members[0].effective_permissions.includes("model:use_laf"));
  assert.ok(!res.body.members[0].effective_permissions.includes("skill:invoke"));
});

test("permissions handler blocks self-permission edits", async () => {
  const deps = baseDeps({
    async readBody() {
      return {
        permissions: { allow: ["model:use_laf"] },
        user_id: "admin-1",
      };
    },
  });
  const handlers = createHostedMemberHandlers(deps);

  await assert.rejects(
    () => handlers.permissions({ method: "PATCH" }, {}),
    (err) => err.status === 403 && err.message === "cannot change your own permissions",
  );
});

test("permissions handler patches role and overrides for another member", async () => {
  const deps = baseDeps({
    async readBody() {
      return {
        permissions: { allow: ["model:use_laf"], deny: ["skill:invoke"] },
        role: "manager",
        user_id: "member-1",
      };
    },
    async rest(table, options) {
      deps.calls.rest.push({ options, table });
      if (options.method === "PATCH") {
        return [{ ...options.body, status: "active", team_id: "team-1", user_id: "member-1" }];
      }
      if (options.query?.user_id === "eq.member-1") {
        return [{ role: "member", status: "active", team_id: "team-1", user_id: "member-1" }];
      }
      return [{ role: "owner", status: "active", team_id: "team-1", user_id: "owner-1" }];
    },
  });
  const handlers = createHostedMemberHandlers(deps);

  const res = {};
  await handlers.permissions({ method: "PATCH" }, res);

  const patchCall = deps.calls.rest.find((call) => call.options.method === "PATCH");
  assert.deepEqual(patchCall.options.body, {
    permissions: { allow: ["model:use_laf"], deny: ["skill:invoke"] },
    role: "manager",
    updated_at: "2026-05-25T00:00:00.000Z",
  });
  assert.equal(deps.calls.audits[0][1], "permissions.updated");
  assert.equal(res.body.member.role, "manager");
  assert.ok(res.body.member.effective_permissions.includes("member:invite"));
});
