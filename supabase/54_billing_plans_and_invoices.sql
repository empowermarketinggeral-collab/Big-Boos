-- =========================================================
-- EMPOWER OS — PLANOS (agência + marca) + FATURAÇÃO DE SERVIÇOS
-- =========================================================
-- Corre isto depois do 53_twilio_usage_sync_cron.sql.
--
-- Dois níveis de subscrição, com lógicas de preço diferentes:
--   - "agency": quem revende o EMPOWER OS (a própria Empower
--     Marketing, e outras agências no futuro) — cobrado por nº de
--     marcas/utilizadores que consegue gerir. Dá acesso ao Painel
--     Global, Reuniões, Propostas, Portfólio, Centro de Comando, etc.
--   - "brand": cada marca/cliente dentro de uma agência — preço fixo,
--     nunca por utilizador da marca (só a comunicação — WhatsApp —
--     custa dinheiro real via Twilio). Dá acesso ao Dashboard, Plano
--     Estratégico, Brand Book, CRM, Automações, Formulários,
--     Agendamento.
--
-- O nível "gerido" (250€, app + a Empower a trabalhar ativamente no
-- CRM/automações do cliente) NÃO entra aqui como plano — é uma
-- combinação de "Marca" (49€, Stripe) + uma fatura de serviço
-- recorrente em service_invoices (mais abaixo), porque só a Empower
-- Marketing o oferece, não é para revenda a outras agências.
--
-- IMPORTANTE — margem de WhatsApp: as 200 conversas/mês incluídas no
-- plano "Marca" são uma ESTIMATIVA conservadora, não um valor
-- confirmado — o preço por conversa da Meta/Twilio varia por
-- categoria (Marketing/Utility/Service) e por país, e muda com
-- alguma frequência. Confirma o valor real em Twilio → Billing →
-- WhatsApp pricing (ou espera teres alguns clientes reais e compara
-- com o custo verdadeiro na tabela messaging_usage_daily, já
-- construída na Fase E) antes de assumir que a margem é suficiente.
-- Não há ainda cobrança automática de excedente/"saldo" — isso fica
-- para uma fase futura do Billing; por agora, usa essa mesma tabela
-- para identificares à mão marcas que estejam a gastar muito mais do
-- que o incluído.
-- =========================================================

alter table plans add column if not exists stripe_price_id text;
alter table plans add column if not exists scope text check (scope in ('agency', 'brand')) default 'brand';

alter table subscriptions alter column brand_id drop not null;
alter table subscriptions add column if not exists agency_id uuid references agencies(id) on delete cascade;
alter table subscriptions drop constraint if exists subscriptions_scope_check;
alter table subscriptions add constraint subscriptions_scope_check
  check ((brand_id is not null and agency_id is null) or (brand_id is null and agency_id is not null));

drop index if exists idx_subscriptions_brand;
create unique index if not exists idx_subscriptions_brand on subscriptions(brand_id) where brand_id is not null;
create unique index if not exists idx_subscriptions_agency on subscriptions(agency_id) where agency_id is not null;

drop policy if exists subscriptions_select on subscriptions;
create policy subscriptions_select on subscriptions for select using (
  (brand_id is not null and is_brand_member(brand_id)) or (agency_id is not null and can_manage_agency(agency_id))
);

create unique index if not exists idx_plans_global_name on plans(name) where agency_id is null;

insert into plans (name, scope, price_cents, currency, billing_interval, limits, features)
values
  ('Marca', 'brand', 4900, 'EUR', 'month',
   '{"whatsapp_conversations": 200, "automations": 10, "contacts": -1}'::jsonb,
   array['Dashboard', 'Plano Estratégico', 'Brand Book', 'CRM', 'Automações (até 10)', 'Formulários', 'Agendamento', '200 conversas WhatsApp/mês incluídas']),
  ('Agência Starter', 'agency', 9700, 'EUR', 'month',
   '{"brands": 5, "users": 3}'::jsonb,
   array['Até 5 marcas', 'Até 3 utilizadores de equipa', 'Painel Global', 'Reuniões e Propostas', 'Portfólio e Link na Bio', 'Centro de Comando', 'Base de Conhecimento']),
  ('Agência Growth', 'agency', 29700, 'EUR', 'month',
   '{"brands": 20, "users": 10}'::jsonb,
   array['Até 20 marcas', 'Até 10 utilizadores de equipa', 'Painel Global', 'Reuniões e Propostas', 'Portfólio e Link na Bio', 'Centro de Comando', 'Base de Conhecimento'])
on conflict (name) where agency_id is null do nothing;

-- ---------------------------------------------------------
-- Faturação de serviços de agência (sem Stripe — registo manual).
-- É aqui que entra o nível "gerido" (250€) da Empower Marketing:
-- cria-se uma fatura recorrente mensal para esse cliente, à parte da
-- subscrição de 49€ do plano "Marca".
-- ---------------------------------------------------------
create table service_invoices (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade not null,
  title text not null,
  status text default 'draft' check (status in ('draft', 'sent', 'paid', 'overdue', 'cancelled')),
  currency text default 'EUR',
  issue_date date default current_date,
  due_date date,
  paid_at timestamptz,
  notes text,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

create table service_invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid references service_invoices(id) on delete cascade not null,
  description text not null,
  quantity numeric default 1,
  unit_price_cents int not null,
  position int default 0
);
create index idx_service_invoice_items_invoice on service_invoice_items(invoice_id);

alter table service_invoices enable row level security;
create policy service_invoices_all on service_invoices for all using (is_brand_member(brand_id)) with check (is_brand_member(brand_id));

alter table service_invoice_items enable row level security;
create policy service_invoice_items_all on service_invoice_items for all using (
  exists (select 1 from service_invoices si where si.id = invoice_id and is_brand_member(si.brand_id))
) with check (
  exists (select 1 from service_invoices si where si.id = invoice_id and is_brand_member(si.brand_id))
);
