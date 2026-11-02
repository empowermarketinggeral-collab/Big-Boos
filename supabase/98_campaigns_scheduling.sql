-- Agendar campanhas de email, SMS e WhatsApp.
-- A equipa escolhe a hora e os destinatários; à hora marcada o cron chama
-- a função campaigns-scheduled-run (de minuto a minuto), que envia em lotes
-- pelas mesmas funções de envio (email-send, sms-campaign-send,
-- whatsapp-campaign-send). Um lote por minuto e por campanha.
-- Pode correr-se mais do que uma vez.

alter table email_campaigns    add column if not exists scheduled_at timestamptz;
alter table email_campaigns    add column if not exists scheduled_payload jsonb;
alter table email_campaigns    add column if not exists scheduled_batch int not null default 0;
alter table email_campaigns    add column if not exists last_error text;

alter table sms_campaigns      add column if not exists scheduled_at timestamptz;
alter table sms_campaigns      add column if not exists scheduled_payload jsonb;
alter table sms_campaigns      add column if not exists scheduled_batch int not null default 0;
alter table sms_campaigns      add column if not exists last_error text;

alter table whatsapp_campaigns add column if not exists scheduled_at timestamptz;
alter table whatsapp_campaigns add column if not exists scheduled_payload jsonb;
alter table whatsapp_campaigns add column if not exists scheduled_batch int not null default 0;
alter table whatsapp_campaigns add column if not exists last_error text;

-- Estado "scheduled" (o email já o tinha).
alter table sms_campaigns drop constraint if exists sms_campaigns_status_check;
alter table sms_campaigns add constraint sms_campaigns_status_check check (status in ('draft', 'scheduled', 'sending', 'sent'));
alter table whatsapp_campaigns drop constraint if exists whatsapp_campaigns_status_check;
alter table whatsapp_campaigns add constraint whatsapp_campaigns_status_check check (status in ('draft', 'scheduled', 'sending', 'sent'));

create index if not exists email_campaigns_scheduled_idx on email_campaigns (scheduled_at) where scheduled_at is not null and status in ('scheduled', 'sending');
create index if not exists sms_campaigns_scheduled_idx on sms_campaigns (scheduled_at) where scheduled_at is not null and status in ('scheduled', 'sending');
create index if not exists whatsapp_campaigns_scheduled_idx on whatsapp_campaigns (scheduled_at) where scheduled_at is not null and status in ('scheduled', 'sending');

-- Cron de minuto a minuto (usa os mesmos segredos do Vault das automações:
-- automations_project_url / automations_service_role_key).
select cron.unschedule(jobid) from cron.job where jobname = 'campaigns-scheduled-every-minute';
select cron.schedule(
  'campaigns-scheduled-every-minute',
  '* * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'automations_project_url') || '/functions/v1/campaigns-scheduled-run',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'automations_service_role_key')
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);
