# Hosted Deployment Runbook

Status: Bridge-only hosted execution runbook

## Go-Live Checklist

Run these gates in order before enabling hosted pairing for production users:

1. Generate execution-plan signing keys and copy the values into Vercel:

```sh
npm run hosted-bridge:keys -- --dotenv --key-id execution-plan-prod-YYYY-MM
```

2. Set the required Supabase, public host, and signing-key environment
   variables in Vercel. Use `.env.example` as the checklist and
   `npm run hosted-bridge:preflight -- --no-env-file` to validate exported
   shell or CI variables without reading local files.
3. Apply Supabase migrations, then verify the final hosted schema:

```sh
npm run hosted-bridge:schema
```

4. Run the Release workflow for the tag so GitHub release assets, `laf-bridge`,
   and the developer `laf-office` bootstrap package publish together.
5. Validate the exact freshly published Bridge package before promoting
   `latest`:

```sh
npm run hosted-bridge:readiness -- --bridge-package laf-bridge@<version>
```

6. After Vercel deploys, run `Hosted Bridge Deploy Smoke` against the deployed
   `/api` URL. Use `api` mode first, then `cli` mode on a host with `git` and a
   logged-in Codex or Claude CLI.

## Vercel

The repo contains a root `vercel.json` that builds the Vite web app from
`web/`, serves `web/dist`, and routes `/api/*` to the hosted control-plane
facade in `api/[...path].js`.

Required Vercel environment variables:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY`
- `LAF_EXECUTION_PLAN_SIGNING_PRIVATE_KEY` and
  `LAF_EXECUTION_PLAN_SIGNING_PUBLIC_KEY`: PEM-encoded Ed25519 key pair used to
  sign execution plans. Production pairing fails closed when these are missing,
  because Bridge must receive a stable public key during `npx laf-bridge pair`
  and verify every plan before running local CLI work.
- `LAF_EXECUTION_PLAN_SIGNING_KEY_ID`: stable key identifier for execution plan
  signatures, such as `execution-plan-prod-2026-05`.

Generate a production Ed25519 signing key pair before configuring Vercel:

```sh
npm run hosted-bridge:keys -- --key-id execution-plan-prod-2026-05
```

For local `.env.local` preflight, generate dotenv-compatible assignments:

```sh
npm run hosted-bridge:keys -- --dotenv --key-id execution-plan-prod-2026-05
```

Paste the generated private key, public key, and key id into the matching Vercel
environment variables. PEM values must be stored with real newlines, not literal
`\n` escapes.
Use `.env.example` as the local/Vercel environment checklist; it intentionally
keeps secret values blank.

Recommended production environment variables:

- `VITE_LAF_API_BASE_URL`: optional browser API base URL. Leave unset for the
  normal same-origin Vercel deployment, where the web app calls `/api`. Set it
  to a deployed API origin or base path such as `https://api.example.com/api`
  only when the web app and hosted API are served from different origins. Bare
  API hosts such as `api.example.com` normalize to `https://api.example.com/api`
  so they match the Bridge setup-code API base. The same base is used for
  browser API calls and any browser-side SSE URL construction.
- `LAF_OFFICE_PUBLIC_API_BASE_URL`: optional server-side canonical hosted API
  base URL used in Bridge setup codes and other server-generated API URLs. Leave
  unset for same-origin `/api` deployments. In split-origin deployments, set it
  to the same deployed API base as `VITE_LAF_API_BASE_URL`, for example
  `https://api.example.com/api`.
- `LAF_OFFICE_PUBLIC_HOST`: canonical hosted web origin, for example
  `https://office.example.com` with no path, query string, or hash. Vercel's
  `VERCEL_URL` is used as a fallback, but setting this avoids invite/setup URLs
  drifting to a preview domain.
  Production Bridge setup codes embed this canonical API origin, not
  client-submitted URLs.
