alter table public.startup_office_customers
  add column if not exists loop_id uuid references public.startup_office_loops(id) on delete set null;

create index if not exists idx_startup_office_customers_team_loop
  on public.startup_office_customers(team_id, loop_id, updated_at desc);
