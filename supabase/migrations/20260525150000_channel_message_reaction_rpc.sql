create or replace function public.toggle_channel_message_reaction(
  p_team_id uuid,
  p_message_id uuid,
  p_channel text,
  p_user_id uuid,
  p_emoji text
)
returns setof public.channel_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  current_reactions jsonb;
  current_users jsonb;
  next_reactions jsonb;
  user_text text := p_user_id::text;
begin
  if p_emoji is null or btrim(p_emoji) = '' or length(p_emoji) > 32 then
    raise exception 'invalid reaction token';
  end if;

  select coalesce(reactions, '{}'::jsonb)
    into current_reactions
    from public.channel_messages
   where team_id = p_team_id
     and id = p_message_id
     and channel = coalesce(nullif(btrim(p_channel), ''), 'general')
     and deleted_at is null
   for update;

  if not found then
    return;
  end if;

  current_users := coalesce(current_reactions -> p_emoji, '[]'::jsonb);
  if jsonb_typeof(current_users) <> 'array' then
    current_users := '[]'::jsonb;
  end if;

  if current_users ? user_text then
    select coalesce(jsonb_agg(value order by value), '[]'::jsonb)
      into current_users
      from jsonb_array_elements_text(current_users) as items(value)
     where value <> user_text;
  else
    current_users := current_users || to_jsonb(user_text);
  end if;

  if jsonb_array_length(current_users) = 0 then
    next_reactions := current_reactions - p_emoji;
  else
    next_reactions := jsonb_set(current_reactions, array[p_emoji], current_users, true);
  end if;

  return query
  update public.channel_messages
     set reactions = next_reactions,
         updated_at = now()
   where team_id = p_team_id
     and id = p_message_id
   returning *;
end;
$$;

revoke all on function public.toggle_channel_message_reaction(uuid, uuid, text, uuid, text) from public;
grant execute on function public.toggle_channel_message_reaction(uuid, uuid, text, uuid, text) to service_role;
