alter table public.memberships
  drop constraint if exists memberships_role_check;

alter table public.memberships
  add constraint memberships_role_check
  check (role in ('owner', 'admin', 'manager', 'member', 'viewer'));

alter table public.team_invites
  drop constraint if exists team_invites_role_check;

alter table public.team_invites
  add constraint team_invites_role_check
  check (role in ('owner', 'admin', 'manager', 'member', 'viewer'));

alter table public.memberships
  add column if not exists permissions jsonb not null default '{}'::jsonb;

alter table public.tasks
  add column if not exists assignee_type text not null default 'agent'
    check (assignee_type in ('agent', 'human', 'none')),
  add column if not exists assignee_id text,
  add column if not exists human_owner_user_id uuid references auth.users(id) on delete set null,
  add column if not exists model_mode text not null default 'record_only'
    check (model_mode in ('laf_model', 'local_cli', 'record_only'));

update public.tasks
set assignee_id = coalesce(nullif(owner, ''), assignee_id),
    assignee_type = case
      when coalesce(nullif(owner, ''), '') = '' then 'none'
      when lower(owner) in ('human', 'you') then 'human'
      else 'agent'
    end
where assignee_id is null;

alter table public.runner_jobs
  add column if not exists requested_by uuid references auth.users(id) on delete set null,
  add column if not exists effective_permissions text[] not null default '{}',
  add column if not exists model_mode text not null default 'record_only'
    check (model_mode in ('laf_model', 'local_cli', 'record_only')),
  add column if not exists intent_id uuid,
  add column if not exists confirmation_id uuid;

alter table public.runner_capabilities
  add column if not exists cli_details jsonb not null default '{}'::jsonb;

create table if not exists public.workspace_billing (
  team_id uuid primary key references public.teams(id) on delete cascade,
  plan text not null default 'free',
  laf_model_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_type text,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.orchestration_intents (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  requested_by uuid references auth.users(id) on delete set null,
  type text not null,
  risk text not null default 'low',
  summary text not null,
  proposed_actions jsonb not null default '[]'::jsonb,
  required_permissions text[] not null default '{}',
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'rejected', 'expired', 'applied')),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  confirmation_id uuid
);

create table if not exists public.skills (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  name text not null,
  title text,
  description text,
  content text not null,
  created_by text,
  created_by_user_id uuid references auth.users(id) on delete set null,
  channel text,
  tags text[] not null default '{}',
  trigger text,
  workflow_provider text,
  workflow_key text,
  workflow_definition text,
  workflow_schedule text,
  status text not null default 'proposed'
    check (status in ('proposed', 'active', 'archived', 'rejected')),
  version integer not null default 1,
  risk text not null default 'low',
  usage_count integer not null default 0,
  last_execution_at timestamptz,
  last_execution_status text,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  rejected_by uuid references auth.users(id) on delete set null,
  rejected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, name)
);

create index if not exists idx_audit_events_team_created
  on public.audit_events(team_id, created_at desc);

create index if not exists idx_orchestration_intents_team_status
  on public.orchestration_intents(team_id, status, created_at desc);

create index if not exists idx_skills_team_status
  on public.skills(team_id, status, updated_at desc);

alter table public.workspace_billing enable row level security;
alter table public.audit_events enable row level security;
alter table public.orchestration_intents enable row level security;
alter table public.skills enable row level security;

drop policy if exists "members can read workspace billing"
  on public.workspace_billing;
create policy "members can read workspace billing"
  on public.workspace_billing for select
  using (public.is_team_member(team_id));

drop policy if exists "members can read audit events"
  on public.audit_events;
create policy "members can read audit events"
  on public.audit_events for select
  using (public.is_team_member(team_id));

drop policy if exists "members can read orchestration intents"
  on public.orchestration_intents;
create policy "members can read orchestration intents"
  on public.orchestration_intents for select
  using (public.is_team_member(team_id));

drop policy if exists "members can read skills"
  on public.skills;
create policy "members can read skills"
  on public.skills for select
  using (public.is_team_member(team_id));
