const WORKSPACE_ROLES = Object.freeze(["owner", "admin", "manager", "member", "viewer"]);
const WORKSPACE_PERMISSIONS = Object.freeze([
  "workspace:read",
  "workspace:manage",
  "member:invite",
  "member:manage_roles",
  "member:manage_permissions",
  "project:create",
  "project:update",
  "project:archive",
  "task:create",
  "task:update",
  "task:assign",
  "task:change_status",
  "task:execute_agent",
  "agent:create",
  "agent:update",
  "agent:assign",
  "skill:read",
  "skill:propose",
  "skill:create_active",
  "skill:approve",
  "skill:update",
  "skill:archive",
  "skill:invoke",
  "memory:read",
  "memory:write_draft",
  "memory:promote",
  "memory:write_canonical",
  "wiki:read",
  "model:use_laf",
  "mcp:use_task_context",
  "mcp:use_workspace_context",
  "audit:read",
]);

function normalizeRole(role) {
  const value = String(role || "").trim().toLowerCase();
  return WORKSPACE_ROLES.includes(value) ? value : "member";
}

function normalizePermission(permission) {
  const value = String(permission || "").trim().toLowerCase();
  return WORKSPACE_PERMISSIONS.includes(value) ? value : "";
}

function normalizePermissionList(list) {
  return [...new Set((Array.isArray(list) ? list : []).map(normalizePermission).filter(Boolean))].sort();
}

function normalizePermissionOverride(raw) {
  const value = raw && typeof raw === "object" ? raw : {};
  return {
    allow: normalizePermissionList(value.allow),
    deny: normalizePermissionList(value.deny),
  };
}

function rolePresetPermissions(role) {
  switch (normalizeRole(role)) {
    case "owner":
    case "admin":
      return [...WORKSPACE_PERMISSIONS].sort();
    case "manager":
      return [
        "workspace:read",
        "member:invite",
        "project:create",
        "project:update",
        "project:archive",
        "task:create",
        "task:update",
        "task:assign",
        "task:change_status",
        "task:execute_agent",
        "agent:assign",
        "skill:read",
        "skill:propose",
        "skill:approve",
        "skill:update",
        "skill:invoke",
        "memory:read",
        "memory:write_draft",
        "memory:promote",
        "wiki:read",
        "model:use_laf",
        "mcp:use_task_context",
        "mcp:use_workspace_context",
      ].sort();
    case "member":
      return [
        "workspace:read",
        "project:create",
        "project:update",
        "task:create",
        "task:update",
        "task:change_status",
        "task:execute_agent",
        "skill:read",
        "skill:propose",
        "skill:invoke",
        "memory:read",
        "memory:write_draft",
        "wiki:read",
        "mcp:use_task_context",
      ].sort();
    case "viewer":
      return ["workspace:read", "skill:read", "memory:read", "wiki:read", "execution:receipt_read"];
    default:
      return rolePresetPermissions("member");
  }
}

function effectivePermissions(membership) {
  const role = normalizeRole(membership?.role);
  if (role === "owner") return [...WORKSPACE_PERMISSIONS].sort();
  const set = new Set(rolePresetPermissions(role));
  const overrides = normalizePermissionOverride(membership?.permissions);
  for (const permission of overrides.allow) set.add(permission);
  for (const permission of overrides.deny) set.delete(permission);
  return [...set].sort();
}

function hasPermission(membership, permission) {
  return effectivePermissions(membership).includes(normalizePermission(permission));
}

function createHostedPermissionGuards({ createHTTPError }) {
  function requirePermission(membership, permission) {
    if (!hasPermission(membership, permission)) {
      throw createHTTPError(403, `permission required: ${permission}`);
    }
  }

  function requireAdminRole(membership, message = "admin role required") {
    const role = normalizeRole(membership?.role);
    if (role !== "owner" && role !== "admin") {
      throw createHTTPError(403, message);
    }
  }

  return {
    requireAdminRole,
    requirePermission,
  };
}

module.exports = {
  WORKSPACE_PERMISSIONS,
  WORKSPACE_ROLES,
  createHostedPermissionGuards,
  effectivePermissions,
  hasPermission,
  normalizePermission,
  normalizePermissionList,
  normalizePermissionOverride,
  normalizeRole,
  rolePresetPermissions,
};
