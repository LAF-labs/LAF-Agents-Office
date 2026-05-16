# Hosted Deployment Runbook

Status: v1 execution-ready scaffold

## Vercel

The repo now contains a root `vercel.json` that builds the Vite web app from
`web/`, serves `web/dist`, and routes `/api/*` to the hosted control-plane
facade in `api/[...path].js`.

Required Vercel environment variables:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY`

The API facade intentionally performs no agent execution, no git operations,
and no filesystem work. It only validates Supabase users/team membership,
mirrors project/task records, manages runner registrations and job leases, and
accepts validated runner job/wiki results.

## Supabase

Apply the Supabase migrations in order:

```sh
supabase/migrations/20260509_hosted_control_plane.sql
supabase/migrations/20260510_runner_job_claim_hardening.sql
supabase/migrations/20260510_runner_pairing_codes.sql
```

The hosted API uses the service role from Vercel server functions, but every
browser-facing route still performs explicit membership checks before reading or
mutating team-scoped records. Runner routes authenticate with the one-time
runner token hash stored in `public.runners`; pass it as a bearer token, not a
query parameter. Job leasing uses the `claim_runner_job` RPC so concurrent
runners cannot claim the same queued job.

## Local Runner Against Hosted

Install `laf-runner` from a shell on the macOS/Linux machine that should execute
hosted jobs:

```sh
curl -fsSL https://raw.githubusercontent.com/LAF-labs/LAF-Agents-Office/main/scripts/install.sh | LAF_OFFICE_INSTALL_BINARY=laf-runner sh
```

After logging in to the hosted UI, open Settings -> LAF Bridge, create a setup
command, then run the printed command on the bridge machine. The command
installs `laf-runner` if needed, pairs it with the workspace, and starts it in
the background:

```sh
laf-runner pair --api-url https://<your-vercel-app>/api --code <setup-code> --background
```

`laf-office runner ...` remains supported for local workspace installs, but
hosted onboarding should present `laf-runner` as the primary command.

Hosted runner onboarding is command-only for now. Windows and native package
installers are paused while the CLI runner path stabilizes.

For source checkouts or release tarballs, the same script can install only the
runner binary:

```sh
LAF_OFFICE_INSTALL_BINARY=laf-runner sh scripts/install.sh
```

Then create a setup command in Settings -> LAF Bridge and pair from the runner
machine:

```sh
laf-runner pair --api-url https://<your-hosted-app>/api --code <setup-code> --background
```

The runner keeps using local `gh auth`, local provider credentials, and local
git worktrees. Hosted state records only runner capability, job events, delivery
receipt metadata, and wiki index results.

Runner host prerequisites:

- `git`
- `gh auth login` when PR creation or repo readiness checks are required
- at least one provider CLI matching the jobs it should lease: `codex`,
  `claude`, or `opencode`
