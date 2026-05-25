#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const workflowPath = path.join(root, ".github", "workflows", "startup-office-outbox-worker.yml");
const loopWorkflowPath = path.join(root, ".github", "workflows", "startup-office-loop-worker.yml");
const monitorWorkflowPath = path.join(root, ".github", "workflows", "startup-office-ops-monitor.yml");
const packagePath = path.join(root, "package.json");
const runbookPath = path.join(root, "docs", "ops", "STARTUP-OFFICE-DEPLOYMENT-RUNBOOK.md");

function fail(message) {
  console.error(`startup office worker deploy check failed: ${message}`);
  process.exit(1);
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

if (!fs.existsSync(workflowPath)) {
  fail("missing .github/workflows/startup-office-outbox-worker.yml");
}
if (!fs.existsSync(loopWorkflowPath)) {
  fail("missing .github/workflows/startup-office-loop-worker.yml");
}
if (!fs.existsSync(monitorWorkflowPath)) {
  fail("missing .github/workflows/startup-office-ops-monitor.yml");
}
if (!fs.existsSync(runbookPath)) {
  fail("missing docs/ops/STARTUP-OFFICE-DEPLOYMENT-RUNBOOK.md");
}

const workflow = fs.readFileSync(workflowPath, "utf8");
const loopWorkflow = fs.readFileSync(loopWorkflowPath, "utf8");
const monitorWorkflow = fs.readFileSync(monitorWorkflowPath, "utf8");
const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));
const runbook = fs.readFileSync(runbookPath, "utf8");

if (pkg.scripts?.["startup-office:outbox-worker"] !== "node scripts/startup-office-outbox-worker.cjs") {
  fail("package.json must expose startup-office:outbox-worker");
}
if (pkg.scripts?.["startup-office:loop-worker"] !== "node scripts/startup-office-loop-worker.cjs") {
  fail("package.json must expose startup-office:loop-worker");
}
if (pkg.scripts?.["startup-office:loop-worker:test"] !== "node --test workers/startup-office/loopWorker.test.js") {
  fail("package.json must expose startup-office:loop-worker:test");
}
if (pkg.scripts?.["startup-office:ops-monitor"] !== "node scripts/startup-office-ops-monitor.cjs") {
  fail("package.json must expose startup-office:ops-monitor");
}
if (pkg.scripts?.["startup-office:ops-monitor:test"] !== "node --test scripts/startup-office-ops-monitor.test.cjs") {
  fail("package.json must expose startup-office:ops-monitor:test");
}

for (const snippet of [
  "name: Startup Office Outbox Worker",
  "schedule:",
  'cron: "*/5 * * * *"',
  "workflow_dispatch:",
  "permissions:\n  contents: read",
  "concurrency:",
  "timeout-minutes: 10",
  "actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd",
  "actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e",
  "npm run hosted-env:preflight -- --no-env-file",
  "npm run startup-office:outbox-worker",
]) {
  if (!workflow.includes(snippet)) fail(`worker workflow is missing ${snippet}`);
}

for (const name of [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_ANON_KEY",
  "LAF_OFFICE_PUBLIC_HOST",
  "LAF_OFFICE_BILLING_MODE",
  "LAF_OFFICE_STARTUP_OFFICE_AI_PROVIDER",
  "LAF_OFFICE_STARTUP_OFFICE_MODEL",
  "LAF_OFFICE_OPENAI_API_KEY",
  "OPENAI_API_KEY",
  "LAF_OUTBOX_EMAIL_PROVIDER",
  "LAF_OUTBOX_BATCH_SIZE",
  "LAF_OUTBOX_LOCK_MS",
  "LAF_OUTBOX_WORKER_ID",
  "RESEND_API_KEY",
  "LAF_EMAIL_FROM",
  "LAF_EMAIL_REPLY_TO",
]) {
  if (!workflow.includes(name)) fail(`worker workflow is missing env ${name}`);
}

const workflowOrder =
  workflow.indexOf("npm run hosted-env:preflight -- --no-env-file") <
  workflow.indexOf("npm run startup-office:outbox-worker");
if (!workflowOrder) fail("worker workflow must run preflight before draining outbox");

for (const snippet of [
  "name: Startup Office Loop Worker",
  "schedule:",
  'cron: "*/5 * * * *"',
  "workflow_dispatch:",
  "permissions:\n  contents: read",
  "concurrency:",
  "timeout-minutes: 20",
  "actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd",
  "actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e",
  "npm run hosted-env:preflight -- --no-env-file",
  "npm run startup-office:loop-worker",
]) {
  if (!loopWorkflow.includes(snippet)) fail(`loop worker workflow is missing ${snippet}`);
}

for (const name of [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_ANON_KEY",
  "LAF_OFFICE_PUBLIC_HOST",
  "LAF_OFFICE_BILLING_MODE",
  "LAF_LOOP_WORKER_BATCH_SIZE",
  "LAF_LOOP_WORKER_LOCK_MS",
  "LAF_LOOP_WORKER_ID",
  "LAF_OFFICE_STARTUP_OFFICE_AI_PROVIDER",
  "LAF_OFFICE_STARTUP_OFFICE_MODEL",
  "LAF_OFFICE_OPENAI_API_KEY",
  "OPENAI_API_KEY",
]) {
  if (!loopWorkflow.includes(name)) fail(`loop worker workflow is missing env ${name}`);
}

const loopWorkflowOrder =
  loopWorkflow.indexOf("npm run hosted-env:preflight -- --no-env-file") <
  loopWorkflow.indexOf("npm run startup-office:loop-worker");
if (!loopWorkflowOrder) fail("loop worker workflow must run preflight before processing jobs");

