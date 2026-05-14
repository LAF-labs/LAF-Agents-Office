# Agentic Workspace Governance Implementation Plan

Status: implementation handoff plan

## 1. 목적과 기준

이 문서는 GPT 웹에서 생성한 `laf_codex_improvement_directive.md`를 그대로
적용하지 않고, 현재 저장소의 실제 구현 상태와 대조해 다시 작성한 구현
인계용 계획안이다.

제품 목표는 다음 문장으로 고정한다.

> LAF는 기업이 프로젝트와 태스크를 만들고, 사람과 AI 에이전트에게 일을
> 배정하며, 공유 스킬과 LLM Wiki 메모리를 축적해 업무 실행력을 계속
> 진화시키는 agent-native project execution workspace다.

이 문서의 구현 원칙:

- 기존 local-first broker/runtime 기능은 삭제하지 않는다.
- hosted control plane과 local broker의 semantics를 최대한 맞춘다.
- Jira, Linear, GitHub Issues 같은 외부 issue tracker를 primary task source로
  삼지 않는다.
- GitHub PR delivery는 Jira/GitHub Issues 연동이 아니므로 유지한다.
- BYOK SaaS mode는 만들지 않는다. 기존 API key UI는 legacy local-dev fallback
  또는 self-hosted 설정으로 격리한다.
- agent runtime은 넓은 실행 권한을 유지할 수 있지만, LAF product-level
  mutation은 지시한 member의 effective permissions로 제한한다.

## 2. GPT 웹 지시서 검토 결과

### 맞는 지적

- Hosted API의 RBAC가 약하다. `api/[...path].js`의 `requireUser()`는 active
  membership만 확인하고, invite/project/task/runner mutation 대부분을
  허용한다.
- Home chat은 orchestration layer로 재정의되어야 하지만, 현재는
  intent routing/confirmation 없이 `postMessage()`로 바로 전송된다.
- Task chat은 execution layer가 되어야 하지만, 현재 message body에
  `task_id`, `project_id`, `scope`, `model_mode`, initiating member permission
  snapshot이 없다.
- Managed Model Mode와 Local CLI Mode를 결정하는 `/model/availability`가 없다.
- Hosted API에는 local broker와 같은 `/skills` route가 없다.
- Supabase migration은 `owner/admin/member`만 허용하며 `manager`, `viewer`,
  granular permission override, audit log, billing/model mode, skill lifecycle
  schema가 없다.
- `internal/team/launcher.go`의 `resolvePermissionFlags()`는 agent runtime을
  broad permission mode로 실행한다. 이 자체를 제거하기보다 broker/MCP/API
  mutation gate를 보강해야 한다.

### 오해 또는 보정 지점

- local broker에는 이미 `/auth/users`가 있다. hosted API에만 equivalent route가
  빠져 있다.
- local broker에는 이미 `/skills`, `/skills/:name/invoke`, proposed skill,
  request accept 시 active 전환, usage count가 있다. 새로 만들기보다
  permission, manifest, version, audit를 붙여 확장해야 한다.
- project wiki materialization은 이미 local broker에 구현되어 있다. project
  생성 후 wiki article을 만드는 방향은 맞지만, local path는 새로 만들 필요가
  없다.
- runner CLI detection은 이미 `claude-code`, `codex`, `opencode`를 감지한다.
  필요한 것은 `cli_details`, availability matrix, UI toggle과의 연결이다.
- 기존 onboarding/settings의 API key 입력은 BYOK SaaS mode와 충돌한다. 즉시
  삭제보다 product mode에 따라 숨기거나 legacy local/self-hosted 설정으로
  분리해야 한다.
- README와 일부 테스트에는 "Jira-style" copy가 남아 있다. Jira 연동은 없지만
  제품 인상을 바꾸려면 copy를 `project execution board`로 정리해야 한다.

## 3. Non-goals

다음은 이번 개선 범위에서 구현하지 않는다.

