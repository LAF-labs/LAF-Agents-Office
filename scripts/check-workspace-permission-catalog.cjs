#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const catalogPath = path.join(root, "shared", "workspace-permissions.json");
const webPath = path.join(root, "web", "src", "api", "workspacePermissions.ts");
const apiPermissionsPath = path.join(root, "api", "lib", "hosted", "permissions.js");

function fail(message) {
  console.error(`workspace permission catalog check failed: ${message}`);
  process.exit(1);
}

function unique(values, label) {
  const duplicates = values.filter((value, index) => values.indexOf(value) !== index);
  if (duplicates.length > 0) {
    fail(`${label} contains duplicates: ${[...new Set(duplicates)].join(", ")}`);
  }
}

function formatArray(values, indent = "") {
  return `[\n${values.map((value) => `${indent}  ${JSON.stringify(value)},`).join("\n")}\n${indent}]`;
}

function formatPresetValue(value, indent) {
  if (value === "all") return JSON.stringify(value);
  return formatArray(value, indent);
}

function expectedWebSource(catalog) {
  const presetLines = Object.entries(catalog.rolePresets)
    .map(([role, preset]) => `  ${role}: ${formatPresetValue(preset, "  ")},`)
    .join("\n");
  return `// Generated from shared/workspace-permissions.json by scripts/check-workspace-permission-catalog.cjs.
export const WORKSPACE_ROLES = ${formatArray(catalog.roles)} as const;

export const WORKSPACE_PERMISSIONS = ${formatArray(catalog.permissions)} as const;

export const WORKSPACE_ROLE_PRESETS = {
${presetLines}
} as const;

export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];
export type WorkspacePermission = (typeof WORKSPACE_PERMISSIONS)[number];
`;
}

const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
if (catalog.version !== "workspace-permissions.v1") {
  fail(`unexpected catalog version ${catalog.version || "<missing>"}`);
}
if (!Array.isArray(catalog.roles) || catalog.roles.length === 0) {
  fail("roles must be a non-empty array");
}
if (!Array.isArray(catalog.permissions) || catalog.permissions.length === 0) {
  fail("permissions must be a non-empty array");
}
unique(catalog.roles, "roles");
unique(catalog.permissions, "permissions");

const roleSet = new Set(catalog.roles);
const permissionSet = new Set(catalog.permissions);
for (const requiredRole of ["owner", "admin", "manager", "member", "viewer"]) {
  if (!roleSet.has(requiredRole)) fail(`missing required role: ${requiredRole}`);
}
for (const requiredPermission of ["workspace:read", "member:invite", "audit:read"]) {
  if (!permissionSet.has(requiredPermission)) {
    fail(`missing required permission: ${requiredPermission}`);
  }
}

const presetRoles = Object.keys(catalog.rolePresets || {});
assert.deepEqual(presetRoles.sort(), [...catalog.roles].sort());
for (const [role, preset] of Object.entries(catalog.rolePresets)) {
  if (preset === "all") continue;
  if (!Array.isArray(preset)) fail(`${role} preset must be "all" or an array`);
  unique(preset, `${role} preset`);
  for (const permission of preset) {
    if (!permissionSet.has(permission)) {
      fail(`${role} preset references unknown permission: ${permission}`);
    }
  }
}
if (catalog.rolePresets.owner !== "all" || catalog.rolePresets.admin !== "all") {
  fail("owner and admin presets must inherit all permissions");
}

const apiSource = fs.readFileSync(apiPermissionsPath, "utf8");
if (!apiSource.includes('require("../../../shared/workspace-permissions.json")')) {
  fail("API permissions module must use the shared catalog");
}
const apiPermissions = require("../api/lib/hosted/permissions");
assert.deepEqual(apiPermissions.WORKSPACE_ROLES, catalog.roles);
assert.deepEqual(apiPermissions.WORKSPACE_PERMISSIONS, catalog.permissions);
for (const role of catalog.roles) {
  const expected =
    catalog.rolePresets[role] === "all"
      ? [...catalog.permissions].sort()
      : [...catalog.rolePresets[role]].sort();
  assert.deepEqual(apiPermissions.rolePresetPermissions(role), expected);
}

const expected = expectedWebSource(catalog);
const actual = fs.readFileSync(webPath, "utf8");
if (actual !== expected) {
  fail("web/src/api/workspacePermissions.ts is out of sync with shared/workspace-permissions.json");
}

console.log(
  `workspace permission catalog check passed: ${catalog.roles.length} roles, ${catalog.permissions.length} permissions`,
);
