-- =========================================================
-- EMPOWER OS — APARÊNCIA DOS FORMULÁRIOS (cor, tipo de letra, logo)
-- =========================================================
-- Corre isto depois do 35_email_api_key.sql.

alter table forms add column if not exists style jsonb default '{}'::jsonb;
