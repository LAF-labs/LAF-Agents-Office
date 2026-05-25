-- Pure-cloud Startup Office removes the retired project/task workspace schema.
drop index if exists public.idx_channel_messages_task;
drop index if exists public.idx_tasks_team_project;
drop index if exists public.idx_projects_team;
drop index if exists public.idx_wiki_article_index_project;

alter table if exists public.channel_messages
  drop column if exists project_id,
  drop column if exists task_id;

alter table if exists public.wiki_write_requests
  drop column if exists project_id;

do $$
begin
  if to_regclass('public.wiki_article_index') is not null then
    delete from public.wiki_article_index w
    using (
      select id,
             row_number() over (
               partition by team_id, article_path
               order by updated_at desc nulls last, id desc
             ) as rank
        from public.wiki_article_index
    ) ranked
    where w.id = ranked.id
      and ranked.rank > 1;
  end if;
end $$;

alter table if exists public.wiki_article_index
  drop constraint if exists wiki_article_index_team_id_project_id_article_path_key,
  drop column if exists project_id;

create unique index if not exists idx_wiki_article_index_team_article_path
  on public.wiki_article_index(team_id, article_path);

drop table if exists public.delivery_receipts cascade;
drop table if exists public.tasks cascade;
drop table if exists public.projects cascade;
