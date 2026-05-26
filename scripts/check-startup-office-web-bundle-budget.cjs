#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const manifestPath = "shared/startup-office-web-bundle-budget.json";

function fail(message) {
  console.error(`startup-office web bundle budget check failed: ${message}`);
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
  if (value > budget) {
    fail(`${label} ${value} exceeded budget ${budget}`);
  }
}

function assetFiles(buildDir) {
  const assetsDir = path.join(root, buildDir, "assets");
  if (!fs.existsSync(assetsDir)) {
    fail(`${buildDir}/assets is missing; run npm --prefix web run build first`);
  }
  return fs.readdirSync(assetsDir).map((name) => ({
    name,
    size: fs.statSync(path.join(assetsDir, name)).size,
  }));
}

function oneAsset(files, pattern, label) {
  const matches = files.filter((file) => pattern.test(file.name));
  if (matches.length !== 1) {
    fail(`${label} expected 1 matching asset, found ${matches.length}`);
  }
  return matches[0];
}

function modulePreloadHrefs(indexHtml) {
  return Array.from(indexHtml.matchAll(/rel="modulepreload"[^>]+href="([^"]+)"/g))
    .map((match) => match[1].replace(/^\/+/, ""));
}

const manifest = JSON.parse(read(manifestPath));
const pkg = JSON.parse(read("package.json"));
const releaseGate = read("scripts/startup-office-beta-release-gate.cjs");

if (manifest.version !== "startup-office-web-bundle-budget.v1") {
  fail(`unexpected manifest version ${manifest.version || "<missing>"}`);
}

if (
  pkg.scripts?.["startup-office:web-bundle-budget"] !==
  "node scripts/check-startup-office-web-bundle-budget.cjs"
) {
  fail("package.json must expose startup-office:web-bundle-budget");
}

if (!releaseGate.includes('"startup-office:web-bundle-budget"')) {
  fail("beta release gate must include startup-office:web-bundle-budget");
}

assertContains("web/vite.config.ts", "modulePreload", "web bundle preload policy");
assertContains(
  "web/vite.config.ts",
  "isDeferredWorkspaceSurfaceDependency",
  "deferred workspace surface policy",
);
assertContains(
  "docs/specs/SILICON-VALLEY-PRODUCTION-AUDIT.md",
  manifestPath,
  "production audit evidence",
);

const buildDir = manifest.build_dir || "web/dist";
const indexPath = path.join(root, buildDir, "index.html");
if (!fs.existsSync(indexPath)) {
  fail(`${buildDir}/index.html is missing; run npm --prefix web run build first`);
}

const files = assetFiles(buildDir);
const budgets = manifest.budgets || {};
const indexHtml = fs.readFileSync(indexPath, "utf8");
const entry = oneAsset(files, /^index-[\w-]+\.js$/, "entry chunk");
const workspace = oneAsset(files, /^WorkspaceApp-[\w-]+\.js$/, "workspace shell chunk");
const preloads = modulePreloadHrefs(indexHtml);
const preloadAssets = preloads
  .map((href) => files.find((file) => `assets/${file.name}` === href))
  .filter(Boolean);
const initialJsBytes = entry.size + preloadAssets
  .filter((file) => file.name.endsWith(".js"))
  .reduce((sum, file) => sum + file.size, 0);

assertUnder("entry js bytes", entry.size, budgets.max_entry_js_bytes);
assertUnder("workspace shell js bytes", workspace.size, budgets.max_workspace_shell_js_bytes);
assertUnder("initial modulepreload count", preloads.length, budgets.max_initial_modulepreload_count);
assertUnder("initial preload js bytes", initialJsBytes, budgets.max_initial_preload_js_bytes);

for (const file of files.filter((item) => item.name.endsWith(".css"))) {
  assertUnder(`${file.name} css bytes`, file.size, budgets.max_css_chunk_bytes);
}

for (const file of files.filter((item) => /vendor-[\w-]+\.js$/.test(item.name))) {
  assertUnder(`${file.name} vendor js bytes`, file.size, budgets.max_vendor_js_bytes);
}

for (const prefix of manifest.required_lazy_chunks || []) {
  const chunk = oneAsset(files, new RegExp(`^${prefix}-[\\w-]+\\.js$`), `${prefix} lazy chunk`);
  assertUnder(`${chunk.name} app surface js bytes`, chunk.size, budgets.max_app_surface_js_bytes);
}

const entrySource = fs.readFileSync(path.join(root, buildDir, "assets", entry.name), "utf8");
const entryPreloadTable = entrySource.match(/^const __vite__mapDeps[\s\S]+?\);\n/)?.[0] || "";
for (const forbidden of manifest.forbidden_initial_preload_patterns || []) {
  if (indexHtml.includes(forbidden)) {
    fail(`index.html must not preload deferred workspace surface dependency ${forbidden}`);
  }
  if (entryPreloadTable.includes(forbidden)) {
    fail(`entry chunk must not preload deferred workspace surface dependency ${forbidden}`);
  }
}

console.log(
  "startup-office web bundle budget check passed: " +
    `entry=${entry.size} workspace=${workspace.size} initial=${initialJsBytes} ` +
    `preloads=${preloads.length} lazyChunks=${(manifest.required_lazy_chunks || []).length}`,
);
