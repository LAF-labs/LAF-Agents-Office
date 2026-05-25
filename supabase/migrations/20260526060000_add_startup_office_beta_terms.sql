create table if not exists public.startup_office_terms_acceptances (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  accepted_by uuid references auth.users(id) on delete set null,
  terms_version text not null,
  privacy_version text not null,
  dpa_version text not null,
  ai_use_version text not null,
  retention_version text not null,
  deletion_version text not null,
  acceptance_note text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  accepted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint startup_office_terms_acceptances_versions_present check (
    terms_version <> '' and
    privacy_version <> '' and
    dpa_version <> '' and
    ai_use_version <> '' and
    retention_version <> '' and
    deletion_version <> ''
  )
);

create unique index if not exists idx_startup_office_terms_acceptances_team_terms
  on public.startup_office_terms_acceptances(team_id, terms_version);

create index if not exists idx_startup_office_terms_acceptances_team_accepted
  on public.startup_office_terms_acceptances(team_id, accepted_at desc);

alter table public.startup_office_terms_acceptances enable row level security;

drop policy if exists "startup_office_terms_acceptances_select_team_members"
  on public.startup_office_terms_acceptances;
create policy "startup_office_terms_acceptances_select_team_members"
  on public.startup_office_terms_acceptances for select
  using (
    exists (
      select 1
      from public.memberships m
      where m.team_id = startup_office_terms_acceptances.team_id
        and m.user_id = auth.uid()
        and m.status = 'active'
    )
  );
