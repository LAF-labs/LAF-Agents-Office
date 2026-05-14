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
  updated_at timestamptz not null default now(),
  unique(signature_key_id, nonce)
);

create index if not exists idx_execution_plans_team_status
  on public.execution_plans(team_id, status, created_at desc);

create index if not exists idx_execution_plans_device_status
  on public.execution_plans(device_id, status, created_at desc);

create index if not exists idx_execution_plans_task
  on public.execution_plans(task_id, created_at desc);

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

alter table public.bridge_devices enable row level security;
alter table public.bridge_pairing_codes enable row level security;
alter table public.project_local_bindings enable row level security;
alter table public.execution_plans enable row level security;
alter table public.execution_events enable row level security;
alter table public.execution_receipts enable row level security;

drop policy if exists "members can read bridge devices"
  on public.bridge_devices;
create policy "members can read bridge devices"
  on public.bridge_devices for select
  using (public.is_team_member(team_id));

drop policy if exists "users can manage own bridge devices"
  on public.bridge_devices;
create policy "users can manage own bridge devices"
  on public.bridge_devices for update
  using (user_id = auth.uid() and public.is_team_member(team_id))
  with check (user_id = auth.uid() and public.is_team_member(team_id));

drop policy if exists "team admins can manage bridge devices"
  on public.bridge_devices;
create policy "team admins can manage bridge devices"
  on public.bridge_devices for update
  using (
    exists (
      select 1
      from public.memberships m
      where m.team_id = bridge_devices.team_id
        and m.user_id = auth.uid()
        and m.status = 'active'
        and m.role in ('owner', 'admin')
    )
  )
  with check (
    exists (
      select 1
      from public.memberships m
      where m.team_id = bridge_devices.team_id
        and m.user_id = auth.uid()
        and m.status = 'active'
        and m.role in ('owner', 'admin')
    )
  );

drop policy if exists "users can read own bridge pairing codes"
  on public.bridge_pairing_codes;
create policy "users can read own bridge pairing codes"
  on public.bridge_pairing_codes for select
  using (user_id = auth.uid() and public.is_team_member(team_id));

drop policy if exists "users can read own project local bindings"
  on public.project_local_bindings;
create policy "users can read own project local bindings"
  on public.project_local_bindings for select
  using (user_id = auth.uid() and public.is_team_member(team_id));

drop policy if exists "users can manage own project local bindings"
  on public.project_local_bindings;
create policy "users can manage own project local bindings"
  on public.project_local_bindings for all
  using (user_id = auth.uid() and public.is_team_member(team_id))
  with check (user_id = auth.uid() and public.is_team_member(team_id));

drop policy if exists "users can read own execution plans"
  on public.execution_plans;
create policy "users can read own execution plans"
  on public.execution_plans for select
  using (
    public.is_team_member(team_id)
    and (actor_user_id = auth.uid() or executor_user_id = auth.uid())
  );

drop policy if exists "members can read execution events"
  on public.execution_events;
create policy "members can read execution events"
  on public.execution_events for select
  using (public.is_team_member(team_id));

drop policy if exists "members can read execution receipts"
  on public.execution_receipts;
create policy "members can read execution receipts"
  on public.execution_receipts for select
  using (public.is_team_member(team_id));
