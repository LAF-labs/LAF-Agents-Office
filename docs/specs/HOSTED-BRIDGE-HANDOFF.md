# Hosted Bridge Handoff

Status: deployment handoff for `bridge-update`
Date: 2026-05-19
Base: `origin/main`
Branch: `bridge-update`
Implementation commit before this handoff: `55577cd`

## Purpose

This branch simplifies LAF-Office into a hosted AI development workspace with a
single local execution component: LAF Bridge. The production user path is now:

1. Sign in to the hosted web app.
2. Open Settings -> LAF Bridge.
3. Create a setup code.
4. Run:

```sh
npx laf-bridge pair
```

5. Paste the setup code when Bridge prompts for it.
6. Keep the Bridge terminal running while this computer should receive approved
   Codex or Claude CLI work.

The browser and hosted API do not run local CLIs, git, GitHub, or filesystem
work directly. They create hosted records, pairing codes, execution plans, and
receipts. LAF Bridge owns the local CLI execution loop and reports logs,
changed files, PR artifacts, and receipts back to the hosted workspace.

## What Changed

- Product positioning changed from local-first or Runner-based execution to
  hosted workspace plus one LAF Bridge.
- `laf-runner` and Runner product flows were removed from docs, UI, API, tests,
  packaging, public downloads, and release workflows.
- `npm-bridge/` was added as the public `laf-bridge` npm package. Its npx
  surface intentionally exposes only `laf-bridge pair`; internal commands and
  pairing flags are rejected.
- Hosted API pairing responses expose only `commands.pair =
  "npx laf-bridge pair"` plus a setup code. The API must not return setup
  commands containing `--api-url`, `--code`, local paths, or legacy Runner job
  fields.
- Hosted task execution uses public `managed_checkout` wording. Legacy
  `local_worktree` values are accepted only as compatibility input and are
  normalized away from public hosted responses.
- Supabase migrations were renumbered to unique timestamp prefixes and extended
  with Bridge-only cleanup/model constraints.
- Release and deployment gates were added for env preflight, final schema
  checks, public npm release validation, deploy input validation, and hosted
  Bridge smoke testing.
- Website, README, Korean guide, npm docs, Settings UI, Tasks UI, and package
  metadata now point users to the hosted app plus `npx laf-bridge pair`.

## Removed Or Retired Surfaces

The branch removes or retires these product surfaces:

- `cmd/laf-runner`
- `cmd/laf-runner-installer`
- Runner packaging scripts and Windows/macOS installer definitions
- Runner downloadable artifacts under `web/public/downloads`
- Runner job claim/background protocol code under `internal/team`
- Runner protocol docs
- Hosted API Runner routes and local binding routes as product surfaces
- UI copy that asks users to install Runner, use a local folder, or paste a
  generated setup command with embedded pairing flags

Guardrail: `npm run bridge-only:surface` checks these removals and public
copy boundaries.

## Usage Check

Expected user-facing hosted pairing flow:

```sh
npx laf-bridge pair
```

Expected UI behavior:

- Settings -> LAF Bridge shows the fixed command `npx laf-bridge pair`.
- Settings creates and displays a setup code separately.
- The command is shown before the setup code.
- Server-provided command flags are ignored by the browser.
- Hosted settings hide local runtime reset/API key sections.
- Tasks use Bridge managed checkout wording instead of local folder/worktree
  setup commands.

Expected API behavior:

- Pairing start returns `commands: { pair: "npx laf-bridge pair" }`.
- Pairing start does not return `commands.setup`, raw pairing code fields, or
  pairing flags in the command string.
- Repo-backed hosted tasks use `execution_mode: "managed_checkout"`.
- Browser-provided `execution_mode: "managed_checkout"` cannot force managed
  checkout without hosted repo metadata.
- Hosted task payloads do not expose `worktree_path` or `runner_job`.
- Legacy Runner routes return unavailable/not found behavior.

Expected npx package behavior:

- `npx laf-bridge pair` launches the Bridge pair flow.
- `npx laf-bridge pair --help` prints public pair usage and mentions setup
  code prompting.
- `npx laf-bridge start`, `status`, `runner`, `pair --api-url`, and
  `pair --code` are rejected from the public npx package.

## Verified Locally

The following commands passed before this handoff:

```sh
npm run bridge-only:surface
npm run hosted-bridge:ops:test
npm run hosted-bridge:smoke:test
npm run laf-bridge:package:test
node --test api/hosted-api.test.js
go test ./cmd/laf-bridge
cd web && bun run test src/components/apps/SettingsApp.test.tsx
git diff --check
```

Most recent notable pass counts:

- Hosted Bridge ops tests: 58 passed
- Hosted Bridge smoke tests: 20 passed
- LAF Bridge package tests: 20 passed
- Hosted API tests: 55 passed
- SettingsApp tests: 11 passed

`npm run hosted-bridge:readiness` currently has one expected outcome:

- Schema gate passes.
- Env preflight fails until production host/signing-key env vars are configured.
- Release gate fails until `laf-bridge@latest` exists on npm.

Those two failures are external deployment/release state, not repo-local test
failures.

## Deployment Owner Checklist

