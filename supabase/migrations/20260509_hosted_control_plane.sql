create extension if not exists pgcrypto;

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (slug)
);

create table if not exists public.memberships (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  status text not null default 'active' check (status in ('active', 'invited', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, user_id)
);

create table if not exists public.team_invites (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  email text not null,
  name text,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  channel text,
  token_hash text not null unique,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null,
  sent_at timestamptz,
  send_status text,
  send_error text
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  local_id text,
  name text not null,
  description text,
  additional_info text,
  channel text,
  lead_agent text,
  github_repo_url text,
  recipe_filename text,
  recipe_markdown text,
  recipe_updated_at timestamptz,
  status text not null default 'active',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, local_id)
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  local_id text,
  channel text,
  title text not null,
  details text,
  human_details text,
  owner text,
  status text not null default 'open',
  created_by uuid references auth.users(id) on delete set null,
  thread_id text,
  task_type text,
  pipeline_id text,
  pipeline_stage text,
  execution_mode text,
  review_state text,
  source_signal_id text,
  source_decision_id text,
  worktree_path text,
  worktree_branch text,
  delivery_url text,
  delivery_summary text,
  delivery_status text,
  delivery_review_decision text,
  delivery_checks_status text,
  delivery_merge_state text,
  delivery_draft boolean not null default false,
  delivery_checked_at timestamptz,
  delivered_at timestamptz,
  depends_on text[] not null default '{}',
  blocked boolean not null default false,
  acked_at timestamptz,
  due_at timestamptz,
  follow_up_at timestamptz,
  reminder_at timestamptz,
  recheck_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, local_id)
);

create table if not exists public.delivery_receipts (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  task_id uuid references public.tasks(id) on delete cascade,
  delivery_url text,
  delivery_summary text,
  delivery_status text,
  delivery_review_decision text,
  delivery_checks_status text,
  delivery_merge_state text,
  delivery_draft boolean not null default false,
  delivery_checked_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.runners (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  name text,
  runner_type text not null default 'local' check (runner_type in ('local', 'managed')),
  status text not null default 'connected' check (status in ('connected', 'disconnected', 'stale', 'revoked')),
  token_hash text not null,
  capabilities jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz,
  revoked_at timestamptz
);

create table if not exists public.runner_capabilities (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  runner_id uuid not null references public.runners(id) on delete cascade,
  provider_runtimes text[] not null default '{}',
  execution_modes text[] not null default '{}',
  git_available boolean not null default false,
  git_version text,
  gh_available boolean not null default false,
  gh_authenticated boolean not null default false,
  os text,
  arch text,
  hostname text,
  workspace_root text,
  reported_at timestamptz not null default now(),
  unique (runner_id)
);

create table if not exists public.runner_jobs (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  task_id uuid references public.tasks(id) on delete cascade,
  runner_id uuid references public.runners(id) on delete set null,
  agent_slug text,
  execution_mode text,
  provider_kind text,
  status text not null default 'queued' check (status in ('queued', 'leased', 'running', 'succeeded', 'failed', 'canceled', 'expired')),
  agent_memory_packet jsonb not null default '{}'::jsonb,
  repo_url text,
  wiki_path text,
  lease_expires_at timestamptz,
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

create table if not exists public.runner_job_events (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  job_id uuid not null references public.runner_jobs(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete set null,
  runner_id uuid references public.runners(id) on delete set null,
  kind text not null,
  level text,
  message text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.wiki_write_requests (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  article_path text not null,
  status text not null default 'queued',
  requested_by uuid references auth.users(id) on delete set null,
  runner_id uuid references public.runners(id) on delete set null,
  commit_sha text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.wiki_article_index (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  article_path text not null,
  title text,
  last_commit text,
  excerpt text,
  decisions text[] not null default '{}',
  risks text[] not null default '{}',
  open_questions text[] not null default '{}',
  updated_at timestamptz not null default now(),
  unique (team_id, project_id, article_path)
);

create index if not exists idx_memberships_user_team on public.memberships(user_id, team_id);
create index if not exists idx_team_invites_team_status on public.team_invites(team_id, status);
create index if not exists idx_team_invites_token_hash on public.team_invites(token_hash);
create index if not exists idx_projects_team on public.projects(team_id);
create index if not exists idx_tasks_team_project on public.tasks(team_id, project_id);
create index if not exists idx_runner_jobs_claim on public.runner_jobs(team_id, status, lease_expires_at);
create index if not exists idx_runner_job_events_job on public.runner_job_events(job_id, created_at);
create index if not exists idx_wiki_article_index_project on public.wiki_article_index(team_id, project_id);

alter table public.teams enable row level security;
alter table public.memberships enable row level security;
alter table public.team_invites enable row level security;
alter table public.projects enable row level security;
alter table public.tasks enable row level security;
alter table public.delivery_receipts enable row level security;
alter table public.runners enable row level security;
alter table public.runner_capabilities enable row level security;
alter table public.runner_jobs enable row level security;
alter table public.runner_job_events enable row level security;
alter table public.wiki_write_requests enable row level security;
alter table public.wiki_article_index enable row level security;

create or replace function public.is_team_member(target_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.memberships m
    where m.team_id = target_team_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
$$;

create policy "members can read teams"
  on public.teams for select
  using (public.is_team_member(id));

create policy "members can read memberships"
  on public.memberships for select
  using (public.is_team_member(team_id));

create policy "members can read team invites"
  on public.team_invites for select
  using (public.is_team_member(team_id));

create policy "members can read projects"
  on public.projects for select
  using (public.is_team_member(team_id));

create policy "members can read tasks"
  on public.tasks for select
  using (public.is_team_member(team_id));

create policy "members can read delivery receipts"
  on public.delivery_receipts for select
  using (public.is_team_member(team_id));

create policy "members can read runners"
  on public.runners for select
  using (public.is_team_member(team_id));

create policy "members can read runner capabilities"
  on public.runner_capabilities for select
  using (public.is_team_member(team_id));

create policy "members can read runner jobs"
  on public.runner_jobs for select
  using (public.is_team_member(team_id));

create policy "members can read runner job events"
  on public.runner_job_events for select
  using (public.is_team_member(team_id));

create policy "members can read wiki write requests"
  on public.wiki_write_requests for select
  using (public.is_team_member(team_id));

create policy "members can read wiki article index"
  on public.wiki_article_index for select
  using (public.is_team_member(team_id));
