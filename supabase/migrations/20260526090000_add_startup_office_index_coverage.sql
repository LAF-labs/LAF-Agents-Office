create index if not exists idx_startup_office_runs_team_created
  on public.startup_office_runs(team_id, created_at desc);

create index if not exists idx_startup_office_runs_team_loop
  on public.startup_office_runs(team_id, loop_id, created_at desc);

create index if not exists idx_startup_office_artifacts_team_created
  on public.startup_office_artifacts(team_id, created_at desc);

create index if not exists idx_startup_office_artifacts_team_run
  on public.startup_office_artifacts(team_id, run_id, created_at desc);

create index if not exists idx_startup_office_approvals_team_requested
  on public.startup_office_approvals(team_id, requested_at desc);

create index if not exists idx_startup_office_approvals_team_run_requested
  on public.startup_office_approvals(team_id, run_id, requested_at desc);

create index if not exists idx_startup_office_receipts_team_run_created
  on public.startup_office_receipts(team_id, run_id, created_at desc);

create index if not exists idx_startup_office_assets_team_created
  on public.startup_office_assets(team_id, created_at desc);

create index if not exists idx_startup_office_assets_team_run_created
  on public.startup_office_assets(team_id, run_id, created_at desc);

create index if not exists idx_startup_office_customers_team_created
  on public.startup_office_customers(team_id, created_at desc);

create index if not exists idx_startup_office_memory_pages_team_created
  on public.startup_office_memory_pages(team_id, created_at desc);

create index if not exists idx_startup_office_metrics_team_created
  on public.startup_office_metrics(team_id, created_at desc);

create index if not exists idx_startup_office_signals_team_created
  on public.startup_office_signals(team_id, created_at desc);

create index if not exists idx_startup_office_notifications_team_created
  on public.startup_office_notifications(team_id, created_at desc);

create index if not exists idx_startup_office_outbox_events_team_created
  on public.startup_office_outbox_events(team_id, created_at desc);

create index if not exists idx_startup_office_worker_jobs_team_created
  on public.startup_office_worker_jobs(team_id, created_at desc);

create index if not exists idx_startup_office_worker_jobs_team_run
  on public.startup_office_worker_jobs(team_id, run_id, created_at desc);
