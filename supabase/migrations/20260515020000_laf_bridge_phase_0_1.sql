alter table public.skills
  add column if not exists required_permissions text[] not null default '{}';

alter table public.tasks
  drop constraint if exists tasks_model_mode_check;

update public.tasks
set model_mode = 'my_bridge'
where model_mode = 'local_cli';

alter table public.tasks
  add constraint tasks_model_mode_check
  check (model_mode in ('laf_model', 'my_bridge', 'record_only'));