- `LAF_OFFICE_ALLOWED_ORIGINS`: comma-separated browser origins allowed to
  call the API with cookies when the web app and API are served from different
  origins. Same-origin `/api` deployments do not need CORS. Trusted
  split-origin auth responses use `SameSite=None; Secure` cookies so browser
  sessions survive credentialed API calls.

The API facade performs no agent execution, git operations, or filesystem work.
It validates Supabase users/team membership, mirrors product records, manages
Bridge pairing/devices, creates execution plans, and accepts Bridge-uploaded
events and receipts.

Before deploying, validate the production environment locally or in CI without
printing secret values, and verify that the ordered Supabase migrations resolve
to a Bridge-only final execution schema:

```sh
npm run hosted-bridge:readiness
```

The readiness command runs the schema manifest, environment preflight, and
public npm release gate in order, and continues after failures so every
deployment blocker is visible in one pass. For focused debugging, run
`npm run hosted-bridge:schema`, `npm run hosted-bridge:preflight`, or
`npm run hosted-bridge:release-gate` directly. The preflight loads `.env` and
`.env.local` by default when they are present, while shell environment variables
remain authoritative; pass `--no-env-file` to validate only exported shell/CI
variables or `--dotenv <path>` for an additional deployment file. The
preflight rejects private/localhost deployment URLs, malformed PEM signing
keys, mismatched `LAF_OFFICE_PUBLIC_API_BASE_URL` and
`VITE_LAF_API_BASE_URL`, and split-origin API deployments where
`LAF_OFFICE_ALLOWED_ORIGINS` does not include the canonical web origin. Its
output includes the effective Bridge setup API base that will be embedded in
setup codes for `npx laf-bridge pair`, even when same-origin deployments leave
`LAF_OFFICE_PUBLIC_API_BASE_URL` unset. On failure, the output also prints
`NEXT` hints for the missing Supabase settings, signing keys, public host, CORS
origins, and the exact command to rerun before smoke testing.
The full readiness command forwards the same dotenv loading controls to preflight, so
`npm run hosted-bridge:readiness -- --no-env-file` validates only exported
environment variables. To validate a freshly published npm package before
promoting `latest`, run
`npm run hosted-bridge:readiness -- --bridge-package laf-bridge@<version>`.
To verify that the public `latest` path already resolves to that release, run
`npm run hosted-bridge:readiness -- --bridge-package laf-bridge@latest --expect-version <version>`.

For contributor-only hosted-API rehearsals, run the serverless facade directly
instead of starting the local Go app, and opt into localhost validation
explicitly:

```sh
npm run hosted-api:dev
npm run hosted-bridge:preflight -- --allow-localhost
```

This local rehearsal path is not a production readiness gate.
Production preflight must run without `--allow-localhost`.
Production users still pair through the deployed web app with only
`npx laf-bridge pair`.

## Release Gate

The hosted Bridge setup flow depends on the public npm package name
`laf-bridge`.
Before treating a deployment as ready for new users, confirm the release tag has
published both the GitHub release assets and the npm Bridge package:

```sh
npm run hosted-bridge:release-gate
npm view laf-bridge version
npx --yes laf-bridge@latest --version
npx --yes laf-bridge@latest pair --help
```

For a freshly published tag, verify the exact package before promoting the
deployment. Release tags and `bridge_package` inputs must use canonical
npm-compatible SemVer without build metadata, leading-zero numeric identifiers,
or empty prerelease identifiers. npm normalizes values like `1.2.3+build.1` to
`1.2.3` and `01.2.3` to `1.2.3`, which would no longer match the GitHub release
asset names:

```sh
node scripts/hosted-bridge-release-gate.cjs --package laf-bridge@<version>
node scripts/hosted-bridge-release-gate.cjs --package laf-bridge@latest --expect-version <version>
```

