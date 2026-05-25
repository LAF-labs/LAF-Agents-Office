-- Service-role workers claim one due outbox row atomically. This gives
-- delivery processors at-least-once semantics with bounded lock recovery.
create or replace function public.claim_startup_office_outbox_event(
  p_worker_id text default 'startup-office-outbox-worker',
  p_lock_ms integer default 300000
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  now_ts timestamptz := clock_timestamp();
  lock_interval interval := (greatest(coalesce(p_lock_ms, 300000), 1000)::text || ' milliseconds')::interval;
  claimed public.startup_office_outbox_events%rowtype;
begin
  with candidate as (
    select id
    from public.startup_office_outbox_events
    where (
      status in ('queued', 'failed')
      and available_at <= now_ts
      and attempts < max_attempts
    ) or (
      status = 'processing'
      and locked_at <= now_ts - lock_interval
      and attempts < max_attempts
    )
    order by available_at asc, created_at asc
    for update skip locked
    limit 1
  )
  update public.startup_office_outbox_events as events
  set
    attempts = events.attempts + 1,
    last_error = '',
    locked_at = now_ts,
    status = 'processing',
    updated_at = now_ts
  from candidate
  where events.id = candidate.id
  returning events.* into claimed;

  if not found then
    return null;
  end if;

  return to_jsonb(claimed) || jsonb_build_object(
    'claimed_by',
    nullif(btrim(coalesce(p_worker_id, '')), '')
  );
end;
$$;

revoke all on function public.claim_startup_office_outbox_event(text, integer)
  from anon, authenticated;

grant execute on function public.claim_startup_office_outbox_event(text, integer)
  to service_role;
