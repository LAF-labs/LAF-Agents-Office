alter table if exists public.startup_office_usage_events
  add column if not exists tool_calls integer not null default 0,
  add column if not exists idempotency_key text not null default '';

alter table if exists public.startup_office_usage_events
  drop constraint if exists startup_office_usage_events_nonnegative_check;

alter table if exists public.startup_office_usage_events
  add constraint startup_office_usage_events_nonnegative_check
  check (
    input_tokens >= 0
    and output_tokens >= 0
    and total_tokens >= 0
    and cost_cents >= 0
    and worker_duration_ms >= 0
    and tool_calls >= 0
  );

create unique index if not exists idx_startup_office_usage_events_idempotency_key
  on public.startup_office_usage_events(team_id, idempotency_key)
  where idempotency_key <> '';

create index if not exists idx_startup_office_usage_events_team_run
  on public.startup_office_usage_events(team_id, run_id, created_at desc);
