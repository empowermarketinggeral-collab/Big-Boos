-- Templates de WhatsApp com rodapé e botão com link (criados pelo Big Boss
-- na Twilio). Guarda o formato para voltar a submeter igual se for rejeitado.
-- layout = { footer, buttonText, buttonUrl }. Pode correr-se mais do que uma vez.
alter table whatsapp_templates add column if not exists layout jsonb not null default '{}'::jsonb;
