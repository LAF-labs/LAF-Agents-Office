alter table if exists public.workspace_billing
  add column if not exists billing_provider text not null default 'manual'
    check (billing_provider in ('manual', 'stripe')),
  add column if not exists payment_status text not null default 'trial'
    check (payment_status in ('trial', 'paid', 'paused', 'blocked')),
  add column if not exists beta_agreement_url text not null default '',
  add column if not exists last_paid_at timestamptz,
  add column if not exists blocked_reason text not null default '';

alter table if exists public.startup_office_assets
  add column if not exists content_type text not null default '',
  add column if not exists size_bytes bigint not null default 0,
  add column if not exists storage_path text not null default '',
  add column if not exists checksum_sha256 text not null default '',
  add column if not exists upload_status text not null default 'inline'
    check (upload_status in ('inline', 'pending', 'uploaded', 'failed'));

create table if not exists public.startup_office_support_access_events (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  support_user_id uuid references auth.users(id) on delete set null,
  event_type text not null default 'granted'
    check (event_type in ('granted', 'accessed', 'revoked')),
  reason text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.startup_office_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  requested_by uuid references auth.users(id) on delete set null,
  status text not null default 'queued'
    check (status in ('queued', 'exported', 'deleting', 'completed', 'canceled')),
  reason text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_startup_office_support_access_team_created
  on public.startup_office_support_access_events(team_id, created_at desc);
create index if not exists idx_startup_office_deletion_requests_team_status
  on public.startup_office_deletion_requests(team_id, status, created_at desc);
create index if not exists idx_startup_office_assets_upload_path
  on public.startup_office_assets(team_id, storage_path)
  where storage_path <> '';

alter table public.startup_office_support_access_events enable row level security;
alter table public.startup_office_deletion_requests enable row level security;

drop policy if exists "owners can read startup office support access"
  on public.startup_office_support_access_events;
create policy "owners can read startup office support access"
  on public.startup_office_support_access_events for select
  using (public.is_team_role(team_id, array['owner','admin']));

drop policy if exists "owners can write startup office support access"
  on public.startup_office_support_access_events;
create policy "owners can write startup office support access"
  on public.startup_office_support_access_events for insert
  with check (public.is_team_role(team_id, array['owner','admin']));

drop policy if exists "owners can read startup office deletion requests"
  on public.startup_office_deletion_requests;
create policy "owners can read startup office deletion requests"
  on public.startup_office_deletion_requests for select
  using (public.is_team_role(team_id, array['owner','admin']));

drop policy if exists "owners can write startup office deletion requests"
  on public.startup_office_deletion_requests;
create policy "owners can write startup office deletion requests"
  on public.startup_office_deletion_requests for insert
  with check (public.is_team_role(team_id, array['owner','admin']));
