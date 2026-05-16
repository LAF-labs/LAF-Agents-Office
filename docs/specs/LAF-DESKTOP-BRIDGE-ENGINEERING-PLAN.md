# LAF Desktop Bridge Engineering Plan

Status: implementation-ready plan
Source review date: 2026-05-15
Source draft: `/Users/gimgibeom/Downloads/laf_desktop_bridge_engineering_plan_2026-05-14.md`

## 1. Decision

LAF should not make the existing Runner the default local execution experience.
The default product path becomes:

```text
Hosted Web
  -> LAF Hosted API
  -> Cloud Relay + durable execution_plan state
  -> LAF Desktop Bridge
  -> user-installed Codex CLI
```

The Runner remains, but only as the enterprise/background execution surface:

```text
my_bridge:
  personal desktop bridge, foreground/local approval, user-owned CLI auth

team_bridge:
  admin-managed machine or background runner, scheduled/long-running work

laf_model:
  LAF-managed model path, no local CLI required

record_only:
  chat and task records only, no agent execution
```

Non-goals for this plan:

- Do not add SaaS BYOK provider-key collection.
- Do not store Codex or Claude credentials in LAF Cloud.
- Do not expose a browser-to-localhost execution API as the default product path.
- Do not remove existing Runner code in the first implementation pass.
- Do not implement Claude Code in the MVP. Design for it, but ship Codex first.

## 2. Current Repo Baseline

The current `main` already contains the governance work that the draft assumed:

- `supabase/migrations/20260514_agentic_workspace_governance.sql`
- permissions/model availability/orchestration/skills routes in `api/[...path].js`
- `web/src/components/ModelModeToggle.tsx`
- local broker permission/model availability support

Important gaps still present:

- The code still uses `local_cli` as a model mode in API, web, migration, and local broker.
- `tasks.execution_mode` is a different concept from model/runtime selection.
- `taskNeedsRunnerJob()` does not inspect model mode yet, so `record_only` can still enqueue runner work when status/owner match.
- Hosted orchestration confirmation still accepts client-supplied proposed actions.
- Hosted skill invoke currently requires `skill:read`, not `skill:invoke` plus manifest policy.

Those gaps are Phase 0 and Phase 1 blockers. Do not start the bridge relay until
they are closed.

## 3. Vocabulary Contract

This distinction is mandatory.

| Term | Values | Meaning |
|---|---|---|
| `model_mode` | `laf_model`, `my_bridge`, `team_bridge`, `record_only` | Who executes the AI work and whether execution is allowed. |
| `execution_mode` | `office`, `local_worktree`, `live_external` | How the task worktree/workflow is shaped inside LAF. Existing task lifecycle concept. |
| `provider` | `codex`, `claude_code`, `laf_model` | Provider adapter used by an execution plan. |
| `runner_jobs` | existing Runner queue | Only allowed for `team_bridge` after Phase 1. |
| `execution_plans` | new signed execution queue | Used for `my_bridge`; later can wrap `team_bridge` too. |

Backward compatibility:

- API input may accept `local_cli` as a deprecated alias during one release window.
- New writes must persist `my_bridge`, not `local_cli`.
- Existing `tasks.model_mode = 'local_cli'` should be migrated to `my_bridge` only after runner job auto-enqueue is guarded.
- Existing active `runner_jobs.model_mode = 'local_cli'` should be migrated to `team_bridge` so old queued Runner work keeps its semantics.
- UI must not display "Local CLI" as a product mode after Phase 1.

## 4. Target Architecture

```text
Browser
  -> Hosted API
      - auth/session/team membership
      - RBAC and audit
      - bridge pairing/device state
      - project local binding metadata
      - signed execution plan persistence
      - execution events and receipts
  -> Relay
      - MVP: Supabase Realtime Broadcast
      - Product: Cloudflare Durable Objects
  -> Desktop Bridge
      - outbound HTTPS/WSS only
      - device token authentication
      - plan signature validation
      - local approval gate
      - project binding lookup
      - Codex process adapter
      - event/receipt upload
```

The relay is not the source of truth. PostgreSQL is.

If a relay message is missed, the bridge must recover by polling pending plans:

```text
laf-bridge start
  -> authenticate device
  -> subscribe to relay channel
  -> GET /bridge/devices/:deviceId/pending-plans
  -> execute valid pending plans
```

## 5. Execution Plan State Machine

Valid states:

```text
pending
dispatched
acknowledged
running
completed
failed
cancelled
expired
```

Transitions:

