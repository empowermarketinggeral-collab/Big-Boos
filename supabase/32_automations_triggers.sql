-- =========================================================
-- EMPOWER OS — GATILHOS DE AUTOMAÇÃO (event-driven, não hardcoded)
-- =========================================================
-- Corre isto depois do 31_whatsapp_vault_helpers.sql.
--
-- Em vez de cada sítio do código (criar contacto, importar CSV,
-- receber WhatsApp, etc.) ter de "lembrar-se" de disparar
-- automações, isto acontece sozinho na base de dados sempre que a
-- linha certa é inserida — não importa por onde entrou.
-- =========================================================

create or replace function start_automations_for(p_brand_id uuid, p_trigger_type text, p_contact_id uuid) returns void
language plpgsql security definer as $$
declare
  auto record;
begin
  for auto in
    select id from automations
    where brand_id = p_brand_id and trigger_type = p_trigger_type and status = 'active'
  loop
    insert into automation_runs (brand_id, automation_id, contact_id, current_step_id, status, next_run_at)
    values (p_brand_id, auto.id, p_contact_id, null, 'waiting', now());
  end loop;
end;
$$;

-- NOVO CONTACTO
create or replace function trg_contact_created() returns trigger
language plpgsql security definer as $$
begin
  perform start_automations_for(new.brand_id, 'contact_created', new.id);
  return new;
end;
$$;

drop trigger if exists contacts_after_insert on contacts;
create trigger contacts_after_insert
  after insert on contacts
  for each row execute function trg_contact_created();

-- TAG ADICIONADA A UM CONTACTO
create or replace function trg_contact_tagged() returns trigger
language plpgsql security definer as $$
begin
  perform start_automations_for(new.brand_id, 'contact_tagged', new.contact_id);
  return new;
end;
$$;

drop trigger if exists contact_tags_after_insert on contact_tags;
create trigger contact_tags_after_insert
  after insert on contact_tags
  for each row execute function trg_contact_tagged();

-- MENSAGEM DE WHATSAPP RECEBIDA
create or replace function trg_whatsapp_message_received() returns trigger
language plpgsql security definer as $$
declare
  v_contact_id uuid;
begin
  if new.direction = 'inbound' then
    select contact_id into v_contact_id from whatsapp_conversations where id = new.conversation_id;
    perform start_automations_for(new.brand_id, 'whatsapp_message_received', v_contact_id);
  end if;
  return new;
end;
$$;

drop trigger if exists whatsapp_messages_after_insert on whatsapp_messages;
create trigger whatsapp_messages_after_insert
  after insert on whatsapp_messages
  for each row execute function trg_whatsapp_message_received();
