-- =========================================================
-- EMPOWER OS — CONTAGEM DE DIAS EM ATRASO (para o aviso de pagamento)
-- =========================================================
-- Corre isto depois do 56_service_invoices_client_readonly.sql.
--
-- past_due_since marca o momento em que a subscrição entrou em atraso
-- pela primeira vez — é a partir daqui que a contagem de 7+3 dias do
-- aviso no topo da app é calculada. Só o webhook do Stripe escreve
-- aqui (stripe-webhook/index.ts).
-- =========================================================

alter table subscriptions add column if not exists past_due_since timestamptz;
