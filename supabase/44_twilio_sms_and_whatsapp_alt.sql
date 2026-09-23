-- =========================================================
-- EMPOWER OS — SMS (Twilio) + WHATSAPP VIA TWILIO COMO ALTERNATIVA
-- =========================================================
-- Corre isto depois do 43_booking_style.sql.
--
-- Motivo: a verificação de negócio da Meta pode ficar bloqueada
-- indefinidamente, sem alternativa dentro da própria Meta Cloud API.
-- whatsapp_accounts ganha "provider" — 'meta' (como já estava) ou
-- 'twilio' — reaproveitando as MESMAS colunas phone_number_id (aqui
-- guarda o número Twilio, formato +351...) e access_token_ref (aqui
-- guarda o Auth Token da Twilio) para não duplicar a tabela toda por
-- causa de um fornecedor novo. twilio_account_sid é o único campo
-- genuinamente novo que a Twilio precisa e a Meta não tem equivalente.
-- =========================================================

alter table whatsapp_accounts add column if not exists provider text default 'meta' check (provider in ('meta', 'twilio'));
alter table whatsapp_accounts add column if not exists twilio_account_sid text;

create table sms_accounts (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade not null,
  account_sid text not null,
  from_number text not null,
  auth_token_ref text,
  status text default 'connected' check (status in ('connected', 'disconnected', 'error')),
  created_at timestamptz default now()
);

create table sms_messages (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade not null,
  contact_id uuid references contacts(id) on delete set null,
  direction text check (direction in ('inbound', 'outbound')) default 'outbound',
  to_number text,
  body text,
  status text default 'sent' check (status in ('sent', 'delivered', 'failed')),
  provider_ref text,
  created_at timestamptz default now()
);
create index idx_sms_messages_brand on sms_messages(brand_id, created_at desc);

-- SMS entra como terceiro canal possível de lembrete de marcação.
alter table booking_reminder_settings drop constraint if exists booking_reminder_settings_channel_check;
alter table booking_reminder_settings add constraint booking_reminder_settings_channel_check check (channel in ('whatsapp', 'email', 'sms'));

-- SMS entra como novo tipo de ação nas automações.
alter table automation_steps drop constraint if exists automation_steps_action_type_check;
alter table automation_steps add constraint automation_steps_action_type_check check (action_type in (
  'send_whatsapp', 'send_sms', 'send_email', 'add_tag', 'remove_tag', 'create_task',
  'assign_user', 'create_deal', 'update_contact', 'move_pipeline_stage', 'http_request', 'start_automation'
));

-- ---------------------------------------------------------
-- RLS
-- ---------------------------------------------------------
alter table sms_accounts enable row level security;
create policy sms_accounts_all on sms_accounts for all using (is_brand_member(brand_id)) with check (is_brand_member(brand_id));

alter table sms_messages enable row level security;
create policy sms_messages_all on sms_messages for all using (is_brand_member(brand_id)) with check (is_brand_member(brand_id));
