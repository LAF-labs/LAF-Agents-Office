#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const { STARTUP_OFFICE_APPROVAL_ACTIONS } = require("../api/lib/startup-office/approvalPolicy");
const { STARTUP_OFFICE_LOOP_TEMPLATES } = require("../workers/startup-office/loopTemplates");
const {
  BLOCKED_EXECUTION_TOOLS,
  LOOP_TOOL_POLICY_MANIFEST,
  startupOfficeLoopToolPolicy,
  startupOfficeToolPolicyAllows,
} = require("../workers/startup-office/toolPolicy");

const root = path.resolve(__dirname, "..");

function fail(message) {
  console.error(`startup-office tool policy check failed: ${message}`);
  process.exit(1);
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

const packageJSON = JSON.parse(read("package.json"));
if (packageJSON.scripts?.["startup-office:tool-policy"] !== "node scripts/check-startup-office-tool-policy.cjs") {
  fail("package.json must expose startup-office:tool-policy");
}

const templateSlugs = Object.keys(STARTUP_OFFICE_LOOP_TEMPLATES).sort();
const manifestSlugs = Object.keys(LOOP_TOOL_POLICY_MANIFEST).sort();
if (JSON.stringify(templateSlugs) !== JSON.stringify(manifestSlugs)) {
  fail("loop tool policy manifest must cover exactly the Startup Office loop templates");
}

for (const slug of templateSlugs) {
  const policy = startupOfficeLoopToolPolicy({ loop: { slug } });
  if (!policy.version || !policy.version.includes("tool-policy")) {
    fail(`${slug} must expose a versioned tool policy`);
  }
  for (const tool of ["artifact_writer", "approval_request", "receipt_writer"]) {
    if (!startupOfficeToolPolicyAllows(policy, tool)) {
      fail(`${slug} must allow trace tool ${tool}`);
    }
  }
  for (const tool of BLOCKED_EXECUTION_TOOLS) {
    if (startupOfficeToolPolicyAllows(policy, tool)) {
      fail(`${slug} must not allow external execution tool ${tool}`);
    }
  }
  for (const action of STARTUP_OFFICE_APPROVAL_ACTIONS) {
    const externalAction = policy.external_actions[action.type];
    if (!externalAction) fail(`${slug} is missing external action ${action.type}`);
    if (externalAction.execution !== "never_auto_execute") {
      fail(`${slug} must never auto-execute ${action.type}`);
    }
    if (!["approval_required", "draft_only"].includes(externalAction.mode)) {
      fail(`${slug} has invalid external action mode for ${action.type}`);
    }
  }
}

if (startupOfficeToolPolicyAllows(
  startupOfficeLoopToolPolicy({ loop: { slug: "weekly-operator-review" } }),
  "browser_research",
)) {
  fail("weekly operator review must not allow browser research");
}

for (const slug of ["customer-discovery", "idea-validation", "launch-campaign", "offer-package"]) {
  if (!startupOfficeToolPolicyAllows(startupOfficeLoopToolPolicy({ loop: { slug } }), "browser_research")) {
    fail(`${slug} must allow browser research`);
  }
}

for (const relativePath of [
  "workers/startup-office/loopEngine.js",
  "workers/startup-office/loopTemplates/customerDiscovery.js",
  "workers/startup-office/loopTemplates/ideaValidation.js",
  "workers/startup-office/loopTemplates/launchCampaign.js",
  "workers/startup-office/loopTemplates/offerPackage.js",
  "workers/startup-office/loopTemplates/weeklyReview.js",
]) {
  if (!read(relativePath).includes("tool_policy")) {
    fail(`${relativePath} must carry tool_policy into prompts, metadata, or traces`);
  }
}

if (!read("scripts/startup-office-beta-release-gate.cjs").includes("startup-office:tool-policy")) {
  fail("beta release gate must include startup-office:tool-policy");
}

if (!read("docs/specs/CLOSED-BETA-100-GOALS.md").includes("workers/startup-office/toolPolicy.js")) {
  fail("closed beta goals must cite the tool policy evidence");
}

if (!read("docs/specs/SILICON-VALLEY-PRODUCTION-AUDIT.md").includes("startup-office:tool-policy")) {
  fail("production audit must cite startup-office:tool-policy");
}

console.log("startup-office tool policy check passed");