- Jira import/export 또는 Jira ticket 처리
- Linear/GitHub Issues sync
- 외부 issue tracker를 task source of truth로 삼는 구조
- SaaS BYOK provider key 입력/저장/사용
- agent가 무승인으로 active skill을 publish하는 구조
- home chat에서 쓰기 작업을 confirmation 없이 바로 실행하는 구조
- hosted API 또는 Vercel function이 local worktree/coding agent를 직접 실행하는 구조

## 4. Phase 1 - Permission foundation

### 목표

Workspace member role과 granular override를 도입하고, hosted API와 local broker가
같은 permission semantics를 사용하도록 만든다.

### Role preset

지원 role:

| Role | 의미 | 기본 방향 |
|---|---|---|
| `owner` | Workspace owner | 모든 권한 |
| `admin` | 운영 관리자 | billing 제외 대부분 권한 |
| `manager` | 프로젝트/태스크 관리자 | project/task/agent assign, 일부 skill approval |
| `member` | 일반 작업자 | read, project/task create/update, 제한적 agent execution |
| `viewer` | 읽기 전용 | read only |

### Permission keys

최소 permission key는 다음 union으로 고정한다.

```ts
export type WorkspacePermission =
  | "workspace:read"
  | "workspace:manage"
  | "member:invite"
  | "member:manage_roles"
  | "member:manage_permissions"
  | "project:create"
  | "project:update"
  | "project:archive"
  | "task:create"
  | "task:update"
  | "task:assign"
  | "task:change_status"
  | "task:execute_agent"
  | "agent:create"
  | "agent:update"
  | "agent:assign"
  | "skill:read"
  | "skill:propose"
  | "skill:create_active"
  | "skill:approve"
  | "skill:update"
  | "skill:archive"
  | "memory:read"
  | "memory:write_draft"
  | "memory:promote"
  | "memory:write_canonical"
  | "runner:read"
  | "runner:manage"
  | "model:use_laf"
  | "model:use_local_cli"
  | "audit:read";
```

### Data model

Supabase migration:

- Extend `memberships.role` and `team_invites.role` constraints to include
  `manager`, `viewer`.
- Add `memberships.permissions jsonb not null default '{}'::jsonb`.
- Add `audit_events`.

Recommended permission override shape:

```json
{
  "allow": ["skill:approve"],
  "deny": ["runner:manage"]
}
```

Local broker state:

```go
type permissionOverride struct {
  Allow []string `json:"allow,omitempty"`
  Deny  []string `json:"deny,omitempty"`
}

type authUser struct {
  ...
  Role        string             `json:"role"`
  Permissions permissionOverride `json:"permissions,omitempty"`
}
```

### Public API

Add to hosted API and local broker:

```http
GET /permissions
PATCH /permissions
```

`GET /permissions` response:

```json
{
  "roles": ["owner", "admin", "manager", "member", "viewer"],
  "permissions": ["workspace:read", "..."],
  "members": [
    {
      "user_id": "user-id",
      "email": "person@example.com",
      "name": "Person",
      "role": "manager",
      "overrides": { "allow": [], "deny": [] },
      "effective_permissions": ["workspace:read"]
    }
  ]
}
```

`PATCH /permissions` request:

```json
{
  "user_id": "user-id",
  "role": "manager",
  "permissions": {
    "allow": ["skill:approve"],
    "deny": ["runner:manage"]
  }
}
```

Required permission: `member:manage_permissions`.

### Implementation notes

- Implement permission helpers in both JS and Go. They cannot share code
  directly, so keep key lists and role behavior mirrored by tests.
- `owner` must always have every permission after overrides unless explicitly
  deciding otherwise later. For MVP, do not allow denying owner-critical
  permissions on the final owner.
- Keep last-owner protection from local broker and add equivalent hosted API
  protection.
- Return effective permissions in `auth/session` user payload for UI gating.

### Completion criteria

