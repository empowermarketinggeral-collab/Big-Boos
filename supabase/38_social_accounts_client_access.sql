-- =========================================================
-- EMPOWER OS — SOCIAL_ACCOUNTS: ACESSO DO CLIENTE
-- =========================================================
-- Corre isto depois do 37_email_sends_error.sql.
--
-- social_accounts é de 01_schema.sql (anterior ao EMPOWER OS) e só
-- dava acesso à equipa (can_manage_brand). Aqui, tal como WhatsApp/
-- Email/CRM, o cliente é quem opera as próprias ferramentas de
-- marketing — alinha com is_brand_member().
-- =========================================================

drop policy if exists social_accounts_all on social_accounts;
create policy social_accounts_all on social_accounts for all using (is_brand_member(brand_id)) with check (is_brand_member(brand_id));
