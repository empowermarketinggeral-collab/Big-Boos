-- =========================================================
-- EMPOWER OS — GUARDAR A RAZÃO DE UM ENVIO DE EMAIL FALHADO
-- =========================================================
-- Corre isto depois do 36_forms_style.sql.

alter table email_sends add column if not exists error text;
