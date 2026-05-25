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

assertMaxLines("api/[...path].js", 1960);
assertMaxLines("api/lib/hosted/activityHandlers.js", 220);
assertMaxLines("api/lib/hosted/agentLogHandlers.js", 80);
assertMaxLines("api/lib/hosted/auditHandlers.js", 80);
assertMaxLines("api/lib/hosted/actionRateLimitRules.js", 80);
assertMaxLines("api/lib/hosted/authHandlers.js", 140);
assertMaxLines("api/lib/hosted/clientTelemetryHandlers.js", 180);
assertMaxLines("api/lib/hosted/commandHandlers.js", 70);
assertMaxLines("api/lib/hosted/conversationHandlers.js", 360);
assertMaxLines("api/lib/hosted/errorEnvelope.js", 80);
assertMaxLines("api/lib/hosted/healthHandlers.js", 140);
assertMaxLines("api/lib/hosted/inviteHandlers.js", 180);
assertMaxLines("api/lib/hosted/invitePresentation.js", 100);
assertMaxLines("api/lib/hosted/memberHandlers.js", 240);
assertMaxLines("api/lib/hosted/memoryHandlers.js", 100);
assertMaxLines("api/lib/hosted/modelAccess.js", 90);
assertMaxLines("api/lib/hosted/orchestrationHandlers.js", 150);
assertMaxLines("api/lib/hosted/permissions.js", 170);
assertMaxLines("api/lib/hosted/rateLimits.js", 90);
assertMaxLines("api/lib/hosted/redaction.js", 40);
assertMaxLines("api/lib/hosted/requestHandlers.js", 120);
assertMaxLines("api/lib/hosted/requestIO.js", 100);
assertMaxLines("api/lib/hosted/rosterHandlers.js", 120);
assertMaxLines("api/lib/hosted/schedulerHandlers.js", 90);
assertMaxLines("api/lib/hosted/securityHeaders.js", 55);
assertMaxLines("api/lib/hosted/serviceRoleAccess.js", 60);
assertMaxLines("api/lib/hosted/skillHandlers.js", 230);
assertMaxLines("api/lib/hosted/signupHandlers.js", 170);
assertMaxLines("api/lib/hosted/teamPresentation.js", 25);
assertMaxLines("api/lib/hosted/urlTrust.js", 215);
assertMaxLines("api/lib/hosted/userPresentation.js", 55);
assertMaxLines("api/lib/hosted/usageHandlers.js", 90);
assertMaxLines("api/lib/hosted/valueUtils.js", 80);
assertMaxLines("api/lib/startup-office/activationAnalytics.js", 180);
assertMaxLines("api/lib/startup-office/demoSeedHandlers.js", 340);
assertMaxLines("api/lib/startup-office/authorization.js", 120);
assertMaxLines("api/lib/startup-office/betaTerms.js", 120);
assertMaxLines("api/lib/startup-office/commercialBilling.js", 240);
assertMaxLines("api/lib/startup-office/commercialBillingDocuments.js", 180);
assertMaxLines("api/lib/startup-office/customerCsv.js", 100);
assertMaxLines("api/lib/startup-office/customerCsvHandlers.js", 140);
assertMaxLines("api/lib/startup-office/exportHandlers.js", 140);
assertMaxLines("api/lib/startup-office/importHandlers.js", 140);
assertMaxLines("api/lib/startup-office/operationsHandlers.js", 220);
assertMaxLines("api/lib/startup-office/objectHandlers.js", 220);
assertMaxLines("api/lib/startup-office/objectInvariants.js", 80);
assertMaxLines("api/lib/startup-office/objectPayloadSchemas.js", 100);
assertMaxLines("api/lib/startup-office/objectQueries.js", 120);
assertMaxLines("api/lib/startup-office/profileHandlers.js", 120);
assertMaxLines("api/lib/startup-office/payloadLimits.js", 80);
assertMaxLines("api/lib/startup-office/queryHandlers.js", 260);
assertMaxLines("api/lib/startup-office/rateLimits.js", 90);
assertMaxLines("api/lib/startup-office/services.js", 90);
assertMaxLines("api/lib/startup-office/supportPlaybooks.js", 100);
assertMaxLines("api/lib/startup-office/supportTimeline.js", 160);
assertMaxLines("api/lib/startup-office/termsHandlers.js", 120);
assertMaxLines("api/lib/startup-office/validation.js", 80);
assertMaxLines("api/lib/startup-office/workflowEntitlements.js", 80);
assertMaxLines("api/lib/startup-office/workflowHandlers.js", 520);
assertMaxLines("api/lib/startup-office/workflowRunHandlers.js", 280);
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
  [/async function handleAuditEvents\b/, "hosted audit events handler"],
  [/profile\.password_changed/, "auth password update audit action"],
  [/function normalizeModelMode\b/, "hosted model mode normalizer"],
  [/async function modelAvailabilityForMembership\b/, "hosted model availability policy"],
  [/async function resolveAllowedModelMode\b/, "hosted model mode resolver"],
  [/async function handleModelAvailability\b/, "hosted model availability handler"],
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
  [/async function inviteByToken\b/, "hosted invite token lookup helper"],
  [/function publicInvite\b/, "hosted invite serializer"],
  [/function hashToken\b/, "hosted invite token hash helper"],
  [/invite\.created/, "hosted invite audit action"],
  [/active session is for a different team/, "hosted invite accept team guard"],
  [/async function createConfirmedSignupSession\b/, "hosted signup confirmed session helper"],
  [/function isDuplicateSignupError\b/, "hosted signup duplicate error helper"],
  [/async function uniqueTeamSlug\b/, "hosted signup team slug helper"],
  [/account already exists/, "hosted signup duplicate response"],
  [/signup session was not issued/, "hosted signup provider session guard"],
  [/body\.team_action === "join"/, "hosted signup invite join branch"],
  [/HOSTED_WEB_COMMANDS/, "hosted web command registry"],
  [/HOSTED_WEB_COMMAND_NAMES/, "hosted web command lookup"],
  [/async function handleHostedCommandRun\b/, "hosted command run handler"],
  [/function hostedSlashCommandName\b/, "hosted command parser"],
  [/async function handleHostedHumans\b/, "hosted human identity handler"],
  [/async function handleHostedTeams\b/, "hosted team identity handler"],
  [/async function handleHostedOfficeMembers\b/, "hosted office members handler"],
  [/async function handleHostedOfficeMemberGenerate\b/, "hosted office member generator"],
  [/async function handleHostedChannelMembers\b/, "hosted channel member handler"],
  [/function hostedOfficeMembers\b/, "hosted office members serializer"],
  [/function hostedOfficeMember\b/, "hosted office member serializer"],
  [/async function handleHostedMemory\b/, "hosted memory handler"],
  [/memory\.note_saved/, "hosted memory audit action"],
  [/total: \{ cost_usd: 0, total_tokens: 0 \}/, "hosted usage zero stub"],
  [/async function handleHostedUsage\b/, "hosted usage handler"],
  [/function hostedChannel\b/, "hosted conversation channel serializer"],
  [/function normalizeStringList\b/, "hosted conversation string-list normalizer"],
  [/async function listHostedChannelMessages\b/, "hosted conversation message list helper"],
  [/async function listHostedHomeSessions\b/, "hosted conversation home-session helper"],
  [/async function createHostedChannelMessage\b/, "hosted conversation message creation helper"],
  [/function publicChannelMessage\b/, "hosted conversation message serializer"],
  [/function hostedMessageBelongsToThread\b/, "hosted conversation thread filter"],
  [/function sessionTitleFromContent\b/, "hosted conversation session title helper"],
  [/function isMissingChannelMessagesError\b/, "hosted conversation missing-table helper"],
  [/channel_messages/, "hosted conversation persistence table"],
  [/content is required/, "hosted conversation content validation"],
  [/thread_id is required/, "hosted conversation home-session validation"],
  [/async function handleHostedMessageReaction\b/, "hosted conversation reaction handler"],
  [/async function handleHostedAgentLogs\b/, "hosted agent log handler"],
  [/logs: \[\]/, "hosted agent logs empty stub"],
  [/async function handleHostedRequests\b/, "hosted request handler"],
  [/requests: \[\]/, "hosted requests empty stub"],
  [/path === "messages\/react"[\s\S]{0,160}\{ ok: true \}/, "hosted message reaction no-op response"],
  [/path === "requests\/answer"[\s\S]{0,160}\{ ok: true \}/, "hosted request answer no-op response"],
  [/async function handleHostedScheduler\b/, "hosted scheduler handler"],
  [/jobs: \[\]/, "hosted scheduler empty stub"],
  [/async function handleOrchestrationIntent\b/, "hosted orchestration intent handler"],
  [/async function handleOrchestrationConfirm\b/, "hosted orchestration confirm handler"],
  [/function buildOrchestrationIntent\b/, "hosted orchestration intent builder"],
  [/async function applyOrchestrationAction\b/, "hosted orchestration action helper"],
  [/function normalizeAllowedOrigins\b/, "hosted URL allowed-origin list normalizer"],
  [/function normalizeAllowedOrigin\b/, "hosted URL allowed-origin normalizer"],
  [/function trustedPublicAPIURL\b/, "hosted public API URL resolver"],
  [/function trustedPublicOrigin\b/, "hosted public origin resolver"],
  [/function normalizeConfiguredPublicOrigin\b/, "hosted public origin normalizer"],
  [/function normalizeConfiguredPublicAPIBase\b/, "hosted public API base normalizer"],
  [/function allowLocalHostedURLs\b/, "hosted local URL policy helper"],
  [/function looksLikeBareHostedAPIHost\b/, "hosted bare API host classifier"],
  [/function isPrivateHostedHostname\b/, "hosted private host classifier"],
  [/function redactSensitiveText\b/, "hosted redaction text helper"],
  [/function redactSensitiveValue\b/, "hosted redaction value helper"],
  [/const DEFAULT_PROFILE_AVATAR_ID\b/, "hosted user default avatar constant"],
  [/const PROFILE_AVATAR_IDS\b/, "hosted user avatar catalog"],
  [/function publicUser\b/, "hosted user serializer"],
  [/function normalizeProfileAvatarID\b/, "hosted user avatar normalizer"],
  [/function publicTeam\b/, "hosted team serializer"],
  [/function applyBaselineSecurityHeaders\b/, "hosted baseline security headers"],
  [/function applyCORSHeaders\b/, "hosted CORS headers"],
  [/function trustedBrowserOrigin\b/, "hosted trusted browser origin helper"],
  [/function requestPath\b/, "hosted request path helper"],
  [/async function readBody\b/, "hosted request body reader"],
  [/function writeJSON\b/, "hosted JSON response writer"],
  [/function jsonByteSize\b/, "hosted JSON byte-size helper"],
  [/function assertJSONByteSize\b/, "hosted JSON byte-size assertion"],
  [/function truncateText\b/, "hosted text truncation helper"],
  [/function isHuman\b/, "hosted human actor helper"],
  [/function slugify\b/, "hosted slug helper"],
  [/function shortID\b/, "hosted short ID helper"],
  [/function randomID\b/, "hosted random ID helper"],
  [/function nowISO\b/, "hosted clock helper"],
  [/function truthy\b/, "hosted truthy flag helper"],
  [/function isUUID\b/, "hosted UUID helper"],
  [/function clamp\b/, "hosted numeric clamp helper"],
  [/function arrayOrEmpty\b/, "hosted array fallback helper"],
  [/function compactObject\b/, "hosted compact object helper"],
  [/async function handleSkills\b/, "hosted skills handler"],
  [/async function handleSkillInvoke\b/, "hosted skill invoke handler"],
  [/function skillRequiredPermissions\b/, "hosted skill permission helper"],
  [/function permissionRequirementList\b/, "hosted skill permission normalizer"],
  [/\["actions", "signals", "decisions", "watchdogs"\]/, "hosted activity multiplexer stub"],
  [/\{\s*\[path\]: \[\]\s*\}/, "hosted activity empty stub"],
  [/path === "projects"[\s\S]{0,100}handleProjects/, "hosted projects route"],
  [/path === "tasks"[\s\S]{0,100}handleTasks/, "hosted tasks route"],
  [/path === "projects\/repo-readiness"[\s\S]{0,100}handleHostedProjectRepoReadiness/, "hosted project readiness route"],
  [/async function handleProjects\b/, "hosted projects handler"],
  [/async function handleTasks\b/, "hosted tasks handler"],
  [/async function handleHostedProjectRepoReadiness\b/, "hosted project readiness handler"],
  [/async function createTask\b/, "hosted task creation helper"],
  [/async function findProject\b/, "hosted project lookup helper"],
  [/async function findTask\b/, "hosted task lookup helper"],
  [/function publicProject\b/, "hosted project serializer"],
  [/function publicTask\b/, "hosted task serializer"],
  [/path: "\/projects"/, "orchestration project action"],
  [/path: "\/tasks"/, "orchestration task action"],
]) {
  assertNotContains("api/[...path].js", pattern, label);
}

console.log("startup-office architecture check passed");
