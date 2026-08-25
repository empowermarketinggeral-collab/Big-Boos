-- =========================================================
-- BIG BOSS — LINK NA BIO: NOME A MOSTRAR
-- =========================================================
-- Corre isto depois do 18_contents_status_expand.sql.
--
-- Permite escrever um nome personalizado para aparecer a seguir
-- ao avatar na página pública de Link na Bio, em vez de usar sempre
-- o nome oficial da marca/agência.
-- =========================================================

alter table link_pages add column if not exists display_name text;
