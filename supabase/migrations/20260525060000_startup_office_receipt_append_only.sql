-- Startup Office receipts are the founder-visible trust ledger. They are
-- append-only by default; retention or workspace deletion jobs must opt in
-- explicitly before deleting them.
create or replace function public.prevent_startup_office_receipt_mutation()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'startup office receipts are append-only';
  end if;

  if tg_op = 'DELETE'
     and coalesce(current_setting('app.allow_receipt_delete', true), '') <> 'on' then
    raise exception 'startup office receipt deletion requires app.allow_receipt_delete=on';
  end if;

  return old;
end;
$$;

drop trigger if exists trg_startup_office_receipts_append_only
  on public.startup_office_receipts;

create trigger trg_startup_office_receipts_append_only
  before update or delete on public.startup_office_receipts
  for each row
  execute function public.prevent_startup_office_receipt_mutation();
