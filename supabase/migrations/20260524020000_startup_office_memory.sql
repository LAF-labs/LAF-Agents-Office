create table if not exists public.startup_office_memory_pages (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  slug text not null,
  title text not null,
  body text not null default '',
  summary text not null default '',
  status text not null default 'approved'
    check (status in ('draft', 'approved', 'archived')),
  provenance jsonb not null default '{}'::jsonb,
  sources jsonb not null default '[]'::jsonb,
  assumptions jsonb not null default '[]'::jsonb,
  last_verified_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(team_id, slug)
);

create index if not exists idx_startup_office_memory_pages_team_status
  on public.startup_office_memory_pages(team_id, status, updated_at desc);

alter table public.startup_office_memory_pages enable row level security;

drop policy if exists "members can read startup office memory pages"
  on public.startup_office_memory_pages;
create policy "members can read startup office memory pages"
  on public.startup_office_memory_pages for select
  using (public.is_team_member(team_id));

drop policy if exists "members can write startup office memory pages"
  on public.startup_office_memory_pages;
create policy "members can write startup office memory pages"
  on public.startup_office_memory_pages for all
  using (public.is_team_member(team_id))
  with check (public.is_team_member(team_id));
