const assert = require("node:assert/strict");
const test = require("node:test");

const {
  authorizeStartupOfficeAccess,
} = require("./authorization");

test("Startup Office authorizer enforces permission access", async () => {
  const calls = [];
  const result = await authorizeStartupOfficeAccess({
    access: { permission: "workspace:manage", type: "permission" },
    req: { id: "req-1" },
    async requireUser(req) {
      calls.push(["requireUser", req.id]);
      return { membership: { role: "manager", team_id: "team-1" } };
    },
    requirePermission(membership, permission) {
      calls.push(["requirePermission", membership.team_id, permission]);
    },
    requireAdminRole() {
      throw new Error("admin guard should not run");
    },
  });

  assert.deepEqual(result.membership, { role: "manager", team_id: "team-1" });
  assert.deepEqual(calls, [
    ["requireUser", "req-1"],
    ["requirePermission", "team-1", "workspace:manage"],
  ]);
});

test("Startup Office authorizer enforces admin access", async () => {
  const calls = [];
  await authorizeStartupOfficeAccess({
    access: { reason: "owner or admin billing operations", type: "admin" },
    req: {},
    async requireUser() {
      return { membership: { role: "admin", team_id: "team-1" } };
    },
    requirePermission() {
      throw new Error("permission guard should not run");
    },
    requireAdminRole(membership, reason) {
      calls.push(["requireAdminRole", membership.role, reason]);
    },
  });

  assert.deepEqual(calls, [
    ["requireAdminRole", "admin", "owner or admin billing operations"],
  ]);
});

test("Startup Office authorizer rejects unsupported access types", async () => {
  await assert.rejects(
    () =>
      authorizeStartupOfficeAccess({
        access: { type: "public" },
        req: {},
        async requireUser() {
          return { membership: { role: "viewer" } };
        },
        requireAdminRole() {},
        requirePermission() {},
      }),
    /unsupported startup office access type: public/,
  );
});
