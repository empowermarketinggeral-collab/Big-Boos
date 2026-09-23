-- =========================================================
-- EMPOWER OS — CAMPANHAS DE WHATSAPP (envio em massa por template)
-- =========================================================
-- Corre isto depois do 48_whatsapp_templates_expand.sql.
--
-- Mesmo padrão de email_campaigns/email_sends (25_email.sql). Uma
-- campanha de WhatsApp usa sempre um template aprovado — fora da
-- janela de 24h só assim é que a Meta deixa mandar mensagem.
-- =========================================================

create table whatsapp_campaigns (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade not null,
  name text not null,
  template_id uuid references whatsapp_templates(id) not null,
  status text default 'draft' check (status in ('draft', 'sending', 'sent')),
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

create table whatsapp_campaign_sends (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade not null,
  campaign_id uuid references whatsapp_campaigns(id) on delete cascade,
  contact_id uuid references contacts(id) on delete cascade not null,
  wa_message_id text,
  status text default 'queued' check (status in ('queued', 'sent', 'delivered', 'read', 'failed')),
  error text,
  sent_at timestamptz,
  created_at timestamptz default now()
);
create index idx_whatsapp_campaign_sends_campaign on whatsapp_campaign_sends(campaign_id);
create index idx_whatsapp_campaign_sends_contact on whatsapp_campaign_sends(contact_id, created_at desc);

alter table whatsapp_campaigns enable row level security;
create policy whatsapp_campaigns_all on whatsapp_campaigns for all using (is_brand_member(brand_id)) with check (is_brand_member(brand_id));

alter table whatsapp_campaign_sends enable row level security;
create policy whatsapp_campaign_sends_all on whatsapp_campaign_sends for all using (is_brand_member(brand_id)) with check (is_brand_member(brand_id));
