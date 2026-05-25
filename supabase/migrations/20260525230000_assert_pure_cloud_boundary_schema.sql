-- Pure-cloud boundary assertion: remove any remaining customer-managed execution residue and fail closed.
do $$
declare
  retired_device text := 'bri' || 'dge';
  retired_queue text := 'run' || 'ner';
  retired_pairing text := 'pair' || 'ing';
  retired_exact_names text[] := array[
    'delivery_receipts',
    'execution_events',
    'execution_plans',
    'execution_receipts',
    'project_local_bindings',
    'projects',
    'tasks',
    retired_device || '_' || retired_pairing || '_codes',
    retired_device || '_devices',
    retired_device || 's',
    retired_queue || '_' || retired_pairing || '_codes',
    retired_queue || '_capabilities',
    retired_queue || '_devices',
    retired_queue || '_job_events',
    retired_queue || '_jobs',
    retired_queue || 's'
  ];
  retired_column_names text[] := array[
    'execution_mode',
    'local_id',
    'local_path',
    'local_project_id',
    'local_root',
    'local_task_id',
    'local_worktree',
    'local_workspace',
    'local_workspace_path',
    'managed_checkout',
    'project_id',
    'task_id',
    'worktree_branch',
    'worktree_path',
    retired_device || '_id',
    retired_queue || '_id'
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
  for col in
    select n.nspname as table_schema, c.relname as table_name, a.attname as column_name
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p', 'f')
      and a.attnum > 0
      and not a.attisdropped
      and (
        lower(a.attname) = any(retired_column_names)
        or lower(a.attname) like '%' || retired_device || '%'
        or lower(a.attname) like '%' || retired_queue || '%'
        or lower(a.attname) like '%' || retired_pairing || '%'
        or lower(a.attname) like '%worktree%'
        or lower(a.attname) like '%managed_checkout%'
        or lower(a.attname) like '%\_local_id' escape '\'
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
        lower(con.conname) like '%' || retired_device || '%'
        or lower(con.conname) like '%' || retired_queue || '%'
        or lower(con.conname) like '%' || retired_pairing || '%'
        or lower(con.conname) like '%worktree%'
        or lower(con.conname) like '%managed_checkout%'
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
        lower(t.tgname) like '%' || retired_device || '%'
        or lower(t.tgname) like '%' || retired_queue || '%'
        or lower(t.tgname) like '%' || retired_pairing || '%'
        or lower(t.tgname) like '%worktree%'
        or lower(t.tgname) like '%managed_checkout%'
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
        lower(p.proname) like '%' || retired_device || '%'
        or lower(p.proname) like '%' || retired_queue || '%'
        or lower(p.proname) like '%' || retired_pairing || '%'
        or lower(p.proname) like '%worktree%'
        or lower(p.proname) like '%managed_checkout%'
      )
  loop
    execute format('drop function if exists %s cascade', fn.signature);
  end loop;

  for pol in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and (
        lower(policyname) like '%' || retired_device || '%'
        or lower(policyname) like '%' || retired_queue || '%'
        or lower(policyname) like '%' || retired_pairing || '%'
        or lower(policyname) like '%worktree%'
        or lower(policyname) like '%managed_checkout%'
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
      and c.relkind in ('i', 'v', 'm', 'S', 'f', 'r', 'p')
      and (
        lower(c.relname) = any(retired_exact_names)
        or lower(c.relname) like '%' || retired_device || '%'
        or lower(c.relname) like '%' || retired_queue || '%'
        or lower(c.relname) like '%' || retired_pairing || '%'
        or lower(c.relname) like '%worktree%'
        or lower(c.relname) like '%managed_checkout%'
      )
    order by case c.relkind
      when 'i' then 1
      when 'v' then 2
      when 'm' then 3
      when 'S' then 4
      else 5
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
      and t.typrelid = 0
      and (
        lower(t.typname) = 'execution_mode'
        or lower(t.typname) like '%' || retired_device || '%'
        or lower(t.typname) like '%' || retired_queue || '%'
        or lower(t.typname) like '%' || retired_pairing || '%'
        or lower(t.typname) like '%worktree%'
        or lower(t.typname) like '%managed_checkout%'
      )
  loop
    execute format('drop type if exists %I.%I cascade', typ.nspname, typ.typname);
  end loop;

  select count(*) into remaining_columns
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r', 'p', 'f')
    and a.attnum > 0
    and not a.attisdropped
    and (
      lower(a.attname) = any(retired_column_names)
      or lower(a.attname) like '%' || retired_device || '%'
      or lower(a.attname) like '%' || retired_queue || '%'
      or lower(a.attname) like '%' || retired_pairing || '%'
      or lower(a.attname) like '%worktree%'
      or lower(a.attname) like '%managed_checkout%'
      or lower(a.attname) like '%\_local_id' escape '\'
    );

  select count(*) into remaining_constraints
  from pg_constraint con
  join pg_class c on c.oid = con.conrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and (
      lower(con.conname) like '%' || retired_device || '%'
      or lower(con.conname) like '%' || retired_queue || '%'
      or lower(con.conname) like '%' || retired_pairing || '%'
      or lower(con.conname) like '%worktree%'
      or lower(con.conname) like '%managed_checkout%'
    );

  select count(*) into remaining_functions
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and (
      lower(p.proname) like '%' || retired_device || '%'
      or lower(p.proname) like '%' || retired_queue || '%'
      or lower(p.proname) like '%' || retired_pairing || '%'
      or lower(p.proname) like '%worktree%'
      or lower(p.proname) like '%managed_checkout%'
    );

  select count(*) into remaining_policies
  from pg_policies
  where schemaname = 'public'
    and (
      lower(policyname) like '%' || retired_device || '%'
      or lower(policyname) like '%' || retired_queue || '%'
      or lower(policyname) like '%' || retired_pairing || '%'
      or lower(policyname) like '%worktree%'
      or lower(policyname) like '%managed_checkout%'
    );

  select count(*) into remaining_tables
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('i', 'v', 'm', 'S', 'f', 'r', 'p')
    and (
      lower(c.relname) = any(retired_exact_names)
      or lower(c.relname) like '%' || retired_device || '%'
      or lower(c.relname) like '%' || retired_queue || '%'
      or lower(c.relname) like '%' || retired_pairing || '%'
      or lower(c.relname) like '%worktree%'
      or lower(c.relname) like '%managed_checkout%'
    );

  select count(*) into remaining_triggers
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and not t.tgisinternal
    and (
      lower(t.tgname) like '%' || retired_device || '%'
      or lower(t.tgname) like '%' || retired_queue || '%'
      or lower(t.tgname) like '%' || retired_pairing || '%'
      or lower(t.tgname) like '%worktree%'
      or lower(t.tgname) like '%managed_checkout%'
    );

  select count(*) into remaining_types
  from pg_type t
  join pg_namespace n on n.oid = t.typnamespace
  where n.nspname = 'public'
    and t.typrelid = 0
    and (
      lower(t.typname) = 'execution_mode'
      or lower(t.typname) like '%' || retired_device || '%'
      or lower(t.typname) like '%' || retired_queue || '%'
      or lower(t.typname) like '%' || retired_pairing || '%'
      or lower(t.typname) like '%worktree%'
      or lower(t.typname) like '%managed_checkout%'
    );

  if remaining_columns <> 0
     or remaining_constraints <> 0
     or remaining_functions <> 0
     or remaining_policies <> 0
     or remaining_tables <> 0
     or remaining_triggers <> 0
     or remaining_types <> 0 then
    raise exception
      'pure cloud boundary still has retired execution objects: columns %, constraints %, functions %, policies %, tables %, triggers %, types %',
      remaining_columns,
      remaining_constraints,
      remaining_functions,
      remaining_policies,
      remaining_tables,
      remaining_triggers,
      remaining_types;
  end if;
end $$;
