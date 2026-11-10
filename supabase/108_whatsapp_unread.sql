-- Conversas por ler na Inbox do WhatsApp.
-- last_inbound_at = última mensagem recebida da cliente (posto pelo trigger);
-- read_at = quando a equipa abriu a conversa pela última vez (whatsapp_mark_read).
-- Por ler = last_inbound_at depois de read_at. É partilhado pela equipa da
-- marca: quando alguém abre a conversa, fica lida para todos.
-- As conversas que já existem ficam como lidas.
-- Pode correr-se mais do que uma vez.

alter table whatsapp_conversations add column if not exists last_inbound_at timestamptz;
alter table whatsapp_conversations add column if not exists read_at timestamptz;

update whatsapp_conversations c
set last_inbound_at = m.last_in
from (select conversation_id, max(created_at) as last_in from whatsapp_messages where direction = 'inbound' group by conversation_id) m
where m.conversation_id = c.id and c.last_inbound_at is null;

update whatsapp_conversations set read_at = coalesce(last_inbound_at, now()) where read_at is null;

create or replace function whatsapp_conversation_inbound_at() returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  update whatsapp_conversations
  set last_inbound_at = greatest(coalesce(last_inbound_at, new.created_at), new.created_at)
  where id = new.conversation_id;
  return new;
end;
$fn$;

drop trigger if exists whatsapp_messages_inbound_at on whatsapp_messages;
create trigger whatsapp_messages_inbound_at
  after insert on whatsapp_messages
  for each row when (new.direction = 'inbound')
  execute function whatsapp_conversation_inbound_at();

create or replace function whatsapp_mark_read(p_conversation uuid) returns void
language plpgsql security definer set search_path = public as $fn$
begin
  update whatsapp_conversations
  set read_at = now()
  where id = p_conversation and is_brand_member(brand_id);
end;
$fn$;
revoke all on function whatsapp_mark_read(uuid) from public, anon;
grant execute on function whatsapp_mark_read(uuid) to authenticated;
