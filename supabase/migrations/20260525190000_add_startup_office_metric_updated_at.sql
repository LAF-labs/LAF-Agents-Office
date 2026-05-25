alter table public.startup_office_metrics
  add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_startup_office_metrics_team_updated
  on public.startup_office_metrics(team_id, updated_at desc);
