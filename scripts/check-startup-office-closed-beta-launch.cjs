#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const launchDoc = "docs/ops/STARTUP-OFFICE-CLOSED-BETA-LAUNCH-KIT.md";

function fail(message) {
  console.error(`startup-office closed beta launch check failed: ${message}`);
  process.exit(1);
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function assertContains(relativePath, snippet, label) {
  if (!read(relativePath).includes(snippet)) {
    fail(`${label} is missing ${snippet} in ${relativePath}`);
  }
}

const pkg = JSON.parse(read("package.json"));
if (pkg.scripts?.["startup-office:closed-beta-launch"] !== "node scripts/check-startup-office-closed-beta-launch.cjs") {
  fail("package.json must expose startup-office:closed-beta-launch");
}
if (pkg.scripts?.["startup-office:first-beta-smoke"] !== "node scripts/startup-office-first-beta-smoke.cjs") {
  fail("package.json must expose startup-office:first-beta-smoke");
}

const schema = JSON.parse(read("supabase/schema/current.json"));
if (String(schema.latestMigration || "") < "20260526030000") {
  fail("schema latestMigration must include the launch readiness migration");
}

for (const [tableName, columns] of [
  ["workspace_billing", ["billing_provider", "payment_status", "beta_agreement_url", "last_paid_at", "blocked_reason"]],
  ["startup_office_assets", ["content_type", "size_bytes", "storage_path", "checksum_sha256", "upload_status"]],
  ["startup_office_support_access_events", ["event_type", "reason", "expires_at"]],
  ["startup_office_deletion_requests", ["requested_by", "status", "reason"]],
]) {
  const table = schema.activeTables.find((entry) => entry.name === tableName);
  if (!table) fail(`${tableName} must be present in schema manifest`);
  for (const column of columns) {
    if (!table.columns.includes(column)) fail(`${tableName} must include ${column}`);
  }
}

for (const [relativePath, snippets, label] of [
  [
    "supabase/migrations/20260526030000_add_startup_office_launch_readiness.sql",
    ["payment_status", "startup_office_support_access_events", "startup_office_deletion_requests", "upload_status"],
    "launch readiness migration",
  ],
  [
    "api/lib/startup-office/billingState.js",
    ["startupOfficePaymentStatusValue", "startupOfficeBillingBlockReason"],
    "manual billing state",
  ],
  [
    "api/lib/startup-office/lifecycleHandlers.js",
    ["support_access", "deletion_requested", "visible_to_owner", "deletion_manifest"],
    "support and deletion lifecycle",
  ],
  [
    "api/lib/startup-office/assetUploadHandlers.js",
    ["ALLOWED_CONTENT_TYPES", "MAX_ASSET_UPLOAD_BYTES", "crypto.randomUUID", "checksum must be a lowercase SHA-256 hex digest", "storage_path"],
    "secure asset upload intent",
  ],
  [
    "api/lib/startup-office/queryHandlers.js",
    ["company_profile: profile", "beta_ops: betaOps", "activity_notifications"],
    "activity query surface",
  ],
  [
    "api/lib/startup-office/exportHandlers.js",
    ["export_manifest", "workspace_billing", "restore_notes"],
    "export query surface",
  ],
  [
    "workers/startup-office/contextBuilder.js",
    ["rankByRelevance", "relevant_assets", "wiki_memory", "citation_sources"],
    "wiki and asset retrieval",
  ],
  [
    "workers/startup-office/toolPolicy.js",
    ["STARTUP_OFFICE_TOOL_POLICY_VERSION", "never_auto_execute", "weekly-operator-review"],
    "loop tool permission policy",
  ],
  [
    "workers/startup-office/promptVersions.js",
    ["STARTUP_OFFICE_PROMPT_VERSION_MANIFEST_VERSION", "instructions_hash", "schema_hash"],
    "loop prompt version policy",
  ],
  [
    "workers/startup-office/outputEval.test.js",
    ["fake loop outputs clear the beta quality rubric", "requires attached citations", "red-teams overclaiming and regulated advice"],
    "quality evaluation harness",
  ],
  [
    "workers/startup-office/modelClient.js",
    ["openAIProviderConfigs", "openai_fallback", "LAF_OFFICE_OPENAI_FALLBACK_API_KEY"],
    "model provider failover",
  ],
  [
    "workers/startup-office/outboxWorker.test.js",
    ["configured email notifications", "notification.approval_waiting"],
    "approval notification email",
  ],
  [
    "api/lib/hosted/inviteHandlers.js",
    ["one_time_invite_url", "invite_url", "sendInviteEmail"],
    "team invite notification fallback",
  ],
  [
    "api/lib/hosted/invitePresentation.js",
    ["mailto_url", "inviteMailtoURL"],
    "team invite presentation fallback",
  ],
  [
    launchDoc,
    [
      "Commercial Positioning",
      "Privacy And Data Processing Terms",
      "Safety Boundaries",
      "Beta Onboarding Email Sequence",
      "Acceptance Criteria",
      "Founder Success Checklist",
      "Support Playbook",
      "Incident Response",
      "Backup And Restore Drill",
      "Production Deployment And DNS",
      "First Closed Beta Sale",
    ],
    "closed beta launch kit",
  ],
  [
    "docs/ops/STARTUP-OFFICE-PRODUCTION-HANDOFF.md",
    ["G099 Production Deployment Evidence", "G100 First Customer Evidence"],
    "production handoff",
  ],
  [
    "scripts/startup-office-beta-release-gate.cjs",
    ["startup-office:citation-enforcement", "startup-office:closed-beta-launch", "startup-office:first-beta-smoke", "startup-office:live-model-smoke-check", "startup-office:memory-conflicts", "startup-office:memory-freshness", "startup-office:memory-import", "startup-office:model-failover", "startup-office:pagination", "startup-office:production-handoff", "startup-office:provenance-replay", "startup-office:prompt-versions", "startup-office:receipt-integrity", "startup-office:retrieval-quality", "startup-office:tool-policy"],
    "release gate launch checks",
  ],
]) {
  for (const snippet of snippets) assertContains(relativePath, snippet, label);
}

const goals = read("docs/specs/CLOSED-BETA-100-GOALS.md");
for (let id = 73; id <= 98; id += 1) {
  if (!goals.includes(`| G${String(id).padStart(3, "0")} | Complete |`)) {
    fail(`G${String(id).padStart(3, "0")} must be marked complete`);
  }
}
for (const id of ["G099", "G100"]) {
  if (!goals.includes(`| ${id} | Blocked |`)) fail(`${id} must be blocked until external proof exists`);
}

console.log("startup-office closed beta launch check passed");