- `GET /permissions` works in hosted API and local broker.
- `PATCH /permissions` can change role and overrides.
- Last active owner cannot be demoted or denied ownership-critical permissions.
- Audit event is written for role/permission changes.

## 5. Phase 2 - Sensitive route enforcement

### 목표

Product-level mutation을 모두 initiating member permission으로 gate한다.
Prompt instruction은 보조 수단이며 보안/거버넌스의 source of truth가 아니다.

### Required permissions by action

| Action | Required permission |
|---|---|
| invite create | `member:invite` |
| role change | `member:manage_roles` |
| permission override change | `member:manage_permissions` |
| project create | `project:create` |
| project update | `project:update` |
| project archive | `project:archive` |
| task create | `task:create` |
| task update | `task:update` |
| task reassign | `task:assign` |
| task status change | `task:change_status` |
| runner job creation | `task:execute_agent` |
| runner pairing/register/revoke | `runner:manage` |
| skill read | `skill:read` |
| skill proposal | `skill:propose` |
| active skill create | `skill:create_active` |
| skill approval | `skill:approve` |
| skill update | `skill:update` |
| skill archive | `skill:archive` |
| notebook write | `memory:write_draft` |
| notebook promote/review approve | `memory:promote` |
| direct wiki write | `memory:write_canonical` |
| LAF model run | `model:use_laf` |
| local CLI run | `model:use_local_cli` |

### Hosted API changes

Add permission checks in `api/[...path].js`:

- `handleInvites`
- `handleProjects`
- `handleTasks`
- `handleRunnerPairingStart`
- `handleRunnerRegister`
- `handleRunnerRevoke`
- hosted skill routes added in Phase 6
- orchestration confirm apply added in Phase 4

Update `requireUser(req)`:

- Resolve requested `team_id` from header/query/body when supplied.
- Return `{ membership, team, token, user, permissions }`.
- Include `effective_permissions` in `publicUser`.

### Local broker changes

Add permission checks in:

- `broker_auth.go` for auth user role/permission update.
- `broker_invites.go` for invite create.
- `broker_runner.go` for pairing/register/revoke.
- `broker.go` project/task/skill handlers.
- `broker_notebook.go`, `broker_review.go`, `wiki write` handlers where product
  memory is mutated.

Important local broker caveat:

- `requireAuth` currently accepts either broker bearer token or browser auth
  session. Browser-origin product mutation should use the session user when
  present.
- Agent/MCP calls authenticated by broker token must carry an initiator context
  or be limited to proposal/draft flows. Do not let raw broker token imply
  product-level authority.

### Audit events

Write `audit_events` for:

- member invited
- role changed
- permission changed
- runner paired/revoked
- project created/updated/archived
- task created/assigned/status changed
- agent execution requested
- model mode selected for execution
- skill proposed/approved/rejected/updated/archived/invoked
- wiki canonical write
- memory promoted
- orchestration intent confirmed/canceled

Completion criteria:

- Non-permissioned members receive 403 for sensitive mutation.
- Existing owner/admin flows continue to work through role presets.
- Agent/MCP token cannot activate skills or mutate canonical product state
  without initiator permission context.

## 6. Phase 3 - Managed Model Mode and Local CLI Mode

### 목표

모든 home/task chat composer에서 작은 model mode toggle을 제공하고, server가
실행 가능 여부를 일관되게 계산한다.

### Model mode

```ts
export type ModelMode = "laf_model" | "local_cli" | "record_only";
```

- `laf_model`: LAF managed internal model.
- `local_cli`: connected runner가 감지한 local CLI runtime.
- `record_only`: chat/project/task records only, no agent execution.

### Availability API

Add:

```http
GET /model/availability
```

Response:

```ts
export interface ModelAvailability {
  default_mode: ModelMode;
  laf_model: {
    enabled: boolean;
    reason?: string;
    plan?: string;
  };
  local_cli: {
    enabled: boolean;
    reason?: string;
    runners: HostedRunner[];
    provider_runtimes: string[];
  };
  record_only: {
    enabled: true;
  };
}
```

