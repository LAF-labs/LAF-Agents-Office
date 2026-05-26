#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function fail(message) {
  console.error(`startup-office visual regression check failed: ${message}`);
  process.exit(1);
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function assertContains(body, snippet, label) {
  if (!body.includes(snippet)) fail(`${label} is missing ${snippet}`);
}

const manifest = JSON.parse(read("shared/startup-office-visual-regression.json"));
const spec = read("web/playwright/startup-office-visual-regression.spec.ts");
const releaseGate = read("scripts/startup-office-beta-release-gate.cjs");

if (manifest.version !== 1) fail(`unexpected manifest version ${manifest.version || "<missing>"}`);
if (manifest.scope !== "closed-beta-founder-core-flow") fail("visual regression scope must cover the closed beta founder core flow");
if (!Array.isArray(manifest.screens) || manifest.screens.length < 3) {
  fail("visual regression manifest must define at least three core screens");
}

assertContains(spec, "toHaveScreenshot", "visual regression spec");
assertContains(spec, "maxDiffPixelRatio", "visual regression spec");
assertContains(releaseGate, '"startup-office:visual-regression"', "beta release gate");

for (const screen of manifest.screens) {
  if (!screen.id || !screen.screenshot) fail("visual regression screen is missing id or screenshot");
  if (!screen.viewport?.width || !screen.viewport?.height) {
    fail(`${screen.id} is missing viewport dimensions`);
  }
  assertContains(spec, screen.screenshot, `${screen.id} spec`);
  assertContains(spec, `width: ${screen.viewport.width}`, `${screen.id} spec`);
  assertContains(spec, `height: ${screen.viewport.height}`, `${screen.id} spec`);
  for (const label of screen.mustShow || []) {
    assertContains(spec, label, `${screen.id} spec`);
  }
}

console.log(`startup-office visual regression check passed: ${manifest.screens.length} screens`);
