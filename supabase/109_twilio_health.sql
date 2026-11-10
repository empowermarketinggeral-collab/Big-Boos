-- Saldo e estado das contas Twilio de cada marca (WhatsApp e SMS).
-- A função twilio-health (cron de hora a hora, ou o botão "Verificar" no
-- módulo) pergunta à Twilio o saldo e se a conta está ativa, guarda aqui e
-- avisa no sino (área crm) quando o saldo está baixo, a conta foi suspensa
-- ou o Auth Token deixou de servir. O aviso repete-se no máximo uma vez por dia.
-- Pode correr-se mais do que uma vez.

create table if not exists twilio_account_health (
  brand_id uuid not null references brands(id) on delete cascade,
  account_sid text not null,
  channels text[] not null default '{}',
  status text not null default 'unknown' check (status in ('ok', 'low', 'suspended', 'auth_failed', 'unknown')),
  balance numeric,
  currency text,
  low_threshold numeric not null default 10,
  detail text,
  checked_at timestamptz not null default now(),
  alerted_status text,
  alerted_at timestamptz,
  primary key (brand_id, account_sid)
);
alter table twilio_account_health enable row level security;
drop policy if exists twilio_account_health_read on twilio_account_health;
create policy twilio_account_health_read on twilio_account_health for select using (is_brand_member(brand_id));
-- Escrita só pela função (service role).

-- Cron de hora a hora (mesmos segredos do Vault das automações).
select cron.unschedule(jobid) from cron.job where jobname = 'twilio-health-hourly';
select cron.schedule(
  'twilio-health-hourly',
  '17 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'automations_project_url') || '/functions/v1/twilio-health',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'automations_service_role_key')
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);
