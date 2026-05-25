create table if not exists public.startup_office_billing_documents (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  document_type text not null default 'agreement'
    check (document_type in ('agreement', 'invoice', 'receipt', 'plan_change')),
  status text not null default 'draft'
    check (status in ('draft', 'sent', 'signed', 'accepted', 'paid', 'void')),
  provider text not null default 'manual'
    check (provider in ('manual', 'stripe')),
  reference_url text not null default '',
  external_reference text not null default '',
  amount_cents integer not null default 0,
  currency text not null default 'USD',
  plan text not null default '',
  period_start timestamptz,
  period_end timestamptz,
  notes text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_startup_office_billing_documents_team_created
  on public.startup_office_billing_documents(team_id, created_at desc);
create index if not exists idx_startup_office_billing_documents_team_type_status
  on public.startup_office_billing_documents(team_id, document_type, status);

alter table public.startup_office_billing_documents enable row level security;

drop policy if exists "members can read startup office billing documents"
  on public.startup_office_billing_documents;
create policy "members can read startup office billing documents"
  on public.startup_office_billing_documents for select
  using (public.is_team_member(team_id));
