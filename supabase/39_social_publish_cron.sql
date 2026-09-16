-- =========================================================
-- EMPOWER OS — AGENDADOR DA PUBLICAÇÃO SOCIAL (pg_cron + pg_net)
-- =========================================================
-- Corre isto depois do 38_social_accounts_client_access.sql.
--
-- Reutiliza os MESMOS segredos já guardados no Vault para o
-- agendador das automações (33_automations_cron.sql) —
-- 'automations_project_url' e 'automations_service_role_key' — não
-- é preciso guardá-los outra vez, são só o URL do projeto e a
-- service_role key, genéricos a qualquer cron job deste projeto.
-- =========================================================

select cron.schedule(
  'social-publish-every-minute',
  '* * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'automations_project_url') || '/functions/v1/social-publish',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'automations_service_role_key')
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);
