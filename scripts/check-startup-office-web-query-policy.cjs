#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const manifestPath = "shared/startup-office-web-query-policy.json";

function fail(message) {
  console.error(`startup-office web query policy check failed: ${message}`);
  process.exit(1);
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function collectSourceFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(fullPath));
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry.name)) continue;
    if (/\.(test|spec)\.(ts|tsx)$/.test(entry.name)) continue;
    files.push(fullPath);
  }
  return files;
}

function numbersIn(expression) {
  return Array.from(expression.matchAll(/\b\d[\d_]*\b/g)).map((match) =>
    Number(match[0].replaceAll("_", "")),
  );
}

function assertNoFastPollers(files, minimumMs) {
  const offenders = [];
  let refetchIntervals = 0;
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    const relative = path.relative(root, file);
    refetchIntervals += Array.from(source.matchAll(/refetchInterval\s*:/g)).length;

    for (const match of source.matchAll(/refetchInterval\s*:\s*([^,\n]+)/g)) {
      for (const value of numbersIn(match[1])) {
        if (value < minimumMs) offenders.push(`${relative}: refetchInterval ${value}ms`);
      }
    }
    for (const match of source.matchAll(/const\s+\w*REFETCH_MS\s*=\s*([\s\S]*?);/g)) {
      for (const value of numbersIn(match[1])) {
        if (value < minimumMs) offenders.push(`${relative}: REFETCH_MS ${value}ms`);
      }
    }
  }
  return { offenders, refetchIntervals };
}

function assertContains(relativePath, snippet, label) {
  if (!read(relativePath).includes(snippet)) {
    fail(`${label} is missing ${snippet} in ${relativePath}`);
  }
}

const manifest = JSON.parse(read(manifestPath));
const pkg = JSON.parse(read("package.json"));
const releaseGate = read("scripts/startup-office-beta-release-gate.cjs");

if (manifest.version !== "startup-office-web-query-policy.v1") {
  fail(`unexpected manifest version ${manifest.version || "<missing>"}`);
}
if (
  pkg.scripts?.["startup-office:web-query-policy"] !==
  "node scripts/check-startup-office-web-query-policy.cjs"
) {
  fail("package.json must expose startup-office:web-query-policy");
}
if (!releaseGate.includes('"startup-office:web-query-policy"')) {
  fail("beta release gate must include startup-office:web-query-policy");
}

const files = collectSourceFiles(path.join(root, "web", "src"));
const { offenders, refetchIntervals } = assertNoFastPollers(
  files,
  manifest.min_refetch_interval_ms,
);
if (offenders.length) fail(`fast polling below ${manifest.min_refetch_interval_ms}ms:\n${offenders.join("\n")}`);
if (refetchIntervals > manifest.max_refetch_interval_occurrences) {
  fail(
    `React Query polling budget exceeded: ${refetchIntervals}/${manifest.max_refetch_interval_occurrences}`,
  );
}

for (const [relativePath, snippet, label] of [
  ["web/src/main.tsx", "refetchOnWindowFocus: false", "global focus refetch default"],
  ["web/src/main.tsx", "staleTime: 5_000", "global stale-time default"],
  ["web/src/main.tsx", "gcTime: 5 * 60_000", "global cache GC default"],
  ["web/src/hooks/useBrokerEvents.ts", "INVALIDATE_DEBOUNCE_MS = 250", "event invalidation debounce"],
  ["web/src/hooks/useMessages.ts", "liveEventsSupported ? 30_000 : 10_000", "message polling backstop"],
  ["web/src/components/apps/HomeApp.tsx", "? 30_000", "home polling backstop"],
  ["web/src/components/sidebar/UsagePanel.tsx", "open ? 15_000 : false", "focused usage polling"],
  ["docs/specs/SILICON-VALLEY-PRODUCTION-AUDIT.md", manifestPath, "production audit evidence"],
]) {
  assertContains(relativePath, snippet, label);
}

for (const eventName of manifest.required_event_invalidation || []) {
  assertContains(
    "web/src/hooks/useBrokerEvents.ts",
    `subscribeBrokerEvent("${eventName}"`,
    `broker event ${eventName}`,
  );
}

console.log(
  "startup-office web query policy check passed: " +
    `${refetchIntervals}/${manifest.max_refetch_interval_occurrences} pollers, ` +
    `min ${manifest.min_refetch_interval_ms}ms interval`,
);
