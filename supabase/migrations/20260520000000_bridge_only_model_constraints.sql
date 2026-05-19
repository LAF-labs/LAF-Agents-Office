-- Collapse legacy workspace-Bridge values into the single LAF Bridge
-- execution surface, then tighten hosted constraints so new writes cannot
-- recreate the old split.
do $$
begin
  if to_regclass('public.bridge_devices') is not null then
    update public.bridge_devices
      set device_kind = 'desktop'
      where device_kind = 'team_bridge';

    alter table public.bridge_devices
      drop constraint if exists bridge_devices_device_kind_check;
    alter table public.bridge_devices
      add constraint bridge_devices_device_kind_check
      check (device_kind in ('desktop'));
  end if;

  if to_regclass('public.execution_plans') is not null then
    update public.execution_plans
      set mode = 'my_bridge'
      where mode = 'team_bridge';

    alter table public.execution_plans
      drop constraint if exists execution_plans_mode_check;
    alter table public.execution_plans
      add constraint execution_plans_mode_check
      check (mode in ('laf_model', 'my_bridge', 'record_only'));
  end if;

  if to_regclass('public.tasks') is not null then
    update public.tasks
      set model_mode = 'my_bridge'
      where model_mode in ('local_cli', 'team_bridge');

    alter table public.tasks
      drop constraint if exists tasks_model_mode_check;
    alter table public.tasks
      add constraint tasks_model_mode_check
      check (model_mode in ('laf_model', 'my_bridge', 'record_only'));
  end if;

  if to_regclass('public.channel_messages') is not null then
    update public.channel_messages
      set model_mode = 'my_bridge'
      where model_mode in ('local_cli', 'team_bridge');

    alter table public.channel_messages
      drop constraint if exists channel_messages_model_mode_check;
    alter table public.channel_messages
      add constraint channel_messages_model_mode_check
      check (model_mode in ('laf_model', 'my_bridge', 'record_only'));
  end if;
end $$;
