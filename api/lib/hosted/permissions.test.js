const assert = require("node:assert/strict");
const test = require("node:test");

const {
  WORKSPACE_PERMISSIONS,
  WORKSPACE_ROLES,
  createHostedPermissionGuards,
  effectivePermissions,
  hasPermission,
  normalizePermissionOverride,
  normalizeRole,
  rolePresetPermissions,
} = require("./permissions");

function createHTTPError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

test("workspace roles and permissions expose the hosted company account contract", () => {
  assert.deepEqual(WORKSPACE_ROLES, ["owner", "admin", "manager", "member", "viewer"]);
  assert.ok(WORKSPACE_PERMISSIONS.includes("workspace:manage"));
  assert.ok(WORKSPACE_PERMISSIONS.includes("member:invite"));
  assert.ok(WORKSPACE_PERMISSIONS.includes("model:use_laf"));
  assert.equal(normalizeRole("OWNER"), "owner");
  assert.equal(normalizeRole("unknown"), "member");
});

test("permission overrides are normalized, deduped, sorted, and allow-listed", () => {
  assert.deepEqual(
    normalizePermissionOverride({
      allow: ["wiki:read", "bad:value", "wiki:read", "model:use_laf"],
      deny: ["TASK:UPDATE", "unknown"],
    }),
    {
      allow: ["model:use_laf", "wiki:read"],
      deny: ["task:update"],
    },
  );
});

test("role presets preserve existing workspace permission semantics", () => {
  assert.deepEqual(rolePresetPermissions("viewer"), [
    "workspace:read",
    "skill:read",
    "memory:read",
    "wiki:read",
    "execution:receipt_read",
  ]);
  assert.equal(rolePresetPermissions("owner").length, WORKSPACE_PERMISSIONS.length);
  assert.ok(rolePresetPermissions("manager").includes("member:invite"));
  assert.ok(!rolePresetPermissions("member").includes("member:invite"));
});

test("effective permissions apply role defaults plus explicit allow and deny", () => {
  const permissions = effectivePermissions({
    permissions: {
      allow: ["model:use_laf"],
      deny: ["task:update"],
    },
    role: "member",
  });

  assert.ok(permissions.includes("model:use_laf"));
  assert.ok(!permissions.includes("task:update"));
  assert.ok(hasPermission({ role: "owner" }, "audit:read"));
  assert.ok(!hasPermission({ role: "viewer" }, "model:use_laf"));
});

test("permission guards throw typed errors for blocked actions", () => {
  const guards = createHostedPermissionGuards({ createHTTPError });

  assert.doesNotThrow(() => guards.requirePermission({ role: "owner" }, "workspace:manage"));
  assert.throws(
    () => guards.requirePermission({ role: "viewer" }, "workspace:manage"),
    (err) => err.status === 403 && err.message === "permission required: workspace:manage",
  );
  assert.doesNotThrow(() => guards.requireAdminRole({ role: "admin" }));
  assert.throws(
    () => guards.requireAdminRole({ role: "manager" }, "admin needed"),
    (err) => err.status === 403 && err.message === "admin needed",
  );
});