### Availability matrix

| Workspace paid? | Runner connected? | Local CLI detected? | Default mode | Agent execution |
|---:|---:|---:|---|---|
| yes | yes | yes | `laf_model` | yes |
| yes | yes | no | `laf_model` | yes, LAF only |
| yes | no | no | `laf_model` | yes, LAF only |
| no | yes | yes | `local_cli` | yes, local only |
| no | yes | no | `record_only` | no |
| no | no | no | `record_only` | no |

### Billing MVP

Supabase:

```sql
create table if not exists public.workspace_billing (
  team_id uuid primary key references public.teams(id) on delete cascade,
  plan text not null default 'free',
  status text not null default 'inactive',
  laf_model_enabled boolean not null default false,
  laf_model_monthly_limit_usd numeric(12,2),
  laf_model_used_usd numeric(12,2) not null default 0,
  updated_at timestamptz not null default now()
);
```

Local broker dev fallback:

- `LAF_OFFICE_PLAN=team`
- `LAF_OFFICE_LAF_MODEL_ENABLED=1`

### Runner capability extension

Existing runner detection already reports `provider_runtimes`. Extend with:

```json
{
  "cli_details": {
    "codex": { "available": true, "version": "...", "authenticated": true },
    "claude-code": { "available": true, "version": "...", "authenticated": true },
    "opencode": { "available": false }
  }
}
```

Do not fail availability if auth status cannot be detected. Omit or use `null`.

### UI

Add `web/src/components/ui/ModelModeToggle.tsx`.

Props:

```ts
interface ModelModeToggleProps {
  value: ModelMode;
  availability: ModelAvailability;
  onChange: (mode: ModelMode) => void;
  compact?: boolean;
}
```

Placement:

- Home composer footer.
- Task chat composer footer.

Disabled copy:

- Local disabled: `Local runner or CLI not detected`.
- LAF disabled: `Upgrade workspace to use LAF model`.
- No execution: `Record only - agent execution unavailable`.

Completion criteria:

- Free workspace with no runner can still chat/create projects/tasks.
- Agent execution is not started in `record_only`.
- Paid workspace defaults to `laf_model`.
- Local CLI mode is enabled only when a connected runner reports a supported runtime.

## 7. Phase 4 - Home orchestration layer

### 목표

Home chat을 workspace/project-level command center로 만들고, write intent는
confirmation card를 거친 뒤에만 mutation한다.

### New API

```http
POST /orchestration/intent
POST /orchestration/confirm
GET /orchestration/pending
```

`POST /orchestration/intent` request:

```json
{
  "message": "결제 프로젝트에 QA 태스크 3개 만들어줘",
  "context": {
    "scope": "home",
    "selected_project_id": "project-id",
    "model_mode": "laf_model"
  }
}
```

Response:

```ts
export interface OrchestrationIntent {
  id: string;
  type: OrchestrationIntentType;
  confidence: number;
  read_only: boolean;
  requires_confirmation: boolean;
  requires_execution: boolean;
  model_mode: ModelMode;
  target_project_id?: string;
  summary: string;
  proposed_actions: OrchestrationAction[];
  missing_fields: string[];
  warnings: string[];
  required_permissions: WorkspacePermission[];
}
```

Intent types:

```ts
type OrchestrationIntentType =
  | "read_workspace_summary"
  | "read_project_summary"
  | "create_project"
  | "update_project"
  | "archive_project"
  | "create_tasks"
  | "update_task"
  | "assign_task"
  | "change_task_status"
  | "execute_agent_on_task"
  | "propose_skill"
  | "approve_skill"
  | "write_memory_draft"
  | "promote_memory"
  | "write_canonical_wiki"
  | "unknown";
```

### Deterministic MVP router

Before LLM router integration, implement deterministic parsing:

