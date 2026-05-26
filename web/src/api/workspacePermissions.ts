// Generated from shared/workspace-permissions.json by scripts/check-workspace-permission-catalog.cjs.
export const WORKSPACE_ROLES = [
  "owner",
  "admin",
  "manager",
  "member",
  "viewer",
] as const;

export const WORKSPACE_PERMISSIONS = [
  "workspace:read",
  "workspace:manage",
  "member:invite",
  "member:manage_roles",
  "member:manage_permissions",
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
  "audit:read",
] as const;

export const WORKSPACE_ROLE_PRESETS = {
  owner: "all",
  admin: "all",
  manager: [
    "workspace:read",
    "member:invite",
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
  ],
  member: [
    "workspace:read",
    "skill:read",
    "skill:propose",
    "skill:invoke",
    "memory:read",
    "memory:write_draft",
    "wiki:read",
  ],
  viewer: ["workspace:read", "skill:read", "memory:read", "wiki:read"],
} as const;

export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];
export type WorkspacePermission = (typeof WORKSPACE_PERMISSIONS)[number];
