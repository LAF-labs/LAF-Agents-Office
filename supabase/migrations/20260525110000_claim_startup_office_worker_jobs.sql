alter table public.startup_office_worker_jobs
  add column if not exists available_at timestamptz not null default now();

alter table public.startup_office_worker_jobs
  drop constraint if exists startup_office_worker_jobs_status_check,
  add constraint startup_office_worker_jobs_status_check
    check (status in ('queued', 'running', 'completed', 'failed', 'canceled', 'dead_letter'));

create index if not exists idx_startup_office_worker_jobs_claim
  on public.startup_office_worker_jobs(status, available_at, updated_at);

create or replace function public.claim_startup_office_worker_job(
  p_worker_id text default 'startup-office-loop-worker',
  p_lock_ms integer default 1800000
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed public.startup_office_worker_jobs%rowtype;
  lock_ms integer := greatest(1000, least(coalesce(p_lock_ms, 1800000), 86400000));
  now_ts timestamptz := now();
  worker_id text := coalesce(nullif(p_worker_id, ''), 'startup-office-loop-worker');
  stale_before timestamptz;
begin
  stale_before := now_ts - (lock_ms || ' milliseconds')::interval;

  with candidate as (
    select *
    from public.startup_office_worker_jobs
    where (
        status = 'queued'
        and available_at <= now_ts
      )
      or (
        status = 'failed'
        and attempts < max_attempts
        and available_at <= now_ts
      )
      or (
        status = 'running'
        and attempts < max_attempts
        and locked_at is not null
        and locked_at < stale_before
      )
    order by
      case status
        when 'running' then 0
        when 'failed' then 1
        else 2
      end,
      available_at asc,
      updated_at asc
    limit 1
    for update skip locked
  )
  update public.startup_office_worker_jobs jobs
  set
    attempts = jobs.attempts + 1,
    last_error = case
      when candidate.status = 'running' then 'reclaimed stale worker lease'
      else jobs.last_error
    end,
    locked_at = now_ts,
    metadata = coalesce(jobs.metadata, '{}'::jsonb)
      || jsonb_build_object('worker_id', worker_id, 'claimed_at', now_ts),
    started_at = coalesce(jobs.started_at, now_ts),
    status = 'running',
    updated_at = now_ts
  from candidate
  where jobs.id = candidate.id
  returning jobs.* into claimed;

  if claimed.id is null then
    return null;
  end if;

  return to_jsonb(claimed);
end;
$$;

revoke all on function public.claim_startup_office_worker_job(text, integer)
  from public, anon, authenticated;
grant execute on function public.claim_startup_office_worker_job(text, integer)
  to service_role;
