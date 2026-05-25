create table if not exists public.hosted_rate_limits (
  scope text not null,
  bucket_key text not null,
  window_start timestamptz not null default now(),
  count integer not null default 0 check (count >= 0),
  reset_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (scope, bucket_key)
);

create index if not exists idx_hosted_rate_limits_reset
  on public.hosted_rate_limits(reset_at);

alter table public.hosted_rate_limits enable row level security;

create or replace function public.claim_hosted_rate_limit(
  p_scope text,
  p_bucket_key text,
  p_limit integer,
  p_window_ms integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  now_ts timestamptz := clock_timestamp();
  window_interval interval := (greatest(p_window_ms, 1000)::text || ' milliseconds')::interval;
  claimed record;
begin
  if nullif(btrim(p_scope), '') is null then
    raise exception 'rate limit scope is required';
  end if;
  if nullif(btrim(p_bucket_key), '') is null then
    raise exception 'rate limit bucket key is required';
  end if;
  if p_limit is null or p_limit < 1 then
    raise exception 'rate limit must be positive';
  end if;

  insert into public.hosted_rate_limits as limits (
    scope,
    bucket_key,
    window_start,
    count,
    reset_at,
    updated_at
  )
  values (
    btrim(p_scope),
    btrim(p_bucket_key),
    now_ts,
    1,
    now_ts + window_interval,
    now_ts
  )
  on conflict (scope, bucket_key)
  do update set
    count = case
      when limits.reset_at <= now_ts then 1
      else limits.count + 1
    end,
    window_start = case
      when limits.reset_at <= now_ts then now_ts
      else limits.window_start
    end,
    reset_at = case
      when limits.reset_at <= now_ts then now_ts + window_interval
      else limits.reset_at
    end,
    updated_at = now_ts
  returning limits.count, limits.reset_at into claimed;

  return jsonb_build_object(
    'allowed', claimed.count <= p_limit,
    'count', claimed.count,
    'limit', p_limit,
    'reset_at', claimed.reset_at
  );
end;
$$;

revoke all on function public.claim_hosted_rate_limit(text, text, integer, integer)
  from anon, authenticated;

grant execute on function public.claim_hosted_rate_limit(text, text, integer, integer)
  to service_role;
