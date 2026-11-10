-- Uma só conversa por número em cada marca.
-- As campanhas podiam criar uma segunda conversa para o mesmo número; as
-- mensagens ficavam repartidas e a Inbox mostrava a conversa "errada".
-- Junta as repetidas na mais antiga (mensagens, última mensagem, janela de
-- 24h, contacto) e impede que voltem a aparecer.
-- Pode correr-se mais do que uma vez.

with ranked as (
  select id, brand_id, wa_contact_phone,
    first_value(id) over (partition by brand_id, wa_contact_phone order by created_at, id) as keeper
  from whatsapp_conversations
), dups as (
  select id, keeper from ranked where id <> keeper
), moved as (
  update whatsapp_messages m set conversation_id = d.keeper
  from dups d where m.conversation_id = d.id
  returning m.id
)
select count(*) as mensagens_movidas from moved;

with ranked as (
  select id, brand_id, wa_contact_phone,
    first_value(id) over (partition by brand_id, wa_contact_phone order by created_at, id) as keeper
  from whatsapp_conversations
), agg as (
  select r.keeper,
    max(c.last_message_at) as last_message_at,
    max(c.window_expires_at) as window_expires_at,
    (array_agg(c.contact_id order by c.created_at) filter (where c.contact_id is not null))[1] as contact_id,
    bool_or(c.status = 'open') as any_open
  from ranked r join whatsapp_conversations c on c.id = r.id
  group by r.keeper
  having count(*) > 1
)
update whatsapp_conversations k
set last_message_at = a.last_message_at,
    window_expires_at = a.window_expires_at,
    contact_id = coalesce(k.contact_id, a.contact_id),
    status = case when a.any_open then 'open' else k.status end
from agg a where k.id = a.keeper;

delete from whatsapp_conversations c
using (
  select id, first_value(id) over (partition by brand_id, wa_contact_phone order by created_at, id) as keeper
  from whatsapp_conversations
) r
where c.id = r.id and r.id <> r.keeper;

create unique index if not exists whatsapp_conversations_brand_phone_key
  on whatsapp_conversations (brand_id, wa_contact_phone);
