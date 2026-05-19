create table if not exists public.workspace_settings (
  team_id uuid primary key references public.teams(id) on delete cascade,
  onboarding_completed_at timestamptz,
  llm_provider text check (llm_provider in ('claude-code', 'codex')),
  team_lead_slug text,
  company_profile jsonb not null default '{}'::jsonb,
  preferences jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists idx_workspace_settings_onboarding
  on public.workspace_settings(onboarding_completed_at);

alter table public.workspace_settings enable row level security;

drop policy if exists "members can read workspace settings"
  on public.workspace_settings;

create policy "members can read workspace settings"
  on public.workspace_settings for select
  using (public.is_team_member(team_id));

drop policy if exists "managers can insert workspace settings"
  on public.workspace_settings;

create policy "managers can insert workspace settings"
  on public.workspace_settings for insert
  with check (public.is_team_role(team_id, array['owner','admin','manager']));

drop policy if exists "managers can update workspace settings"
  on public.workspace_settings;

create policy "managers can update workspace settings"
  on public.workspace_settings for update
  using (public.is_team_role(team_id, array['owner','admin','manager']))
  with check (public.is_team_role(team_id, array['owner','admin','manager']));
