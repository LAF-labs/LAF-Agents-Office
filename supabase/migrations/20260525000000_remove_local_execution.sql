-- Pure cloud Startup Office removes obsolete device, queue, and checkout state.
do $$
begin
  if to_regclass('public.tasks') is not null then
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'tasks'
        and column_name = 'model_mode'
    ) then
      update public.tasks
      set model_mode = 'laf_model'
      where model_mode not in ('laf_model', 'record_only')
         or model_mode is null;

      alter table public.tasks
        drop constraint if exists tasks_model_mode_check;

      alter table public.tasks
        add constraint tasks_model_mode_check
        check (model_mode in ('laf_model', 'record_only'));

      alter table public.tasks
        alter column model_mode set default 'laf_model';
    end if;

    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'tasks'
        and column_name = 'execution_mode'
    ) then
      update public.tasks
      set execution_mode = 'office'
      where execution_mode is null
         or execution_mode <> 'office';
    end if;

    alter table public.tasks
      drop column if exists worktree_path,
      drop column if exists worktree_branch;
  end if;

  if to_regclass('public.channel_messages') is not null
     and exists (
       select 1
       from information_schema.columns
       where table_schema = 'public'
         and table_name = 'channel_messages'
         and column_name = 'model_mode'
     ) then
    update public.channel_messages
    set model_mode = 'laf_model'
    where model_mode not in ('laf_model', 'record_only')
       or model_mode is null;

    alter table public.channel_messages
      drop constraint if exists channel_messages_model_mode_check;

    alter table public.channel_messages
      add constraint channel_messages_model_mode_check
      check (model_mode in ('laf_model', 'record_only'));

    alter table public.channel_messages
      alter column model_mode set default 'laf_model';
  end if;
end $$;

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
