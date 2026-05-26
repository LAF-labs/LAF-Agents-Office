#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const manifestPath = "shared/startup-office-site-asset-budget.json";

function fail(message) {
  console.error(`startup-office site assets budget check failed: ${message}`);
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

function assertUnder(label, value, budget) {
  if (value > budget) fail(`${label} ${value} exceeded budget ${budget}`);
}

function collectAssets(relativeDir, extensions) {
  const dir = path.join(root, relativeDir);
  if (!fs.existsSync(dir)) fail(`${relativeDir} is missing`);
  const out = [];
  walk(dir, (file) => {
    const extension = path.extname(file).toLowerCase();
    if (!extensions.includes(extension)) return;
    out.push({
      extension,
      path: path.relative(root, file),
      size: fs.statSync(file).size,
    });
  });
  return out;
}

function walk(dir, visit) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, visit);
      continue;
    }
    if (entry.isFile()) visit(fullPath);
  }
}

function totalSize(files) {
  return files.reduce((sum, file) => sum + file.size, 0);
}

const manifest = JSON.parse(read(manifestPath));
const pkg = JSON.parse(read("package.json"));
const releaseGate = read("scripts/startup-office-beta-release-gate.cjs");

if (manifest.version !== "startup-office-site-asset-budget.v1") {
  fail(`unexpected manifest version ${manifest.version || "<missing>"}`);
}
if (
  pkg.scripts?.["startup-office:site-assets-budget"] !==
  "node scripts/check-startup-office-site-assets-budget.cjs"
) {
  fail("package.json must expose startup-office:site-assets-budget");
}
if (!releaseGate.includes('"startup-office:site-assets-budget"')) {
  fail("beta release gate must include startup-office:site-assets-budget");
}

const extensions = manifest.asset_extensions || [];
const budgets = manifest.budgets || {};
const marketingDir = manifest.paths?.marketing_dir || "website";
const appBuildDir = manifest.paths?.app_build_dir || "web/dist";
const marketingAssets = collectAssets(marketingDir, extensions);
const appAssets = collectAssets(appBuildDir, extensions);
const allAssets = [...marketingAssets, ...appAssets];

assertUnder("marketing asset bytes", totalSize(marketingAssets), budgets.max_marketing_asset_bytes);
assertUnder("app build asset bytes", totalSize(appAssets), budgets.max_app_build_asset_bytes);
assertUnder("combined site/app asset bytes", totalSize(allAssets), budgets.max_combined_asset_bytes);
assertUnder("site/app asset file count", allAssets.length, budgets.max_asset_file_count);

for (const file of allAssets) {
  if (file.extension === ".css") {
    assertUnder(`${file.path} css bytes`, file.size, budgets.max_single_css_bytes);
  }
  if (file.extension === ".js") {
    assertUnder(`${file.path} js bytes`, file.size, budgets.max_single_js_bytes);
  }
  if ([".ico", ".jpeg", ".jpg", ".png", ".svg", ".webp"].includes(file.extension)) {
    assertUnder(`${file.path} image bytes`, file.size, budgets.max_single_image_bytes);
  }
}

for (const file of marketingAssets) {
  if (file.extension === ".css") {
    assertUnder(`${file.path} marketing css bytes`, file.size, budgets.max_static_marketing_css_bytes);
  }
  if (file.extension === ".js") {
    assertUnder(`${file.path} marketing js bytes`, file.size, budgets.max_static_marketing_js_bytes);
  }
}

assertContains("scripts/check-startup-office-web-bundle-budget.cjs", "max_initial_preload_js_bytes", "app bundle gate");
assertContains("website/index.html", "AI Startup Office", "marketing page identity");
assertContains("docs/specs/SILICON-VALLEY-PRODUCTION-AUDIT.md", manifestPath, "production audit evidence");

console.log(
  "startup-office site assets budget check passed: " +
    `marketing=${totalSize(marketingAssets)} app=${totalSize(appAssets)} ` +
    `combined=${totalSize(allAssets)} files=${allAssets.length}`,
);
