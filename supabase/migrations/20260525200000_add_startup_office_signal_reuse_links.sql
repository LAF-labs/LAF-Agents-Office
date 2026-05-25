alter table public.startup_office_signals
  add column if not exists signal_type text not null default 'market',
  add column if not exists loop_id uuid references public.startup_office_loops(id) on delete set null,
  add column if not exists run_id uuid references public.startup_office_runs(id) on delete set null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'startup_office_signals_signal_type_check'
      and conrelid = 'public.startup_office_signals'::regclass
  ) then
    alter table public.startup_office_signals
      add constraint startup_office_signals_signal_type_check
      check (signal_type in ('market', 'customer', 'competitor', 'internal'));
  end if;
end $$;

create index if not exists idx_startup_office_signals_team_type_status
  on public.startup_office_signals(team_id, signal_type, status, updated_at desc);

create index if not exists idx_startup_office_signals_team_loop
  on public.startup_office_signals(team_id, loop_id, updated_at desc);

create index if not exists idx_startup_office_signals_team_run
  on public.startup_office_signals(team_id, run_id, updated_at desc);
