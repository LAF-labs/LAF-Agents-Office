alter table if exists public.workspace_billing
  add column if not exists seat_limit integer not null default 5;
