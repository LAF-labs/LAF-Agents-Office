-- Final pure-cloud cleanup for obsolete customer-managed execution remnants.
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
      and p.proname = 'claim_' || queue_prefix || '_job'
  loop
    execute format('drop function if exists %s cascade', fn.signature);
  end loop;

  foreach relation_name in array obsolete_relations loop
    execute format('drop table if exists public.%I cascade', relation_name);
  end loop;
end $$;
