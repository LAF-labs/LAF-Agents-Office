# Hosted Product Boundary

This project remains local-first while the product surface is being shaped. The
hosted version should preserve the same project-centered workflow instead of
reintroducing office, CRM, email, calendar, notification, or managed integration
state.

## Target Shape

The hosted architecture has three clear responsibilities:

- **Supabase Postgres/Auth** owns durable product records: users, teams,
  memberships, projects, project repo connections, tasks, delivery receipts, and
  a queryable index of project wiki pages.
- **Vercel web/API** owns the browser UI, auth session bridge, lightweight API
  routes, and product permissions. It should not run coding agents or hold
  long-lived worktrees.
- **Runner service** owns agent execution, git checkouts, branch creation, test
  commands, project wiki writes, and GitHub PR creation. The runner is the only
  component allowed to mutate source repositories.

```mermaid
flowchart LR
  Browser["Web UI on Vercel"] --> API["Vercel API"]
  API --> DB["Supabase Auth + Postgres"]
  Runner["Agent runner"] --> API
  Runner --> DB
  Runner --> Wiki["Project wiki markdown"]
  Runner --> GitHub["Project GitHub repo"]
```

## Product Rules

- Projects are the primary workspace unit after login.
- GitHub connections are optional and project-scoped.
- Before GitHub is ready, agents may plan, document, split tasks, and update the
  project wiki only.
- After GitHub is ready, coding tasks must create branch/PR evidence before they
  can be marked done.
- The project wiki remains the canonical memory surface. Hosted storage can index
  and sync it, but it must not replace it with CRM or integration memory.

## Data Split

| Domain | Hosted owner | Notes |
|---|---|---|
| Auth users and sessions | Supabase Auth | Replace local password/session logic before public hosting. |
| Teams and memberships | Supabase Postgres | Every project/task query is team-scoped. |
| Projects | Supabase Postgres | Includes optional repo URL and status. |
| Project repo readiness | Runner + GitHub CLI/App | API requests a fresh check; readiness is not a team-wide setting. |
| Tasks and receipts | Supabase Postgres | `delivery_url`, summary, and timestamps stay first-class. |
| Project wiki articles | Runner-owned markdown, DB-indexed | Markdown remains reviewable source of truth. |
| Agent execution logs | Runner storage, DB summaries | UI should show compact task progress, not raw logs by default. |

## Non-Goals For This Phase

- No hosted CRM, contacts, deals, email inbox, calendar, reminders, or generic
  notification center.
- No team-wide repository setting.
- No browser-executed coding agents.
- No hosted-browser-to-localhost execution bridge. The hosted web app must not
  depend on reaching a service on the user's loopback interface. Local runners
  connect outbound to the control plane and lease work.
- No long-running worktree state inside Vercel functions.
- No production billing or tenant-isolation implementation in the local MVP.

## Runner Distribution

The local runner is a first-class installable product component. `laf-runner`
is the preferred executable for hosted use; `laf-office runner <command>` stays
as a compatibility path for existing local workspace installs.

NPM is not part of the hosted execution architecture. It may remain as a
developer bootstrap for `laf-office`, but hosted runner onboarding is
command-only for now:

- macOS/Linux: install `laf-runner` from the release tarball via
  `scripts/install.sh` or the hosted setup command.
- Windows: support is paused.
- Native package installers and URL handlers are paused until the command-line
  runner path has stabilized.

Every runner install path should converge on the same protocol: create a
short-lived setup code in the web UI, claim it through a generated setup
command that runs `laf-runner pair --background`, report
capabilities, heartbeat, lease jobs, renew leases, upload events, and complete
jobs.

The hosted workspace must remain usable before any runner is installed. Missing
runners block local Codex/Claude execution only; planning, project memory, task
creation, and queue visibility remain available.

## Migration Order

1. Keep local APIs stable while projects, tasks, wiki, delivery receipts, and
   repo readiness are hardened.
2. Introduce Supabase tables that mirror the local contracts without changing the
   UI flow.
3. Move auth sessions to Supabase Auth and require team-scoped project/task
   queries.
4. Split agent execution into runner jobs while Vercel stays request/response.
5. Replace local `gh` readiness with project-scoped GitHub App installation
   checks.
6. Add PR creation and delivery receipt automation from the runner.

## Current Local Mapping

- `internal/team/broker.go` is the local API and state broker.
- `internal/team/project_wiki.go` and `internal/team/wiki_worker.go` define the
  current project memory contract.
- `internal/team/project_repo_readiness.go` is the local readiness adapter.
- `internal/team/runner_protocol.go`, `broker_runner.go`, and `runner_cli.go`
  define the hosted-style runner protocol and local CLI runner.
- `internal/team/worktree.go` is now runner-side infrastructure for project
  coding work.
- `api/[...path].js` is the Vercel/Supabase control-plane facade. It mirrors the
  local project/task/runner contracts without running agents in the API layer.
- `supabase/migrations/20260509_hosted_control_plane.sql` creates the hosted
  tables and RLS read boundaries.
- `supabase/migrations/20260510_runner_job_claim_hardening.sql` adds provider
  matching metadata and the atomic runner job claim RPC.
- `web/src/components/apps/TasksApp.tsx` is the project workspace surface that
  should remain the hosted product's primary screen, including runner status.
