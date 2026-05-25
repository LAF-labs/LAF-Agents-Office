-- Durable outbox records make founder-visible side effects observable and
-- replayable by a production delivery worker without relying on in-request
-- best-effort notification writes.
create table if not exists public.startup_office_outbox_events (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  source_table text not null,
  source_id uuid not null,
  event_type text not null,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'delivered', 'failed', 'dead_letter')),
  payload jsonb not null default '{}'::jsonb,
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  processed_at timestamptz,
  last_error text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_startup_office_outbox_events_team_status_available
  on public.startup_office_outbox_events(team_id, status, available_at asc);

create index if not exists idx_startup_office_outbox_events_source
  on public.startup_office_outbox_events(source_table, source_id);

alter table public.startup_office_outbox_events enable row level security;

drop policy if exists "members can read startup office outbox events"
  on public.startup_office_outbox_events;
create policy "members can read startup office outbox events"
  on public.startup_office_outbox_events for select
  using (public.is_team_member(team_id));

create or replace function public.enqueue_startup_office_outbox_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  outbox_created_by uuid;
  outbox_event_type text;
  outbox_payload jsonb;
begin
  if tg_table_name = 'startup_office_notifications' then
    outbox_created_by := null;
    outbox_event_type := 'notification.' || new.event_type;
    outbox_payload := jsonb_build_object(
      'notification_id', new.id,
      'recipient_user_id', new.recipient_user_id,
      'status', new.status,
      'payload', new.payload
    );
  elsif tg_table_name = 'startup_office_receipts' then
    outbox_created_by := new.created_by;
    outbox_event_type := 'receipt.' || new.event_type;
    outbox_payload := jsonb_build_object(
      'receipt_id', new.id,
      'run_id', new.run_id,
      'approval_id', new.approval_id,
      'actor_slug', new.actor_slug,
      'summary', new.summary,
      'trace', new.trace
    );
  elsif tg_table_name = 'startup_office_usage_events' then
    outbox_created_by := new.created_by;
    outbox_event_type := 'usage.' || new.event_type;
    outbox_payload := jsonb_build_object(
      'usage_event_id', new.id,
      'run_id', new.run_id,
      'provider', new.provider,
      'model', new.model,
      'total_tokens', new.total_tokens,
      'cost_cents', new.cost_cents,
      'metadata', new.metadata
    );
  else
    raise exception 'unsupported startup office outbox source: %', tg_table_name;
  end if;

  insert into public.startup_office_outbox_events (
    team_id,
    source_table,
    source_id,
    event_type,
    payload,
    created_by
  ) values (
    new.team_id,
    tg_table_name,
    new.id,
    outbox_event_type,
    outbox_payload,
    outbox_created_by
  );

  return new;
end;
$$;

drop trigger if exists trg_startup_office_notifications_outbox
  on public.startup_office_notifications;
create trigger trg_startup_office_notifications_outbox
  after insert on public.startup_office_notifications
  for each row
  execute function public.enqueue_startup_office_outbox_event();

drop trigger if exists trg_startup_office_receipts_outbox
  on public.startup_office_receipts;
create trigger trg_startup_office_receipts_outbox
  after insert on public.startup_office_receipts
  for each row
  execute function public.enqueue_startup_office_outbox_event();

drop trigger if exists trg_startup_office_usage_events_outbox
  on public.startup_office_usage_events;
create trigger trg_startup_office_usage_events_outbox
  after insert on public.startup_office_usage_events
  for each row
  execute function public.enqueue_startup_office_outbox_event();
