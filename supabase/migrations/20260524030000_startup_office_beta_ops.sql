alter table if exists public.workspace_billing
  add column if not exists billing_state text not null default 'trial'
    check (billing_state in ('trial', 'active', 'past_due', 'paused', 'comped', 'canceled')),
  add column if not exists monthly_run_limit integer not null default 50,
  add column if not exists monthly_model_spend_cents integer not null default 20000,
  add column if not exists storage_mb_limit integer not null default 1024,
  add column if not exists support_notes text not null default '';

create table if not exists public.startup_office_usage_events (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  run_id uuid references public.startup_office_runs(id) on delete set null,
  event_type text not null default 'model_run',
  provider text not null default '',
  model text not null default '',
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  total_tokens integer not null default 0,
  cost_cents integer not null default 0,
  worker_duration_ms integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.startup_office_notifications (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  recipient_user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'failed', 'suppressed')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists idx_startup_office_usage_events_team_created
  on public.startup_office_usage_events(team_id, created_at desc);
create index if not exists idx_startup_office_notifications_team_status
  on public.startup_office_notifications(team_id, status, created_at desc);

alter table public.startup_office_usage_events enable row level security;
alter table public.startup_office_notifications enable row level security;

drop policy if exists "members can read startup office usage events"
  on public.startup_office_usage_events;
create policy "members can read startup office usage events"
  on public.startup_office_usage_events for select
  using (public.is_team_member(team_id));

drop policy if exists "members can read startup office notifications"
  on public.startup_office_notifications;
create policy "members can read startup office notifications"
  on public.startup_office_notifications for select
  using (public.is_team_member(team_id));
