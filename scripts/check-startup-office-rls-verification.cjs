#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function fail(message) {
  console.error(`startup-office RLS verification check failed: ${message}`);
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

const packageJson = JSON.parse(read("package.json"));
if (
  packageJson.scripts?.["startup-office:rls-live"] !==
  "node scripts/verify-startup-office-rls-postgrest.cjs"
) {
  fail("package.json must expose startup-office:rls-live");
}
if (
  packageJson.scripts?.["startup-office:rls-verification"] !==
  "node scripts/check-startup-office-rls-verification.cjs"
) {
  fail("package.json must expose startup-office:rls-verification");
}

assertContains(
  "scripts/startup-office-beta-release-gate.cjs",
  '"startup-office:rls-verification"',
  "beta release gate",
);

for (const [relativePath, snippet, label] of [
  [
    "scripts/verify-startup-office-rls-postgrest.cjs",
    "postgrest",
    "PostgREST live verifier",
  ],
  [
    "scripts/verify-startup-office-rls-postgrest.cjs",
    "auth.uid()",
    "Supabase auth.uid bootstrap",
  ],
  [
    "scripts/verify-startup-office-rls-postgrest.cjs",
    "service_role",
    "service-role bypass verification",
  ],
  [
    "scripts/verify-startup-office-rls-postgrest.cjs",
    "startup_office_assets",
    "Startup Office table exercise",
  ],
  [
    "scripts/verify-startup-office-rls-postgrest.cjs",
    "startup_office_terms_acceptances",
    "terms acceptance RLS exercise",
  ],
  [
    "scripts/verify-startup-office-rls-postgrest.cjs",
    "crossTeamInsert",
    "cross-tenant write rejection",
  ],
  [
    "scripts/verify-startup-office-rls-postgrest.cjs",
    "authenticated user inserted terms acceptance directly despite RLS",
    "direct terms insert rejection",
  ],
  [
    "scripts/verify-startup-office-rls-postgrest.cjs",
    "beta asset was modified by alpha user despite RLS",
    "cross-tenant update assertion",
  ],
  [
    "scripts/verify-startup-office-rls-postgrest.cjs",
    "service_role did not bypass RLS to see all terms acceptances",
    "service-role terms bypass verification",
  ],
  [
    "scripts/verify-startup-office-rls-postgrest.cjs",
    "startup-office RLS live verification passed",
    "success signal",
  ],
]) {
  assertContains(relativePath, snippet, label);
}

console.log("startup-office RLS verification check passed");