```text
pending -> dispatched      API publishes relay event
pending -> expired         expires_at passes before bridge ack
dispatched -> acknowledged bridge receives and validates plan
acknowledged -> running    local approval granted and provider starts
acknowledged -> cancelled  local approval denied or cloud cancel requested
running -> completed       provider exits successfully and receipt accepted
running -> failed          provider exits non-zero or adapter fails
running -> cancelled       user/cloud cancellation wins
running -> expired         lease_until passes without heartbeat
```

Required idempotency:

- `execution_plans.nonce` is unique per signing key.
- Bridge keeps a local nonce cache and rejects replay.
- Event upload uses a monotonic `sequence` per `plan_id`.
- Receipt creation is idempotent by `plan_id`.
- Cancel is best-effort and can race with completion; final terminal state must be written once.

## 6. Database Contract

Add a new migration:

```text
supabase/migrations/20260515_desktop_bridge_execution.sql
```

### 6.1 Runtime Mode Migration

Update `tasks.model_mode` and `runner_jobs.model_mode` constraints. The order
matters: drop old constraints, migrate legacy values, then add the new
constraints.

```sql
alter table public.tasks
  drop constraint if exists tasks_model_mode_check;

alter table public.runner_jobs
  drop constraint if exists runner_jobs_model_mode_check;

update public.tasks
set model_mode = 'my_bridge'
where model_mode = 'local_cli';

update public.runner_jobs
set model_mode = 'team_bridge'
where model_mode = 'local_cli';

alter table public.tasks
  add constraint tasks_model_mode_check
  check (model_mode in ('laf_model', 'my_bridge', 'team_bridge', 'record_only'));

alter table public.runner_jobs
  add constraint runner_jobs_model_mode_check
  check (model_mode in ('laf_model', 'my_bridge', 'team_bridge', 'record_only'));
```

This must land with application code that prevents `my_bridge` from creating
runner jobs.

### 6.2 Permissions

Add permission keys to the JS and Go permission mirrors:

```text
bridge:pair_own
bridge:read_own
bridge:execute_own
bridge:manage_own
bridge:read_team
bridge:execute_team
bridge:manage_team
execution:plan_create
execution:read
execution:cancel
execution:receipt_read
execution:receipt_write
mcp:use_task_context
mcp:use_workspace_context
wiki:read
skill:invoke
```

Role defaults:

```text
owner/admin:
  all bridge and execution permissions

manager:
  bridge:execute_own, bridge:read_team, execution:plan_create,
  execution:read, execution:cancel, execution:receipt_read,
  execution:receipt_write, mcp:use_task_context

member:
  bridge:pair_own, bridge:read_own, bridge:execute_own,
  bridge:manage_own, execution:plan_create, execution:read,
  execution:receipt_read, mcp:use_task_context

viewer:
  execution:receipt_read only when project access allows
```

### 6.3 `bridge_devices`

```sql
create table if not exists public.bridge_devices (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  device_label text not null,
  device_kind text not null default 'desktop'
    check (device_kind in ('desktop', 'team_bridge')),
  platform text,
  arch text,
  bridge_version text,
  public_key text not null,
  token_hash text not null,
  capabilities jsonb not null default '{}'::jsonb,
  status text not null default 'offline'
    check (status in ('online', 'offline', 'revoked')),
  paired_at timestamptz not null default now(),
  last_seen_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_bridge_devices_team_user
  on public.bridge_devices(team_id, user_id, status);

create index if not exists idx_bridge_devices_team_seen
  on public.bridge_devices(team_id, last_seen_at desc);
```

Do not store the bridge token plaintext.

### 6.4 `bridge_pairing_codes`

```sql
create table if not exists public.bridge_pairing_codes (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  code_hash text not null unique,
  status text not null default 'pending'
    check (status in ('pending', 'claimed', 'expired', 'revoked')),
  expires_at timestamptz not null,
  claimed_at timestamptz,
  claimed_device_id uuid references public.bridge_devices(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_bridge_pairing_codes_team_user
  on public.bridge_pairing_codes(team_id, user_id, status, expires_at desc);
```

### 6.5 `project_local_bindings`

```sql
create table if not exists public.project_local_bindings (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid not null references public.bridge_devices(id) on delete cascade,
  display_name text not null,
  local_path_hash text not null,
  git_remote_hash text,
  git_root_hash text,
  trusted boolean not null default false,
  trusted_at timestamptz,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  unique(team_id, project_id, user_id, device_id, local_path_hash)
);

create index if not exists idx_project_local_bindings_project_user
  on public.project_local_bindings(project_id, user_id, device_id);
```

Cloud must never store the full local path. `display_name` should be a basename
or user-visible alias only.

