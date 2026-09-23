-- =========================================================
-- EMPOWER OS — PLANO ENTERPRISE (agência, sob consulta) + PRICE IDs
-- =========================================================
-- Corre isto depois do 54_billing_plans_and_invoices.sql.
-- =========================================================

alter table plans add column if not exists contact_sales boolean default false;

update plans set stripe_price_id = 'price_1UIuTR2KIRM9GY4lDuW0xnAf' where name = 'Agência Starter';
update plans set stripe_price_id = 'price_1UIuU32KIRM9GY4lSE6ovhqu' where name = 'Agência Growth';

insert into plans (name, scope, price_cents, currency, billing_interval, limits, features, contact_sales)
values (
  'Enterprise', 'agency', 0, 'EUR', 'month',
  '{"brands": -1, "users": -1}'::jsonb,
  array['Marcas e utilizadores à medida', 'Painel Global', 'Reuniões e Propostas', 'Portfólio e Link na Bio', 'Centro de Comando', 'Base de Conhecimento', 'Apoio dedicado'],
  true
)
on conflict (name) where agency_id is null do nothing;
