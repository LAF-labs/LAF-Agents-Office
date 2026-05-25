#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function fail(message) {
  console.error(`startup-office citation enforcement check failed: ${message}`);
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

const packageJSON = JSON.parse(read("package.json"));
if (
  packageJSON.scripts?.["startup-office:citation-enforcement"] !==
  "node scripts/check-startup-office-citation-enforcement.cjs"
) {
  fail("package.json must expose startup-office:citation-enforcement");
}

for (const [relativePath, snippets, label] of [
  [
    "workers/startup-office/contextBuilder.js",
    ["buildCitationSources", "assets: context.relevant_assets", "wikiMemory: context.wiki_memory"],
    "retrieval citation source binding",
  ],
  [
    "workers/startup-office/loopEngine.js",
    ["mergeCitationSources", "browserResearch.sources", "inputs"],
    "live research citation merge",
  ],
  [
    "workers/startup-office/qualityChecks.js",
    [
      "externally informed outputs require source citations",
      "output sources must cite attached source metadata",
    ],
    "citation quality gate",
  ],
  [
    "workers/startup-office/loopEngine.test.js",
    [
      "blocks externally informed drafts without citations",
      "rejects citations outside attached source metadata",
      "gathers browser research and records cited sources",
    ],
    "loop citation tests",
  ],
  [
    "scripts/startup-office-beta-release-gate.cjs",
    ["startup-office:citation-enforcement", "workers/startup-office/citationSources.test.js"],
    "release gate citation coverage",
  ],
  [
    "docs/specs/SILICON-VALLEY-PRODUCTION-AUDIT.md",
    ["startup-office:citation-enforcement", "retrieval and live research"],
    "production audit citation evidence",
  ],
]) {
  for (const snippet of snippets) assertContains(relativePath, snippet, label);
}

console.log("startup-office citation enforcement check passed");
