-- =========================================================
-- EMPOWER OS — AGENDADOR DOS LEMBRETES DE MARCAÇÃO (pg_cron + pg_net)
-- =========================================================
-- Corre isto depois do 41_booking_v2.sql.
--
-- A cada 15 minutos chega para lembretes de 24h/1h (têm janelas de
-- tolerância). Reutiliza os mesmos segredos já guardados no Vault
-- para os outros agendadores (automations-run, social-publish).

select cron.schedule(
  'booking-reminders-every-15-minutes',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'automations_project_url') || '/functions/v1/booking-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'automations_service_role_key')
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);
