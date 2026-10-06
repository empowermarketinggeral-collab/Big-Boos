-- =========================================================
-- CRM — pontuação de leads, Hotmart, cliques nos emails, pipeline
-- =========================================================
-- Corre isto depois do 85_creatives.sql. Pode correr-se mais do que uma vez.
-- Serve qualquer marca; a configuração da Dreams Academy vem no 87.
--
-- 1. Pontuação (contacts.lead_score, 0-100): cada tag pode valer pontos
--    (lead_score_rules). Ao passar um patamar (lead_score_levels) o contacto
--    recebe a tag do patamar, e é essa tag que arranca automações.
--    Uma vez por dia: -10 a quem está há 30 dias sem interagir e tag de
--    "fria" a quem está há N dias sem interagir (brand_crm_settings).
-- 2. Hotmart: catálogo de produtos por marca, hottok no Vault e registo
--    dos eventos recebidos pela função hotmart-webhook.
-- 3. Automações: "singleRun" (um gatilho novo cancela a execução anterior
--    da mesma automação para o mesmo contacto), ação notify_team, gatilho
--    "fase do pipeline mudou" e avisos internos da área crm.
-- 4. Formulários: campo de consentimento (RGPD) e respostas guardadas em
--    campos personalizados do contacto.
--
-- Depois de correr: publicar as funções automations-run (atualizada),
-- hotmart-webhook e email-click (novas, "Verify JWT" DESLIGADO nas duas).
-- =========================================================

-- ---------------------------------------------------------
-- 1. PONTUAÇÃO
-- ---------------------------------------------------------
alter table contacts add column if not exists lead_score int not null default 0;
alter table contacts add column if not exists last_engaged_at timestamptz;
alter table contacts add column if not exists email_open_points int not null default 0;
alter table contacts add column if not exists score_decayed_at timestamptz;
create index if not exists idx_contacts_brand_score on contacts(brand_id, lead_score desc);

create table if not exists lead_score_rules (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade not null,
  tag_id uuid references tags(id) on delete cascade not null unique,
  points int not null default 0 check (points between -100 and 100),
  reset boolean not null default false,          -- true = volta a 0 (ex.: anulou a subscrição)
  created_at timestamptz default now()
);
alter table lead_score_rules enable row level security;
drop policy if exists lead_score_rules_read on lead_score_rules;
create policy lead_score_rules_read on lead_score_rules for select using (is_brand_member(brand_id));
drop policy if exists lead_score_rules_write on lead_score_rules;
create policy lead_score_rules_write on lead_score_rules for all using (can_manage_brand(brand_id)) with check (can_manage_brand(brand_id));

create table if not exists lead_score_levels (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade not null,
  min_score int not null check (min_score between 1 and 100),
  tag_id uuid references tags(id) on delete cascade not null,
  created_at timestamptz default now(),
  unique (brand_id, min_score)
);
alter table lead_score_levels enable row level security;
drop policy if exists lead_score_levels_read on lead_score_levels;
create policy lead_score_levels_read on lead_score_levels for select using (is_brand_member(brand_id));
drop policy if exists lead_score_levels_write on lead_score_levels;
create policy lead_score_levels_write on lead_score_levels for all using (can_manage_brand(brand_id)) with check (can_manage_brand(brand_id));

create table if not exists brand_crm_settings (
  brand_id uuid primary key references brands(id) on delete cascade,
  cold_after_days int check (cold_after_days between 14 and 365),
  cold_tag_id uuid references tags(id) on delete set null,
  updated_at timestamptz default now()
);
alter table brand_crm_settings enable row level security;
drop policy if exists brand_crm_settings_read on brand_crm_settings;
create policy brand_crm_settings_read on brand_crm_settings for select using (is_brand_member(brand_id));
drop policy if exists brand_crm_settings_write on brand_crm_settings;
create policy brand_crm_settings_write on brand_crm_settings for all using (can_manage_brand(brand_id)) with check (can_manage_brand(brand_id));

