-- =========================================================
-- EMPOWER OS — ENTRADA DE LEADS (webhook público) + GATILHOS POR DATA
-- (aniversário, datas anuais como Natal/Ano Novo/Dia da Mulher) +
-- GATILHO DE INDICAÇÃO
-- =========================================================
-- Corre isto depois do 62. Pode correr-se mais do que uma vez.
-- Depois de correr: cola a função lead-intake no Dashboard (Verify JWT
-- DESLIGADO). Os gatilhos por data não precisam de função nova — o
-- pg_cron chama uma função SQL diretamente, todos os dias.
-- =========================================================

-- ---------------------------------------------------------
-- 1. CONTACTOS: data de nascimento + quem indicou
-- ---------------------------------------------------------
alter table contacts add column if not exists birth_date date;
alter table contacts add column if not exists referred_by uuid references contacts(id) on delete set null;
create index if not exists idx_contacts_referred_by on contacts(referred_by) where referred_by is not null;

-- Quem indica tem de ser da mesma marca (a FK sozinha não impede
-- apontar para um contacto de outra marca).
create or replace function trg_contact_referrer_check() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.referred_by is not null then
    if new.referred_by = new.id then
      raise exception 'Um contacto não se pode indicar a si próprio.';
    end if;
    if not exists (select 1 from contacts where id = new.referred_by and brand_id = new.brand_id) then
      raise exception 'Quem indicou tem de ser um contacto da mesma marca.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists contacts_referrer_check on contacts;
create trigger contacts_referrer_check
  before insert or update of referred_by on contacts
  for each row execute function trg_contact_referrer_check();

-- ---------------------------------------------------------
-- 2. NOVOS TIPOS DE GATILHO
-- ---------------------------------------------------------
--   contact_birthday  trigger_config: { daysBefore?: 0-60, tagId?, requireConsent?: true }
--   annual_date       trigger_config: { month: 1-12, day: 1-31, daysBefore?, tagId?, requireConsent?: true }
--   contact_referred  trigger_config: { target?: 'referrer' | 'referred' }  (por omissão 'referrer')
alter table automations drop constraint if exists automations_trigger_type_check;
alter table automations add constraint automations_trigger_type_check check (trigger_type in (
  'contact_created','contact_tagged','deal_stage_changed','form_submitted',
  'whatsapp_message_received','email_opened','email_clicked','date_time','webhook',
  'contact_birthday','annual_date','contact_referred'
));

-- ---------------------------------------------------------
-- 3. INDICAÇÃO — dispara quando um contacto passa a ter "referred_by"
-- ---------------------------------------------------------
-- target = 'referrer' (por omissão): a automação corre para QUEM INDICOU
--   (ex: "obrigada por indicares, aqui está o teu desconto").
-- target = 'referred': corre para o contacto indicado (ex: boas-vindas).
create or replace function trg_contact_referred() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  auto record;
  v_target uuid;
begin
  if new.referred_by is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.referred_by is not distinct from new.referred_by then
    return new;
  end if;

  for auto in
    select id, trigger_config from automations
    where brand_id = new.brand_id and trigger_type = 'contact_referred' and status = 'active'
  loop
    v_target := case when auto.trigger_config->>'target' = 'referred' then new.id else new.referred_by end;
    perform start_automation_run(auto.id, new.brand_id, v_target);
  end loop;
  return new;
end;
$$;

drop trigger if exists contacts_after_referral on contacts;
create trigger contacts_after_referral
  after insert or update of referred_by on contacts
  for each row execute function trg_contact_referred();

-- ---------------------------------------------------------
-- 4. GATILHOS POR DATA — registo anti-duplicação + função diária
-- ---------------------------------------------------------
-- Uma linha por (automação, contacto, ano da data-alvo): garante que o
-- aniversário / o Natal só dispara uma vez por ano, mesmo que a função
-- corra duas vezes no mesmo dia. Sem políticas: só a função a escreve.
create table if not exists automation_date_fires (
  automation_id uuid references automations(id) on delete cascade not null,
  contact_id uuid references contacts(id) on delete cascade not null,
  period text not null,
  fired_at timestamptz default now(),
  primary key (automation_id, contact_id, period)
);
alter table automation_date_fires enable row level security;