for (const snippet of [
  "name: Startup Office Ops Monitor",
  "schedule:",
  'cron: "*/15 * * * *"',
  "workflow_dispatch:",
  "permissions:\n  contents: read",
  "concurrency:",
  "timeout-minutes: 5",
  "actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd",
  "actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e",
  "npm run hosted-env:preflight -- --no-env-file",
  "npm run startup-office:ops-monitor",
]) {
  if (!monitorWorkflow.includes(snippet)) fail(`ops monitor workflow is missing ${snippet}`);
}

for (const name of [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_ANON_KEY",
  "LAF_OFFICE_PUBLIC_HOST",
  "LAF_OFFICE_ALLOWED_ORIGINS",
  "LAF_OFFICE_BILLING_MODE",
  "LAF_OFFICE_STARTUP_OFFICE_AI_PROVIDER",
  "LAF_OFFICE_STARTUP_OFFICE_MODEL",
  "LAF_OFFICE_OPENAI_API_KEY",
  "OPENAI_API_KEY",
  "LAF_OUTBOX_EMAIL_PROVIDER",
  "LAF_OUTBOX_BATCH_SIZE",
  "LAF_OUTBOX_LOCK_MS",
  "RESEND_API_KEY",
  "LAF_EMAIL_FROM",
  "LAF_EMAIL_REPLY_TO",
  "LAF_MONITOR_APPROVAL_STALE_MS",
  "LAF_MONITOR_MAX_DEAD_LETTER_OUTBOX",
  "LAF_MONITOR_MAX_DEAD_LETTER_WORKER_JOBS",
  "LAF_MONITOR_MAX_FAILED_RUNS",
  "LAF_MONITOR_MAX_FAILED_OUTBOX",
  "LAF_MONITOR_MAX_MODEL_SPEND_CENTS",
  "LAF_MONITOR_MAX_STALE_PENDING_APPROVALS",
  "LAF_MONITOR_MAX_STALE_PROCESSING_OUTBOX",
  "LAF_MONITOR_MAX_STUCK_WORKER_JOBS",
  "LAF_MONITOR_MAX_USAGE_EVENT_COST_CENTS",
  "LAF_MONITOR_MAX_WORKSPACE_MODEL_SPEND_RATIO_BPS",
  "LAF_MONITOR_OUTBOX_STALE_MS",
  "LAF_MONITOR_WORKER_JOB_STUCK_MS",
]) {
  if (!monitorWorkflow.includes(name)) fail(`ops monitor workflow is missing env ${name}`);
}

const monitorWorkflowOrder =
  monitorWorkflow.indexOf("npm run hosted-env:preflight -- --no-env-file") <
  monitorWorkflow.indexOf("npm run startup-office:ops-monitor");
if (!monitorWorkflowOrder) fail("ops monitor workflow must run preflight before checking thresholds");

for (const heading of [
  "## Deploy Order",
  "## Required Secrets And Variables",
  "## AI Loop Worker Schedule",
  "## Outbox Worker Schedule",
  "## Operational Monitor",
  "## Smoke Test",
  "## Rollback",
]) {
  if (!runbook.includes(heading)) fail(`deployment runbook is missing ${heading}`);
}

for (const term of [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_ANON_KEY",
  "LAF_OFFICE_BILLING_MODE",
  "LAF_OUTBOX_EMAIL_PROVIDER",
  "LAF_OFFICE_OPENAI_API_KEY",
  "RESEND_API_KEY",
  "LAF_OFFICE_STARTUP_OFFICE_AI_PROVIDER",
  "npm run hosted-env:preflight",
  "npx supabase db push",
  "startup-office-outbox-worker.yml",
  "startup-office-loop-worker.yml",
  "startup-office-ops-monitor.yml",
  "npm run startup-office:outbox-worker",
  "npm run startup-office:loop-worker",
  "claim_startup_office_worker_job",
  "LAF_LOOP_WORKER_BATCH_SIZE",
  "LAF_LOOP_WORKER_LOCK_MS",
  "npm run startup-office:ops-monitor",
  "LAF_MONITOR_MAX_DEAD_LETTER_OUTBOX",
  "LAF_MONITOR_MAX_DEAD_LETTER_WORKER_JOBS",
  "LAF_MONITOR_MAX_FAILED_RUNS",
  "LAF_MONITOR_MAX_MODEL_SPEND_CENTS",
  "LAF_MONITOR_MAX_STALE_PENDING_APPROVALS",
  "LAF_MONITOR_MAX_USAGE_EVENT_COST_CENTS",
  "LAF_MONITOR_MAX_WORKSPACE_MODEL_SPEND_RATIO_BPS",
  "LAF_MONITOR_APPROVAL_STALE_MS",
  "LAF_MONITOR_OUTBOX_STALE_MS",
  "LAF_MONITOR_WORKER_JOB_STUCK_MS",
  "npm run beta:release-gate",
]) {
  if (!runbook.includes(term)) fail(`deployment runbook is missing ${term}`);
}

const releaseGate = read("scripts/startup-office-beta-release-gate.cjs");
if (!releaseGate.includes("npm\", [\"run\", \"startup-office:worker-deploy\"")) {
  fail("beta release gate must run startup-office:worker-deploy");
}
if (!releaseGate.includes("npm\", [\"run\", \"startup-office:loop-worker:test\"")) {
  fail("beta release gate must run startup-office:loop-worker:test");
}
if (!releaseGate.includes("npm\", [\"run\", \"startup-office:ops-monitor:test\"")) {
  fail("beta release gate must run startup-office:ops-monitor:test");
}

console.log("startup office worker deploy check passed");
