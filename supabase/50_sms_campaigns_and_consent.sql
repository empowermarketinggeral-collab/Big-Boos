-- =========================================================
-- EMPOWER OS — CAMPANHAS DE SMS + CONSENTIMENTO
-- =========================================================
-- Corre isto depois do 49_whatsapp_campaigns.sql.
--
-- opted_in_sms não existia (ao contrário de opted_in_email/
-- opted_in_whatsapp, que já existem desde o 21_crm_core.sql) — sem
-- restrição de janela de 24h como o WhatsApp, um SMS normal pode ser
-- enviado a qualquer momento, mas ainda assim precisa de consentimento
-- próprio antes de entrar numa campanha em massa.
-- =========================================================

alter table contacts add column if not exists opted_in_sms boolean default false;

create table sms_campaigns (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade not null,
  name text not null,
  body text not null,
  status text default 'draft' check (status in ('draft', 'sending', 'sent')),
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

alter table sms_messages add column if not exists campaign_id uuid references sms_campaigns(id) on delete cascade;
alter table sms_messages add column if not exists error text;

alter table sms_campaigns enable row level security;
create policy sms_campaigns_all on sms_campaigns for all using (is_brand_member(brand_id)) with check (is_brand_member(brand_id));
