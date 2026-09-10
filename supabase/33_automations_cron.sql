-- =========================================================
-- EMPOWER OS — AGENDADOR DAS AUTOMAÇÕES (pg_cron + pg_net)
-- =========================================================
-- Corre isto depois do 32_automations_triggers.sql.
--
-- IMPORTANTE — antes de correr este ficheiro, corre isto à parte no
-- SQL Editor, com os TEUS valores reais (nunca commitar isto num
-- ficheiro — por isso não está aqui, é só para colares e correres):
--
--   select vault_upsert_secret('automations_project_url', 'https://phfhhricqtttinploffo.supabase.co');
--   select vault_upsert_secret('automations_service_role_key', 'COLA_AQUI_A_TUA_SERVICE_ROLE_KEY');
--
-- (a service_role key está em Project Settings → API → service_role)
--
-- Se "create extension pg_cron" ou "pg_net" derem erro, ativa-as
-- primeiro em Database → Extensions no painel do Supabase, depois
-- corre este ficheiro outra vez.
-- =========================================================

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'automations-run-every-minute',
  '* * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'automations_project_url') || '/functions/v1/automations-run',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'automations_service_role_key')
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);
