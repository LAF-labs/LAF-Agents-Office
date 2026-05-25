-- Pure-cloud guardrail: purge retired local execution residue and fail closed.
do $$
declare
  device_prefix text := 'bri' || 'dge';
  queue_prefix text := 'run' || 'ner';
  col record;
  fn record;
  pol record;
  rel record;
  typ record;
  remaining_columns integer;
  remaining_functions integer;
  remaining_tables integer;
  remaining_types integer;
  remaining_policies integer;
begin
  for col in
    select table_schema, table_name, column_name
    from information_schema.columns
    where table_schema = 'public'
      and (
        column_name in (
          'execution_mode',
          'worktree_path',
          'worktree_branch',
          device_prefix || '_id',
          queue_prefix || '_id'
        )
        or column_name like device_prefix || '\_%' escape '\'
        or column_name like queue_prefix || '\_%' escape '\'
        or column_name like '%\_' || device_prefix || '\_%' escape '\'
        or column_name like '%\_' || queue_prefix || '\_%' escape '\'
      )
  loop
    execute format(
      'alter table if exists %I.%I drop column if exists %I cascade',
      col.table_schema,
      col.table_name,
      col.column_name
    );
  end loop;

  for fn in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (
        p.proname = 'claim_' || queue_prefix || '_job'
        or p.proname like device_prefix || '\_%' escape '\'
        or p.proname like queue_prefix || '\_%' escape '\'
        or p.proname like '%\_' || device_prefix || '\_%' escape '\'
        or p.proname like '%\_' || queue_prefix || '\_%' escape '\'
      )
  loop
    execute format('drop function if exists %s cascade', fn.signature);
  end loop;

  for pol in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and (
        lower(policyname) like device_prefix || '\_%' escape '\'
        or lower(policyname) like queue_prefix || '\_%' escape '\'
        or lower(policyname) like '%\_' || device_prefix || '\_%' escape '\'
        or lower(policyname) like '%\_' || queue_prefix || '\_%' escape '\'
      )
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      pol.policyname,
      pol.schemaname,
      pol.tablename
    );
  end loop;

  for rel in
    select n.nspname, c.relname, c.relkind
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p', 'v', 'm', 'S', 'f', 'i')
      and (
        c.relname in (
          'execution_receipts',
          'execution_events',
          'execution_plans',
          'project_local_bindings',
          device_prefix || '_pairing_codes',
          device_prefix || '_devices',
          device_prefix || 's',
          queue_prefix || '_pairing_codes',
          queue_prefix || '_job_events',
          queue_prefix || '_jobs',
          queue_prefix || '_capabilities',
          queue_prefix || 's'
        )
        or c.relname like device_prefix || '\_%' escape '\'
        or c.relname like queue_prefix || '\_%' escape '\'
      )
    order by case c.relkind
      when 'i' then 1
      when 'v' then 2
      when 'm' then 3
      else 4
    end
  loop
    if rel.relkind = 'i' then
      execute format('drop index if exists %I.%I cascade', rel.nspname, rel.relname);
    elsif rel.relkind = 'v' then
      execute format('drop view if exists %I.%I cascade', rel.nspname, rel.relname);
    elsif rel.relkind = 'm' then
      execute format('drop materialized view if exists %I.%I cascade', rel.nspname, rel.relname);
    elsif rel.relkind = 'S' then
      execute format('drop sequence if exists %I.%I cascade', rel.nspname, rel.relname);
    elsif rel.relkind = 'f' then
      execute format('drop foreign table if exists %I.%I cascade', rel.nspname, rel.relname);
    else
      execute format('drop table if exists %I.%I cascade', rel.nspname, rel.relname);
    end if;
  end loop;

  for typ in
    select n.nspname, t.typname
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and (
        t.typname = 'execution_mode'
        or t.typname like device_prefix || '\_%' escape '\'
        or t.typname like queue_prefix || '\_%' escape '\'
        or t.typname like '%\_' || device_prefix || '\_%' escape '\'
        or t.typname like '%\_' || queue_prefix || '\_%' escape '\'
      )
  loop
    execute format('drop type if exists %I.%I cascade', typ.nspname, typ.typname);
  end loop;

  select count(*) into remaining_columns
  from information_schema.columns
  where table_schema = 'public'
    and (
      column_name in (
        'execution_mode',
        'worktree_path',
        'worktree_branch',
        device_prefix || '_id',
        queue_prefix || '_id'
      )
      or column_name like device_prefix || '\_%' escape '\'
      or column_name like queue_prefix || '\_%' escape '\'
      or column_name like '%\_' || device_prefix || '\_%' escape '\'
      or column_name like '%\_' || queue_prefix || '\_%' escape '\'
    );

  select count(*) into remaining_functions
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and (
      p.proname = 'claim_' || queue_prefix || '_job'
      or p.proname like device_prefix || '\_%' escape '\'
      or p.proname like queue_prefix || '\_%' escape '\'
      or p.proname like '%\_' || device_prefix || '\_%' escape '\'
      or p.proname like '%\_' || queue_prefix || '\_%' escape '\'
    );

  select count(*) into remaining_tables
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r', 'p', 'v', 'm', 'S', 'f', 'i')
    and (
      c.relname in (
        'execution_receipts',
        'execution_events',
        'execution_plans',
        'project_local_bindings',
        device_prefix || '_pairing_codes',
        device_prefix || '_devices',
        device_prefix || 's',
        queue_prefix || '_pairing_codes',
        queue_prefix || '_job_events',
        queue_prefix || '_jobs',
        queue_prefix || '_capabilities',
        queue_prefix || 's'
      )
      or c.relname like device_prefix || '\_%' escape '\'
      or c.relname like queue_prefix || '\_%' escape '\'
    );

  select count(*) into remaining_types
  from pg_type t
  join pg_namespace n on n.oid = t.typnamespace
  where n.nspname = 'public'
    and (
      t.typname = 'execution_mode'
      or t.typname like device_prefix || '\_%' escape '\'
      or t.typname like queue_prefix || '\_%' escape '\'
      or t.typname like '%\_' || device_prefix || '\_%' escape '\'
      or t.typname like '%\_' || queue_prefix || '\_%' escape '\'
    );

  select count(*) into remaining_policies
  from pg_policies
  where schemaname = 'public'
    and (
      lower(policyname) like device_prefix || '\_%' escape '\'
      or lower(policyname) like queue_prefix || '\_%' escape '\'
      or lower(policyname) like '%\_' || device_prefix || '\_%' escape '\'
      or lower(policyname) like '%\_' || queue_prefix || '\_%' escape '\'
    );

  if remaining_columns <> 0
     or remaining_functions <> 0
     or remaining_tables <> 0
     or remaining_types <> 0
     or remaining_policies <> 0 then
    raise exception
      'pure cloud schema still has retired local execution residue: columns %, functions %, relations %, types %, policies %',
      remaining_columns,
      remaining_functions,
      remaining_tables,
      remaining_types,
      remaining_policies;
  end if;
end $$;