### 6.6 `execution_plans`

```sql
create table if not exists public.execution_plans (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  task_id uuid references public.tasks(id) on delete set null,
  binding_id uuid references public.project_local_bindings(id) on delete set null,
  actor_user_id uuid not null references auth.users(id),
  executor_user_id uuid references auth.users(id),
  device_id uuid references public.bridge_devices(id),
  mode text not null
    check (mode in ('laf_model', 'my_bridge', 'team_bridge', 'record_only')),
  provider text not null
    check (provider in ('codex', 'claude_code', 'laf_model')),
  status text not null default 'pending'
    check (status in (
      'pending', 'dispatched', 'acknowledged', 'running',
      'completed', 'failed', 'cancelled', 'expired'
    )),
  required_permissions text[] not null default '{}',
  effective_permissions text[] not null default '{}',
  context_refs jsonb not null default '[]'::jsonb,
  prompt text not null,
  policy jsonb not null default '{}'::jsonb,
  signature_alg text not null default 'ed25519',
  signature_key_id text not null,
  payload_hash text not null,
  signature text not null,
  nonce text not null,
  relay_channel text,
  local_approval_status text not null default 'pending'
    check (local_approval_status in ('pending', 'approved', 'denied', 'not_required')),
  expires_at timestamptz not null,
  lease_until timestamptz,
  dispatched_at timestamptz,
  acknowledged_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  cancel_requested_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique(signature_key_id, nonce)
);

create index if not exists idx_execution_plans_team_status
  on public.execution_plans(team_id, status, created_at desc);

create index if not exists idx_execution_plans_device_status
  on public.execution_plans(device_id, status, created_at desc);

create index if not exists idx_execution_plans_task
  on public.execution_plans(task_id, created_at desc);
```

Plan prompt visibility:

- Service-role API can read full prompt.
- Browser APIs should return a redacted/public projection by default.
- Bridge APIs can read full prompt only for the assigned device and only while the plan is non-terminal.

### 6.7 `execution_events`

```sql
create table if not exists public.execution_events (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  plan_id uuid not null references public.execution_plans(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete set null,
  sequence integer not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  redacted boolean not null default true,
  created_at timestamptz not null default now(),
  unique(plan_id, sequence)
);

create index if not exists idx_execution_events_plan_created
  on public.execution_events(plan_id, created_at asc);
```

Events need a retention policy. The first implementation can keep them forever,
but the schema must allow later cleanup without deleting receipts.

### 6.8 `execution_receipts`

```sql
create table if not exists public.execution_receipts (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  task_id uuid references public.tasks(id) on delete set null,
  plan_id uuid references public.execution_plans(id) on delete set null,
  actor_user_id uuid references auth.users(id),
  executor_user_id uuid references auth.users(id),
  device_id uuid references public.bridge_devices(id),
  mode text not null,
  provider text not null,
  provider_version text,
  status text not null check (status in ('completed', 'failed', 'cancelled')),
  summary text,
  changed_files jsonb not null default '[]'::jsonb,
  test_results jsonb not null default '[]'::jsonb,
  artifacts jsonb not null default '[]'::jsonb,
  usage jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(plan_id)
);

create index if not exists idx_execution_receipts_task_created
  on public.execution_receipts(task_id, created_at desc);
```

### 6.9 RLS Minimum

Enable RLS for all new tables.

Minimum policies:

- Team members can read non-sensitive bridge device metadata.
- Users can read and manage their own bridge devices.
- Admins can read team bridge metadata and revoke devices.
- Users can read their own project local bindings.
- Browser reads of execution plans must use a public projection or omit `prompt`.
- Project/task authorized users can read execution events and receipts.
- Bridge device-token endpoints should run through service role after explicit token/team/device checks.

## 7. Hosted API Contract

Add these routes before relay/web UX work.

### 7.1 Browser/User Routes

```http
GET  /bridge/availability
GET  /bridge/devices
POST /bridge/pairing/start
POST /bridge/devices/:deviceId/revoke

GET  /projects/:projectId/local-bindings
POST /projects/:projectId/local-bindings
DELETE /projects/:projectId/local-bindings/:bindingId

POST /execution/plans
GET  /execution/plans/:planId
GET  /execution/plans/:planId/events
POST /execution/plans/:planId/cancel
```

### 7.2 Bridge Routes

```http
POST /bridge/pairing/claim
POST /bridge/devices/:deviceId/heartbeat
GET  /bridge/devices/:deviceId/pending-plans
POST /execution/plans/:planId/ack
POST /execution/plans/:planId/start
POST /execution/plans/:planId/events
POST /execution/plans/:planId/complete
```

