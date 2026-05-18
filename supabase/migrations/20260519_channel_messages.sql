create table if not exists public.channel_messages (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  channel text not null default 'general',
  sender_slug text not null,
  kind text not null default 'message',
  content text not null default '',
  tagged text[] not null default '{}'::text[],
  audience text[] not null default '{}'::text[],
  reply_to text,
  public_reply_to text,
  home_session_thread_id text,
  thread_id text,
  project_id text,
  task_id text,
  scope text,
  visibility text,
  run_id text,
  model_mode text check (model_mode in ('laf_model', 'my_bridge', 'team_bridge', 'record_only')),
  metadata jsonb not null default '{}'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_channel_messages_team_channel_created
  on public.channel_messages(team_id, channel, created_at);

create index if not exists idx_channel_messages_team_thread
  on public.channel_messages(team_id, thread_id, created_at);

create index if not exists idx_channel_messages_home_session
  on public.channel_messages(team_id, home_session_thread_id, created_at);

create index if not exists idx_channel_messages_task
  on public.channel_messages(team_id, task_id, created_at);

create index if not exists idx_channel_messages_run
  on public.channel_messages(team_id, run_id);

alter table public.channel_messages enable row level security;

drop policy if exists "members can read channel messages"
  on public.channel_messages;

create policy "members can read channel messages"
  on public.channel_messages for select
  using (public.is_team_member(team_id));

drop policy if exists "members can insert channel messages"
  on public.channel_messages;

create policy "members can insert channel messages"
  on public.channel_messages for insert
  with check (public.is_team_member(team_id));

drop policy if exists "members can update own channel messages"
  on public.channel_messages;

create policy "members can update own channel messages"
  on public.channel_messages for update
  using (public.is_team_member(team_id))
  with check (public.is_team_member(team_id));
