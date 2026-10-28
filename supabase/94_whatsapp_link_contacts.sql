-- =========================================================
-- 94 — WhatsApp: ligar as conversas às fichas do CRM
-- =========================================================
-- Corre depois da 93. Pode correr-se mais do que uma vez.
--
-- As mensagens recebidas criavam a conversa sem a ligar a um contacto,
-- por isso não apareciam no Inbox Unificado nem arrancavam automações.
-- As funções twilio-whatsapp-webhook e whatsapp-webhook já ligam as
-- novas; isto liga as que já existem:
--   1. pelo telemóvel (compara os últimos 9 dígitos) a um contacto da marca;
--   2. se não houver contacto, cria-o (origem "whatsapp") e liga.
-- =========================================================

-- 1. Liga a contactos existentes (se houver mais do que um com o mesmo número, fica o mais antigo).
update whatsapp_conversations wc
   set contact_id = m.contact_id
  from (
    select distinct on (wc2.id) wc2.id as conversation_id, c.id as contact_id
      from whatsapp_conversations wc2
      join contacts c on c.brand_id = wc2.brand_id
       and length(regexp_replace(coalesce(c.phone, ''), '\D', '', 'g')) >= 8
       and right(regexp_replace(c.phone, '\D', '', 'g'), 9) = right(regexp_replace(wc2.wa_contact_phone, '\D', '', 'g'), 9)
     where wc2.contact_id is null
     order by wc2.id, c.created_at
  ) m
 where wc.id = m.conversation_id;

-- 2. Cria os contactos que faltam (um por número e marca).
insert into contacts (brand_id, name, phone, source, opted_in_whatsapp)
select distinct on (wc.brand_id, right(regexp_replace(wc.wa_contact_phone, '\D', '', 'g'), 9))
       wc.brand_id,
       '+' || regexp_replace(wc.wa_contact_phone, '\D', '', 'g'),
       '+' || regexp_replace(wc.wa_contact_phone, '\D', '', 'g'),
       'whatsapp', true
  from whatsapp_conversations wc
 where wc.contact_id is null
   and length(regexp_replace(wc.wa_contact_phone, '\D', '', 'g')) >= 8;

-- 3. Liga as conversas aos contactos acabados de criar.
update whatsapp_conversations wc
   set contact_id = c.id
  from contacts c
 where wc.contact_id is null
   and c.brand_id = wc.brand_id
   and c.source = 'whatsapp'
   and right(regexp_replace(c.phone, '\D', '', 'g'), 9) = right(regexp_replace(wc.wa_contact_phone, '\D', '', 'g'), 9);

-- Confirmação: conversas ainda sem contacto (deve dar 0).
-- select count(*) from whatsapp_conversations where contact_id is null;
