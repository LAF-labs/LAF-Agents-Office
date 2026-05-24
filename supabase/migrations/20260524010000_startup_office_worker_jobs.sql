create table if not exists public.startup_office_worker_jobs (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  run_id uuid references public.startup_office_runs(id) on delete cascade,
  loop_slug text not null default '',
  status text not null default 'queued'
    check (status in ('queued', 'running', 'completed', 'failed', 'canceled')),
  attempts integer not null default 0,
  max_attempts integer not null default 2,
  last_error text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  locked_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_startup_office_worker_jobs_team_status
  on public.startup_office_worker_jobs(team_id, status, updated_at desc);
create index if not exists idx_startup_office_worker_jobs_run
  on public.startup_office_worker_jobs(run_id, created_at desc);

alter table public.startup_office_worker_jobs enable row level security;

drop policy if exists "members can read startup office worker jobs"
  on public.startup_office_worker_jobs;
create policy "members can read startup office worker jobs"
  on public.startup_office_worker_jobs for select
  using (public.is_team_member(team_id));

drop policy if exists "members can write startup office worker jobs"
  on public.startup_office_worker_jobs;
create policy "members can write startup office worker jobs"
  on public.startup_office_worker_jobs for all
  using (public.is_team_member(team_id))
  with check (public.is_team_member(team_id));
