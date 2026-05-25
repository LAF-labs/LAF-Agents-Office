create table if not exists public.startup_office_deletion_tombstones (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null,
  deletion_request_id uuid,
  requested_by uuid references auth.users(id) on delete set null,
  status text not null default 'purged' check (status in ('purged', 'failed')),
  reason text,
  manifest_version text not null,
  purged_tables text[] not null default '{}',
  retained_tables text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  requested_at timestamptz,
  purged_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_startup_office_deletion_tombstones_team_created
  on public.startup_office_deletion_tombstones(team_id, created_at desc);

alter table public.startup_office_deletion_tombstones enable row level security;

drop policy if exists "owners can read startup office deletion tombstones"
  on public.startup_office_deletion_tombstones;
create policy "owners can read startup office deletion tombstones"
  on public.startup_office_deletion_tombstones for select
  to authenticated
  using (public.is_team_role(team_id, array['owner','admin']));

create or replace function public.purge_startup_office_workspace(
  target_team_id uuid,
  target_deletion_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  request_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('role', true), ''),
    current_user
  );
  now_ts timestamptz := clock_timestamp();
  deletion_row record;
  deleted_teams integer := 0;
  purge_tables text[] := array[
    'audit_events',
    'channel_messages',
    'company_profiles',
    'memberships',
    'orchestration_intents',
    'skills',
    'startup_office_activation_events',
    'startup_office_approvals',
    'startup_office_artifacts',
    'startup_office_assets',
    'startup_office_billing_documents',
    'startup_office_customers',
    'startup_office_deletion_requests',
    'startup_office_loops',
    'startup_office_memory_pages',
    'startup_office_metrics',
    'startup_office_notifications',
    'startup_office_outbox_events',
    'startup_office_receipts',
    'startup_office_runs',
    'startup_office_signals',
    'startup_office_support_access_events',
    'startup_office_terms_acceptances',
    'startup_office_usage_events',
    'startup_office_worker_jobs',
    'team_invites',
    'teams',
    'wiki_article_index',
    'wiki_write_requests',
    'workspace_billing',
    'workspace_settings'
  ];
  retained_tables text[] := array['startup_office_deletion_tombstones'];
begin
  if request_role <> 'service_role' then
    raise exception 'startup office workspace purge requires service_role'
      using errcode = '42501';
  end if;

  if target_team_id is null then
    raise exception 'target_team_id is required';
  end if;
  if target_deletion_request_id is null then
    raise exception 'target_deletion_request_id is required';
  end if;

  select *
    into deletion_row
    from public.startup_office_deletion_requests
    where id = target_deletion_request_id
      and team_id = target_team_id
    for update;

  if not found then
    raise exception 'startup office deletion request not found';
  end if;
  if deletion_row.status not in ('queued', 'exported', 'deleting') then
    raise exception 'startup office deletion request is not purgeable';
  end if;

  update public.startup_office_deletion_requests
    set status = 'deleting',
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
          'purge_started_at', now_ts,
          'purge_method', 'purge_startup_office_workspace'
        ),
        updated_at = now_ts
    where id = target_deletion_request_id
      and team_id = target_team_id;

  insert into public.startup_office_deletion_tombstones (
    team_id,
    deletion_request_id,
    requested_by,
    status,
    reason,
    manifest_version,
    purged_tables,
    retained_tables,
    metadata,
    requested_at,
    purged_at
  )
  values (
    target_team_id,
    target_deletion_request_id,
    deletion_row.requested_by,
    'purged',
    deletion_row.reason,
    'startup-office-deletion-manifest-2026-05-26',
    purge_tables,
    retained_tables,
    jsonb_build_object(
      'deletion_request_metadata', coalesce(deletion_row.metadata, '{}'::jsonb),
      'receipt_delete_bypass', 'app.allow_receipt_delete'
    ),
    deletion_row.created_at,
    now_ts
  );

  perform set_config('app.allow_receipt_delete', 'on', true);
  delete from public.teams where id = target_team_id;
  get diagnostics deleted_teams = row_count;

  if deleted_teams <> 1 then
    raise exception 'startup office workspace purge deleted % teams', deleted_teams;
  end if;

  return jsonb_build_object(
    'status', 'purged',
    'team_id', target_team_id,
    'deletion_request_id', target_deletion_request_id,
    'manifest_version', 'startup-office-deletion-manifest-2026-05-26',
    'purged_tables', purge_tables,
    'retained_tables', retained_tables,
    'purged_at', now_ts
  );
end;
$$;

revoke execute on function public.purge_startup_office_workspace(uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.purge_startup_office_workspace(uuid, uuid)
  to service_role;