If `npm view laf-bridge` returns 404, the hosted UI may generate setup codes but
new users cannot run `npx laf-bridge pair` yet. Re-run the Release workflow
after fixing npm publish credentials or package ownership. The release gate
prints `NEXT` hints for npm 404s, placeholder versions, accidental internal
command exposure, and the exact command to rerun before enabling hosted pairing.
The Release workflow retries both the exact-version `laf-bridge@<version>`
release gate and the `laf-bridge@latest --expect-version <version>` gate after
publish so short npm registry or dist-tag propagation delays do not hide a
successful publish, but a persistent failure still blocks hosted pairing.
Stable SemVer tags publish with npm dist-tag `latest`; pre-release tags publish
with npm dist-tag `next` and skip the `latest` gate so `npx laf-bridge pair`
does not accidentally move to a beta build. The release smoke still verifies
the exact pre-release package and fails if `laf-bridge@latest` resolves to that
pre-release version.
Release retries also reapply the intended npm dist-tag to already-published
`laf-bridge` and `laf-office` versions, so a partial publish with a missing or
stale `latest`/`next` tag can be repaired by rerunning the workflow. Dist-tag
updates are retried so short npm registry propagation delays do not leave a
fresh package version detached from its selected tag.
Stable release smoke verifies both exact-version `laf-office@<version>` and
`laf-office@latest` report the tag version; pre-release smoke verifies the
exact package only.
Before GitHub release assets are uploaded, the workflow also injects the tag
version into `npm-bridge/package.json` and `npm/package.json`, then runs
`npm publish --dry-run --access public` in both package directories. That dry
run catches missing package files, placeholder versions, and public package
surface regressions before the native release artifact exists.

## Supabase

Apply the Supabase migrations in order. Hosted Bridge execution needs the base
control-plane tables plus Bridge device, pairing, execution plan, and receipt
tables.

Every migration filename must use a unique 14-digit timestamp prefix before the
first underscore, such as `20260519000000_bridge_only_execution_surface.sql`.
Supabase stores that numeric prefix as the migration version, so duplicate
date-only prefixes can collide in `supabase_migrations.schema_migrations` and
leave hosted Bridge tables unapplied. Run `npm run hosted-bridge:schema` before
`supabase db push` or any deployment smoke.

The hosted API uses the service role from Vercel server functions, but every
browser-facing route still performs explicit membership checks before reading or
mutating team-scoped records. Bridge routes authenticate with the one-time
Bridge token hash stored on `public.bridge_devices`; pass it as a bearer token.

## LAF Bridge Against Hosted

After logging in to the hosted UI, open Settings -> LAF Bridge, create a setup
code, then run the printed command on the computer that should execute work:

```sh
npx laf-bridge pair
```

Paste the setup code when LAF Bridge prompts for it. Pairing stores the Bridge
token locally and starts the Bridge loop by default. The Bridge sends
heartbeats, reports detected Codex/Claude CLI runtimes, polls for pending
execution plans, runs the requested local CLI, and uploads events, receipts,
file-change summaries, and PR metadata.
For project tasks with a GitHub repository configured, the signed execution plan
includes that repository URL; Bridge prepares a project-specific managed
checkout locally before invoking Codex or Claude. Hosted execution does not
accept browser-provided local folder paths or project local-binding state.

Hosted onboarding should not present legacy local-execution products, native
installers, URL handlers, or separate pair/start/status commands.

Bridge host prerequisites:

- Node/npm for the `npx laf-bridge` entrypoint
- `git`
- `gh auth login` when PR creation or repo readiness checks are required
- at least one provider CLI matching the work it should run: `codex` or
  `claude`

The hosted workspace must remain usable before any Bridge is connected. Missing
Bridge state blocks local Codex/Claude execution only; login, projects, tasks,
memory, review queues, and unavailable-state UI remain available.

## Operational Smoke Test

