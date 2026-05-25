-- Notification recipients are delivery targets, not necessarily the actor that
-- caused the side effect. Keep recipient_user_id in payload and avoid
-- mislabeling notification outbox rows as user-created.
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
