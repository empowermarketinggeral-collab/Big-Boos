-- =========================================================
-- EMPOWER OS — CHAVE DA API DE EMAIL (Resend), POR MARCA
-- =========================================================
-- Corre isto depois do 34_forms_and_trigger_filters.sql.
--
-- Mesma lógica do WhatsApp: a API key nunca fica em claro numa
-- coluna normal — api_key_ref é o id do segredo no Supabase Vault
-- (ver vault_upsert_secret/vault_read_secret em 31_whatsapp_vault_helpers.sql).
-- =========================================================

alter table email_domains add column if not exists api_key_ref uuid;
