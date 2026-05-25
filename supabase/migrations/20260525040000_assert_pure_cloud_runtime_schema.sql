-- Final pure-cloud guardrail: remove runner/bridge remnants and fail if any
-- retired local execution object can still be observed in public schema.
alter table if exists public.tasks
  drop column if exists execution_mode,
  drop column if exists worktree_path,
  drop column if exists worktree_branch;

alter table if exists public.wiki_write_requests
  drop column if exists runner_id;

do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (
        p.proname = 'claim_runner_job'
        or p.proname ilike 'bridge_%'
        or p.proname ilike 'runner_%'
        or p.proname ilike '%_bridge_%'
        or p.proname ilike '%_runner_%'
      )
  loop
    execute format('drop function if exists %s cascade', fn.signature);
  end loop;
end $$;

drop table if exists public.execution_receipts cascade;
drop table if exists public.execution_events cascade;
drop table if exists public.execution_plans cascade;
drop table if exists public.project_local_bindings cascade;
drop table if exists public.bridge_pairing_codes cascade;
drop table if exists public.bridge_devices cascade;
drop table if exists public.runner_pairing_codes cascade;
drop table if exists public.runner_job_events cascade;
drop table if exists public.runner_jobs cascade;
drop table if exists public.runner_capabilities cascade;
drop table if exists public.runners cascade;

do $$
declare
  remaining_columns integer;
  remaining_functions integer;
  remaining_tables integer;
begin
  select count(*) into remaining_columns
  from information_schema.columns
  where table_schema = 'public'
    and (
      (
        table_name = 'tasks'
        and column_name in ('execution_mode', 'worktree_path', 'worktree_branch')
      )
      or (
        table_name = 'wiki_write_requests'
        and column_name = 'runner_id'
      )
    );

  select count(*) into remaining_functions
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and (
      p.proname = 'claim_runner_job'
      or p.proname ilike 'bridge_%'
      or p.proname ilike 'runner_%'
      or p.proname ilike '%_bridge_%'
      or p.proname ilike '%_runner_%'
    );

  select count(*) into remaining_tables
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r', 'p')
    and (
      c.relname in (
        'execution_receipts',
        'execution_events',
        'execution_plans',
        'project_local_bindings',
        'bridge_pairing_codes',
        'bridge_devices',
        'runner_pairing_codes',
        'runner_job_events',
        'runner_jobs',
        'runner_capabilities',
        'runners'
      )
      or c.relname like 'bridge_%'
      or c.relname like 'runner_%'
    );

  if remaining_columns <> 0
     or remaining_functions <> 0
     or remaining_tables <> 0 then
    raise exception
      'pure cloud schema still has obsolete runner/bridge objects: columns %, functions %, tables %',
      remaining_columns,
      remaining_functions,
      remaining_tables;
  end if;
end $$;
