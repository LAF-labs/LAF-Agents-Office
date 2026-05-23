create table if not exists public.company_profiles (
  team_id uuid primary key references public.teams(id) on delete cascade,
  name text,
  description text,
  goals text,
  size text,
  priority text,
  stage text,
  icp text,
  offer text,
  positioning text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.startup_office_loops (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  slug text not null,
  name text not null,
  department text not null default 'Operations',
  objective text not null default '',
  cadence text not null default 'manual'
    check (cadence in ('manual', 'daily', 'weekly', 'monthly')),
  status text not null default 'active'
    check (status in ('active', 'paused', 'archived')),
  policy jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(team_id, slug)
);

create table if not exists public.startup_office_runs (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  loop_id uuid references public.startup_office_loops(id) on delete set null,
  title text not null default '',
  objective text not null default '',
  status text not null default 'queued'
    check (status in ('queued', 'running', 'waiting_approval', 'completed', 'failed', 'canceled')),
  inputs jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  summary text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.startup_office_artifacts (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  run_id uuid references public.startup_office_runs(id) on delete cascade,
  kind text not null default 'draft'
    check (kind in ('plan', 'draft', 'asset', 'wiki_update', 'report', 'message')),
  title text not null default '',
  content text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.startup_office_approvals (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  run_id uuid references public.startup_office_runs(id) on delete cascade,
  artifact_id uuid references public.startup_office_artifacts(id) on delete set null,
  title text not null default '',
  details text not null default '',
  action text not null default '',
  risk_level text not null default 'medium'
    check (risk_level in ('low', 'medium', 'high')),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'revision_requested')),
  requested_by uuid references auth.users(id) on delete set null,
  decided_by uuid references auth.users(id) on delete set null,
  decision_note text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.startup_office_receipts (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  run_id uuid references public.startup_office_runs(id) on delete set null,
  approval_id uuid references public.startup_office_approvals(id) on delete set null,
  actor_slug text not null default 'agent',
  event_type text not null default 'event',
  summary text not null default '',
  trace jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.startup_office_assets (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  run_id uuid references public.startup_office_runs(id) on delete set null,
  name text not null,
  kind text not null default 'document',
  body text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.startup_office_customers (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  name text not null,
  status text not null default 'lead'
    check (status in ('lead', 'interviewing', 'qualified', 'customer', 'lost', 'archived')),
  profile jsonb not null default '{}'::jsonb,
  notes text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.startup_office_metrics (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  metric_key text not null,
  metric_value numeric,
  unit text not null default '',
  period_start date,
  period_end date,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.startup_office_signals (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  source text not null default '',
  title text not null default '',
  body text not null default '',
  status text not null default 'new'
    check (status in ('new', 'triaged', 'used', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_company_profiles_updated
  on public.company_profiles(updated_at desc);
create index if not exists idx_startup_office_loops_team_status
  on public.startup_office_loops(team_id, status, updated_at desc);
create index if not exists idx_startup_office_runs_team_status
  on public.startup_office_runs(team_id, status, updated_at desc);
create index if not exists idx_startup_office_runs_loop
  on public.startup_office_runs(loop_id, created_at desc);
create index if not exists idx_startup_office_artifacts_run
  on public.startup_office_artifacts(run_id, created_at desc);
create index if not exists idx_startup_office_approvals_team_status
  on public.startup_office_approvals(team_id, status, requested_at desc);
create index if not exists idx_startup_office_receipts_team_created
  on public.startup_office_receipts(team_id, created_at desc);
create index if not exists idx_startup_office_assets_team_kind
  on public.startup_office_assets(team_id, kind, updated_at desc);
create index if not exists idx_startup_office_customers_team_status
  on public.startup_office_customers(team_id, status, updated_at desc);
create index if not exists idx_startup_office_metrics_team_key
  on public.startup_office_metrics(team_id, metric_key, created_at desc);
create index if not exists idx_startup_office_signals_team_status
  on public.startup_office_signals(team_id, status, created_at desc);

alter table public.company_profiles enable row level security;
alter table public.startup_office_loops enable row level security;
alter table public.startup_office_runs enable row level security;
alter table public.startup_office_artifacts enable row level security;
alter table public.startup_office_approvals enable row level security;
alter table public.startup_office_receipts enable row level security;
alter table public.startup_office_assets enable row level security;
alter table public.startup_office_customers enable row level security;
alter table public.startup_office_metrics enable row level security;
alter table public.startup_office_signals enable row level security;

drop policy if exists "members can read company profiles"
  on public.company_profiles;
create policy "members can read company profiles"
  on public.company_profiles for select
  using (public.is_team_member(team_id));

drop policy if exists "managers can write company profiles"
  on public.company_profiles;
create policy "managers can write company profiles"
  on public.company_profiles for all
  using (public.is_team_role(team_id, array['owner','admin','manager']))
  with check (public.is_team_role(team_id, array['owner','admin','manager']));

drop policy if exists "members can read startup office loops"
  on public.startup_office_loops;
create policy "members can read startup office loops"
  on public.startup_office_loops for select
  using (public.is_team_member(team_id));

drop policy if exists "managers can write startup office loops"
  on public.startup_office_loops;
create policy "managers can write startup office loops"
  on public.startup_office_loops for all
  using (public.is_team_role(team_id, array['owner','admin','manager']))
  with check (public.is_team_role(team_id, array['owner','admin','manager']));

drop policy if exists "members can read startup office runs"
  on public.startup_office_runs;
create policy "members can read startup office runs"
  on public.startup_office_runs for select
  using (public.is_team_member(team_id));

drop policy if exists "members can write startup office runs"
  on public.startup_office_runs;
create policy "members can write startup office runs"
  on public.startup_office_runs for insert
  with check (public.is_team_member(team_id));

drop policy if exists "members can update startup office runs"
  on public.startup_office_runs;
create policy "members can update startup office runs"
  on public.startup_office_runs for update
  using (public.is_team_member(team_id))
  with check (public.is_team_member(team_id));

drop policy if exists "members can read startup office artifacts"
  on public.startup_office_artifacts;
create policy "members can read startup office artifacts"
  on public.startup_office_artifacts for select
  using (public.is_team_member(team_id));

drop policy if exists "members can write startup office artifacts"
  on public.startup_office_artifacts;
create policy "members can write startup office artifacts"
  on public.startup_office_artifacts for insert
  with check (public.is_team_member(team_id));

drop policy if exists "members can read startup office approvals"
  on public.startup_office_approvals;
create policy "members can read startup office approvals"
  on public.startup_office_approvals for select
  using (public.is_team_member(team_id));

drop policy if exists "members can write startup office approvals"
  on public.startup_office_approvals;
create policy "members can write startup office approvals"
  on public.startup_office_approvals for insert
  with check (public.is_team_member(team_id));

drop policy if exists "managers can decide startup office approvals"
  on public.startup_office_approvals;
create policy "managers can decide startup office approvals"
  on public.startup_office_approvals for update
  using (public.is_team_role(team_id, array['owner','admin','manager']))
  with check (public.is_team_role(team_id, array['owner','admin','manager']));

drop policy if exists "members can read startup office receipts"
  on public.startup_office_receipts;
create policy "members can read startup office receipts"
  on public.startup_office_receipts for select
  using (public.is_team_member(team_id));

drop policy if exists "members can write startup office receipts"
  on public.startup_office_receipts;
create policy "members can write startup office receipts"
  on public.startup_office_receipts for insert
  with check (public.is_team_member(team_id));

drop policy if exists "members can read startup office assets"
  on public.startup_office_assets;
create policy "members can read startup office assets"
  on public.startup_office_assets for select
  using (public.is_team_member(team_id));

drop policy if exists "members can write startup office assets"
  on public.startup_office_assets;
create policy "members can write startup office assets"
  on public.startup_office_assets for all
  using (public.is_team_member(team_id))
  with check (public.is_team_member(team_id));

drop policy if exists "members can read startup office customers"
  on public.startup_office_customers;
create policy "members can read startup office customers"
  on public.startup_office_customers for select
  using (public.is_team_member(team_id));

drop policy if exists "members can write startup office customers"
  on public.startup_office_customers;
create policy "members can write startup office customers"
  on public.startup_office_customers for all
  using (public.is_team_member(team_id))
  with check (public.is_team_member(team_id));

drop policy if exists "members can read startup office metrics"
  on public.startup_office_metrics;
create policy "members can read startup office metrics"
  on public.startup_office_metrics for select
  using (public.is_team_member(team_id));

drop policy if exists "members can write startup office metrics"
  on public.startup_office_metrics;
create policy "members can write startup office metrics"
  on public.startup_office_metrics for insert
  with check (public.is_team_member(team_id));

drop policy if exists "members can read startup office signals"
  on public.startup_office_signals;
create policy "members can read startup office signals"
  on public.startup_office_signals for select
  using (public.is_team_member(team_id));

drop policy if exists "members can write startup office signals"
  on public.startup_office_signals;
create policy "members can write startup office signals"
  on public.startup_office_signals for all
  using (public.is_team_member(team_id))
  with check (public.is_team_member(team_id));
