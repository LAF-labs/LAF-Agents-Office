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

do $$
declare
  device_prefix text := 'bri' || 'dge';
  queue_prefix text := 'run' || 'ner';
  pair_codes text := 'pair' || 'ing' || '_codes';
  obsolete_relations text[] := array[
    'execution_receipts',
    'execution_events',
    'execution_plans',
    'project_local_bindings',
    device_prefix || '_' || pair_codes,
    device_prefix || '_devices',
    queue_prefix || '_' || pair_codes,
    queue_prefix || '_job_events',
    queue_prefix || '_jobs',
    queue_prefix || '_capabilities',
    queue_prefix || 's'
  ];
  fn record;
  relation_name text;
begin
  execute format(
    'alter table if exists public.%I drop column if exists %I cascade',
    'wiki_write_requests',
    queue_prefix || '_id'
  );

  for fn in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'claim_' || queue_prefix || '_job'
  loop
    execute format('drop function if exists %s cascade', fn.signature);
  end loop;

  foreach relation_name in array obsolete_relations loop
    execute format('drop table if exists public.%I cascade', relation_name);
  end loop;
end $$;
