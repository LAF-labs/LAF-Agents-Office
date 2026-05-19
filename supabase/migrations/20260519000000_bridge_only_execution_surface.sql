-- LAF Bridge is the only hosted local-execution component. Retire the legacy
-- hosted local-execution queue after the bridge/execution_plans schema exists.
drop function if exists public.claim_runner_job(uuid, uuid, text[], text[], integer);

alter table if exists public.wiki_write_requests
  drop column if exists runner_id;

alter table if exists public.execution_plans
  drop column if exists binding_id;

alter table if exists public.tasks
  drop column if exists worktree_path;

do $$
begin
  if to_regclass('public.project_local_bindings') is not null then
    drop policy if exists "users can read own project local bindings"
      on public.project_local_bindings;
    drop policy if exists "users can manage own project local bindings"
      on public.project_local_bindings;
  end if;
  if to_regclass('public.runner_pairing_codes') is not null then
    drop policy if exists "members can read runner pairing codes"
      on public.runner_pairing_codes;
  end if;
  if to_regclass('public.runner_job_events') is not null then
    drop policy if exists "members can read runner job events"
      on public.runner_job_events;
  end if;
  if to_regclass('public.runner_jobs') is not null then
    drop policy if exists "members can read runner jobs"
      on public.runner_jobs;
    drop policy if exists "members can write runner jobs"
      on public.runner_jobs;
  end if;
  if to_regclass('public.runner_capabilities') is not null then
    drop policy if exists "members can read runner capabilities"
      on public.runner_capabilities;
    drop policy if exists "managers can write runner capabilities"
      on public.runner_capabilities;
    drop policy if exists "managers can update runner capabilities"
      on public.runner_capabilities;
  end if;
  if to_regclass('public.runners') is not null then
    drop policy if exists "members can read runners"
      on public.runners;
    drop policy if exists "managers can write runners"
      on public.runners;
    drop policy if exists "managers can update runners"
      on public.runners;
    drop policy if exists "managers can delete runners"
      on public.runners;
  end if;
end $$;

drop table if exists public.project_local_bindings cascade;
drop table if exists public.runner_pairing_codes cascade;
drop table if exists public.runner_job_events cascade;
drop table if exists public.runner_jobs cascade;
drop table if exists public.runner_capabilities cascade;
drop table if exists public.runners cascade;
