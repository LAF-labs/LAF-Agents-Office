-- Final pure-cloud guardrail: remove obsolete customer-managed execution
-- remnants and fail if any retired execution object can still be observed.
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
  remaining_columns integer;
  remaining_functions integer;
  remaining_tables integer;
begin
  execute format(
    'alter table if exists public.%I drop column if exists %I cascade',
    'tasks',
    'execution_mode'
  );
  execute format(
    'alter table if exists public.%I drop column if exists %I cascade',
    'tasks',
    'worktree_path'
  );
  execute format(
    'alter table if exists public.%I drop column if exists %I cascade',
    'tasks',
    'worktree_branch'
  );
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
      and (
        p.proname = 'claim_' || queue_prefix || '_job'
        or p.proname ilike device_prefix || '\_%' escape '\'
        or p.proname ilike queue_prefix || '\_%' escape '\'
        or p.proname ilike '%\_' || device_prefix || '\_%' escape '\'
        or p.proname ilike '%\_' || queue_prefix || '\_%' escape '\'
      )
  loop
    execute format('drop function if exists %s cascade', fn.signature);
  end loop;

  foreach relation_name in array obsolete_relations loop
    execute format('drop table if exists public.%I cascade', relation_name);
  end loop;

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
        and column_name = queue_prefix || '_id'
      )
    );

  select count(*) into remaining_functions
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and (
      p.proname = 'claim_' || queue_prefix || '_job'
      or p.proname ilike device_prefix || '\_%' escape '\'
      or p.proname ilike queue_prefix || '\_%' escape '\'
      or p.proname ilike '%\_' || device_prefix || '\_%' escape '\'
      or p.proname ilike '%\_' || queue_prefix || '\_%' escape '\'
    );

  select count(*) into remaining_tables
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r', 'p')
    and (
      c.relname = any(obsolete_relations)
      or c.relname like device_prefix || '\_%' escape '\'
      or c.relname like queue_prefix || '\_%' escape '\'
    );

  if remaining_columns <> 0
     or remaining_functions <> 0
     or remaining_tables <> 0 then
    raise exception
      'pure cloud schema still has obsolete execution objects: columns %, functions %, tables %',
      remaining_columns,
      remaining_functions,
      remaining_tables;
  end if;
end $$;
