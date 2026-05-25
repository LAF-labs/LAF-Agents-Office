alter table if exists public.startup_office_runs
  add column if not exists model_timeout_ms integer not null default 120000
    check (model_timeout_ms between 1 and 900000),
  add column if not exists model_deadline_at timestamptz,
  add column if not exists timed_out_at timestamptz;

alter table if exists public.startup_office_worker_jobs
  add column if not exists model_timeout_ms integer not null default 120000
    check (model_timeout_ms between 1 and 900000),
  add column if not exists model_deadline_at timestamptz,
  add column if not exists timed_out_at timestamptz;

create index if not exists idx_startup_office_runs_model_deadline
  on public.startup_office_runs(team_id, model_deadline_at)
  where status = 'running' and model_deadline_at is not null;

create index if not exists idx_startup_office_worker_jobs_model_deadline
  on public.startup_office_worker_jobs(team_id, model_deadline_at)
  where status = 'running' and model_deadline_at is not null;
