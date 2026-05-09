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

Apply `supabase/migrations/20260509_hosted_control_plane.sql`.

The hosted API uses the service role from Vercel server functions, but every
browser-facing route still performs explicit membership checks before reading or
mutating team-scoped records. Runner routes authenticate with the one-time
runner token hash stored in `public.runners`.

## Local Runner Against Hosted

After logging in to the hosted UI and obtaining a user access token for runner
registration, run:

```sh
laf-office runner login --api-url https://<your-vercel-app> --team-id <team-id> --api-token <supabase-user-access-token>
laf-office runner connect
```

The runner keeps using local `gh auth`, local provider credentials, and local
git worktrees. Hosted state records only runner capability, job events, delivery
receipt metadata, and wiki index results.