Bridge routes require a bridge device token, not a user browser session.

### 7.3 Execution Plan Creation

Payload:

```json
{
  "task_id": "...",
  "mode": "my_bridge",
  "provider": "codex",
  "device_id": "...",
  "binding_id": "...",
  "message": "Implement this task and run focused tests."
}
```

Checks:

- `record_only` cannot create execution plans.
- `my_bridge` requires `bridge:execute_own`.
- `team_bridge` requires `bridge:execute_team`.
- `task:read` and `task:execute_agent` are required.
- `binding_id` must belong to the task project, executor user, and target device.
- Device must be non-revoked and recently online, or the plan remains `pending` for pull.
- Required permissions must be a subset of effective permissions.
- Plan must be signed before persistence.

### 7.4 Signing

Use Ed25519 for execution plan signatures.

Canonical payload fields:

```text
id
team_id
project_id
task_id
binding_id
actor_user_id
executor_user_id
device_id
mode
provider
required_permissions
effective_permissions
context_refs
prompt
policy
expires_at
nonce
```

Persist:

```text
signature_alg
signature_key_id
payload_hash
signature
nonce
```

Bridge verification requires:

- Known server signing public key.
- Valid signature over canonical payload.
- `expires_at` not passed.
- Nonce not replayed.
- Plan `device_id` matches local device.
- Plan `executor_user_id` matches paired bridge user.
- Binding exists locally and is trusted.
- Local policy allows the requested provider/sandbox/network mode.

### 7.5 Relay MVP

Supabase Realtime Broadcast can be used for fanout:

```text
laf:team:{team_id}:bridge:{device_id}
laf:team:{team_id}:task:{task_id}:runs
```

Broadcast messages are hints only:

```text
execution.plan.created
execution.event
execution.completed
execution.cancelled
bridge.presence
```

Every bridge startup and reconnect must call:

```http
GET /bridge/devices/:deviceId/pending-plans
```

Supabase Realtime auth:

- Do not embed service-role secrets in browser or bridge.
- Browser uses existing user session/Supabase auth.
- Bridge should receive a short-lived relay token from the API or rely on API pull while relay auth is finalized.
- Private channels need authorization policies before use in production.

## 8. Desktop Bridge Contract

Initial package layout:

```text
cmd/laf-bridge/main.go
internal/bridge/
  app.go
  api_client.go
  capabilities.go
  config.go
  device.go
  execution.go
  local_policy.go
  pairing.go
  plan_validator.go
  project_binding.go
  receipts.go
  redaction.go
  relay_client.go
  providers/
    codex_exec.go
  mcp/
    context_server.go
    tokens.go
    tools.go
```

CLI commands:

```bash
laf-bridge pair <code>
laf-bridge start
laf-bridge status
laf-bridge doctor
laf-bridge providers
laf-bridge link-project --project-id <id> --path <path>
laf-bridge unlink-project --binding-id <id>
laf-bridge logout
```

MVP local config paths:

```text
macOS:   ~/Library/Application Support/LAF Bridge/config.json
Linux:   ~/.config/laf-bridge/config.json
```

Secret storage:

- Prefer OS keychain for bridge token and local private key.
- Fallback files must be `0600` on Unix.
- Never read or upload Codex/Claude credential files.

Local approval:

- `read-only`: no approval required if the current user initiated the plan.
- `workspace-write`: approval required first time per project/session.
- network, deploy, git push, destructive shell: always approval.
- If the bridge runs without a foreground TTY/tray approval channel, deny plans that require approval.

## 9. Codex MVP Contract

Use `codex exec --json` first.

Default invocation:

```bash
codex exec --json --sandbox workspace-write "<prompt>"
```

Rules:

- Run only inside the trusted binding path.
- Do not pass `danger-full-access`.
- Preserve read-only sandbox for analysis tasks.
- Set a controlled environment for task-scoped MCP config.
- Stream JSONL to normalized execution events.
- Capture final agent message into receipt summary.
- Capture changed files using `git diff --name-status` after execution.
- Support cancellation via process context.

Initial event mapping:

```text
thread.started       -> run.started
turn.started         -> turn.started
item.started         -> item.started
item.completed       -> item.completed
turn.completed       -> turn.completed
turn.failed          -> run.failed
error                -> run.failed
command_execution    -> command.started / command.completed
file_change          -> file.changed
mcp_tool_call        -> mcp.tool_called
```

Tests must use a fake `codex` binary before any real CLI integration.

## 10. MCP Context Gateway