- `만들어`, `생성`, `추가` + `태스크` -> `create_tasks`
- `배정`, `담당` -> `assign_task`
- `완료`, `닫아`, `cancel`, `취소` -> `change_task_status`
- `스킬`, `반복`, `playbook` -> `propose_skill`
- `요약`, `알려줘`, `상태` -> read intent

Ambiguous target resolution:

- If no target project/task can be resolved, return `missing_fields` and do not
  mutate.
- UI should ask for clarification or require project selection before confirm.

### Confirmation apply

`POST /orchestration/confirm` request:

```json
{
  "intent_id": "intent-id",
  "decision": "confirm",
  "model_mode": "laf_model"
}
```

Rules:

- Re-check permissions at confirm time.
- Re-check model availability at confirm time.
- Write audit event for confirm/cancel.
- Apply actions server-side. Do not trust client-provided proposed actions as
  authority.

### UI

Add:

- `HomeIntentConfirmationCard`
- `IntentActionPreview`
- `IntentWarnings`

`HomeApp.tsx` flow:

1. Submit message to `/orchestration/intent`.
2. If read-only, answer/send normally.
3. If confirmation required, render card.
4. On confirm, call `/orchestration/confirm`.
5. Invalidate messages/projects/tasks as needed.

Completion criteria:

- Home write commands produce a preview card before mutation.
- Canceling an intent leaves project/task/skill/wiki state unchanged.
- Confirming creates/updates product state and audit event.

## 8. Phase 5 - Task execution layer

### 목표

Task chat을 task-scoped execution command center로 만들고, agent job에는 task
context, model mode, initiating member permission snapshot을 포함한다.

### Data fields

Supabase `tasks`:

```sql
alter table public.tasks
  add column if not exists assignee_type text not null default 'agent',
  add column if not exists assignee_id text,
  add column if not exists human_owner_user_id uuid references auth.users(id) on delete set null,
  add column if not exists last_instruction_by uuid references auth.users(id) on delete set null,
  add column if not exists last_instruction_permissions jsonb not null default '[]'::jsonb,
  add column if not exists model_mode text not null default 'record_only';
```

Keep existing `owner` as backwards-compatible agent slug fallback.

Supabase `runner_jobs`:

```sql
alter table public.runner_jobs
  add column if not exists requested_by uuid references auth.users(id) on delete set null,
  add column if not exists requested_by_role text,
  add column if not exists effective_permissions jsonb not null default '[]'::jsonb,
  add column if not exists model_mode text not null default 'local_cli',
  add column if not exists confirmation_id uuid,
  add column if not exists intent_id uuid;
```

Local structs:

- `office.TeamTask`
- `office.ChannelMessage`
- `runnerJob`
- any agent memory packet builder input/output

### Task chat request body

Extend `postMessage` metadata support:

```json
{
  "content": "관련 코드 찾아서 수정해",
  "channel": "project-payment-api",
  "reply_to": "task-id",
  "task_id": "task-id",
  "project_id": "project-id",
  "scope": "task_execution",
  "model_mode": "local_cli",
  "tagged": ["backend-agent"]
}
```

Server rules:

- Derive `requested_by` from auth session, not from client `from`.
- If no session exists and this is a dev broker-token call, use a safe fallback
  identity with limited mutation authority.
- In `record_only`, store message only and do not queue job.
- In `local_cli`, require `task:execute_agent` and `model:use_local_cli`.
- In `laf_model`, require `task:execute_agent` and `model:use_laf`.

### Agent memory packet

Extend current `agent-memory/v1` packet with:

```json
{
  "requested_by": {
    "user_id": "user-id",
    "role": "member",
    "effective_permissions": ["task:execute_agent", "model:use_local_cli"]
  },
  "model_mode": "local_cli",
  "task": {
    "assignee_type": "agent",
    "assignee_id": "backend-agent",
    "human_owner_user_id": "user-id"
  },
  "relevant_skills": [],
  "memory_refs": []
}
```

Add instruction:

