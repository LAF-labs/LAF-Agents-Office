create table if not exists public.runner_pairing_codes (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  code_hash text not null unique,
  status text not null default 'pending' check (status in ('pending', 'claimed', 'expired', 'revoked')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  claimed_runner_id uuid references public.runners(id) on delete set null,
  claimed_at timestamptz
);

create index if not exists idx_runner_pairing_codes_team_status
  on public.runner_pairing_codes(team_id, status, expires_at);

alter table public.runner_pairing_codes enable row level security;

create policy "members can read runner pairing codes"
  on public.runner_pairing_codes for select
  using (public.is_team_member(team_id));