This is not required for the first bridge execution loop. It starts after
Codex execution plans and receipts are working.

MVP tools:

```text
laf.get_current_task
laf.search_wiki
laf.list_allowed_skills
laf.write_execution_event
laf.write_execution_receipt
```

Transport:

- Prefer stdio local MCP server for MVP.
- Remote Streamable HTTP MCP can come later.

Auth:

- Use task-scoped tokens.
- Check `allowed_tools` and permissions on every tool call.
- Expired tokens fail closed.

## 11. Web UX Contract

Mode selector after Phase 1:

```text
LAF Model | LAF Bridge | Record Only
```

The old `my_bridge` and `team_bridge` internal modes should present as one
LAF Bridge surface.

Required UI surfaces:

- Settings: bridge device list, pairing code, revoke, provider status.
- Project settings: local folder binding status and link instructions.
- Task composer/detail: execution mode selector and LAF Bridge availability.
- Execution confirmation dialog.
- Execution event stream in task chat/detail.
- Receipt card after completion.

Web must never show full local paths from cloud state. It may show `display_name`.

## 12. Security Invariants

These must be true at the end of each phase that touches execution:

- `record_only` never creates runner jobs or execution plans.
- `my_bridge` never creates runner jobs.
- `laf_model` never creates runner jobs.
- Only `team_bridge` may create runner jobs.
- LAF Cloud never stores Codex/Claude credentials.
- LAF Cloud never stores raw local paths.
- Bridge rejects invalid signatures, expired plans, wrong device, wrong executor, unknown binding, missing permission, and local policy violations.
- Browser cannot submit arbitrary confirmed orchestration actions.
- Skill execution requires `skill:invoke` and manifest required permissions.
- Sensitive event payloads are redacted before persistence.
- Sensitive mutations write audit events; audit write failure blocks the mutation once audit hardening lands.

## 13. Phased Implementation Plan

Each phase should be one focused PR or a small stack of PRs. Do not implement
the full bridge in one patch.

### Phase 0 - Safety Fixes Before Bridge

Status: Implemented in the current workspace.

Goal:

Close existing hosted execution holes that would make bridge work unsafe.

Files:

```text
api/[...path].js
api/hosted-api.test.js
internal/team/orchestration.go
internal/team/*test.go
```

Work:

- Change orchestration confirm to accept `intent_id`, not client-supplied action payload.
- Persist hosted orchestration intents or otherwise resolve them server-side.
- Add `skill:invoke`.
- Make skill invocation check `skill:invoke` and manifest required permissions.
- Add regression tests for forged confirm payloads and missing `skill:invoke`.

Gate:

```bash
node --check api/[...path].js
node --test api/hosted-api.test.js
go test ./internal/team
```

### Phase 1 - Runtime Taxonomy and Runner Guard

Status: Implemented in the current workspace.

Goal:

Replace product-facing `local_cli` with `my_bridge`/`team_bridge`, and guarantee
that only `team_bridge` can enqueue runner jobs.

Files:

```text
api/[...path].js
api/hosted-api.test.js
web/src/api/client.ts
web/src/components/ModelModeToggle.tsx
web/src/components/apps/HomeApp.tsx
web/src/components/apps/TasksApp.tsx
internal/team/permissions.go
internal/team/orchestration.go
internal/team/runner_protocol.go
supabase/migrations/20260515_desktop_bridge_phase_0_1.sql
```

Work:

- Add new model mode union: `laf_model | my_bridge | team_bridge | record_only`.
- Accept deprecated input alias `local_cli` only at API boundaries.
- Update DB constraints and migration values.
- Update model availability to expose `my_bridge`, not `local_cli`.
- Initially mark `my_bridge` unavailable until bridge availability exists.
- Hide or disable `team_bridge` in web until Phase 10.
- Update `taskNeedsRunnerJob()` in hosted API and Go broker to check model mode.

Tests:

- `record_only` task never creates `runner_jobs`.
- `my_bridge` task never creates `runner_jobs`.
- `laf_model` task never creates `runner_jobs`.
- `team_bridge` task can create `runner_jobs` only with permission.
- Deprecated `local_cli` input normalizes to `my_bridge`.

Gate:

```bash
node --check api/[...path].js
node --test api/hosted-api.test.js
go test ./internal/team
cd web && npm run typecheck
cd web && npm test -- src/components/apps/HomeApp.test.tsx src/components/apps/TasksApp.test.tsx
```

### Phase 2 - Bridge Persistence Schema

Status: Implemented in the current workspace.

Goal:

Add bridge device, binding, execution plan, event, and receipt persistence.