-- Devolve quantas execuções arrancou. Datas calculadas no fuso de
-- Lisboa. Só considera contactos com consentimento (WhatsApp, email
-- ou SMS) — a não ser que a automação tenha requireConsent = false.
create or replace function fire_date_automations(p_today date default null) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_today date := coalesce(p_today, (now() at time zone 'Europe/Lisbon')::date);
  auto record;
  r record;
  v_days int;
  v_target date;
  v_year int;
  v_leap boolean;
  v_rows int;
  v_started int := 0;
begin
  for auto in
    select id, brand_id, trigger_type, trigger_config
    from automations
    where status = 'active' and trigger_type in ('contact_birthday', 'annual_date')
  loop
    -- Uma configuração inválida (ex: tagId mal formado) não pode travar
    -- as restantes automações neste ciclo.
    begin
      v_days := greatest(0, least(coalesce((auto.trigger_config->>'daysBefore')::int, 0), 60));
      v_target := v_today + v_days;
      v_year := extract(year from v_target)::int;
      v_leap := (v_year % 4 = 0 and (v_year % 100 <> 0 or v_year % 400 = 0));

      for r in
        select ct.id
        from contacts ct
        where ct.brand_id = auto.brand_id
          and (
            (auto.trigger_type = 'contact_birthday' and ct.birth_date is not null and (
              (extract(month from ct.birth_date) = extract(month from v_target)
                and extract(day from ct.birth_date) = extract(day from v_target))
              -- quem nasceu a 29/02 celebra a 28/02 nos anos não bissextos
              or (not v_leap and extract(month from v_target) = 2 and extract(day from v_target) = 28
                and extract(month from ct.birth_date) = 2 and extract(day from ct.birth_date) = 29)
            ))
            or
            (auto.trigger_type = 'annual_date'
              and extract(month from v_target) = (auto.trigger_config->>'month')::int
              and extract(day from v_target) = (auto.trigger_config->>'day')::int)
          )
          and (
            coalesce((auto.trigger_config->>'requireConsent')::boolean, true) = false
            or ct.opted_in_whatsapp or ct.opted_in_email or ct.opted_in_sms
          )
          and (
            auto.trigger_config->>'tagId' is null
            or exists (
              select 1 from contact_tags t
              where t.contact_id = ct.id and t.tag_id = (auto.trigger_config->>'tagId')::uuid
            )
          )
      loop
        insert into automation_date_fires (automation_id, contact_id, period)
        values (auto.id, r.id, v_year::text)
        on conflict do nothing;
        get diagnostics v_rows = row_count;
        if v_rows > 0 then
          perform start_automation_run(auto.id, auto.brand_id, r.id);
          v_started := v_started + 1;
        end if;
      end loop;
    exception when others then
      raise warning 'fire_date_automations: automação % falhou: %', auto.id, sqlerrm;
    end;
  end loop;

  return v_started;
end;
$$;

revoke execute on function fire_date_automations(date) from public, anon, authenticated;

-- Todos os dias às 08:00 UTC (08:00/09:00 em Lisboa). O motor
-- (automations-run) apanha as execuções no minuto seguinte.
select cron.schedule('automations-date-triggers-daily', '0 8 * * *', $$select public.fire_date_automations();$$);

-- ---------------------------------------------------------
-- 5. ENTRADA DE LEADS — configuração por marca
-- ---------------------------------------------------------
-- O token vive numa tabela à parte (não em "brands") porque os clientes
-- da marca leem "brands"; aqui só a equipa da agência vê e gere.
create table if not exists brand_lead_webhooks (
  brand_id uuid primary key references brands(id) on delete cascade,
  token text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  enabled boolean not null default true,
  default_tag_ids uuid[] not null default '{}',
  default_source text not null default 'landing_page',
  default_country_code text not null default '351',
  created_at timestamptz default now(),
  rotated_at timestamptz
);
alter table brand_lead_webhooks enable row level security;
drop policy if exists brand_lead_webhooks_manage on brand_lead_webhooks;
create policy brand_lead_webhooks_manage on brand_lead_webhooks for all
  using (can_manage_brand(brand_id)) with check (can_manage_brand(brand_id));

-- Gera um token novo (o antigo deixa de funcionar de imediato).
create or replace function rotate_lead_webhook_token(p_brand_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_token text;
begin
  if not can_manage_brand(p_brand_id) then
    raise exception 'Sem permissão.';
  end if;
  update brand_lead_webhooks
  set token = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), rotated_at = now()
  where brand_id = p_brand_id
  returning token into v_token;
  return v_token;
end;
$$;

revoke execute on function rotate_lead_webhook_token(uuid) from public, anon;
grant execute on function rotate_lead_webhook_token(uuid) to authenticated;
