-- =========================================================
-- EMPOWER OS — AGENDADOR DO GASTO TWILIO (pg_cron + pg_net)
-- =========================================================
-- Corre isto depois do 52_twilio_usage_tracking.sql.
--
-- Diário (não precisa de correr a cada minuto como as automações —
-- a API de Usage da Twilio só tem dados fechados do dia anterior).
-- Reutiliza os MESMOS segredos já guardados no Vault
-- ('automations_project_url' e 'automations_service_role_key').
-- =========================================================

select cron.schedule(
  'twilio-usage-sync-daily',
  '0 6 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'automations_project_url') || '/functions/v1/twilio-usage-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'automations_service_role_key')
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);