Files:

```text
supabase/migrations/20260515_desktop_bridge_execution.sql
api/hosted-api.test.js
```

Work:

- Add all new tables from section 6.
- Enable RLS and minimum read policies.
- Add indexes and uniqueness constraints.
- Add migration smoke tests in the hosted API test harness if available.

Tests:

- Migration is idempotent.
- Constraints reject invalid model/status values.
- Required indexes exist.
- RLS is enabled for all new tables.

### Phase 3 - Bridge API Control Plane

Status: Mostly implemented in the current workspace. Bridge availability,
device list, pairing start/claim, heartbeat, own-device revoke, local binding
CRUD, signed execution plan create/get/cancel, bridge pending-plan polling, and
ack/start/event/complete lifecycle APIs are in place. Relay publication, full
web UX wiring, and task-thread receipt surfacing remain for later phases.

Goal:

Ship pairing, device, heartbeat, binding, and execution-plan API without relay.

Files:

```text
api/[...path].js
api/hosted-api.test.js
web/src/api/client.ts
```

Work:

- Add route dispatchers.
- Add bridge token hashing and verification.
- Add pairing start/claim.
- Add device list/revoke/heartbeat.
- Add local binding CRUD.
- Add execution plan create/get/pending/ack/start/event/complete/cancel.
- Implement Ed25519 plan signing helpers.
- Return redacted browser projections for plans.

Tests:

- Member can pair own bridge.
- Viewer cannot pair.
- Expired/reused pairing code fails.
- Heartbeat updates status/capabilities.
- Non-owner cannot revoke another user's device without `bridge:manage_team`.
- `my_bridge` plan requires online/non-revoked device and trusted binding.
- Plan contains `signature`, `signature_key_id`, `payload_hash`, and `nonce`.
- Completion writes exactly one receipt and appends task-thread receipt message.

Gate:

```bash
node --test api/hosted-api.test.js
git diff --check
```

### Phase 4 - `laf-bridge` CLI Skeleton

Status: Partially implemented in the current workspace. The `laf-bridge` command
exists with `pair`, `status`, `doctor`, `providers`, and `start`
commands. `internal/bridge` now covers local config/token fallback, bridge
identity generation, API pairing claim, Codex capability detection, local
project binding config, pending-plan fetch, Ed25519 execution plan validation,
and fake execution loops that ack/start/event/complete cycle validated plans.
Hosted binding sync and the concrete realtime relay source remain pending.

Goal:

Create the local bridge binary with pairing, config, capability detection, and
plan validation. No real Codex execution yet.

Files:

```text
cmd/laf-bridge/main.go
internal/bridge/*
internal/bridge/providers/*
```

Work:

- Implement config load/save.
- Implement secure token storage fallback.
- Implement API client.
- Implement `pair`, `status`, `doctor`, `providers`.
- Implement Codex binary detection.
- Implement project binding local config.
- Implement plan signature validator.
- Implement pending plan pull with fake execution response.

Tests:

- Pairing claim stores token reference and device id.
- Fallback token file permission is `0600`.
- Fake capabilities detection works.
- Invalid signature plan rejected.
- Expired plan rejected.
- Wrong device/executor rejected.
- Unknown binding rejected.

Gate:

```bash
go test ./internal/bridge/...
go test ./cmd/laf-bridge/...
```

### Phase 5 - Codex Exec Adapter

Status: Partially implemented in the current workspace. The bridge has a
Codex exec adapter that detects `codex`, runs cancellable `codex exec --json`
with stdin prompt and workspace-write sandbox, parses the existing Codex JSONL
stream, emits normalized/redacted provider events, captures final summary,
usage, and git changed files. `laf-bridge start --provider codex`
now runs validated pending plans through the adapter; MCP context injection is
implemented and the concrete realtime relay source remains pending.

Goal:

Run fake and real-compatible `codex exec --json` through the bridge adapter.

Files:

```text
internal/bridge/providers/codex_exec.go
internal/bridge/execution.go
internal/bridge/receipts.go
internal/bridge/redaction.go
```

Work:

- Locate `codex`.
- Detect version.
- Run `codex exec --json` in binding path.
- Parse JSONL stream.
- Normalize events.
- Upload events with sequence numbers.
- Capture final summary.
- Capture changed files from git diff.
- Implement cancellation.

Tests:

- Fake `codex --version` detected.
- Fake JSONL stream produces normalized events.
- Final agent message becomes receipt summary.
- Git diff changed files are captured.
- Redaction removes bearer tokens/API keys/private key blocks.
- Cancellation terminates provider process.

Gate:

```bash
go test ./internal/bridge/...
```

### Phase 6 - Relay MVP

Status: Partially implemented in the current workspace. Hosted plan creation now
publishes a best-effort Supabase Broadcast hint after the durable
`execution_plans` insert, and publish failures are returned as non-fatal relay
metadata so the plan remains available through DB pull. The bridge has a relay
loop abstraction that pulls pending plans on subscribe, reconnect, and incoming
hints, plus a `laf-bridge start --once=false` polling daemon fallback with an
in-process guard to avoid double-running the same terminal plan. The concrete
Supabase websocket client and web task-event subscription remain pending.

Goal:

Add Supabase Broadcast as a low-latency hint layer while keeping DB pull as the
durability path.

Files:

```text
api/[...path].js
internal/bridge/relay_client.go
web/src/lib/relay.ts
```

Work:

- Publish `execution.plan.created` after plan persistence.
- Bridge subscribes to device channel when relay auth is configured.
- Bridge always pulls pending plans after subscribe/reconnect.
- Web subscribes to task run events when available.
- Keep polling fallback for web.

Tests:

- API publish failure does not lose plan.
- Bridge reconnect pulls missed pending plan.
- Duplicate relay and pending pull do not double-run plan.

### Phase 7 - Web UX Integration

Status: Partially implemented in the current workspace. The hosted API now
returns execution receipts on plan reads when the viewer can read receipts, the
web API client has typed bridge/binding/execution methods with coverage, Settings
has a LAF Bridge status, pairing, command-copy, and revoke panel, project detail
has a local binding management panel, and task chat creates a confirmed
`my_bridge` execution plan instead of posting a normal chat message. The task
panel polls plan/events as the durable fallback and renders recent events plus
the completion receipt. Full realtime relay subscription and broader visual QA
remain pending.

Goal:

Make LAF Bridge usable from Settings, Project settings, and Task execution.

Files:

```text
web/src/api/client.ts
web/src/components/bridge/*
web/src/components/execution/*
web/src/components/apps/SettingsApp.tsx
web/src/components/apps/TasksApp.tsx
web/src/components/apps/HomeApp.tsx
web/src/styles/*.css
```

Work:

- Add bridge API client types/methods.
- Add bridge status card.
- Add pairing panel.
- Add project local binding panel.
- Add execution confirmation dialog.
- Add event stream and receipt card.
- Use `createExecutionPlan` for LAF Bridge execution.
- Show clear disabled reasons for unavailable bridge/binding/provider.

Tests:

- LAF Bridge disabled when no bridge is paired.
- LAF Bridge disabled when project binding is missing.
- Pairing flow renders code and expiry.
- Execution confirmation submits plan creation.
- Event stream renders events.
- Receipt card renders completion.

Gate:

```bash
cd web && bun test
cd web && bun run build
```

### Phase 8 - MCP Context Gateway MVP

Status: Partially implemented in the current workspace. The bridge now has a
task-scoped MCP gateway package with signed expiring tokens derived from
execution-plan permissions, permission-gated task context, wiki search, and
receipt-write tools, a stdio MCP server wrapper, static local context-file
storage, `laf-bridge mcp-context` CLI wiring, and Codex `--config`/env override
support that injects the MCP server per Codex plan run. API-backed context
storage and durable receipt writes back to hosted execution APIs remain pending.

Goal:

Expose LAF task/wiki/skill context to Codex through a task-scoped local MCP
server.

Files:

```text
internal/bridge/mcp/context_server.go
internal/bridge/mcp/tokens.go
internal/bridge/mcp/tools.go
internal/bridge/providers/codex_exec.go
```

Work:

- Generate task-scoped MCP token per execution plan.
- Start local stdio MCP server for the run.
- Inject temporary Codex MCP config.
- Implement MVP tools.
- Clean up temporary config after run.

Tests:

- Expired token denied.
- Missing `wiki:read` denies wiki search.
- Missing `execution:receipt_write` denies receipt write.
- Allowed tool succeeds.

### Phase 9 - Security Hardening

Status: Partially implemented in the current workspace. Hosted API request
bodies and bridge execution-event payloads now have explicit byte caps, bridge
pairing/heartbeat/event endpoints have per-process rate-limit guards, sensitive
bridge revoke and execution cancel mutations require a durable audit write
before state changes, revoked bridge devices rotate away from their old token
hash, local approval denial is persisted as a cancelled execution plan with a
blocking audit write, and bridge event/receipt payloads continue to be redacted.
Durable distributed rate limits and full desktop approval persistence UX remain
pending.

Goal:

Prepare the feature for real users.

