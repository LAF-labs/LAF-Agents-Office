-- Pure-cloud Startup Office removes obsolete local sync identity columns.
do $$
declare
  local_identity_column_names text[] := array[
    'local_id',
    'local_path',
    'local_root',
    'local_workspace',
    'local_workspace_path',
    'local_project_id',
    'local_task_id'
  ];
  col record;
  remaining_columns integer;
begin
  for col in
    select table_schema, table_name, column_name
    from information_schema.columns
    where table_schema = 'public'
      and (
        lower(column_name) = any(local_identity_column_names)
        or lower(column_name) like '%\_local_id' escape '\'
      )
  loop
    execute format(
      'alter table if exists %I.%I drop column if exists %I cascade',
      col.table_schema,
      col.table_name,
      col.column_name
    );
  end loop;

  select count(*) into remaining_columns
  from information_schema.columns
  where table_schema = 'public'
    and (
      lower(column_name) = any(local_identity_column_names)
      or lower(column_name) like '%\_local_id' escape '\'
    );

  if remaining_columns <> 0 then
    raise exception
      'pure cloud boundary still has obsolete local identity columns: %',
      remaining_columns;
  end if;
end $$;
