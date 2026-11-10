-- Mensagens de WhatsApp aparecem logo na Inbox (Supabase Realtime), sem
-- esperar pela atualização de alguns em alguns segundos. As políticas de RLS
-- de whatsapp_messages continuam a decidir quem recebe cada mensagem.
-- Pode correr-se mais do que uma vez.

do $do$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'whatsapp_messages') then
    alter publication supabase_realtime add table whatsapp_messages;
  end if;
end;
$do$;
