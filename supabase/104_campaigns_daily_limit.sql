-- Campanhas agendadas com máximo por dia e horário de envio.
-- scheduled_payload passa a aceitar dailyLimit (contactos por dia),
-- windowStart e windowEnd ("10:00", "19:00", hora de Lisboa). A função
-- campaigns-scheduled-run envia por ordem a partir de scheduled_offset
-- (quantos destinatários já foram tratados) e conta os do dia em
-- sent_today/sent_day; o resto fica para o dia seguinte.
-- Pode correr-se mais do que uma vez.

alter table email_campaigns    add column if not exists scheduled_offset int not null default 0;
alter table email_campaigns    add column if not exists sent_today int not null default 0;
alter table email_campaigns    add column if not exists sent_day date;
alter table sms_campaigns      add column if not exists scheduled_offset int not null default 0;
alter table sms_campaigns      add column if not exists sent_today int not null default 0;
alter table sms_campaigns      add column if not exists sent_day date;
alter table whatsapp_campaigns add column if not exists scheduled_offset int not null default 0;
alter table whatsapp_campaigns add column if not exists sent_today int not null default 0;
alter table whatsapp_campaigns add column if not exists sent_day date;

-- Campanhas a meio do envio antigo (por lotes numerados): passa o lote a posição.
update email_campaigns set scheduled_offset = scheduled_batch * 100
  where status in ('scheduled', 'sending') and scheduled_batch > 0 and scheduled_offset = 0;
update sms_campaigns set scheduled_offset = scheduled_batch * 500
  where status in ('scheduled', 'sending') and scheduled_batch > 0 and scheduled_offset = 0;
update whatsapp_campaigns set scheduled_offset = scheduled_batch * 500
  where status in ('scheduled', 'sending') and scheduled_batch > 0 and scheduled_offset = 0;
