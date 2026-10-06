-- =========================================================
-- BIG BOSS — PLANO "NEGÓCIO" (49 €/mês) PARA COMPRA DIRETA NO SITE
-- =========================================================
-- Um pequeno negócio que compra o Big Boss pelo site fica com a sua
-- própria conta (uma agência de uma só marca), tal como as agências:
-- /registar?plano=negocio → agency-signup → Stripe.
-- O preço no Stripe é criado sozinho pela agency-signup na primeira
-- compra (stripe_price_id fica preenchido nessa altura).
-- Pode correr-se mais do que uma vez.
-- =========================================================

insert into plans (name, scope, price_cents, currency, billing_interval, limits, features)
values (
  'Negócio', 'agency', 4900, 'EUR', 'month',
  '{"brands": 1, "users": 2}'::jsonb,
  array['1 marca', 'Até 2 utilizadores', 'Conteúdo, CRM, automações e agendamento', 'Contratos, propostas e criativos', 'Link na bio e portfólio']
)
on conflict (name) where agency_id is null do nothing;
