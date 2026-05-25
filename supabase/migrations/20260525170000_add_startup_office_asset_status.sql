alter table public.startup_office_assets
  add column if not exists status text not null default 'active';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'startup_office_assets_status_check'
      and conrelid = 'public.startup_office_assets'::regclass
  ) then
    alter table public.startup_office_assets
      add constraint startup_office_assets_status_check
      check (status in ('active', 'archived'));
  end if;
end $$;

create index if not exists idx_startup_office_assets_team_status
  on public.startup_office_assets(team_id, status, updated_at desc);
