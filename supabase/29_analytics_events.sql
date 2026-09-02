-- =========================================================
-- EMPOWER OS — EVENTOS E ANALYTICS
-- =========================================================
-- Corre isto depois do 28_billing.sql.
-- RASCUNHO PARA REVISÃO — Fase 1 (modelo de dados).
--
-- Event-sourcing leve: todos os módulos (email, WhatsApp,
-- formulários, negócios, social) escrevem aqui. Um job diário
-- (Edge Function agendada) agrega para event_rollups_daily, para
-- os dashboards nunca terem de somar a tabela events inteira.
-- =========================================================

create table events (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade not null,
  type text not null,                     -- 'email_opened','whatsapp_received','form_submitted','deal_won', etc.
  contact_id uuid references contacts(id) on delete set null,
  payload jsonb default '{}'::jsonb,
  occurred_at timestamptz default now()
);
create index idx_events_brand_type_time on events(brand_id, type, occurred_at desc);

create table event_rollups_daily (
  brand_id uuid references brands(id) on delete cascade not null,
  day date not null,
  type text not null,
  count int default 0,
  primary key (brand_id, day, type)
);

-- ---------------------------------------------------------
-- RLS
-- ---------------------------------------------------------
alter table events enable row level security;
create policy events_all on events for all using (is_brand_member(brand_id)) with check (is_brand_member(brand_id));

alter table event_rollups_daily enable row level security;
create policy event_rollups_daily_select on event_rollups_daily for select using (is_brand_member(brand_id));
