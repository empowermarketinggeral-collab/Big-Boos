-- =========================================================
-- EMPOWER OS — WHATSAPP (Meta WhatsApp Cloud API oficial)
-- =========================================================
-- Corre isto depois do 21_crm_core.sql.
-- RASCUNHO PARA REVISÃO — Fase 1 (modelo de dados).
--
-- access_token_ref NUNCA guarda o token em claro — é uma
-- referência a um segredo no Supabase Vault (ou, entretanto, numa
-- variável de ambiente de Edge Function). O frontend nunca lê esta
-- coluna; só as Edge Functions whatsapp-send/whatsapp-webhook a usam,
-- com a service role, que ignora RLS.
-- =========================================================

create table whatsapp_accounts (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade not null,
  waba_id text not null,
  phone_number_id text not null,
  display_phone text,
  access_token_ref text,
  status text default 'connected' check (status in ('connected','disconnected','error')),
  connected_by uuid references profiles(id),
  created_at timestamptz default now()
);
create unique index idx_whatsapp_accounts_brand on whatsapp_accounts(brand_id);

create table whatsapp_conversations (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade not null,
  contact_id uuid references contacts(id) on delete set null,
  wa_contact_phone text not null,
  assigned_to uuid references profiles(id),
  last_message_at timestamptz,
  window_expires_at timestamptz,        -- fim da janela de 24h de mensagens de sessão livre (regra da Meta)
  status text default 'open' check (status in ('open','closed')),
  created_at timestamptz default now()
);
create index idx_wa_conversations_brand on whatsapp_conversations(brand_id, status);

create table whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade not null,
  conversation_id uuid references whatsapp_conversations(id) on delete cascade not null,
  direction text check (direction in ('inbound','outbound')) not null,
  wa_message_id text,
  type text check (type in ('text','image','video','document','template')) default 'text',
  body text,
  media_url text,
  template_name text,
  status text default 'sent' check (status in ('sent','delivered','read','failed')),
  sent_by uuid references profiles(id),
  created_at timestamptz default now()
);
create index idx_wa_messages_conversation on whatsapp_messages(conversation_id, created_at);

-- Templates aprovados pela Meta — obrigatórios para iniciar conversa
-- fora da janela de 24h.
create table whatsapp_templates (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade not null,
  name text not null,
  meta_status text default 'pending' check (meta_status in ('pending','approved','rejected')),
  body text not null,
  variables jsonb default '[]'::jsonb,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------
-- RLS
-- ---------------------------------------------------------
alter table whatsapp_accounts enable row level security;
create policy whatsapp_accounts_all on whatsapp_accounts for all using (is_brand_member(brand_id)) with check (is_brand_member(brand_id));

alter table whatsapp_conversations enable row level security;
create policy whatsapp_conversations_all on whatsapp_conversations for all using (is_brand_member(brand_id)) with check (is_brand_member(brand_id));

alter table whatsapp_messages enable row level security;
create policy whatsapp_messages_all on whatsapp_messages for all using (is_brand_member(brand_id)) with check (is_brand_member(brand_id));

alter table whatsapp_templates enable row level security;
create policy whatsapp_templates_all on whatsapp_templates for all using (is_brand_member(brand_id)) with check (is_brand_member(brand_id));
