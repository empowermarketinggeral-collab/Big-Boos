-- =========================================================
-- EMPOWER OS — FORMULÁRIOS: SUBMISSÃO CRIA CONTACTO + AUTOMAÇÃO,
-- E CORRIGE O FILTRO DE "TAG ADICIONADA" NAS AUTOMAÇÕES
-- =========================================================
-- Corre isto depois do 33_automations_cron.sql.
--
-- BUG CORRIGIDO: o gatilho "contact_tagged" (32_automations_triggers.sql)
-- disparava a automação para QUALQUER tag adicionada, ignorando a tag
-- escolhida em trigger_config no editor. Este ficheiro substitui as
-- funções de gatilho por versões que respeitam o trigger_config —
-- e o mesmo padrão de filtro serve agora para "form_submitted".
-- =========================================================

drop function if exists start_automations_for(uuid, text, uuid);

create or replace function start_automation_run(p_automation_id uuid, p_brand_id uuid, p_contact_id uuid) returns void
language plpgsql security definer as $$
begin
  insert into automation_runs (brand_id, automation_id, contact_id, current_step_id, status, next_run_at)
  values (p_brand_id, p_automation_id, p_contact_id, null, 'waiting', now());
end;
$$;

-- NOVO CONTACTO — sem filtro extra
create or replace function trg_contact_created() returns trigger
language plpgsql security definer as $$
declare auto record;
begin
  for auto in
    select id from automations
    where brand_id = new.brand_id and trigger_type = 'contact_created' and status = 'active'
  loop
    perform start_automation_run(auto.id, new.brand_id, new.id);
  end loop;
  return new;
end;
$$;

-- TAG ADICIONADA — só dispara automações sem tag escolhida (qualquer
-- tag) ou cuja trigger_config->>'tagId' seja exatamente esta tag.
create or replace function trg_contact_tagged() returns trigger
language plpgsql security definer as $$
declare auto record;
begin
  for auto in
    select id from automations
    where brand_id = new.brand_id and trigger_type = 'contact_tagged' and status = 'active'
      and (trigger_config->>'tagId' is null or (trigger_config->>'tagId')::uuid = new.tag_id)
  loop
    perform start_automation_run(auto.id, new.brand_id, new.contact_id);
  end loop;
  return new;
end;
$$;

-- MENSAGEM DE WHATSAPP RECEBIDA — sem filtro extra
create or replace function trg_whatsapp_message_received() returns trigger
language plpgsql security definer as $$
declare
  v_contact_id uuid;
  auto record;
begin
  if new.direction = 'inbound' then
    select contact_id into v_contact_id from whatsapp_conversations where id = new.conversation_id;
    for auto in
      select id from automations
      where brand_id = new.brand_id and trigger_type = 'whatsapp_message_received' and status = 'active'
    loop
      perform start_automation_run(auto.id, new.brand_id, v_contact_id);
    end loop;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------
-- FORMULÁRIO SUBMETIDO — cria/reconhece o contacto (por telefone,
-- depois por email), aplica as tags do formulário, e dispara as
-- automações "form_submitted" — só as sem formulário escolhido
-- (qualquer formulário) ou cuja trigger_config->>'formId' seja
-- exatamente este formulário.
-- ---------------------------------------------------------
create or replace function trg_form_submission_created() returns trigger
language plpgsql security definer as $$
declare
  v_form record;
  v_field jsonb;
  v_name text;
  v_email text;
  v_phone text;
  v_contact_id uuid;
  v_tag_id uuid;
  auto record;
begin
  select * into v_form from forms where id = new.form_id;
  if v_form is null then
    return new;
  end if;

  for v_field in select * from jsonb_array_elements(coalesce(v_form.fields, '[]'::jsonb))
  loop
    if v_field->>'mapsTo' = 'name' then v_name := new.answers->>(v_field->>'id'); end if;
    if v_field->>'mapsTo' = 'email' then v_email := new.answers->>(v_field->>'id'); end if;
    if v_field->>'mapsTo' = 'phone' then v_phone := new.answers->>(v_field->>'id'); end if;
  end loop;

  if v_phone is not null and v_phone <> '' then
    select id into v_contact_id from contacts where brand_id = new.brand_id and phone = v_phone;
  end if;
  if v_contact_id is null and v_email is not null and v_email <> '' then
    select id into v_contact_id from contacts where brand_id = new.brand_id and lower(email) = lower(v_email);
  end if;

  if v_contact_id is null then
    insert into contacts (brand_id, name, email, phone, source)
    values (new.brand_id, coalesce(nullif(v_name, ''), 'Sem nome'), nullif(v_email, ''), nullif(v_phone, ''), 'formulario')
    returning id into v_contact_id;
  end if;

  update form_submissions set contact_id = v_contact_id where id = new.id;

  if v_form.on_submit_tags is not null then
    foreach v_tag_id in array v_form.on_submit_tags loop
      insert into contact_tags (brand_id, contact_id, tag_id) values (new.brand_id, v_contact_id, v_tag_id)
      on conflict do nothing;
    end loop;
  end if;

  for auto in
    select id from automations
    where brand_id = new.brand_id and trigger_type = 'form_submitted' and status = 'active'
      and (trigger_config->>'formId' is null or (trigger_config->>'formId')::uuid = new.form_id)
  loop
    perform start_automation_run(auto.id, new.brand_id, v_contact_id);
  end loop;

  return new;
end;
$$;

drop trigger if exists form_submissions_after_insert on form_submissions;
create trigger form_submissions_after_insert
  after insert on form_submissions
  for each row execute function trg_form_submission_created();
