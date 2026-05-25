#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function fail(message) {
  console.error(`startup-office architecture check failed: ${message}`);
  process.exit(1);
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function lineCount(relativePath) {
  return read(relativePath).split(/\r?\n/).length;
}

function assertMaxLines(relativePath, maxLines) {
  const actual = lineCount(relativePath);
  if (actual > maxLines) {
    fail(`${relativePath} has ${actual} lines; max is ${maxLines}`);
  }
}

function assertNotContains(relativePath, pattern, label) {
  const body = read(relativePath);
  if (pattern.test(body)) {
    fail(`${relativePath} still contains ${label}`);
  }
}

assertMaxLines("api/[...path].js", 3270);
assertMaxLines("api/lib/hosted/authHandlers.js", 140);
assertMaxLines("api/lib/hosted/memberHandlers.js", 240);
assertMaxLines("api/lib/hosted/permissions.js", 170);
assertMaxLines("api/lib/startup-office/demoSeedHandlers.js", 340);
assertMaxLines("api/lib/startup-office/operationsHandlers.js", 220);
assertMaxLines("api/lib/startup-office/objectHandlers.js", 220);
assertMaxLines("api/lib/startup-office/profileHandlers.js", 120);
assertMaxLines("api/lib/startup-office/queryHandlers.js", 260);
assertMaxLines("api/lib/startup-office/services.js", 90);
assertMaxLines("api/lib/startup-office/workflowHandlers.js", 520);
assertMaxLines("api/lib/startup-office/workspaceConfigHandlers.js", 320);
assertMaxLines("api/lib/startup-office/routes.js", 180);
assertMaxLines("api/lib/startup-office/dispatcher.js", 80);

for (const [pattern, label] of [
  [/async function handleStartupOfficePolicy\b/, "operations policy handler"],
  [/async function handleStartupOfficeBilling\b/, "operations billing handler"],
  [/async function handleStartupOfficeBetaDashboard\b/, "operations beta dashboard handler"],
  [/async function handleStartupOfficeObjectCollection\b/, "object collection handler"],
  [/async function handleStartupOfficeObjectItem\b/, "object item handler"],
  [/async function handleStartupOfficeArtifactObjectAction\b/, "artifact object action handler"],
  [/async function handleStartupOfficeGrowthSummary\b/, "growth summary handler"],
  [/async function handleStartupOfficeLoops\b/, "loops handler"],
  [/async function handleStartupOfficeApprovals\b/, "approvals handler"],
  [/async function handleStartupOfficeReceipts\b/, "receipts handler"],
  [/async function handleStartupOfficeExport\b/, "export handler"],
  [/async function startupOfficeObjectSummary\b/, "object summary helper"],
  [/async function handleStartupOfficeLoopRun\b/, "loop run handler"],
  [/async function handleStartupOfficeRun\b/, "run handler"],
  [/async function handleStartupOfficeApprovalAction\b/, "approval action handler"],
  [/async function enforceStartupOfficeRunLimit\b/, "run limit helper"],
  [/async function recordStartupOfficeRunOutcome\b/, "run outcome helper"],
  [/async function seedStartupOfficeDemoWorkspace\b/, "demo seed workspace helper"],
  [/async function upsertStartupOfficeDemoRun\b/, "demo seed run helper"],
  [/async function upsertStartupOfficeDemoArtifact\b/, "demo seed artifact helper"],
  [/async function upsertStartupOfficeDemoReceipt\b/, "demo seed receipt helper"],
  [/function startupOfficeCompanyProfilePatch\b/, "company profile patch helper"],
  [/function companyProfileRowPayload\b/, "company profile row helper"],
  [/const DEMO_COMPANY_PROFILE\b/, "demo seed constants"],
  [/const DEMO_ARTIFACTS\b/, "demo seed constants"],
  [/demoSeedUUID\b/, "demo seed UUID helper"],
  [/const DEFAULT_STARTUP_OFFICE_APPROVAL_POLICY\b/, "workspace approval policy defaults"],
  [/function companyProfilePatch\b/, "workspace company profile patch helper"],
  [/function workspacePreferencesPatch\b/, "workspace preferences patch helper"],
  [/function normalizeHostedLLMProvider\b/, "hosted LLM provider normalizer"],
  [/function isMissingWorkspaceSettingsError\b/, "workspace settings storage error helper"],
  [/async function workspaceHasAnyProject\b/, "workspace onboarding project fallback helper"],
  [/async function workspaceHasStartupOfficeState\b/, "workspace onboarding startup office fallback helper"],
  [/profile\.updated/, "auth profile update audit action"],
  [/profile\.password_changed/, "auth password update audit action"],
  [/current password is incorrect/, "auth password verification detail"],
  [/const WORKSPACE_ROLES\b/, "workspace role constants"],
  [/const WORKSPACE_PERMISSIONS\b/, "workspace permission constants"],
  [/function normalizeRole\b/, "workspace role normalizer"],
  [/function normalizePermission\b/, "workspace permission normalizer"],
  [/function normalizePermissionList\b/, "workspace permission list normalizer"],
  [/function normalizePermissionOverride\b/, "workspace permission override normalizer"],
  [/function rolePresetPermissions\b/, "workspace role permission preset helper"],
  [/function effectivePermissions\b/, "workspace effective permission helper"],
  [/function hasPermission\b/, "workspace permission checker"],
  [/function requirePermission\b/, "workspace permission guard"],
  [/function requireAdminRole\b/, "workspace admin guard"],
  [/async function adminUserByID\b/, "hosted member admin user helper"],
  [/async function strictAdminUserByID\b/, "hosted member strict admin user helper"],
  [/async function adminUsersByIDs\b/, "hosted member admin users helper"],
  [/async function listTeamAuthUsers\b/, "hosted member list helper"],
  [/member\.role_updated/, "hosted member role update audit action"],
  [/permissions\.updated/, "hosted member permission update audit action"],
  [/cannot change your own permissions/, "hosted member self-permission guard"],
]) {
  assertNotContains("api/[...path].js", pattern, label);
}

console.log("startup-office architecture check passed");
