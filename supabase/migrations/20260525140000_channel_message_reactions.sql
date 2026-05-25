alter table public.channel_messages
  add column if not exists reactions jsonb not null default '{}'::jsonb;

create index if not exists idx_channel_messages_team_reactions
  on public.channel_messages using gin (reactions);
