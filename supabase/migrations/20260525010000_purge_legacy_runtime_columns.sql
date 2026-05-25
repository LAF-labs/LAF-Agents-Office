-- Final pure-cloud cleanup for task-local execution remnants.
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
      and p.proname = 'claim_runner_job'
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
