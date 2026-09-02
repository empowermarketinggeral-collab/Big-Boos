-- =========================================================
-- EMPOWER OS — PLANOS, SUBSCRIÇÕES E LIMITES DE UTILIZAÇÃO
-- =========================================================
-- Corre isto depois do 27_social_media.sql.
-- RASCUNHO PARA REVISÃO — Fase 1 (modelo de dados).
--
-- Segue o mesmo padrão global/agency_custom já usado em
-- pricing_categories (01_schema.sql/02_rls_policies.sql): planos
-- sem agency_id são catálogo global da Empower; planos com
-- agency_id são personalizados por uma agência revendedora.
--
-- subscriptions/usage_counters propositadamente NÃO têm policy de
-- insert/update/delete para "authenticated" — mudanças de plano
-- devem passar sempre pelo Stripe (checkout/portal do cliente) e
-- ser escritas pela Edge Function do webhook do Stripe, que usa a
-- service role e ignora RLS. Isto evita que qualquer conta possa
-- alterar o seu próprio plano/limites diretamente na tabela.
-- =========================================================

create table plans (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid references agencies(id) on delete cascade,     -- null = plano global da Empower
  name text not null,
  price_cents int not null,
  currency text default 'EUR',
  billing_interval text check (billing_interval in ('month','year')) default 'month',
  limits jsonb default '{}'::jsonb,      -- { users, contacts, whatsapp_conversations, automations, funnels, storage_mb }
  features text[] default '{}',
  status text default 'active' check (status in ('active','archived')),
  created_at timestamptz default now()
);

create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade not null,
  plan_id uuid references plans(id) not null,
  stripe_customer_ref text,
  stripe_subscription_ref text,
  status text default 'trialing' check (status in ('trialing','active','past_due','canceled')),
  current_period_end timestamptz,
  created_at timestamptz default now()
);
create unique index idx_subscriptions_brand on subscriptions(brand_id);

create table usage_counters (
  brand_id uuid references brands(id) on delete cascade not null,
  metric text not null,                  -- 'contacts','whatsapp_conversations','automations_active', etc.
  period_start date not null,
  count int default 0,
  primary key (brand_id, metric, period_start)
);

-- ---------------------------------------------------------
-- RLS
-- ---------------------------------------------------------
alter table plans enable row level security;
create policy plans_select on plans for select using (
  agency_id is null or can_manage_agency(agency_id)
);
create policy plans_write on plans for all using (
  (agency_id is null and my_role() = 'admin_geral') or (agency_id is not null and can_manage_agency(agency_id))
) with check (
  (agency_id is null and my_role() = 'admin_geral') or (agency_id is not null and can_manage_agency(agency_id))
);

alter table subscriptions enable row level security;
create policy subscriptions_select on subscriptions for select using (is_brand_member(brand_id));

alter table usage_counters enable row level security;
create policy usage_counters_select on usage_counters for select using (is_brand_member(brand_id));
