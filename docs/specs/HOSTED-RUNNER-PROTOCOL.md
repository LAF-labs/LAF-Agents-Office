# Hosted Runner Protocol

Status: v1 local-runner control-plane facade

## Invariant

Projects, tasks, delivery receipts, wiki write results, and `agent-memory/v1`
packets are product state. Runners are the execution boundary. The hosted API
must never execute agents, create local worktrees, or trust browser-provided
filesystem paths.

## Implemented Local Facade

The local broker now exposes the hosted runner contract so web-hosted APIs can
adopt the same semantics without changing runner behavior later:

- `POST /runner/register`
- `POST /runner/pairing/start`
- `POST /runner/pairing/claim`
- `POST /runner/heartbeat`
- `POST /runner/capabilities`
- `POST /runner/jobs/lease`
- `POST /runner/jobs/{id}/events`
- `POST /runner/jobs/{id}/renew`
- `POST /runner/jobs/{id}/complete`
- `POST /runner/wiki/write-result`

Runner tokens are returned once at registration or pairing claim and persisted
only as hashes in broker state. Browser users should create a short-lived setup
code through `POST /runner/pairing/start`; the local runner claims it through
`POST /runner/pairing/claim`, so non-developer onboarding does not require
copying a Supabase access token. Heartbeat, capability, lease, renewal,
completion, and wiki write result endpoints authenticate with
`Authorization: Bearer <runner-token>` or `X-LAF-Runner-Token`. Query-string
runner tokens are rejected.

## Durable Records

The broker state now mirrors the hosted database records that Supabase/Postgres
will own:

- `runner`
- `runner_job`
- `runner_job_event`
- `wiki_write_request`
- `wiki_article_index`

These records are intentionally shaped around `team_id`. Hosted persistence must
preserve that as the first tenant boundary and enforce membership on all browser
queries.

## Job Lease Semantics

Lease response includes:

- `job_id`
- `team_id`
- `project_id`
- `task_id`
- `agent_slug`
- `execution_mode`
- `provider_kind`
- `agent_memory_packet`
- `repo_url`
- `wiki_path`
- `lease_expires_at`

Supported lifecycle values:

- `queued`
- `leased`
- `running`
- `succeeded`
- `failed`
- `canceled`
- `expired`

Hosted leases are claimed through the Supabase `claim_runner_job` RPC. The RPC
uses row locking (`FOR UPDATE SKIP LOCKED`) so concurrent runners cannot claim
the same queued job. Expired leased/running jobs are requeued during lease
attempts; the local broker facade also records an `expired` job event.

Only the runner that owns an active, unexpired `leased` or `running` job may
write progress events, renew the lease, or complete the job. Long-running
executions renew through `POST /runner/jobs/{job_id}/renew` with
`lease_seconds`.

Provider matching is optional but strict when present. A job with
`provider_kind: "codex"` can only be leased by a runner whose reported
`provider_runtimes` includes `codex`; the same applies to `claude-code` and
`opencode`. Jobs without `provider_kind` may be leased by any runner that
matches the execution mode.

Hosted runner jobs use the canonical `agent-memory/v1` packet shape: task,
project, `must_read`, `loaded_context`, `decisions`, `risks`, `open_questions`,
`recent_work`, `must_obey`, `start_here`, `write_back`, and `unavailable`.

## CLI Surface

The preferred hosted CLI is the standalone `laf-runner` binary:

- `laf-runner pair --connect`
- `laf-runner pair-url <laf-runner://pair?...>`
- `laf-runner login`
- `laf-runner connect`
- `laf-runner status`
- `laf-runner disconnect`

The workspace binary keeps the same public runner command surface for
compatibility:

- `laf-office runner pair`
- `laf-office runner login`
- `laf-office runner connect`
- `laf-office runner status`
- `laf-office runner disconnect`

`runner pair` exchanges the short setup code shown in the hosted UI for a
runner token, saves it locally, and can immediately enter the connect loop with
`--connect`. `runner pair-url` is the non-developer path used by the
`laf-runner://pair?...` OS protocol handler; it pairs the runner, starts
`laf-runner connect` in the background, and exits so the browser flow does not
require Terminal or PowerShell. `runner status` reports local capabilities for
`git`, `gh auth`, provider runtimes, OS/arch, and supported execution modes.
`runner connect` registers if needed, uploads capabilities, heartbeats, and
leases jobs through the protocol.

## Execution And Provider Split

The runner protocol must keep execution location separate from model/provider
selection.

- `execution_mode` says where and how work is performed, such as `office` or
  `local_worktree`.
- `provider_kind` says which model runtime should reason about the job, such as
  `codex`, `claude-code`, `opencode`, or a future `laf-cloud`.
- `runner_type` says who owns the machine, currently `local` or `managed`.

This split supports the important future cases without changing the job
protocol: a user's local machine can execute filesystem work while using a
hosted LAF model, and a managed runner can execute cloud work while using the
same agent-memory packet shape.

## Task Execution Boundary

Eligible project tasks now create or reuse a `runner_job` instead of relying on
browser/API-side execution. The task response includes `runner_job` when a job
was queued or already active. When `LAF_OFFICE_HOSTED_CONTROL_PLANE=1` or
`LAF_OFFICE_EXECUTION_BOUNDARY=runner|hosted|hybrid`, task creation does not
materialize local worktree paths in the API process.

The web project detail surface reads `GET /runner/status` and shows whether a
runner is connected, stale, unavailable, queued, or actively running a job.

Runner job completion is the source of truth for delivery receipt updates:

- task progress events come from `/runner/jobs/{id}/events`
- delivery URL/summary/check metadata comes from `/runner/jobs/{id}/complete`
- canonical wiki writes come from `/runner/wiki/write-result`

## Hosted API Facade

`api/[...path].js` is the first Vercel/Supabase facade over these same records
and endpoints. It performs Supabase Auth membership checks for browser routes,
stores projects/tasks/jobs through PostgREST, and authenticates runner routes
with runner token hashes. It deliberately performs no execution, git, GitHub,
worktree, or canonical wiki filesystem work.

Remaining production hardening:

- sign and notarize the Windows/macOS installers around the same setup-code
  pairing flow
- add project-scoped runner preferences
- add managed runner infrastructure behind the same protocol
- add a live Supabase/Vercel smoke test once deployment credentials exist
