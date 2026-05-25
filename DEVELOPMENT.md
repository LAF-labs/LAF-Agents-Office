# Development

LAF Agents Office is now a hosted Startup Office SaaS. The development surface is:

- `web/` for the React app.
- `api/` for the Vercel-compatible hosted API facade.
- `workers/startup-office/` for cloud operating-loop execution.
- `supabase/migrations/` for workspace data.

Local commands are for contributors only; customers do not run background
execution services or install a CLI.

The current development contract is tracked in
`shared/startup-office-dev-workflow.json` and checked by
`npm run startup-office:dev-workflow`.

## Setup

```bash
npm install
cd web && bun install
```

If you use git hooks:

```bash
bunx lefthook install
```

## Main Checks

```bash
npm run beta:release-gate
npm run startup-office:web-lint-budget
npm run hosted-env:preflight:test
npm --prefix web run typecheck
npm --prefix web run build
npm run startup-office:schema
```

## Local Web App

Run the hosted API facade and Vite app separately:

```bash
npm run hosted-api:dev
cd web && bun run dev
```

For local worker rehearsals, run these in separate terminals with non-production
environment values:

```bash
npm run startup-office:loop-worker
npm run startup-office:outbox-worker
```

Copy `.env.example` to `.env.local` for local cloud rehearsals. Production and
preview deploys should provide equivalent values through the deployment
platform.

## Supabase

Migrations are append-only forward migrations in `supabase/migrations/`.

```bash
supabase migration list
supabase db push
```

Use `supabase db push --dry-run` before applying migrations when reviewing
schema-only changes.

Live cloud rehearsals use deploy-time secrets and should be run only against
non-production projects unless explicitly performing a production handoff:

```bash
npm run hosted-env:preflight
npm run startup-office:rls-live
npm run startup-office:synthetic-monitor
```
