create table if not exists public.startup_office_activation_events (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  milestone text not null
    check (milestone in ('first_loop_run', 'first_approval_decision', 'second_loop_run', 'first_export')),
  source_table text not null default '',
  source_id text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  first_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, milestone)
);

create index if not exists idx_startup_office_activation_events_team_seen
  on public.startup_office_activation_events(team_id, first_seen_at asc);

alter table public.startup_office_activation_events enable row level security;

drop policy if exists "members can read startup office activation events"
  on public.startup_office_activation_events;
create policy "members can read startup office activation events"
  on public.startup_office_activation_events for select
  using (public.is_team_member(team_id));