```text
You may reason and use your runtime freely, but LAF workspace actions are
constrained by the human initiator's effective permissions. If a tool returns a
permission error, do not work around it; explain the missing permission and
suggest who can approve.
```

### UI

Task card/detail:

- Display `Assignee` and `Human Owner` separately.
- Continue showing legacy `owner` while new fields are backfilled.

Task chat:

- Add `ModelModeToggle`.
- Show execution availability state:
  - `Ready to run`
  - `Record only - agent execution unavailable`
  - `Local runner not connected`
  - `Upgrade workspace to use LAF model`
  - `You do not have permission to run agents`

Completion criteria:

- Task chat sends task/project/model metadata.
- Runner job includes requested_by and effective permission snapshot.
- No runner job is created when execution is unavailable.
- Existing task board behavior remains backwards-compatible with `owner`.

## 9. Phase 6 - Skill governance and self-improvement loop

### 목표

기존 skill proposal system을 보존하면서 enterprise workspace skill lifecycle로
확장한다. Agent는 skill을 제안할 수 있지만, active 전환은 member permission이
필요하다.

### Existing behavior to preserve

Local broker already supports:

- `GET/POST/PUT/DELETE /skills`
- `POST /skills/:name/invoke`
- `action=propose`
- proposed skill request 생성
- request accept 시 active 전환
- usage count and invocation message

Do not replace this path. Extend it.

### Skill fields

Extend `teamSkill` and hosted `skills` table shape:

```ts
type SkillStatus =
  | "draft"
  | "proposed"
  | "in_review"
  | "active"
  | "rejected"
  | "archived";
```

New fields:

- `version`
- `risk_level`
- `permissions_required`
- `allowed_roles`
- `allowed_agents`
- `input_schema`
- `output_schema`
- `created_by_user_id`
- `created_by_agent`
- `approved_by`
- `approved_at`
- `last_execution_status`
- `usage_count`

Add hosted tables:

- `skills`
- `skill_versions`
- `skill_invocations`

Local broker may store equivalent fields in `brokerState` first, then align
hosted schema.

### Permission rules

- Human with `skill:create_active` can create active skill directly.
- Human with `skill:approve` can approve proposed skill.
- Human with `skill:update` can update active skill.
- Human with `skill:archive` can archive skill.
- Agent can use `team_skill_create(action=propose)`.
- `team_skill_create(action=create)` must not rely on lead-agent identity alone.
  It requires an effective human initiator with `skill:create_active`; otherwise
  downgrade to proposal or return permission error.

### Self-improvement loop

Implement lightweight hooks before full automation:

```text
Observe -> detect repeatable workflow/failure -> draft skill proposal ->
permissioned human review -> activate -> invoke in matching tasks ->
record results -> suggest refinement
```

Trigger candidates:

- Human says "이 방식 기억해", "스킬로 만들어", "다음부터 이렇게 해".
- Same task type repeats at least twice.
- Task failure is resolved with reusable steps.
- Skill invocation failure count crosses threshold.
- Completion summary includes reusable procedure.

### UI

`SkillsApp.tsx`:

- Add `Proposed Skills` queue.
- Add active skill table with version/risk/permissions.
- Add approve/reject buttons gated by `skill:approve`.
- Add usage metrics and last invocation status.

Completion criteria:

- Proposed skills never become active without approval.
- Unauthorized members cannot approve/activate skills.
- Agent-created proposals remain reviewable and auditable.
- Active skills show version/risk/usage metadata.

## 10. Frontend integration plan

### API client

Extend `web/src/api/client.ts` with:

- `ModelMode`
- `ModelAvailability`
- `PermissionOverride`
- `MemberPermissionRow`
- `OrchestrationIntent`
- `getModelAvailability()`
- `getPermissions()`
- `updateMemberPermissions()`
- `routeOrchestrationIntent()`
- `confirmOrchestrationIntent()`
- hosted skill proposal helpers
- optional metadata parameter for `postMessage()`
- task create/update fields for assignee/human owner/model mode

### Settings

