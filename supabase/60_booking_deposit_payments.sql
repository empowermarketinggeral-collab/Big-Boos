-- =========================================================
-- EMPOWER OS — SINAL/DEPÓSITO DE PAGAMENTO NO AGENDAMENTO
-- =========================================================
-- Corre isto depois do 59_security_audit_fixes.sql.
--
-- Cada marca escolhe se quer pedir sinal ao marcar (e que percentagem:
-- 20/50/100%), e se isso se aplica a toda a gente ou só a clientes
-- novos (sem marcação confirmada anterior nesta marca). Quando pedido,
-- a marcação nasce como "pending_payment" (não bloqueia o horário
-- definitivamente, mas também não some da disponibilidade) até o
-- webhook do Stripe confirmar o pagamento.
-- =========================================================

create table booking_payment_settings (
  brand_id uuid primary key references brands(id) on delete cascade,
  enabled boolean default false,
  percentage int default 100 check (percentage in (20, 50, 100)),
  scope text default 'all' check (scope in ('all', 'new_customers')),
  updated_at timestamptz default now()
);

alter table booking_payment_settings enable row level security;
create policy booking_payment_settings_all on booking_payment_settings for all using (is_brand_member(brand_id)) with check (is_brand_member(brand_id));

alter table booking_appointments drop constraint if exists booking_appointments_status_check;
alter table booking_appointments add constraint booking_appointments_status_check
  check (status in ('confirmed', 'cancelled', 'completed', 'pending_payment'));

alter table booking_appointments add column if not exists deposit_required boolean default false;
alter table booking_appointments add column if not exists deposit_amount numeric;
alter table booking_appointments add column if not exists deposit_status text default 'not_required' check (deposit_status in ('not_required', 'pending', 'paid', 'failed'));
alter table booking_appointments add column if not exists stripe_checkout_session_id text;
