#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function fail(message) {
  console.error(`startup-office first beta smoke check failed: ${message}`);
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

for (const [relativePath, snippets] of [
  [
    "tests/playwright/startup-office-first-beta-flow.spec.ts",
    ["Company name", "Run Idea Validation", "Approve", "Receipts", "logout"],
  ],
  [
    "tests/playwright/startup-office-accessibility-mobile.spec.ts",
    ["setViewportSize", "keyboard.press", "Beta operations", "Workspace activity"],
  ],
  [
    "web/src/components/startup-office/StartupOfficeApp.test.tsx",
    ["Edit profile", "Run Idea Validation loop", "Approve Idea Validation draft", "Workspace activity"],
  ],
  [
    "web/src/components/startup-office/startupOfficeCopy.ts",
    ["스타트업 오피스", "승인 데스크", "워크스페이스 활동", "영수증"],
  ],
]) {
  for (const snippet of snippets) {
    assertContains(relativePath, snippet, "first beta smoke contract");
  }
}

console.log("startup-office first beta smoke check passed");
