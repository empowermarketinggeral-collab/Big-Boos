-- =========================================================
-- EMPOWER OS — EMAIL
-- =========================================================
-- Corre isto depois do 24_forms.sql.
-- RASCUNHO PARA REVISÃO — Fase 1 (modelo de dados).
--
-- Camada de dados neutra em relação ao fornecedor (Resend
-- recomendado — ver docs/EMPOWER_OS_ARCHITECTURE_STRATEGY.md,
-- secção 15). provider_ref guarda o id do lado do fornecedor;
-- trocar de fornecedor no futuro não implica alterar este schema.
-- =========================================================

create table email_domains (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade not null,
  domain text not null,
  from_name text,
  from_email text,
  verified boolean default false,
  provider_ref text,
  created_at timestamptz default now()
);

create table email_campaigns (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade not null,
  domain_id uuid references email_domains(id),
  name text not null,
  subject text not null,
  body_html text,
  status text default 'draft' check (status in ('draft','scheduled','sending','sent')),
  scheduled_at timestamptz,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

create table email_sends (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade not null,
  campaign_id uuid references email_campaigns(id) on delete cascade,
  automation_step_id uuid references automation_steps(id),
  contact_id uuid references contacts(id) on delete cascade not null,
  provider_ref text,
  status text default 'queued' check (status in ('queued','sent','delivered','opened','clicked','bounced','failed')),
  sent_at timestamptz,
  created_at timestamptz default now()
);
create index idx_email_sends_contact on email_sends(contact_id, created_at desc);
create index idx_email_sends_campaign on email_sends(campaign_id);

-- ---------------------------------------------------------
-- RLS
-- ---------------------------------------------------------
alter table email_domains enable row level security;
create policy email_domains_all on email_domains for all using (is_brand_member(brand_id)) with check (is_brand_member(brand_id));

alter table email_campaigns enable row level security;
create policy email_campaigns_all on email_campaigns for all using (is_brand_member(brand_id)) with check (is_brand_member(brand_id));

alter table email_sends enable row level security;
create policy email_sends_all on email_sends for all using (is_brand_member(brand_id)) with check (is_brand_member(brand_id));
