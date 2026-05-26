#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const {
  STARTUP_OFFICE_ROUTE_CONTRACTS,
} = require("../api/lib/startup-office/routes");

const root = path.resolve(__dirname, "..");

function fail(message) {
  console.error(`startup-office audit coverage check failed: ${message}`);
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

const routeAuditCoverage = {
  "approvalAction.POST": [
    ["api/lib/startup-office/workflowHandlers.js", '"startup_office.approved"'],
    ["api/lib/startup-office/workflowHandlers.js", '"startup_office.rejected"'],
    ["api/lib/startup-office/workflowHandlers.js", '"startup_office.revision_requested"'],
  ],
  "artifactObjectAction.POST": [
    ["api/lib/startup-office/objectHandlers.js", '"startup_office.asset.created_from_artifact"'],
    ["api/lib/startup-office/objectHandlers.js", '"startup_office.signal.created_from_artifact"'],
  ],
  "assetUploadIntent.POST": [
    ["api/lib/startup-office/assetUploadHandlers.js", '"startup_office.asset_upload_intent.created"'],
  ],
  "billing.PATCH": [
    ["api/lib/startup-office/operationsHandlers.js", '"startup_office.billing_updated"'],
  ],
  "companyProfile.PATCH": [
    ["api/lib/startup-office/profileHandlers.js", '"company_profile.updated"'],
  ],
  "customerCsv.POST": [
    ["api/lib/startup-office/customerCsvHandlers.js", '"startup_office.customers_csv_imported"'],
  ],
  "deletionPurge.POST": [
    ["api/lib/startup-office/lifecycleHandlers.js", '"startup_office.deletion_purged"'],
    ["api/lib/startup-office/lifecycleHandlers.test.js", '"startup_office.deletion_purged"'],
  ],
  "deletionRequest.POST": [
    ["api/lib/startup-office/lifecycleHandlers.js", '"startup_office.deletion_requested"'],
  ],
  "demoSeed.POST": [
    ["api/lib/startup-office/demoSeedHandlers.js", '"startup_office.demo_seeded"'],
  ],
  "loopRun.POST": [
    ["api/lib/startup-office/workflowHandlers.js", '"startup_office.run_created"'],
  ],
  "loops.POST": [
    ["api/lib/startup-office/queryHandlers.js", '"startup_office.loop_created"'],
  ],
  "memoryImport.POST": [
    ["api/lib/startup-office/importHandlers.js", '"startup_office.memory_imported"'],
    ["api/lib/startup-office/importHandlers.test.js", '"startup_office.memory_imported"'],
  ],
  "objectCollection.POST": [
    ["api/lib/startup-office/objectHandlers.js", "`startup_office.${kind}.created`"],
  ],
  "objectItem.DELETE": [
    ["api/lib/startup-office/objectHandlers.js", "`startup_office.${kind}.deleted`"],
  ],
  "objectItem.PATCH": [
    ["api/lib/startup-office/objectHandlers.js", "`startup_office.${kind}.updated`"],
  ],
  "policy.PATCH": [
    ["api/lib/startup-office/operationsHandlers.js", '"startup_office.policy_updated"'],
  ],
  "run.POST": [
    ["api/lib/startup-office/workflowRunHandlers.js", '"startup_office.run_canceled"'],
    ["api/lib/startup-office/workflowRunHandlers.js", '"startup_office.run_retry_queued"'],
  ],
  "supportAccess.POST": [
    ["api/lib/startup-office/lifecycleHandlers.js", "`startup_office.support_access.${eventType}`"],
  ],
  "supportAccessAction.POST": [
    ["api/lib/startup-office/lifecycleHandlers.js", "`startup_office.support_access.${eventType}`"],
  ],
  "terms.POST": [
    ["api/lib/startup-office/termsHandlers.js", '"startup_office.terms_accepted"'],
    ["api/lib/startup-office/termsHandlers.test.js", '"startup_office.terms_accepted"'],
  ],
  "workerJobAction.POST": [
    ["api/lib/startup-office/workerJobRecoveryHandlers.js", '"startup_office.worker_job_retried"'],
    ["api/lib/startup-office/workerJobRecoveryHandlers.js", '"startup_office.worker_job_canceled"'],
  ],
  "workspaceImport.POST": [
    ["api/lib/startup-office/workspaceImportAdapters.js", '"startup_office.workspace_imported"'],
    ["api/lib/startup-office/importHandlers.test.js", '"startup_office.workspace_imported"'],
  ],
};

const mutatingRouteMethods = STARTUP_OFFICE_ROUTE_CONTRACTS
  .flatMap((contract) =>
    contract.methods
      .filter((method) => method !== "GET")
      .map((method) => `${contract.id}.${method}`),
  )
  .sort();
const auditedRouteMethods = Object.keys(routeAuditCoverage).sort();

if (JSON.stringify(mutatingRouteMethods) !== JSON.stringify(auditedRouteMethods)) {
  fail(
    `mutating route audit map drifted: expected ${mutatingRouteMethods.join(", ")}, got ${auditedRouteMethods.join(", ")}`,
  );
}

for (const [routeMethod, expectations] of Object.entries(routeAuditCoverage)) {
  for (const [relativePath, snippet] of expectations) {
    assertContains(relativePath, snippet, routeMethod);
  }
}

for (const [relativePath, snippet, label] of [
  [
    "api/lib/startup-office/workspaceConfigHandlers.js",
    '"workspace_config.updated"',
    "workspace config update",
  ],
  [
    "api/lib/startup-office/workspaceConfigHandlers.js",
    '"onboarding.completed"',
    "workspace onboarding completion",
  ],
  [
    "api/lib/hosted/memoryHandlers.js",
    '"memory.note_saved"',
    "hosted memory write",
  ],
  [
    "api/lib/hosted/memoryHandlers.test.js",
    '"memory.note_saved"',
    "hosted memory behavior test",
  ],
  [
    "api/lib/startup-office/workspaceConfigHandlers.test.js",
    '"workspace_config.updated"',
    "workspace config behavior test",
  ],
  [
    "api/lib/startup-office/workflowHandlers.test.js",
    '"startup_office.run_retry_queued"',
    "run retry behavior test",
  ],
  [
    "workers/startup-office/loopEngine.js",
    '"startup_office.run_started"',
    "worker run started audit",
  ],
  [
    "workers/startup-office/loopEngine.js",
    '"startup_office.run_waiting_approval"',
    "worker run waiting approval audit",
  ],
  [
    "workers/startup-office/loopEngine.js",
    '"startup_office.run_completed"',
    "worker run completed audit",
  ],
  [
    "workers/startup-office/loopEngine.js",
    '"startup_office.run_failed"',
    "worker run failed audit",
  ],
  [
    "workers/startup-office/loopEngine.js",
    '"startup_office.artifact.created"',
    "worker artifact creation audit",
  ],
  [
    "workers/startup-office/loopEngine.js",
    '"startup_office.approval.created"',
    "worker approval creation audit",
  ],
  [
    "workers/startup-office/receiptWriter.js",
    '"startup_office.receipt.created"',
    "worker receipt creation audit",
  ],
  [
    "api/lib/startup-office/repositories.js",
    "async function createAuditEvent",
    "repository audit writer",
  ],
  [
    "api/lib/startup-office/repositories.test.js",
    '"startup_office.artifact.created"',
    "repository audit writer test",
  ],
  [
    "workers/startup-office/loopEngine.test.js",
    '"startup_office.approval.created"',
    "worker approval audit behavior test",
  ],
  [
    "workers/startup-office/loopEngine.test.js",
    '"startup_office.receipt.created"',
    "worker receipt audit behavior test",
  ],
  [
    "api/lib/startup-office/objectHandlers.test.js",
    '"startup_office.asset.created_from_artifact"',
    "artifact asset behavior test",
  ],
  [
    "api/lib/startup-office/objectHandlers.test.js",
    '"startup_office.signal.created_from_artifact"',
    "artifact signal behavior test",
  ],
]) {
  assertContains(relativePath, snippet, label);
}

const packageJson = JSON.parse(read("package.json"));
if (
  packageJson.scripts?.["startup-office:audit-coverage"] !==
  "node scripts/check-startup-office-audit-coverage.cjs"
) {
  fail("package.json must expose startup-office:audit-coverage");
}

assertContains(
  "scripts/startup-office-beta-release-gate.cjs",
  '"startup-office:audit-coverage"',
  "beta release gate",
);

console.log(
  `startup-office audit coverage check passed: ${mutatingRouteMethods.length} mutating route methods`,
);