-- Soma (ou repõe a 0) a pontuação de um contacto, entre 0 e 100.
create or replace function apply_lead_score(p_contact_id uuid, p_delta int, p_reset boolean default false) returns void
language plpgsql security definer set search_path = public as $$
begin
  update contacts
     set lead_score = case when p_reset then 0 else greatest(0, least(100, lead_score + p_delta)) end
   where id = p_contact_id;
end;
$$;
revoke all on function apply_lead_score(uuid, int, boolean) from public, anon, authenticated;

-- Cada tag nova com regra de pontos muda a pontuação.
create or replace function trg_contact_tag_score() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_rule record;
begin
  select points, reset into v_rule from lead_score_rules where tag_id = new.tag_id and brand_id = new.brand_id;
  if found then
    perform apply_lead_score(new.contact_id, v_rule.points, v_rule.reset);
  end if;
  return new;
end;
$$;
drop trigger if exists contact_tags_after_insert_score on contact_tags;
create trigger contact_tags_after_insert_score after insert on contact_tags
  for each row execute function trg_contact_tag_score();

-- Patamares: ao subir acima de um patamar recebe a tag; ao descer, perde-a
-- (assim, se voltar a subir, a automação do patamar arranca outra vez).
create or replace function trg_contact_score_levels() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_level record;
begin
  if new.lead_score is not distinct from old.lead_score then return new; end if;
  for v_level in select min_score, tag_id from lead_score_levels where brand_id = new.brand_id loop
    if old.lead_score < v_level.min_score and new.lead_score >= v_level.min_score then
      insert into contact_tags (brand_id, contact_id, tag_id) values (new.brand_id, new.id, v_level.tag_id)
      on conflict do nothing;
    elsif old.lead_score >= v_level.min_score and new.lead_score < v_level.min_score then
      delete from contact_tags where contact_id = new.id and tag_id = v_level.tag_id;
    end if;
  end loop;
  return new;
end;
$$;
drop trigger if exists contacts_after_score_update on contacts;
create trigger contacts_after_score_update after update of lead_score on contacts
  for each row execute function trg_contact_score_levels();

-- Uma vez por dia: -10 a quem está há 30 dias sem interagir (no máximo
-- uma vez a cada 30 dias) e tag de "fria" (se a marca a configurou).
create or replace function lead_score_daily() returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_count int := 0;
  v_rows int;
  v_set record;
begin
  update contacts
     set lead_score = greatest(0, lead_score - 10), score_decayed_at = now()
   where lead_score > 0
     and coalesce(last_engaged_at, created_at) < now() - interval '30 days'
     and (score_decayed_at is null or score_decayed_at < now() - interval '30 days');
  get diagnostics v_rows = row_count;
  v_count := v_count + v_rows;

  for v_set in select brand_id, cold_after_days, cold_tag_id from brand_crm_settings where cold_tag_id is not null and cold_after_days is not null loop
    insert into contact_tags (brand_id, contact_id, tag_id)
    select ct.brand_id, ct.id, v_set.cold_tag_id
      from contacts ct
     where ct.brand_id = v_set.brand_id
       and ct.email is not null
       and ct.opted_in_email
       and coalesce(ct.last_engaged_at, ct.created_at) < now() - make_interval(days => v_set.cold_after_days)
       -- só quem recebeu emails nesse período (senão não é "fria", é só nova)
       and exists (select 1 from email_sends s where s.contact_id = ct.id and s.status = 'sent'
                   and s.sent_at > coalesce(ct.last_engaged_at, ct.created_at))
    on conflict do nothing;
    get diagnostics v_rows = row_count;
    v_count := v_count + v_rows;
  end loop;
  return v_count;
end;
$$;
revoke all on function lead_score_daily() from public, anon, authenticated;

