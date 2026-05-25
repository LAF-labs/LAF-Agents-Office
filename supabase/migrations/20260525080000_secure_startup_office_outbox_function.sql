-- The outbox trigger runs during source-table inserts. SECURITY DEFINER keeps
-- member-scoped inserts from failing on the internal outbox table while the
-- table itself remains read-only to normal workspace members.
alter function public.enqueue_startup_office_outbox_event() security definer;
alter function public.enqueue_startup_office_outbox_event() set search_path = public;
