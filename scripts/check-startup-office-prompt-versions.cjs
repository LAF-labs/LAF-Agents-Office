#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const { STARTUP_OFFICE_LOOP_TEMPLATES } = require("../workers/startup-office/loopTemplates");
const {
  LOOP_PROMPT_VERSION_MANIFEST,
  startupOfficePromptVersion,
} = require("../workers/startup-office/promptVersions");

const root = path.resolve(__dirname, "..");

function fail(message) {
  console.error(`startup-office prompt version check failed: ${message}`);
  process.exit(1);
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

const packageJSON = JSON.parse(read("package.json"));
if (
  packageJSON.scripts?.["startup-office:prompt-versions"] !==
  "node scripts/check-startup-office-prompt-versions.cjs"
) {
  fail("package.json must expose startup-office:prompt-versions");
}

const templateSlugs = Object.keys(STARTUP_OFFICE_LOOP_TEMPLATES).sort();
const manifestSlugs = Object.keys(LOOP_PROMPT_VERSION_MANIFEST).sort();
if (JSON.stringify(templateSlugs) !== JSON.stringify(manifestSlugs)) {
  fail("prompt version manifest must cover exactly the Startup Office loop templates");
}

for (const slug of templateSlugs) {
  const promptVersion = startupOfficePromptVersion({
    template: STARTUP_OFFICE_LOOP_TEMPLATES[slug],
  });
  if (!new RegExp(`^${slug}\\.prompt\\.v\\d+$`).test(promptVersion.version)) {
    fail(`${slug} must use a stable semantic prompt version`);
  }
  for (const field of ["instructions_hash", "schema_hash"]) {
    if (!/^[a-f0-9]{64}$/.test(promptVersion[field] || "")) {
      fail(`${slug} must expose ${field}`);
    }
  }
  if (promptVersion.schema_name !== STARTUP_OFFICE_LOOP_TEMPLATES[slug].schemaName) {
    fail(`${slug} prompt version must pin the schema name`);
  }
  if (!promptVersion.reviewed_for.includes("structured_json")) {
    fail(`${slug} prompt version must record structured_json review evidence`);
  }
}

for (const [relativePath, snippets] of [
  ["workers/startup-office/loopEngine.js", ["prompt_version", "startupOfficePromptVersion"]],
  ["workers/startup-office/loopEngine.test.js", ["prompt_version", "idea-validation.prompt.v1"]],
]) {
  const source = read(relativePath);
  for (const snippet of snippets) {
    if (!source.includes(snippet)) fail(`${relativePath} must include ${snippet}`);
  }
}

for (const relativePath of [
  "workers/startup-office/loopTemplates/customerDiscovery.js",
  "workers/startup-office/loopTemplates/ideaValidation.js",
  "workers/startup-office/loopTemplates/launchCampaign.js",
  "workers/startup-office/loopTemplates/offerPackage.js",
  "workers/startup-office/loopTemplates/weeklyReview.js",
]) {
  if (!read(relativePath).includes("prompt_version")) {
    fail(`${relativePath} must expose prompt_version in the prompt context`);
  }
}

if (!read("scripts/startup-office-beta-release-gate.cjs").includes("startup-office:prompt-versions")) {
  fail("beta release gate must include startup-office:prompt-versions");
}

if (!read("docs/specs/SILICON-VALLEY-PRODUCTION-AUDIT.md").includes("startup-office:prompt-versions")) {
  fail("production audit must cite startup-office:prompt-versions");
}

console.log("startup-office prompt version check passed");
