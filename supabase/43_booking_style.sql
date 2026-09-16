-- =========================================================
-- EMPOWER OS — APARÊNCIA DA PÁGINA DE AGENDAMENTO (cor, tipo de letra, logo)
-- =========================================================
-- Corre isto depois do 42_booking_reminders_cron.sql.
-- Mesmo padrão já usado em forms.style.

alter table brands add column if not exists booking_style jsonb default '{}'::jsonb;
