-- Idempotency keys prevent duplicate founder actions and repeated worker side
-- effects when browsers, API gateways, or workers retry the same request.
alter table if exists public.startup_office_runs
  add column if not exists idempotency_key text not null default '';

alter table if exists public.startup_office_artifacts
  add column if not exists idempotency_key text not null default '';

alter table if exists public.startup_office_approvals
  add column if not exists idempotency_key text not null default '';

create unique index if not exists idx_startup_office_runs_idempotency_key
  on public.startup_office_runs(team_id, idempotency_key)
  where idempotency_key <> '';

create unique index if not exists idx_startup_office_artifacts_idempotency_key
  on public.startup_office_artifacts(team_id, idempotency_key)
  where idempotency_key <> '';

create unique index if not exists idx_startup_office_approvals_idempotency_key
  on public.startup_office_approvals(team_id, idempotency_key)
  where idempotency_key <> '';
