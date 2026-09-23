-- =========================================================
-- EMPOWER OS — waba_id passa a opcional em whatsapp_accounts
-- =========================================================
-- Corre isto depois do 45_drop_funnels_and_enabled_modules.sql.
--
-- waba_id era "not null" de quando só existia o fornecedor Meta
-- (22_whatsapp.sql). Desde o 44_twilio_sms_and_whatsapp_alt.sql que
-- há também o fornecedor 'twilio', que não tem WABA ID — a função
-- whatsapp-connect já envia null nesse caso, mas a coluna continuava
-- a recusar. Isto corrige o erro "null value in column waba_id...
-- violates not-null constraint" ao ligar WhatsApp via Twilio.
-- =========================================================

alter table whatsapp_accounts alter column waba_id drop not null;
