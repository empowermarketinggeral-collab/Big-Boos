-- Saldo pré-pago das mensagens (SMS e WhatsApp) por marca.
-- O cliente carrega saldo pelo Stripe (função messaging-topup; o
-- stripe-webhook regista o pagamento aqui). O saldo é o total carregado
-- menos o gasto real da Twilio (com a margem da agência) desde a data de
-- início (messaging_credit_settings.start_date; sem data, o 1.º carregamento).
-- A equipa pode fazer acertos à mão (tipo 'adjust', positivo ou negativo).
-- Pode correr-se mais do que uma vez.

create table if not exists messaging_credits (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  kind text not null check (kind in ('topup', 'adjust')),
  amount_eur numeric not null,
  stripe_session_id text unique,
  note text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists messaging_credits_brand_idx on messaging_credits (brand_id, created_at);
alter table messaging_credits enable row level security;
drop policy if exists messaging_credits_read on messaging_credits;
create policy messaging_credits_read on messaging_credits for select using (is_brand_member(brand_id));
drop policy if exists messaging_credits_adjust on messaging_credits;
create policy messaging_credits_adjust on messaging_credits for insert
  with check (can_manage_brand(brand_id) and kind = 'adjust' and stripe_session_id is null);
-- Carregamentos ('topup') só pela service role (stripe-webhook).

create table if not exists messaging_credit_settings (
  brand_id uuid primary key references brands(id) on delete cascade,
  start_date date,
  low_balance_eur numeric not null default 10 check (low_balance_eur >= 0),
  updated_at timestamptz not null default now()
);
alter table messaging_credit_settings enable row level security;
drop policy if exists messaging_credit_settings_read on messaging_credit_settings;
create policy messaging_credit_settings_read on messaging_credit_settings for select using (is_brand_member(brand_id));
drop policy if exists messaging_credit_settings_write on messaging_credit_settings;
create policy messaging_credit_settings_write on messaging_credit_settings for all
  using (can_manage_brand(brand_id)) with check (can_manage_brand(brand_id));