Work:

- Message size caps.
- Event payload caps.
- Rate limits on pairing/heartbeat/events.
- Audit writes for sensitive bridge and execution actions.
- Audit write failure blocks sensitive mutation.
- Redaction on API and bridge.
- Token rotation and revoke behavior.
- Local approval persistence and denial audit.

Tests:

- Oversized event rejected.
- API key patterns redacted.
- Revoked device cannot heartbeat or upload events.
- Cancelled plan cannot be completed by stale bridge process.

### Phase 10 - LAF Bridge / Runner Unification

Status: Partially implemented in the current workspace. Runner endpoints remain
stable for installed agents, but new LAF Bridge registration and pairing setup
now require an owner/admin role in hosted and local broker paths. Runner job
claiming is guarded at both the hosted test adapter and Supabase RPC migration
so only `model_mode = 'team_bridge'` jobs can be leased. Web-facing copy now
labels the surface as LAF Bridge while preserving the existing `laf-runner`
binary/protocol names. Wrapping LAF Bridge dispatch in signed execution plans
remains optional future work.

Goal:

Reposition existing Runner as LAF Bridge without disrupting background users.

Work:

- Rename product copy from Runner to LAF Bridge where user-facing.
- Restrict team bridge registration to admins.
- Ensure `runner_jobs` are created only for `team_bridge`.
- Optionally wrap team bridge dispatch in `execution_plans`.
- Keep old runner endpoints stable for installed runners.

Tests:

- Existing runner claim/heartbeat/job tests still pass.
- Non-admin cannot register team bridge.
- `team_bridge` can dispatch background runner work.
- `my_bridge` cannot be claimed by runner endpoints.

### Phase 11 - Productization

Goal:

Move from developer CLI to polished desktop bridge.

Work:

- Tauri tray app wrapper.
- Native installers after the command-line bridge path stabilizes.
- Auto-update.
- Durable Objects relay.
- Enterprise self-hosted relay option.
- Claude Code adapter.

This phase is intentionally outside MVP.

## 14. Implementation Prompts

Use these prompts to start work safely.

### Prompt A - Phase 0 and Phase 1

```text
Implement Phase 0 and Phase 1 from docs/specs/LAF-DESKTOP-BRIDGE-ENGINEERING-PLAN.md.

Do not build the bridge yet.

Goals:
- Stop trusting client-supplied orchestration confirmation payloads.
- Add skill:invoke and enforce it for skill invocation.
- Replace product-facing local_cli with my_bridge/team_bridge.
- Ensure record_only, my_bridge, and laf_model never create runner_jobs.
- Keep deprecated local_cli as an API input alias only.

Required tests:
- forged orchestration confirm payload rejected
- skill invoke without skill:invoke rejected
- record_only does not create runner_jobs
- my_bridge does not create runner_jobs
- laf_model does not create runner_jobs
- team_bridge can create runner_jobs only when allowed

Run:
- node --check api/[...path].js
- node --test api/hosted-api.test.js
- go test ./internal/team/...
- cd web && bun test
```

### Prompt B - Phase 2 and Phase 3

```text
Implement Phase 2 and Phase 3 from docs/specs/LAF-DESKTOP-BRIDGE-ENGINEERING-PLAN.md.

Goals:
- Add desktop bridge DB migration.
- Add bridge pairing/device/heartbeat/local binding APIs.
- Add signed execution plan APIs.
- Add pending-plan pull and idempotent completion.

Do not implement Supabase relay or the local bridge binary yet.

Run:
- node --check api/[...path].js
- node --test api/hosted-api.test.js
```

### Prompt C - Phase 4 and Phase 5

```text
Implement Phase 4 and Phase 5 from docs/specs/LAF-DESKTOP-BRIDGE-ENGINEERING-PLAN.md.

Goals:
- Add cmd/laf-bridge.
- Implement pair/start/status/doctor/providers.
- Implement config and secure token fallback.
- Implement plan validation.
- Implement Codex exec --json adapter with fake binary tests.

Run:
- go test ./internal/bridge/...
- go test ./cmd/laf-bridge/...
```

## 15. Final MVP Definition

The MVP is complete when:

- A user can pair a local `laf-bridge`.
- The bridge can detect Codex CLI.
- A project can be linked to a local folder without storing the raw path in cloud.
- A task can create a signed `my_bridge` execution plan.
- The bridge can pull, validate, approve, and run that plan with fake Codex and then real Codex.
- Execution events and one receipt are visible in the task UI.
- No `runner_jobs` are created for `my_bridge`, `laf_model`, or `record_only`.
