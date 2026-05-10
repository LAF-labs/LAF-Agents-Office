alter table public.runner_jobs
  add column if not exists provider_kind text;

create index if not exists idx_runner_jobs_claim_provider
  on public.runner_jobs(team_id, status, provider_kind, lease_expires_at, created_at);

create or replace function public.claim_runner_job(
  p_team_id uuid,
  p_runner_id uuid,
  p_execution_modes text[] default '{}'::text[],
  p_provider_runtimes text[] default '{}'::text[],
  p_lease_seconds integer default 300
)
returns setof public.runner_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lease_seconds integer := greatest(30, least(coalesce(p_lease_seconds, 300), 1800));
begin
  if not exists (
    select 1
    from public.runners r
    where r.id = p_runner_id
      and r.team_id = p_team_id
      and r.status <> 'revoked'
      and r.revoked_at is null
  ) then
    return;
  end if;

  update public.runner_jobs j
  set status = 'queued',
      runner_id = null,
      lease_expires_at = null,
      last_error = 'runner lease expired',
      updated_at = now()
  where j.team_id = p_team_id
    and j.status in ('leased', 'running')
    and j.lease_expires_at is not null
    and j.lease_expires_at <= now();

  return query
  with picked as (
    select j.id
    from public.runner_jobs j
    where j.team_id = p_team_id
      and j.status in ('queued', 'expired')
      and (
        coalesce(nullif(j.execution_mode, ''), '') = ''
        or coalesce(array_length(p_execution_modes, 1), 0) = 0
        or j.execution_mode = any(coalesce(p_execution_modes, '{}'::text[]))
      )
      and (
        coalesce(nullif(j.provider_kind, ''), '') = ''
        or j.provider_kind = any(coalesce(p_provider_runtimes, '{}'::text[]))
      )
    order by j.created_at asc, j.id asc
    for update skip locked
    limit 1
  )
  update public.runner_jobs j
  set status = 'leased',
      runner_id = p_runner_id,
      lease_expires_at = now() + make_interval(secs => v_lease_seconds),
      attempts = j.attempts + 1,
      updated_at = now()
  from picked
  where j.id = picked.id
  returning j.*;
end;
$$;

revoke execute on function public.claim_runner_job(uuid, uuid, text[], text[], integer)
  from public, anon, authenticated;

grant execute on function public.claim_runner_job(uuid, uuid, text[], text[], integer)
  to service_role;