1. Open and review the PR from `bridge-update`.
   Review priority:
   - `api/[...path].js`
   - `api/hosted-api.test.js`
   - `internal/bridge`
   - `internal/team`
   - `supabase/migrations`
   - `.github/workflows/release.yml`
   - `.github/workflows/hosted-bridge-deploy-smoke.yml`
   - `npm-bridge`
   - `web/src/components/apps/SettingsApp.tsx`
   - `web/src/components/apps/TasksApp.tsx`

2. Configure production env in Vercel or the equivalent hosted environment.
   Required:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_ANON_KEY`
   - `LAF_OFFICE_PUBLIC_HOST` or `VERCEL_URL`
   - `LAF_EXECUTION_PLAN_SIGNING_PRIVATE_KEY`
   - `LAF_EXECUTION_PLAN_SIGNING_PUBLIC_KEY`
   - `LAF_EXECUTION_PLAN_SIGNING_KEY_ID`

   Split-origin deployments also need:
   - `VITE_LAF_API_BASE_URL`
   - `LAF_OFFICE_PUBLIC_API_BASE_URL`
   - `LAF_OFFICE_ALLOWED_ORIGINS`

3. Generate execution-plan signing keys if they do not already exist:

```sh
npm run hosted-bridge:keys -- --dotenv --key-id execution-plan-prod-YYYY-MM
```

   Store PEM values with real newlines, not literal `\n` escapes.

4. Run production preflight against exported deployment env:

```sh
npm run hosted-bridge:preflight -- --no-env-file
```

5. Apply Supabase migrations in order, then verify the final Bridge-only schema:

```sh
npm run hosted-bridge:schema
```

6. Run the Release workflow for a valid SemVer tag. Confirm it:
   - injects the tag version into both `npm/package.json` and
     `npm-bridge/package.json`
   - publishes GitHub release assets containing `laf-office` and `laf-bridge`
   - publishes `laf-bridge`
   - publishes the developer `laf-office` bootstrap package
   - keeps stable releases on npm dist-tag `latest`
   - keeps prereleases on npm dist-tag `next`

7. Validate the public Bridge package:

```sh
npm run hosted-bridge:release-gate
npm view laf-bridge version
npx --yes laf-bridge@latest --version
npx --yes laf-bridge@latest pair --help
```

   For a specific release:

```sh
node scripts/hosted-bridge-release-gate.cjs --package laf-bridge@<version>
node scripts/hosted-bridge-release-gate.cjs --package laf-bridge@latest --expect-version <version>
```

8. Run full readiness:

```sh
npm run hosted-bridge:readiness -- --bridge-package laf-bridge@latest --expect-version <version>
```

9. Deploy the hosted web/API app.

10. Run the Hosted Bridge Deploy Smoke workflow:
    - First in `api` mode against the deployed `/api` URL.
    - Then in `cli` mode on a host with:
      - Node/npm
      - git
      - a logged-in Codex CLI or Claude Code CLI
      - network access to the deployed API

11. Manually verify a production pairing:
    - Open hosted Settings -> LAF Bridge.
    - Create setup code.
    - Run `npx laf-bridge pair`.
    - Paste code.
    - Confirm Bridge online status.
    - Create a repo-backed task.
    - Confirm managed checkout, execution events, changed files, and receipt
      appear in the hosted UI.

## Current External Blockers

These are the only known blockers left outside the repo:

- Production env is missing `LAF_OFFICE_PUBLIC_HOST` or `VERCEL_URL`.
- Production env is missing execution-plan signing key values:
  - `LAF_EXECUTION_PLAN_SIGNING_PRIVATE_KEY`
  - `LAF_EXECUTION_PLAN_SIGNING_PUBLIC_KEY`
  - `LAF_EXECUTION_PLAN_SIGNING_KEY_ID`
- `laf-bridge@latest` is not published on npm yet. `npm view laf-bridge`
  currently returns 404, so new users cannot run the public hosted pairing
  command until the Release workflow publishes it.

## Rollback Notes

If production pairing fails after deploy:

- Disable new hosted pairing in product copy or feature access first.
- Revert the web/API deployment to the previous stable build if setup-code
  creation or API auth is affected.
- Do not reintroduce `laf-runner` package/install flows as a quick fix. The
  intended rollback path is deployment rollback or npm dist-tag repair.
- If npm publish succeeded but `latest` points at the wrong package, repair the
  dist-tag and rerun:

```sh
npm run hosted-bridge:release-gate
```

## Files To Review First

- `docs/specs/HOSTED-DEPLOYMENT-RUNBOOK.md`
- `docs/specs/HOSTED-BRIDGE-PROTOCOL.md`
- `.env.example`
- `.github/workflows/release.yml`
- `.github/workflows/hosted-bridge-deploy-smoke.yml`
- `scripts/hosted-bridge-readiness.cjs`
- `scripts/hosted-env-preflight.cjs`
- `scripts/hosted-bridge-release-gate.cjs`
- `scripts/hosted-bridge-smoke.cjs`
- `api/[...path].js`
- `api/hosted-api.test.js`
- `npm-bridge/package.json`
- `npm-bridge/bin/laf-bridge.js`
- `cmd/laf-bridge/main.go`
- `web/src/components/apps/SettingsApp.tsx`
- `web/src/components/apps/TasksApp.tsx`

