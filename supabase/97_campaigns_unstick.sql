-- Campanhas marcadas como "enviada" ou "a enviar" sem ninguém ter recebido
-- (envios antigos que ignoraram todos por falta de consentimento ou de texto
-- guardado) voltam a rascunho, para se poderem corrigir e enviar de novo.
-- Pode correr-se mais do que uma vez.

update email_campaigns c set status = 'draft'
where c.status in ('sent', 'sending')
  and not exists (select 1 from email_sends s where s.campaign_id = c.id and s.status <> 'failed');

update sms_campaigns c set status = 'draft'
where c.status in ('sent', 'sending')
  and not exists (select 1 from sms_messages m where m.campaign_id = c.id and m.status <> 'failed');

update whatsapp_campaigns c set status = 'draft'
where c.status in ('sent', 'sending')
  and not exists (select 1 from whatsapp_campaign_sends s where s.campaign_id = c.id and s.status <> 'failed');
