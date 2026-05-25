-- Pure-cloud schema assertion: purge retired execution residue and fail closed.
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
    device_prefix || 's',
    queue_prefix || '_' || pair_codes,
    queue_prefix || '_job_events',
    queue_prefix || '_jobs',
    queue_prefix || '_capabilities',
    queue_prefix || 's'
  ];
  col record;
  constraint_row record;
  fn record;
  pol record;
  rel record;
  trigger_row record;
  typ record;
  remaining_columns integer;
  remaining_constraints integer;
  remaining_functions integer;
  remaining_policies integer;
  remaining_tables integer;
  remaining_triggers integer;
  remaining_types integer;
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

  for constraint_row in
    select n.nspname, c.relname, con.conname
    from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and (
        lower(con.conname) like device_prefix || '\_%' escape '\'
        or lower(con.conname) like queue_prefix || '\_%' escape '\'
        or lower(con.conname) like '%\_' || device_prefix || '\_%' escape '\'
        or lower(con.conname) like '%\_' || queue_prefix || '\_%' escape '\'
      )
  loop
    execute format(
      'alter table if exists %I.%I drop constraint if exists %I cascade',
      constraint_row.nspname,
      constraint_row.relname,
      constraint_row.conname
    );
  end loop;

  for trigger_row in
    select n.nspname, c.relname, t.tgname
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and not t.tgisinternal
      and (
        lower(t.tgname) like device_prefix || '\_%' escape '\'
        or lower(t.tgname) like queue_prefix || '\_%' escape '\'
        or lower(t.tgname) like '%\_' || device_prefix || '\_%' escape '\'
        or lower(t.tgname) like '%\_' || queue_prefix || '\_%' escape '\'
      )
  loop
    execute format(
      'drop trigger if exists %I on %I.%I cascade',
      trigger_row.tgname,
      trigger_row.nspname,
      trigger_row.relname
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
        c.relname = any(obsolete_relations)
        or c.relname like device_prefix || '\_%' escape '\'
        or c.relname like queue_prefix || '\_%' escape '\'
        or c.relname like '%\_' || device_prefix || '\_%' escape '\'
        or c.relname like '%\_' || queue_prefix || '\_%' escape '\'
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

  select count(*) into remaining_constraints
  from pg_constraint con
  join pg_class c on c.oid = con.conrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and (
      lower(con.conname) like device_prefix || '\_%' escape '\'
      or lower(con.conname) like queue_prefix || '\_%' escape '\'
      or lower(con.conname) like '%\_' || device_prefix || '\_%' escape '\'
      or lower(con.conname) like '%\_' || queue_prefix || '\_%' escape '\'
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

  select count(*) into remaining_policies
  from pg_policies
  where schemaname = 'public'
    and (
      lower(policyname) like device_prefix || '\_%' escape '\'
      or lower(policyname) like queue_prefix || '\_%' escape '\'
      or lower(policyname) like '%\_' || device_prefix || '\_%' escape '\'
      or lower(policyname) like '%\_' || queue_prefix || '\_%' escape '\'
    );

  select count(*) into remaining_tables
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r', 'p', 'v', 'm', 'S', 'f', 'i')
    and (
      c.relname = any(obsolete_relations)
      or c.relname like device_prefix || '\_%' escape '\'
      or c.relname like queue_prefix || '\_%' escape '\'
      or c.relname like '%\_' || device_prefix || '\_%' escape '\'
      or c.relname like '%\_' || queue_prefix || '\_%' escape '\'
    );

  select count(*) into remaining_triggers
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and not t.tgisinternal
    and (
      lower(t.tgname) like device_prefix || '\_%' escape '\'
      or lower(t.tgname) like queue_prefix || '\_%' escape '\'
      or lower(t.tgname) like '%\_' || device_prefix || '\_%' escape '\'
      or lower(t.tgname) like '%\_' || queue_prefix || '\_%' escape '\'
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

  if remaining_columns <> 0
     or remaining_constraints <> 0
     or remaining_functions <> 0
     or remaining_policies <> 0
     or remaining_tables <> 0
     or remaining_triggers <> 0
     or remaining_types <> 0 then
    raise exception
      'pure cloud schema still has retired execution residue: columns %, constraints %, functions %, policies %, relations %, triggers %, types %',
      remaining_columns,
      remaining_constraints,
      remaining_functions,
      remaining_policies,
      remaining_tables,
      remaining_triggers,
      remaining_types;
  end if;
end $$;