-- Regista interação (clique, abertura, compra, formulário): tira a tag de
-- fria e guarda a data.
create or replace function mark_contact_engaged(p_contact_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_cold uuid;
begin
  update contacts set last_engaged_at = now() where id = p_contact_id;
  select s.cold_tag_id into v_cold from brand_crm_settings s join contacts ct on ct.brand_id = s.brand_id where ct.id = p_contact_id;
  if v_cold is not null then
    delete from contact_tags where contact_id = p_contact_id and tag_id = v_cold;
  end if;
end;
$$;
revoke all on function mark_contact_engaged(uuid) from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'lead-score-daily';
select cron.schedule('lead-score-daily', '30 6 * * *', $$select public.lead_score_daily();$$);

-- ---------------------------------------------------------
-- 2. HOTMART
-- ---------------------------------------------------------
create table if not exists hotmart_products (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade not null,
  hotmart_product_id text,                       -- "ID do produto" na Hotmart
  slug text not null check (slug ~ '^[a-z0-9-]{1,40}$'),  -- usado nas tags: comprou:<slug>
  name text not null,
  track text check (track in ('tecnica', 'marketing', 'ambos')),
  price numeric,
  checkout_url text check (checkout_url is null or checkout_url ~* '^https?://'),
  next_offer_slug text,                          -- produto oferecido no fim do pós-compra
  active boolean not null default true,
  created_at timestamptz default now(),
  unique (brand_id, slug)
);
create unique index if not exists idx_hotmart_products_brand_hid on hotmart_products(brand_id, hotmart_product_id) where hotmart_product_id is not null;
alter table hotmart_products enable row level security;
drop policy if exists hotmart_products_read on hotmart_products;
create policy hotmart_products_read on hotmart_products for select using (is_brand_member(brand_id));
drop policy if exists hotmart_products_write on hotmart_products;
create policy hotmart_products_write on hotmart_products for all using (can_manage_brand(brand_id)) with check (can_manage_brand(brand_id));

create table if not exists brand_hotmart_settings (
  brand_id uuid primary key references brands(id) on delete cascade,
  hottok_ref uuid,                               -- segredo no Vault
  enabled boolean not null default true,
  connected_at timestamptz default now(),
  last_event_at timestamptz
);
alter table brand_hotmart_settings enable row level security;
drop policy if exists brand_hotmart_settings_read on brand_hotmart_settings;
create policy brand_hotmart_settings_read on brand_hotmart_settings for select using (can_manage_brand(brand_id));
drop policy if exists brand_hotmart_settings_update on brand_hotmart_settings;
create policy brand_hotmart_settings_update on brand_hotmart_settings for update using (can_manage_brand(brand_id)) with check (can_manage_brand(brand_id));
-- O browser só liga/desliga; o hottok muda por hotmart_save_hottok.
revoke insert, update, delete on brand_hotmart_settings from authenticated, anon;
grant update (enabled) on brand_hotmart_settings to authenticated;

create table if not exists hotmart_events (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade not null,
  event_key text not null,                       -- id do evento (ou transação+evento): evita processar duas vezes
  event text not null,
  hotmart_product_id text,
  buyer_email text,
  status text not null default 'ok',             -- ok | ignored | error
  error text,
  payload jsonb,
  created_at timestamptz default now(),
  unique (brand_id, event_key)
);
create index if not exists idx_hotmart_events_brand on hotmart_events(brand_id, created_at desc);
alter table hotmart_events enable row level security;
drop policy if exists hotmart_events_read on hotmart_events;
create policy hotmart_events_read on hotmart_events for select using (can_manage_brand(brand_id));

-- Guarda o hottok (Hotmart → Ferramentas → Webhook) no Vault.
create or replace function hotmart_save_hottok(p_brand_id uuid, p_hottok text) returns void
language plpgsql security definer set search_path = public as $$
declare v_ref uuid;
begin
  if not can_manage_brand(p_brand_id) then raise exception 'Sem permissão.'; end if;
  if p_hottok is null or length(trim(p_hottok)) < 10 or length(p_hottok) > 300 then
    raise exception 'O hottok parece incompleto.';
  end if;
  v_ref := vault_upsert_secret('hotmart_hottok_' || p_brand_id::text, trim(p_hottok));
  insert into brand_hotmart_settings (brand_id, hottok_ref, enabled, connected_at)
  values (p_brand_id, v_ref, true, now())
  on conflict (brand_id) do update set hottok_ref = excluded.hottok_ref, connected_at = now();
end;
$$;
revoke all on function hotmart_save_hottok(uuid, text) from public, anon;
grant execute on function hotmart_save_hottok(uuid, text) to authenticated;

-- ---------------------------------------------------------
-- 3. AUTOMAÇÕES
-- ---------------------------------------------------------
-- trigger_config.singleRun = true: uma nova entrada cancela a execução
-- anterior (ainda a decorrer) da mesma automação para o mesmo contacto.
create or replace function start_automation_run(p_automation_id uuid, p_brand_id uuid, p_contact_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from automations where id = p_automation_id and coalesce((trigger_config->>'singleRun')::boolean, false)) then
    update automation_runs set status = 'cancelled'
     where automation_id = p_automation_id and contact_id = p_contact_id and status in ('running', 'waiting');
  end if;
  insert into automation_runs (brand_id, automation_id, contact_id, current_step_id, status, next_run_at)
  values (p_brand_id, p_automation_id, p_contact_id, null, 'waiting', now());
end;
$$;

alter table automation_steps drop constraint if exists automation_steps_action_type_check;
alter table automation_steps add constraint automation_steps_action_type_check check (action_type in (
  'send_whatsapp', 'send_sms', 'send_email', 'add_tag', 'remove_tag', 'create_task',
  'assign_user', 'create_deal', 'update_contact', 'move_pipeline_stage', 'http_request', 'start_automation',
  'notify_team'
));

-- Gatilho "fase do pipeline mudou": trigger_config.stageId (opcional).
create or replace function trg_deal_stage_changed() returns trigger
language plpgsql security definer set search_path = public as $$
declare auto record;
begin
  if new.contact_id is null then return new; end if;
  if tg_op = 'UPDATE' and new.stage_id is not distinct from old.stage_id then return new; end if;
  for auto in
    select id from automations
    where brand_id = new.brand_id and trigger_type = 'deal_stage_changed' and status = 'active'
      and (trigger_config->>'stageId' is null or (trigger_config->>'stageId')::uuid = new.stage_id)
  loop
    perform start_automation_run(auto.id, new.brand_id, new.contact_id);
  end loop;
  return new;
end;
$$;
drop trigger if exists deals_after_stage_change on deals;
create trigger deals_after_stage_change after insert or update of stage_id on deals
  for each row execute function trg_deal_stage_changed();

-- O motivo de perda de um negócio passa para a ficha (campo motivo_perda),
-- para os fluxos de resgate escolherem a mensagem (preço, timing…).
create or replace function trg_deal_lost_reason() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.contact_id is not null and new.lost_reason is distinct from old.lost_reason then
    update contacts
       set custom_fields = coalesce(custom_fields, '{}'::jsonb) || jsonb_build_object('motivo_perda', coalesce(new.lost_reason, ''))
     where id = new.contact_id and brand_id = new.brand_id;
  end if;
  return new;
end;
$$;
drop trigger if exists deals_after_lost_reason on deals;
create trigger deals_after_lost_reason after update of lost_reason on deals
  for each row execute function trg_deal_lost_reason();

alter table notifications drop constraint if exists notifications_area_check;
alter table notifications add constraint notifications_area_check check (area in (
  'conteudos','roteiros','stories','plano_estrategico','propostas','portfolio','automacoes','agendamento','criativos','crm'
));

-- ---------------------------------------------------------
-- 4. FORMULÁRIOS — consentimento e campos personalizados
-- ---------------------------------------------------------
-- Igual ao 59_security_audit_fixes.sql, mais:
--  - campo type 'consent' marcado → opted_in_email (e WhatsApp/SMS se
--    o campo tiver consentAlsoMessaging);
--  - campo com customField → guarda a resposta (texto da opção) em
--    contacts.custom_fields;
--  - regista a interação (last_engaged_at).
create or replace function trg_form_submission_created() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_form record;
  v_field jsonb;
  v_name text;
  v_email text;
  v_phone text;
  v_contact_id uuid;
  v_tag_id uuid;
  v_answer jsonb;
  v_text text;
  v_key text;
  v_cf jsonb := '{}'::jsonb;
  v_consent_email boolean := false;
  v_consent_msg boolean := false;
  auto record;
begin
  select * into v_form from forms where id = new.form_id;
  if v_form is null then
    return new;
  end if;

  for v_field in select * from jsonb_array_elements(coalesce(v_form.fields, '[]'::jsonb))
  loop
    v_answer := new.answers->(v_field->>'id');
    if v_field->>'mapsTo' = 'name' then v_name := new.answers->>(v_field->>'id'); end if;
    if v_field->>'mapsTo' = 'email' then v_email := new.answers->>(v_field->>'id'); end if;
    if v_field->>'mapsTo' = 'phone' then v_phone := new.answers->>(v_field->>'id'); end if;

    if v_field->>'type' = 'consent' and v_answer is not null and v_answer::text in ('true', '"true"', '"sim"') then
      v_consent_email := true;
      if coalesce((v_field->>'consentAlsoMessaging')::boolean, false) then v_consent_msg := true; end if;
    end if;

    v_key := lower(coalesce(v_field->>'customField', ''));
    if v_key ~ '^[a-z0-9_]{1,40}$' and v_answer is not null and v_answer <> 'null'::jsonb then
      if v_field->>'type' = 'choice' then
        -- guarda o texto da opção (ou das opções), não o id
        select string_agg(coalesce(o->>'label', a.v), ', ')
          into v_text
          from jsonb_array_elements_text(case when jsonb_typeof(v_answer) = 'array' then v_answer else jsonb_build_array(v_answer) end) as a(v)
          left join lateral (
            select o from jsonb_array_elements(coalesce(v_field->'options', '[]'::jsonb)) o where o->>'id' = a.v limit 1
          ) opt on true;
      elsif jsonb_typeof(v_answer) = 'array' then
        select string_agg(x, ', ') into v_text from jsonb_array_elements_text(v_answer) x;
      else
        v_text := v_answer #>> '{}';
      end if;
      if coalesce(trim(v_text), '') <> '' then
        v_cf := v_cf || jsonb_build_object(v_key, left(trim(v_text), 500));
      end if;
    end if;
  end loop;

  if v_phone is not null and v_phone <> '' then
    select id into v_contact_id from contacts where brand_id = new.brand_id and phone = v_phone;
  end if;
  if v_contact_id is null and v_email is not null and v_email <> '' then
    select id into v_contact_id from contacts where brand_id = new.brand_id and lower(email) = lower(v_email);
  end if;

  if v_contact_id is null then
    insert into contacts (brand_id, name, email, phone, source, custom_fields, opted_in_email, opted_in_whatsapp, opted_in_sms)
    values (new.brand_id, coalesce(nullif(v_name, ''), 'Sem nome'), nullif(v_email, ''), nullif(v_phone, ''), 'formulario',
            v_cf, v_consent_email, v_consent_msg, v_consent_msg)
    returning id into v_contact_id;
  else
    update contacts
       set custom_fields = coalesce(custom_fields, '{}'::jsonb) || v_cf,
           opted_in_email = opted_in_email or v_consent_email,
           opted_in_whatsapp = opted_in_whatsapp or v_consent_msg,
           opted_in_sms = opted_in_sms or v_consent_msg
     where id = v_contact_id;
  end if;

  update form_submissions set contact_id = v_contact_id where id = new.id;
  perform mark_contact_engaged(v_contact_id);

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