Add Settings section:

- ID: `access`
- English label: `Access Control`
- Korean label: `권한 관리`

Access Control UI:

- Member list
- Role selector
- Permission matrix grouped by category
- Effective permission preview
- Save button
- Audit note

Rules:

- Read-only when user lacks `member:manage_permissions`.
- Confirmation modal before save.
- Owner last-owner protection surfaced in UI.

### Home

- Load model availability.
- Initialize model mode from `availability.default_mode`.
- Render model toggle in composer footer.
- Replace direct write flow with intent route and confirmation card.
- Keep read-only messages fast.

### Tasks

- Load model availability.
- Render model toggle in task chat.
- Send task execution metadata.
- Show record-only/blocked status when execution cannot start.
- Split assignee and human owner in task detail.

### Skills

- Keep current dashboard/list structure.
- Add proposal review queue.
- Add permission-aware approve/reject.
- Add version/risk/permission columns.

## 11. Database migration and backfill

Create a new migration, for example:

```text
supabase/migrations/20260513_agentic_workspace_governance.sql
```

Migration contents:

- Extend role constraints.
- Add `memberships.permissions`.
- Add `workspace_billing`.
- Add `audit_events`.
- Add task assignee/model/instruction fields.
- Add runner job requested_by/effective_permissions/model fields.
- Add `runner_capabilities.cli_details`.
- Add skill lifecycle tables if hosted skills are implemented in the same patch.

Backfill:

- Existing `tasks.owner` -> `assignee_type='agent'`, `assignee_id=owner` when
  owner is non-empty and not human.
- Existing `tasks.human_owner_user_id` -> `created_by` when safe.
- Existing tasks without `model_mode` -> `record_only` until availability can
  compute a better default.
- Existing skills -> `version=1`, `risk_level='low'`, current status preserved.
- Existing owner/admin/member effective permissions derive from role preset.

Compatibility:

- Existing local broker state files must load with zero values.
- UI must tolerate missing new fields during mixed-version local development.
- Hosted API should fail with clear missing-migration errors rather than silent
  partial mutation.

## 12. Copy and documentation cleanup

Update product copy:

- Replace "Jira-style project board" with "project execution board".
- Avoid "Jira replacement", "free AI automation", and "agents can do anything".
- Use "member-scoped authority" wherever agent autonomy is described.
- Keep GitHub PR delivery language project-scoped and optional.

API key/BYOK copy:

- Hosted/SaaS mode: no BYOK provider key setup.
- Local/self-hosted mode: provider keys may remain as legacy fallback if clearly
  labeled and not presented as managed workspace billing path.

Docs to revisit:

- `README.md`
- `USER_GUIDE_KO.md`
- `docs/specs/HOSTED-PRODUCT-BOUNDARY.md`
- `docs/specs/HOSTED-RUNNER-PROTOCOL.md`
- `docs/specs/PROJECT-TASK-TRACKING-MVP.md`

## 13. Test plan

### Hosted API tests

Add or update `api/hosted-api.test.js`:

- Member without `runner:manage` cannot register/revoke runner.
- Member without `member:invite` cannot create invite.
- Owner/admin can grant manager role and granular permissions.
- Member without `skill:approve` cannot activate proposed skill.
- Agent-proposed skill stays `proposed` until approved.
- Paid workspace with no runner defaults to `laf_model`.
- Free workspace with connected Codex runner defaults to `local_cli`.
- Free workspace with no runner returns `record_only`.
- Local mode execution requires runner and `model:use_local_cli`.
- LAF mode execution requires paid workspace and `model:use_laf`.
- Home write intent returns confirmation before mutation.
- Confirmed intent applies actions and writes audit event.

### Go tests

Add or update:

- `internal/team/broker_auth_test.go`
  - role presets
  - permission overrides
  - last owner protection
- `internal/team/broker_runner_test.go`
  - runner manage permission required
  - provider runtimes and cli details survive capability reporting
