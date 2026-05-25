const permissionCatalog = require("../../../shared/workspace-permissions.json");

const WORKSPACE_ROLES = Object.freeze([...permissionCatalog.roles]);
const WORKSPACE_PERMISSIONS = Object.freeze([...permissionCatalog.permissions]);
const ROLE_PERMISSION_PRESETS = Object.freeze(
  Object.fromEntries(
    Object.entries(permissionCatalog.rolePresets).map(([role, preset]) => [
      role,
      preset === "all" ? "all" : Object.freeze([...preset]),
    ]),
  ),
);

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
  const preset = ROLE_PERMISSION_PRESETS[normalizeRole(role)] || ROLE_PERMISSION_PRESETS.member;
  return preset === "all" ? [...WORKSPACE_PERMISSIONS].sort() : [...preset].sort();
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
  ROLE_PERMISSION_PRESETS,
  createHostedPermissionGuards,
  effectivePermissions,
  hasPermission,
  normalizePermission,
  normalizePermissionList,
  normalizePermissionOverride,
  normalizeRole,
  rolePresetPermissions,
};
