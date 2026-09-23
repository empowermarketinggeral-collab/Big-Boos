-- =========================================================
-- EMPOWER OS — GASTO TWILIO POR MARCA
-- =========================================================
-- Corre isto depois do 51_social_platforms_expand.sql.
--
-- Cada marca liga a sua própria conta Twilio (SID + token no Vault)
-- para SMS e/ou WhatsApp — por isso dá para ir buscar o custo real
-- à API de Usage da própria Twilio (gratuita, já incluída na conta)
-- e guardar por marca/dia/canal. A função twilio-usage-sync (cron
-- diário) é que preenche esta tabela.
-- =========================================================

create table messaging_usage_daily (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade not null,
  date date not null,
  channel text check (channel in ('sms', 'whatsapp')) not null,
  twilio_account_sid text not null,
  num_messages int default 0,
  cost numeric default 0,
  currency text default 'USD',
  created_at timestamptz default now(),
  unique (brand_id, date, channel, twilio_account_sid)
);
create index idx_messaging_usage_brand_date on messaging_usage_daily(brand_id, date desc);

alter table messaging_usage_daily enable row level security;
create policy messaging_usage_daily_all on messaging_usage_daily for all using (is_brand_member(brand_id)) with check (is_brand_member(brand_id));