After applying Supabase migrations and deploying Vercel, run the hosted Bridge
smoke test against the deployed API. The default `api` mode validates hosted
auth, hosted-safe slash command discovery and command-run rejection boundaries,
Bridge pairing, heartbeat, availability, task creation, execution plan dispatch,
Bridge completion, execution receipt creation, and the absence of deprecated
local-execution payloads.

You can run the same gate from GitHub Actions with the
`Hosted Bridge Deploy Smoke` workflow. Configure repository or environment
secrets `LAF_SMOKE_EMAIL` and `LAF_SMOKE_PASSWORD`, then dispatch the workflow
with the deployed `/api` URL. The workflow first verifies the configured
`bridge_package` input, which defaults to `laf-bridge@latest`, and the local
Supabase migration manifest by running `npm run hosted-bridge:schema` and
`npm run hosted-bridge:release-gate`, so it catches migration-manifest and
npm-publication gates before exercising the deployed API. The public npm
release gate intentionally runs before CLI host prerequisite checks, so a
missing or broken `laf-bridge` package cannot be hidden by an unauthenticated
or under-provisioned smoke host. Use
`laf-bridge@<version>` without build metadata when validating a fresh release
before promoting `latest`, or set `bridge_package=laf-bridge@latest` plus
`bridge_expected_version=<version>` after promotion to prove the user-facing
default package resolves to the intended release. If the hosted web app and API are on
different origins, set `browser_origin` to the web origin so the smoke verifies
credentialed CORS preflight as well. For `cli` smoke mode, set the
`github_actions_runs_on` workflow input to a GitHub Actions `runs-on` value for
a host that already has `git` and Codex or Claude CLI authenticated. The
workflow runs the Bridge with `npx --yes <bridge_package>` to avoid
interactive npm install prompts in CI; the hosted API must still present the
user-facing command as exactly `npx laf-bridge pair`.

The same workflow also exposes `workflow_call`, so a Vercel deployment workflow
can call it after publishing a production URL and pass the exact deployed
`api_url`, `bridge_package`, optional `browser_origin`, and smoke mode while
reusing the same `LAF_SMOKE_EMAIL` and `LAF_SMOKE_PASSWORD` secrets.

```sh
LAF_HOSTED_API_URL=https://<your-vercel-app>/api \
LAF_SMOKE_EMAIL=owner@example.com \
LAF_SMOKE_PASSWORD='...' \
npm run hosted-bridge:smoke
```

For a first-run environment, add `LAF_SMOKE_SIGNUP=1` to create the smoke user
and workspace. To exercise the actual local Bridge command and real
Codex/Claude CLI execution, run CLI mode. The Bridge command defaults to
`npx --yes laf-bridge@latest`; set `LAF_SMOKE_BRIDGE_CMD` only when testing a
local package tarball or an unpublished binary. `LAF_SMOKE_BRIDGE_CMD` is the
base command; do not include `pair`, `start`, setup codes, or internal pairing
flags because the smoke appends `pair` only after confirming the hosted API
exposes exactly `npx laf-bridge pair` to users. The CLI smoke waits up to 180
seconds for the Bridge command to install, pair, report local CLI runtimes, and
finish the plan; set `LAF_SMOKE_BRIDGE_TIMEOUT_MS` only for unusually slow cold
`npx` downloads.

```sh
LAF_SMOKE_MODE=cli \
LAF_HOSTED_API_URL=https://<your-vercel-app>/api \
LAF_SMOKE_EMAIL=owner@example.com \
LAF_SMOKE_PASSWORD='...' \
LAF_SMOKE_REPO_URL=https://github.com/LAF-labs/LAF-Agents-Office \
npm run hosted-bridge:smoke
```

`api` mode is a fast deployment/schema guard. `cli` mode is the final operating
E2E gate: it keeps the noninteractive `npx --yes laf-bridge@latest pair`
process running by default, verifies detected Codex/Claude runtimes, creates a
LAF Bridge execution plan, and checks that the same pair-started Bridge loop
completes the work and exposes a receipt through the hosted API.