- `internal/team/broker_orchestration_test.go`
  - read-only intent
  - create task intent
  - confirmation required
  - confirm applies only with permission
- `internal/team/model_availability_test.go`
  - full availability matrix
- `internal/teammcp/skills_test.go`
  - lead-only `action=create` no longer enough
  - agent proposal creates review request
  - approved proposal becomes active
  - unauthorized approval fails

### Frontend tests

Add or update:

- `HomeApp.test.tsx`
  - model toggle visible
  - write intent shows confirmation card
  - confirm applies and clears card
- `TasksApp.test.tsx`
  - task chat sends model metadata
  - record-only banner shown
  - no runner disables local mode
- `SettingsApp.test.tsx`
  - Access Control section appears
  - permission matrix read-only without permission
  - authorized user can update overrides
- `SkillsApp.test.tsx`
  - proposed skill queue appears
  - approve/reject buttons are permission-aware
  - active skill shows version and usage

### Suggested commands

```bash
go test ./internal/team ./internal/teammcp ./internal/provider ./internal/config
node --test api/hosted-api.test.js
cd web && npm test -- --run
cd web && npm run typecheck
```

## 14. Recommended implementation order

### Patch 1 - Visible governance foundation

- Add permission helpers and role presets.
- Add migration for role expansion, overrides, audit, model/task/job fields.
- Add `GET/PATCH /permissions`.
- Add Settings Access Control read/write UI.
- Enforce runner manage and invite create permissions.
- Add focused hosted/local tests.

### Patch 2 - Model mode

- Add `workspace_billing` MVP and local env fallback.
- Add `/model/availability`.
- Extend runner capabilities with `cli_details`.
- Add `ModelModeToggle`.
- Add home/task composer model mode state.
- Ensure `record_only` stores messages without execution.

### Patch 3 - Home orchestration

- Add deterministic intent router.
- Add `/orchestration/intent`, `/orchestration/confirm`, `/orchestration/pending`.
- Add confirmation card UI.
- Support `create_tasks` first, then expand to assign/status/skill/wiki.
- Add audit event on confirm/cancel.

### Patch 4 - Task execution context

- Extend task fields and UI.
- Extend `postMessage` metadata.
- Include requested_by/effective_permissions/model_mode in runner jobs.
- Extend `agent-memory/v1` packet.
- Add execution unavailable states.

### Patch 5 - Skill governance

- Add hosted skill routes.
- Extend local skill state with manifest/version/risk fields.
- Replace lead-only active create with initiator permission rule.
- Add skill approval permission check to request accept path.
- Add SkillsApp proposal review queue.

### Patch 6 - Copy/docs cleanup

- Replace Jira-style copy.
- Clarify BYOK prohibition in hosted mode.
- Document model modes and member-scoped agent authority.
- Update Korean user guide after UI behavior lands.

## 15. Acceptance criteria

Product behavior:

- Home chat routes write commands into confirmation before mutation.
- Task chat sends instructions scoped to a task and includes model mode.
- Home and task composers show a small model mode toggle.
- Paid workspace defaults to LAF model when enabled.
- Local CLI mode requires connected runner with supported runtime.
- Free workspace with no runner can still create records but cannot run agents.
- Skill proposals can be created by agents.
- Active skill creation/approval is permission-gated.
- Member permissions can be viewed and edited by authorized users.
- Agent jobs inherit initiating member effective permissions.

Security/governance:

- Non-permissioned member cannot manage runner.
- Non-permissioned member cannot activate skill.
- Non-permissioned member cannot change permissions.
- Agent cannot bypass product permissions through broker/MCP endpoints.
- Audit events exist for permission, runner, task execution, skill, memory, and
  orchestration confirmation changes.

Compatibility:

- Existing `owner/admin/member` users continue to work.
- Existing `tasks.owner` remains supported.
- Existing local skills remain visible and invokable.
- Existing project wiki creation remains intact.
- Existing GitHub PR delivery remains project-scoped and optional.
