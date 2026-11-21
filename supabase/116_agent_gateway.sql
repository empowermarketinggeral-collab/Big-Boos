-- Porta dos agentes para o CRM (leitura e escrita), usada pelo Painel.
--
-- Os agentes do Claude falam só com o Painel; o Painel chama esta função pela
-- API do Supabase (POST /rest/v1/rpc/agent_crm, com a anon key) e manda a sua
-- chave em p_key. Aqui só fica o SHA-256 da chave (agent_gateway_keys), nunca
-- a chave. Sem chave válida a função não devolve nada.
--
--   select agent_crm('<chave>', 'ajuda', '{}');
--
-- Leitura: marcas (clientes da agência, ativas ou não), agencias, resumo,
-- contactos (filtros: clientes/leads, ativos/inativos, tag, etapa, procura…),
-- contacto (ficha completa), tags, pipelines, negocios, marcacoes,
-- formularios, respostas.
-- Escrita (prospeção): guardar_contacto (cria ou completa, como o
-- lead-intake), atualizar_contacto, por_tags, tirar_tags, registar_atividade,
-- concluir_tarefa, criar_negocio, atualizar_negocio. Não apaga nada, não envia
-- mensagens e nunca mexe nos consentimentos. Pôr tags pode arrancar
-- automações (é o comportamento normal das tags).
-- Cada escrita fica em agent_gateway_log.
--
-- Cortar o acesso: update agent_gateway_keys set revoked_at = now();
-- Pode correr-se mais do que uma vez.

create table if not exists agent_gateway_keys (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  key_sha256 text not null unique check (key_sha256 ~ '^[0-9a-f]{64}$'),
  brand_ids uuid[],                         -- null = todas as marcas
  can_write boolean not null default true,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz default now()
);
alter table agent_gateway_keys enable row level security;
-- Sem políticas: só a service role e as funções abaixo leem.

create table if not exists agent_gateway_log (
  id bigint generated always as identity primary key,
  key_id uuid references agent_gateway_keys(id) on delete set null,
  agent text,
  action text not null,
  brand_id uuid references brands(id) on delete set null,
  target_id uuid,
  detail text,
  created_at timestamptz default now()
);
alter table agent_gateway_log enable row level security;
create index if not exists idx_agent_gateway_log_time on agent_gateway_log(created_at desc);

-- Índices para as contas por marca (leituras dos agentes).
create index if not exists idx_activities_brand_time on activities(brand_id, created_at desc);
create index if not exists idx_form_submissions_brand_time on form_submissions(brand_id, submitted_at desc);

-- A chave do Painel (só o SHA-256).
insert into agent_gateway_keys (label, key_sha256)
values ('Painel', 'e1c9252fb4c2f4a5dafc6d5afa8aa35f2f61055a2203a1394e19fa3906b5677a')
on conflict (key_sha256) do nothing;

-- ---------------------------------------------------------------- ajudantes

create or replace function agent_gw_like(p text) returns text
language sql immutable set search_path = public as $fn$
  select replace(replace(replace(coalesce(p, ''), '\', '\\'), '%', '\%'), '_', '\_')
$fn$;

create or replace function agent_gw_int(p text, p_default int, p_min int, p_max int) returns int
language sql immutable set search_path = public as $fn$
  select case
    when btrim(coalesce(p, '')) ~ '^-?[0-9]+(\.[0-9]+)?$' then least(p_max, greatest(p_min, round(btrim(p)::numeric)::int))
    else p_default
  end
$fn$;

create or replace function agent_gw_num(p text) returns numeric
language plpgsql immutable set search_path = public as $fn$
declare v text := replace(btrim(coalesce(p, '')), ',', '.');
begin
  if v = '' then return null; end if;
  if v !~ '^-?[0-9]+(\.[0-9]+)?$' then raise exception 'Valor inválido: % (usa um número, ex.: 120.5)', p; end if;
  return v::numeric;
end
$fn$;

create or replace function agent_gw_bool(p text) returns boolean
language sql immutable set search_path = public as $fn$
  select case
    when lower(btrim(coalesce(p, ''))) in ('true', '1', 'sim', 's', 'yes', 'y') then true
    when lower(btrim(coalesce(p, ''))) in ('false', '0', 'nao', 'não', 'n', 'no') then false
  end
$fn$;

-- Dia (AAAA-MM-DD) em hora de Lisboa → início desse dia.
create or replace function agent_gw_day(p text) returns timestamptz
language plpgsql stable set search_path = public as $fn$
declare v text := btrim(coalesce(p, ''));
begin
  if v = '' then return null; end if;
  if v !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Data inválida: % (usa AAAA-MM-DD)', p; end if;
  return v::date::timestamp at time zone 'Europe/Lisbon';
end
$fn$;

-- Data e hora: AAAA-MM-DD (9:00), AAAA-MM-DDTHH:MM (hora de Lisboa) ou ISO com fuso.
create or replace function agent_gw_ts(p text) returns timestamptz
language plpgsql stable set search_path = public as $fn$
declare v text := btrim(coalesce(p, ''));
begin
  if v = '' then return null; end if;
  if v ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then return (v || ' 09:00')::timestamp at time zone 'Europe/Lisbon'; end if;
  if v ~ '(Z|z|[+-][0-9]{2}(:?[0-9]{2})?)$' and v ~ '[T ][0-9]{2}:' then return v::timestamptz; end if;
  return v::timestamp at time zone 'Europe/Lisbon';
exception when others then
  raise exception 'Data/hora inválida: % (usa AAAA-MM-DD ou AAAA-MM-DDTHH:MM)', p;
end
$fn$;

-- Telefone em E.164, como o lead-intake: 9 dígitos sem indicativo → +351.
create or replace function agent_gw_phone(p text) returns text
language plpgsql immutable set search_path = public as $fn$
declare v text := regexp_replace(coalesce(p, ''), '[^0-9+]', '', 'g');
begin
  if v = '' then return null; end if;
  if left(v, 2) = '00' then v := '+' || substr(v, 3); end if;
  if left(v, 1) <> '+' then
    if length(v) = 9 then v := '+351' || v;
    elsif length(v) >= 10 then v := '+' || v;
    else return null;
    end if;
  end if;
  if substr(v, 2) !~ '^[0-9]{8,15}$' then return null; end if;
  return v;
end
$fn$;

-- Lista de texto: aceita ["a","b"] ou "a, b".
create or replace function agent_gw_list(p jsonb) returns text[]
language sql immutable set search_path = public as $fn$
  select coalesce(array_agg(distinct btrim(x)) filter (where btrim(x) <> ''), '{}'::text[])
  from (
    select jsonb_array_elements_text(case when jsonb_typeof(p) = 'array' then p else '[]'::jsonb end) as x
    union all
    select unnest(string_to_array(case when jsonb_typeof(p) = 'string' then p #>> '{}' end, ','))
  ) s
$fn$;

create or replace function agent_gw_brand(p_allowed uuid[], p_ref text) returns uuid
language plpgsql stable set search_path = public as $fn$
declare
  v_ref text := btrim(coalesce(p_ref, ''));
  v_id uuid;
  v_n int;
begin
  if v_ref = '' then raise exception 'Indica a marca (nome ou id; vê a ação "marcas").'; end if;
  if v_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select id into v_id from brands where id = v_ref::uuid;
  end if;
  if v_id is null then
    select count(*), (array_agg(id))[1] into v_n, v_id from brands where lower(name) = lower(v_ref);
    if v_n > 1 then raise exception 'Há % marcas chamadas "%": usa o id (ação "marcas").', v_n, v_ref; end if;
  end if;
  if v_id is null then
    select count(*), (array_agg(id))[1] into v_n, v_id from brands where name ilike '%' || agent_gw_like(v_ref) || '%';
    if v_n > 1 then raise exception 'Há % marcas com "%" no nome: usa o nome completo ou o id.', v_n, v_ref; end if;
  end if;
  if v_id is null then raise exception 'Marca não encontrada: %', v_ref; end if;
  if p_allowed is not null and not (v_id = any(p_allowed)) then raise exception 'Sem acesso à marca %.', v_ref; end if;
  return v_id;
end
$fn$;

-- Contacto da marca pelo id, email ou telefone.
create or replace function agent_gw_contact(p_brand uuid, p_ref text) returns uuid
language plpgsql stable set search_path = public as $fn$
declare
  v_ref text := btrim(coalesce(p_ref, ''));
  v_id uuid;
  v_phone text;
begin
  if v_ref = '' then raise exception 'Indica o contacto (id, email ou telefone).'; end if;
  if v_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select id into v_id from contacts where id = v_ref::uuid and brand_id = p_brand;
  elsif position('@' in v_ref) > 0 then
    select id into v_id from contacts where brand_id = p_brand and lower(email) = lower(v_ref) limit 1;
  else
    v_phone := agent_gw_phone(v_ref);
    if v_phone is not null then select id into v_id from contacts where brand_id = p_brand and phone = v_phone; end if;
  end if;
  if v_id is null then raise exception 'Contacto não encontrado nesta marca: %', v_ref; end if;
  return v_id;
end
$fn$;

create or replace function agent_gw_tag(p_brand uuid, p_name text) returns uuid
language plpgsql set search_path = public as $fn$
declare
  v_name text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  v_id uuid;
begin
  if v_name = '' then return null; end if;
  if length(v_name) > 80 then raise exception 'Tag demasiado longa: %', v_name; end if;
  select id into v_id from tags where brand_id = p_brand and lower(name) = lower(v_name);
  if v_id is null then
    insert into tags (brand_id, name) values (p_brand, v_name) on conflict do nothing returning id into v_id;
    if v_id is null then select id into v_id from tags where brand_id = p_brand and lower(name) = lower(v_name); end if;
  end if;
  return v_id;
end
$fn$;

create or replace function agent_gw_company(p_brand uuid, p_name text) returns uuid
language plpgsql set search_path = public as $fn$
declare
  v_name text := left(btrim(coalesce(p_name, '')), 200);
  v_id uuid;
begin
  if v_name = '' then return null; end if;
  select id into v_id from companies where brand_id = p_brand and lower(name) = lower(v_name) order by created_at limit 1;
  if v_id is null then insert into companies (brand_id, name) values (p_brand, v_name) returning id into v_id; end if;
  return v_id;
end
$fn$;

-- ---------------------------------------------------------------- a função

create or replace function agent_crm(p_key text, p_action text, p_args jsonb default '{}'::jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare
  v_key agent_gateway_keys;
  v_args jsonb := case when jsonb_typeof(p_args) = 'object' then p_args else '{}'::jsonb end;
  v_act text := lower(btrim(coalesce(p_action, '')));
  v_agent text := left(btrim(coalesce(p_args->>'_agente', '')), 80);
  v_writes constant text[] := array['guardar_contacto', 'atualizar_contacto', 'por_tags', 'tirar_tags', 'registar_atividade', 'concluir_tarefa', 'criar_negocio', 'atualizar_negocio'];
  v_reads constant text[] := array['', 'ajuda', 'marcas', 'agencias', 'resumo', 'contactos', 'contacto', 'tags', 'pipelines', 'negocios', 'marcacoes', 'formularios', 'respostas'];
  v_brand uuid;
  v_cid uuid;
  v_did uuid;
  v_res jsonb;
  v_lim int := agent_gw_int(p_args->>'limite', 50, 1, 500);
  v_off int := agent_gw_int(p_args->>'saltar', 0, 0, 100000);
  v_days int := agent_gw_int(p_args->>'dias', 30, 1, 365);
  v_from timestamptz;
  v_to timestamptz;
  v_q text;
  v_tag text;
  v_notag text;
  v_tipo text;
  v_ativ text;
  v_adays int;
  v_etapa text;
  v_ordem text;
  v_bool boolean;
  v_min int;
  v_estado text;
  v_name text;
  v_email text;
  v_phone text;
  v_fields jsonb;
  v_source text;
  v_birth date;
  v_company uuid;
  v_created boolean := false;
  v_tags text[];
  v_t text;
  v_tid uuid;
  v_n int := 0;
  v_pipe uuid;
  v_stage pipeline_stages;
  v_text text;
  v_type text;
begin
  select * into v_key from agent_gateway_keys
   where key_sha256 = encode(sha256(convert_to(coalesce(p_key, ''), 'UTF8')), 'hex')
     and revoked_at is null;
  if not found or length(coalesce(p_key, '')) < 32 then
    return jsonb_build_object('ok', false, 'erro', 'Chave do agente inválida.');
  end if;
  if v_key.last_used_at is null or v_key.last_used_at < now() - interval '1 minute' then
    update agent_gateway_keys set last_used_at = now() where id = v_key.id;
  end if;
  if not (v_act = any(v_writes) or v_act = any(v_reads)) then
    return jsonb_build_object('ok', false, 'erro', 'Ação desconhecida: ' || v_act || ' (vê a ação "ajuda").');
  end if;
  if v_act = any(v_writes) and not v_key.can_write then
    return jsonb_build_object('ok', false, 'erro', 'Esta chave só pode ler.');
  end if;

  begin
    -- ------------------------------------------------------------ ajuda
    if v_act in ('', 'ajuda') then
      return jsonb_build_object('ok', true, 'acoes', jsonb_build_object(
        'marcas', 'Clientes da agência (marcas) com estado ativa/em_atraso/so_atividade/inativa, subscrição, faturas e atividade dos últimos 30 dias. Filtros: estado, agencia.',
        'agencias', 'Agências (revendedoras do Big Boss) com subscrição, marcas e utilizadores.',
        'resumo', 'Números de uma marca num período (dias): contactos, origens, negócios, marcações, formulários, WhatsApp, Hotmart, tags.',
        'contactos', 'Contactos de uma marca com filtros (procura, tag, sem_tag, tipo clientes/leads, atividade ativos/inativos, dias_atividade, etapa, criados_desde/ate, aceita_email, pontuacao_min) e ordem.',
        'contacto', 'Ficha completa de um contacto (id, email ou telefone).',
        'tags', 'Tags da marca com o número de contactos.',
        'pipelines', 'Pipelines e etapas com negócios e valor.',
        'negocios', 'Negócios (filtros: pipeline, etapa, estado, procura).',
        'marcacoes', 'Marcações entre de e ate (AAAA-MM-DD, hora de Lisboa).',
        'formularios', 'Formulários com o número de respostas.',
        'respostas', 'Respostas a formulários (formulario, dias).',
        'guardar_contacto', 'Cria o contacto ou completa o que já existe (pelo telefone, depois email). Tags, empresa, campos e nota opcionais.',
        'atualizar_contacto', 'Muda nome, email, telefone, empresa, origem, data de nascimento ou campos de um contacto.',
        'por_tags', 'Põe tags num contacto (cria as que não existem; pode arrancar automações).',
        'tirar_tags', 'Tira tags de um contacto.',
        'registar_atividade', 'Nota, chamada, reunião, email, WhatsApp ou tarefa (com prazo) num contacto ou negócio.',
        'concluir_tarefa', 'Marca uma tarefa (atividade) como feita.',
        'criar_negocio', 'Cria um negócio num pipeline (por omissão o principal e a primeira etapa).',
        'atualizar_negocio', 'Muda etapa, valor, título, probabilidade, data prevista ou motivo de perda de um negócio.'
      ));
    end if;

    -- ------------------------------------------------------------ marcas
    if v_act = 'marcas' then
      v_estado := nullif(lower(btrim(coalesce(v_args->>'estado', ''))), '');
      v_q := nullif(btrim(coalesce(v_args->>'agencia', '')), '');
      with s as (
        select distinct on (sub.brand_id) sub.brand_id, sub.status, p.name as plan, p.price_cents, sub.current_period_end, sub.past_due_since
          from subscriptions sub left join plans p on p.id = sub.plan_id
         where sub.brand_id is not null
         order by sub.brand_id, (sub.status in ('active', 'trialing', 'past_due')) desc, sub.created_at desc
      ), inv as (
        select brand_id, max(paid_at) as last_paid, count(*) filter (where status = 'overdue') as overdue
          from service_invoices group by brand_id
      ), tc as (
        select brand_id, count(*) as n, count(*) filter (where created_at > now() - interval '30 days') as n30
          from contacts group by brand_id
      ), bk as (
        select brand_id, count(*) as n from booking_appointments
         where starts_at > now() - interval '30 days' and starts_at <= now() and status in ('confirmed', 'completed') group by brand_id
      ), wm as (
        select brand_id, count(*) as n from whatsapp_messages where created_at > now() - interval '30 days' group by brand_id
      ), ct as (
        select brand_id, bool_or(status = 'signed') as signed from contracts where brand_id is not null group by brand_id
      ), x as (
        select br.id, br.name, ag.id as agency_id, ag.name as agency, coalesce(ag.is_root, false) as is_root, br.category, br.status as light,
               br.created_at, s.status as sub_status, s.plan, s.price_cents, s.current_period_end, s.past_due_since,
               inv.last_paid, coalesce(inv.overdue, 0) as overdue, coalesce(ct.signed, false) as signed,
               coalesce(tc.n, 0) as contacts, coalesce(tc.n30, 0) as contacts30, coalesce(bk.n, 0) as bookings30, coalesce(wm.n, 0) as wa30,
               case
                 when s.status = 'past_due' or coalesce(inv.overdue, 0) > 0 then 'em_atraso'
                 when s.status in ('active', 'trialing') or inv.last_paid > now() - interval '62 days' then 'ativa'
                 when coalesce(tc.n30, 0) + coalesce(bk.n, 0) + coalesce(wm.n, 0) > 0 then 'so_atividade'
                 else 'inativa'
               end as estado
          from brands br
          join agencies ag on ag.id = br.agency_id
          left join s on s.brand_id = br.id
          left join inv on inv.brand_id = br.id
          left join tc on tc.brand_id = br.id
          left join bk on bk.brand_id = br.id
          left join wm on wm.brand_id = br.id
          left join ct on ct.brand_id = br.id
         where (v_key.brand_ids is null or br.id = any(v_key.brand_ids))
           and (v_q is null or ag.id::text = v_q or ag.name ilike '%' || agent_gw_like(v_q) || '%')
      )
      select jsonb_build_object(
        'ok', true,
        'nota', 'estado: ativa = subscrição ativa ou fatura paga nos últimos 62 dias; em_atraso = pagamento em atraso; so_atividade = sem pagamento registado mas com contactos, marcações ou WhatsApp nos últimos 30 dias; inativa = nada disto.',
        'por_estado', (select coalesce(jsonb_object_agg(estado, n), '{}'::jsonb) from (select estado, count(*) as n from x group by estado) e),
        'marcas', coalesce(jsonb_agg(jsonb_build_object(
          'id', x.id, 'nome', x.name, 'agencia', x.agency, 'agencia_id', x.agency_id, 'agencia_raiz', x.is_root,
          'categoria', x.category, 'semaforo', x.light, 'criada', x.created_at::date, 'estado', x.estado,
          'subscricao', case when x.sub_status is null then null else jsonb_build_object(
            'estado', x.sub_status, 'plano', x.plan, 'preco_eur', round(coalesce(x.price_cents, 0) / 100.0, 2),
            'periodo_ate', x.current_period_end::date, 'em_atraso_desde', x.past_due_since::date) end,
          'ultima_fatura_paga', x.last_paid::date, 'faturas_em_atraso', x.overdue, 'contrato_assinado', x.signed,
          'contactos', x.contacts, 'contactos_novos_30d', x.contacts30, 'marcacoes_30d', x.bookings30, 'mensagens_whatsapp_30d', x.wa30
        ) order by x.agency, x.name) filter (where v_estado is null or x.estado = v_estado), '[]'::jsonb)
      ) into v_res from x;
      return v_res;
    end if;

    -- ------------------------------------------------------------ agencias
    if v_act = 'agencias' then
      if v_key.brand_ids is not null then raise exception 'Esta chave só tem acesso a algumas marcas.'; end if;
      with s as (
        select distinct on (sub.agency_id) sub.agency_id, sub.status, p.name as plan, p.price_cents, sub.current_period_end, sub.past_due_since
          from subscriptions sub left join plans p on p.id = sub.plan_id
         where sub.agency_id is not null
         order by sub.agency_id, (sub.status in ('active', 'trialing', 'past_due')) desc, sub.created_at desc
      )
      select jsonb_build_object('ok', true, 'agencias', coalesce(jsonb_agg(jsonb_build_object(
        'id', ag.id, 'nome', ag.name, 'raiz', coalesce(ag.is_root, false), 'estado', ag.status, 'criada', ag.created_at::date,
        'marcas', (select count(*) from brands br where br.agency_id = ag.id),
        'utilizadores', (select count(*) from profiles pr where pr.agency_id = ag.id),
        'subscricao', case when s.status is null then null else jsonb_build_object(
          'estado', s.status, 'plano', s.plan, 'preco_eur', round(coalesce(s.price_cents, 0) / 100.0, 2),
          'periodo_ate', s.current_period_end::date, 'em_atraso_desde', s.past_due_since::date) end
      ) order by coalesce(ag.is_root, false) desc, ag.name), '[]'::jsonb))
      into v_res
      from agencies ag left join s on s.agency_id = ag.id;
      return v_res;
    end if;

    -- A partir daqui tudo é de uma marca.
    v_brand := agent_gw_brand(v_key.brand_ids, v_args->>'marca');

    -- ------------------------------------------------------------ resumo
    if v_act = 'resumo' then
      v_from := now() - make_interval(days => v_days);
      v_to := v_from - make_interval(days => v_days);
      select jsonb_build_object(
        'ok', true,
        'marca', (select name from brands where id = v_brand),
        'periodo', jsonb_build_object('dias', v_days, 'de', v_from, 'ate', now()),
        'contactos', (select jsonb_build_object(
            'total', count(*),
            'novos', count(*) filter (where created_at >= v_from),
            'novos_periodo_anterior', count(*) filter (where created_at >= v_to and created_at < v_from),
            'com_email', count(*) filter (where email is not null),
            'com_telefone', count(*) filter (where phone is not null),
            'aceitam_email', count(*) filter (where opted_in_email),
            'aceitam_whatsapp', count(*) filter (where opted_in_whatsapp),
            'aceitam_sms', count(*) filter (where opted_in_sms))
          from contacts where brand_id = v_brand),
        'novos_por_origem', (select coalesce(jsonb_object_agg(src, n), '{}'::jsonb) from (
            select coalesce(source, 'sem origem') as src, count(*) as n from contacts
             where brand_id = v_brand and created_at >= v_from group by 1) o),
        'negocios', (select jsonb_build_object(
            'abertos', count(*) filter (where status = 'open'),
            'valor_aberto', coalesce(sum(value) filter (where status = 'open'), 0),
            'ganhos', count(*) filter (where status = 'won'),
            'valor_ganho', coalesce(sum(value) filter (where status = 'won'), 0),
            'perdidos', count(*) filter (where status = 'lost'),
            'criados_no_periodo', count(*) filter (where created_at >= v_from))
          from deals where brand_id = v_brand),
        'marcacoes', (select jsonb_build_object(
            'total', count(*),
            'concluidas_ou_confirmadas', count(*) filter (where ba.status in ('completed', 'confirmed')),
            'canceladas', count(*) filter (where ba.status = 'cancelled'),
            'faltou', count(*) filter (where ba.status = 'no_show'),
            'faturacao_estimada', coalesce(sum(coalesce(ba.total_price, sv.price)) filter (where ba.status in ('completed', 'confirmed')), 0))
          from booking_appointments ba left join booking_services sv on sv.id = ba.service_id
         where ba.brand_id = v_brand and ba.starts_at >= v_from and ba.starts_at <= now()),
        'marcacoes_futuras', (select count(*) from booking_appointments
          where brand_id = v_brand and starts_at > now() and status in ('confirmed', 'pending_payment')),
        'respostas_formularios', (select coalesce(jsonb_object_agg(fname, n), '{}'::jsonb) from (
            select f.name as fname, count(*) as n from form_submissions fs join forms f on f.id = fs.form_id
             where fs.brand_id = v_brand and fs.submitted_at >= v_from group by f.name) o),
        'whatsapp', (select jsonb_build_object(
            'recebidas', count(*) filter (where direction = 'inbound'),
            'enviadas', count(*) filter (where direction = 'outbound'))
          from whatsapp_messages where brand_id = v_brand and created_at >= v_from),
        'hotmart', (select coalesce(jsonb_object_agg(event, n), '{}'::jsonb) from (
            select event, count(*) as n from hotmart_events
             where brand_id = v_brand and created_at >= v_from and status = 'ok' group by event) o),
        'tags_mais_usadas', (select coalesce(jsonb_agg(jsonb_build_object('tag', name, 'contactos', n) order by n desc), '[]'::jsonb) from (
            select t.name, count(*) as n from contact_tags ctg join tags t on t.id = ctg.tag_id
             where ctg.brand_id = v_brand group by t.name order by count(*) desc limit 20) o)
      ) into v_res;
      return v_res;
    end if;

    -- ------------------------------------------------------------ contactos
    if v_act = 'contactos' then
      v_q := nullif(btrim(coalesce(v_args->>'procura', '')), '');
      if v_q is not null then v_q := '%' || agent_gw_like(v_q) || '%'; end if;
      v_tag := nullif(lower(btrim(coalesce(v_args->>'tag', ''))), '');
      v_notag := nullif(lower(btrim(coalesce(v_args->>'sem_tag', ''))), '');
      v_tipo := lower(btrim(coalesce(v_args->>'tipo', '')));
      v_ativ := lower(btrim(coalesce(v_args->>'atividade', '')));
      v_adays := agent_gw_int(v_args->>'dias_atividade', 90, 1, 3650);
      v_etapa := nullif(btrim(coalesce(v_args->>'etapa', '')), '');
      v_ordem := lower(btrim(coalesce(v_args->>'ordem', 'recentes')));
      v_bool := agent_gw_bool(v_args->>'aceita_email');
      v_min := agent_gw_int(v_args->>'pontuacao_min', null, 0, 100);
      v_from := agent_gw_day(v_args->>'criados_desde');
      v_to := agent_gw_day(v_args->>'criados_ate');
      if v_tipo not in ('', 'clientes', 'leads') then raise exception 'tipo: clientes ou leads'; end if;
      if v_ativ not in ('', 'ativos', 'inativos') then raise exception 'atividade: ativos ou inativos'; end if;

      with lt as (
        select ctg.contact_id, array_agg(t.name order by t.name) as tags, bool_or(t.name ilike 'comprou:%') as bought
          from contact_tags ctg join tags t on t.id = ctg.tag_id where ctg.brand_id = v_brand group by ctg.contact_id
      ), la as (
        select contact_id, max(created_at) as m from activities where brand_id = v_brand and contact_id is not null group by contact_id
      ), lb as (
        select contact_id, max(starts_at) as m, bool_or(status = 'completed' or starts_at < now()) as done
          from booking_appointments where brand_id = v_brand and contact_id is not null and status in ('confirmed', 'completed') and starts_at <= now()
         group by contact_id
      ), lf as (
        select contact_id, max(submitted_at) as m from form_submissions where brand_id = v_brand and contact_id is not null group by contact_id
      ), lw as (
        select contact_id, max(last_message_at) as m from whatsapp_conversations where brand_id = v_brand and contact_id is not null group by contact_id
      ), ld as (
        select contact_id, bool_or(status = 'won') as won, count(*) filter (where status = 'open') as open
          from deals where brand_id = v_brand and contact_id is not null group by contact_id
      ), base as (
        select c.id, c.name, c.email, c.phone, co.name as company, c.source, c.created_at, c.lead_score, c.birth_date,
               coalesce(c.opted_in_email, false) as oe, coalesce(c.opted_in_whatsapp, false) as ow, coalesce(c.opted_in_sms, false) as os,
               c.custom_fields, coalesce(lt.tags, '{}'::text[]) as tags,
               greatest(c.created_at, c.last_engaged_at, la.m, lb.m, lf.m, lw.m) as last_at,
               (coalesce(ld.won, false) or coalesce(lb.done, false) or coalesce(lt.bought, false)) as is_client,
               coalesce(ld.open, 0) as open_deals
          from contacts c
          left join companies co on co.id = c.company_id
          left join lt on lt.contact_id = c.id
          left join la on la.contact_id = c.id
          left join lb on lb.contact_id = c.id
          left join lf on lf.contact_id = c.id
          left join lw on lw.contact_id = c.id
          left join ld on ld.contact_id = c.id
         where c.brand_id = v_brand
           and (v_q is null or c.name ilike v_q or c.email ilike v_q or c.phone ilike v_q or co.name ilike v_q)
           and (v_tag is null or exists (select 1 from contact_tags x join tags t on t.id = x.tag_id where x.contact_id = c.id and lower(t.name) = v_tag))
           and (v_notag is null or not exists (select 1 from contact_tags x join tags t on t.id = x.tag_id where x.contact_id = c.id and lower(t.name) = v_notag))
           and (v_from is null or c.created_at >= v_from)
           and (v_to is null or c.created_at < v_to + interval '1 day')
           and (v_bool is null or coalesce(c.opted_in_email, false) = v_bool)
           and (v_min is null or c.lead_score >= v_min)
           and (v_etapa is null or exists (
                 select 1 from deals d join pipeline_stages ps on ps.id = d.stage_id
                  where d.contact_id = c.id and d.brand_id = v_brand and (lower(ps.name) = lower(v_etapa) or ps.id::text = v_etapa)))
      ), f as (
        select * from base
         where (v_tipo = '' or (v_tipo = 'clientes' and is_client) or (v_tipo = 'leads' and not is_client))
           and (v_ativ = ''
                or (v_ativ = 'ativos' and last_at >= now() - make_interval(days => v_adays))
                or (v_ativ = 'inativos' and last_at < now() - make_interval(days => v_adays)))
      ), p as (
        select f.*, row_number() over (order by
                 case when v_ordem = 'pontuacao' then f.lead_score end desc nulls last,
                 case when v_ordem = 'atividade' then f.last_at end desc nulls last,
                 case when v_ordem = 'sem_atividade' then f.last_at end asc nulls first,
                 case when v_ordem = 'antigos' then f.created_at end asc,
                 case when v_ordem = 'nome' then lower(f.name) end asc,
                 f.created_at desc) as rn
          from f
      )
      select jsonb_build_object(
        'ok', true,
        'total', (select count(*) from f),
        'nota', 'cliente = negócio ganho, marcação concluída ou tag comprou:…; ultima_atividade = a mais recente entre criação, emails abertos/clicados, atividades, marcações, formulários e WhatsApp.',
        'contactos', coalesce((select jsonb_agg(jsonb_build_object(
            'id', p.id, 'nome', p.name, 'email', p.email, 'telefone', p.phone, 'empresa', p.company, 'origem', p.source,
            'criado', p.created_at, 'ultima_atividade', p.last_at, 'cliente', p.is_client, 'pontuacao', p.lead_score,
            'tags', to_jsonb(p.tags), 'negocios_abertos', p.open_deals, 'data_nascimento', p.birth_date,
            'aceita', jsonb_build_object('email', p.oe, 'whatsapp', p.ow, 'sms', p.os),
            'campos', case when coalesce(agent_gw_bool(v_args->>'com_campos'), true) then coalesce(p.custom_fields, '{}'::jsonb) end
          ) order by p.rn) from p where p.rn > v_off and p.rn <= v_off + v_lim), '[]'::jsonb)
      ) into v_res;
      return v_res;
    end if;

    -- ------------------------------------------------------------ contacto
    if v_act = 'contacto' then
      v_cid := agent_gw_contact(v_brand, v_args->>'contacto');
      select jsonb_build_object(
        'ok', true,
        'id', c.id, 'nome', c.name, 'email', c.email, 'telefone', c.phone, 'empresa', co.name, 'origem', c.source,
        'criado', c.created_at, 'data_nascimento', c.birth_date, 'pontuacao', c.lead_score, 'ultima_interacao_email', c.last_engaged_at,
        'aceita', jsonb_build_object('email', coalesce(c.opted_in_email, false), 'whatsapp', coalesce(c.opted_in_whatsapp, false), 'sms', coalesce(c.opted_in_sms, false)),
        'campos', coalesce(c.custom_fields, '{}'::jsonb),
        'indicada_por', (select jsonb_build_object('id', x.id, 'nome', x.name) from contacts x where x.id = c.referred_by),
        'indicou', (select count(*) from contacts x where x.referred_by = c.id),
        'tags', (select coalesce(jsonb_agg(jsonb_build_object('tag', t.name, 'desde', ctg.created_at) order by ctg.created_at), '[]'::jsonb)
                   from contact_tags ctg join tags t on t.id = ctg.tag_id where ctg.contact_id = c.id),
        'negocios', (select coalesce(jsonb_agg(jsonb_build_object(
                       'id', d.id, 'titulo', d.title, 'valor', d.value, 'estado', d.status, 'pipeline', pl.name, 'etapa', ps.name,
                       'probabilidade', d.probability, 'fecho_previsto', d.expected_close_date, 'motivo_perda', d.lost_reason, 'criado', d.created_at
                     ) order by d.created_at desc), '[]'::jsonb)
                       from deals d left join pipelines pl on pl.id = d.pipeline_id left join pipeline_stages ps on ps.id = d.stage_id
                      where d.contact_id = c.id),
        'atividades', (select coalesce(jsonb_agg(z.j order by z.created_at desc), '[]'::jsonb) from (
                         select jsonb_build_object('id', ac.id, 'tipo', ac.type, 'texto', left(ac.body, 2000), 'prazo', ac.due_at,
                                                   'concluida', ac.completed_at, 'negocio', ac.deal_id, 'quando', ac.created_at) as j, ac.created_at
                           from activities ac where ac.contact_id = c.id order by ac.created_at desc limit 30) z),
        'marcacoes', (select coalesce(jsonb_agg(z.j order by z.starts_at desc), '[]'::jsonb) from (
                        select jsonb_build_object('id', ba.id, 'inicio', to_char(ba.starts_at at time zone 'Europe/Lisbon', 'YYYY-MM-DD HH24:MI'),
                                                  'servico', sv.name, 'profissional', st.name, 'estado', ba.status,
                                                  'preco', coalesce(ba.total_price, sv.price)) as j, ba.starts_at
                          from booking_appointments ba
                          left join booking_services sv on sv.id = ba.service_id
                          left join booking_staff st on st.id = ba.staff_id
                         where ba.brand_id = c.brand_id and ba.contact_id = c.id order by ba.starts_at desc limit 20) z),
        'formularios', (select coalesce(jsonb_agg(z.j order by z.submitted_at desc), '[]'::jsonb) from (
                          select jsonb_build_object('formulario', f.name, 'quando', fs.submitted_at, 'respostas', fs.answers, 'pontos', fs.score) as j, fs.submitted_at
                            from form_submissions fs join forms f on f.id = fs.form_id
                           where fs.contact_id = c.id order by fs.submitted_at desc limit 10) z),
        'hotmart', (select coalesce(jsonb_agg(z.j order by z.created_at desc), '[]'::jsonb) from (
                      select jsonb_build_object('evento', he.event, 'produto', coalesce(hp.name, he.hotmart_product_id), 'quando', he.created_at) as j, he.created_at
                        from hotmart_events he
                        left join hotmart_products hp on hp.brand_id = he.brand_id and hp.hotmart_product_id = he.hotmart_product_id
                       where he.brand_id = c.brand_id and c.email is not null and lower(he.buyer_email) = lower(c.email) and he.status = 'ok'
                       order by he.created_at desc limit 20) z),
        'whatsapp', (select coalesce(jsonb_agg(z.j order by z.created_at desc), '[]'::jsonb) from (
                       select jsonb_build_object('sentido', case m.direction when 'inbound' then 'recebida' else 'enviada' end,
                                                 'texto', left(m.body, 1000), 'tipo', m.type, 'estado', m.status, 'quando', m.created_at) as j, m.created_at
                         from whatsapp_messages m join whatsapp_conversations wc on wc.id = m.conversation_id
                        where wc.contact_id = c.id and wc.brand_id = c.brand_id order by m.created_at desc limit 15) z)
      ) into v_res
      from contacts c left join companies co on co.id = c.company_id
      where c.id = v_cid;
      return v_res;
    end if;

    -- ------------------------------------------------------------ tags
    if v_act = 'tags' then
      select jsonb_build_object('ok', true, 'tags', coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'tag', t.name, 'contactos', coalesce(n.n, 0)) order by lower(t.name)), '[]'::jsonb))
        into v_res
        from tags t left join (select tag_id, count(*) as n from contact_tags where brand_id = v_brand group by tag_id) n on n.tag_id = t.id
       where t.brand_id = v_brand;
      return v_res;
    end if;

    -- ------------------------------------------------------------ pipelines
    if v_act = 'pipelines' then
      select jsonb_build_object('ok', true, 'pipelines', coalesce(jsonb_agg(jsonb_build_object(
        'id', pl.id, 'nome', pl.name, 'principal', coalesce(pl.is_default, false),
        'etapas', (select coalesce(jsonb_agg(jsonb_build_object(
                     'id', ps.id, 'nome', ps.name, 'ordem', ps.position, 'ganho', coalesce(ps.is_won, false), 'perdido', coalesce(ps.is_lost, false),
                     'negocios', (select count(*) from deals d where d.pipeline_id = pl.id and d.stage_id = ps.id),
                     'valor', (select coalesce(sum(d.value), 0) from deals d where d.pipeline_id = pl.id and d.stage_id = ps.id)
                   ) order by ps.position), '[]'::jsonb) from pipeline_stages ps where ps.pipeline_id = pl.id)
      ) order by coalesce(pl.is_default, false) desc, pl.name), '[]'::jsonb))
      into v_res
      from pipelines pl where pl.brand_id = v_brand;
      return v_res;
    end if;

    -- ------------------------------------------------------------ negocios
    if v_act = 'negocios' then
      v_q := nullif(btrim(coalesce(v_args->>'procura', '')), '');
      if v_q is not null then v_q := '%' || agent_gw_like(v_q) || '%'; end if;
      v_etapa := nullif(btrim(coalesce(v_args->>'etapa', '')), '');
      v_t := nullif(btrim(coalesce(v_args->>'pipeline', '')), '');
      v_estado := case lower(btrim(coalesce(v_args->>'estado', '')))
                    when 'aberto' then 'open' when 'abertos' then 'open' when 'open' then 'open'
                    when 'ganho' then 'won' when 'ganhos' then 'won' when 'won' then 'won'
                    when 'perdido' then 'lost' when 'perdidos' then 'lost' when 'lost' then 'lost' end;
      with f as (
        select d.*, pl.name as pipeline_name, ps.name as stage_name, c.name as contact_name, c.email as contact_email, c.phone as contact_phone
          from deals d
          left join pipelines pl on pl.id = d.pipeline_id
          left join pipeline_stages ps on ps.id = d.stage_id
          left join contacts c on c.id = d.contact_id
         where d.brand_id = v_brand
           and (v_t is null or pl.id::text = v_t or lower(pl.name) = lower(v_t))
           and (v_etapa is null or ps.id::text = v_etapa or lower(ps.name) = lower(v_etapa))
           and (v_estado is null or d.status = v_estado)
           and (v_q is null or d.title ilike v_q or c.name ilike v_q or c.email ilike v_q)
      ), p as (select f.*, row_number() over (order by f.created_at desc) as rn from f)
      select jsonb_build_object('ok', true, 'total', (select count(*) from f), 'negocios', coalesce((select jsonb_agg(jsonb_build_object(
          'id', p.id, 'titulo', p.title, 'valor', p.value, 'estado', p.status, 'pipeline', p.pipeline_name, 'etapa', p.stage_name,
          'probabilidade', p.probability, 'fecho_previsto', p.expected_close_date, 'motivo_perda', p.lost_reason, 'criado', p.created_at,
          'contacto', case when p.contact_id is null then null else jsonb_build_object('id', p.contact_id, 'nome', p.contact_name, 'email', p.contact_email, 'telefone', p.contact_phone) end
        ) order by p.rn) from p where p.rn > v_off and p.rn <= v_off + v_lim), '[]'::jsonb))
      into v_res;
      return v_res;
    end if;

    -- ------------------------------------------------------------ marcacoes
    if v_act = 'marcacoes' then
      v_from := coalesce(agent_gw_day(v_args->>'de'), ((now() at time zone 'Europe/Lisbon')::date - 7)::timestamp at time zone 'Europe/Lisbon');
      v_to := coalesce(agent_gw_day(v_args->>'ate'), ((now() at time zone 'Europe/Lisbon')::date + 7)::timestamp at time zone 'Europe/Lisbon') + interval '1 day';
      if v_to - v_from > interval '400 days' then raise exception 'Período demasiado longo (máximo 400 dias).'; end if;
      v_estado := nullif(lower(btrim(coalesce(v_args->>'estado', ''))), '');
      with f as (
        select ba.*, sv.name as service_name, sv.price as service_price, st.name as staff_name
          from booking_appointments ba
          left join booking_services sv on sv.id = ba.service_id
          left join booking_staff st on st.id = ba.staff_id
         where ba.brand_id = v_brand and ba.starts_at >= v_from and ba.starts_at < v_to
           and (v_estado is null or ba.status = v_estado)
      ), p as (select f.*, row_number() over (order by f.starts_at) as rn from f)
      select jsonb_build_object('ok', true, 'total', (select count(*) from f),
        'por_estado', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) from (select status, count(*) as n from f group by status) e),
        'marcacoes', coalesce((select jsonb_agg(jsonb_build_object(
          'id', p.id, 'inicio', to_char(p.starts_at at time zone 'Europe/Lisbon', 'YYYY-MM-DD HH24:MI'),
          'fim', to_char(p.ends_at at time zone 'Europe/Lisbon', 'HH24:MI'), 'servico', p.service_name, 'profissional', p.staff_name,
          'estado', p.status, 'preco', coalesce(p.total_price, p.service_price), 'sinal', p.deposit_status, 'origem', p.source,
          'cliente', p.customer_name, 'telefone', p.customer_phone, 'email', p.customer_email, 'contacto_id', p.contact_id
        ) order by p.rn) from p where p.rn > v_off and p.rn <= v_off + least(v_lim * 4, 500)), '[]'::jsonb))
      into v_res;
      return v_res;
    end if;

    -- ------------------------------------------------------------ formularios
    if v_act = 'formularios' then
      select jsonb_build_object('ok', true, 'formularios', coalesce(jsonb_agg(jsonb_build_object(
        'id', f.id, 'nome', f.name, 'slug', f.slug, 'tipo', f.type, 'estado', f.status,
        'respostas', (select count(*) from form_submissions fs where fs.form_id = f.id),
        'respostas_30d', (select count(*) from form_submissions fs where fs.form_id = f.id and fs.submitted_at > now() - interval '30 days')
      ) order by f.name), '[]'::jsonb))
      into v_res from forms f where f.brand_id = v_brand;
      return v_res;
    end if;

    if v_act = 'respostas' then
      v_t := nullif(btrim(coalesce(v_args->>'formulario', '')), '');
      v_from := now() - make_interval(days => v_days);
      with f as (
        select fs.*, fo.name as form_name, c.name as contact_name, c.email as contact_email, c.phone as contact_phone
          from form_submissions fs
          join forms fo on fo.id = fs.form_id
          left join contacts c on c.id = fs.contact_id
         where fs.brand_id = v_brand and fs.submitted_at >= v_from
           and (v_t is null or fo.id::text = v_t or lower(fo.name) = lower(v_t) or fo.slug = v_t)
      ), p as (select f.*, row_number() over (order by f.submitted_at desc) as rn from f)
      select jsonb_build_object('ok', true, 'total', (select count(*) from f), 'respostas', coalesce((select jsonb_agg(jsonb_build_object(
          'formulario', p.form_name, 'quando', p.submitted_at, 'respostas', p.answers, 'pontos', p.score,
          'contacto', case when p.contact_id is null then null else jsonb_build_object('id', p.contact_id, 'nome', p.contact_name, 'email', p.contact_email, 'telefone', p.contact_phone) end
        ) order by p.rn) from p where p.rn > v_off and p.rn <= v_off + v_lim), '[]'::jsonb))
      into v_res;
      return v_res;
    end if;

    -- ------------------------------------------------------------ guardar_contacto
    if v_act = 'guardar_contacto' then
      v_name := left(btrim(coalesce(v_args->>'nome', '')), 200);
      v_email := lower(btrim(coalesce(v_args->>'email', '')));
      if v_email <> '' and v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$' then raise exception 'Email inválido: %', v_email; end if;
      v_email := nullif(v_email, '');
      v_phone := agent_gw_phone(v_args->>'telefone');
      if btrim(coalesce(v_args->>'telefone', '')) <> '' and v_phone is null then raise exception 'Telefone inválido: % (usa +351…)', v_args->>'telefone'; end if;
      if v_email is null and v_phone is null then raise exception 'Indica pelo menos um email ou telefone.'; end if;
      v_fields := case when jsonb_typeof(v_args->'campos') = 'object' then v_args->'campos' else '{}'::jsonb end;
      v_source := coalesce(nullif(regexp_replace(lower(coalesce(v_args->>'origem', '')), '[^a-z0-9_:-]', '', 'g'), ''), 'agente');
      v_birth := (agent_gw_day(v_args->>'data_nascimento') at time zone 'Europe/Lisbon')::date;
      v_company := agent_gw_company(v_brand, v_args->>'empresa');

      if v_phone is not null then select id into v_cid from contacts where brand_id = v_brand and phone = v_phone; end if;
      if v_cid is null and v_email is not null then select id into v_cid from contacts where brand_id = v_brand and lower(email) = v_email limit 1; end if;

      if v_cid is null then
        insert into contacts (brand_id, name, email, phone, source, custom_fields, birth_date, company_id)
        values (v_brand, coalesce(nullif(v_name, ''), 'Sem nome'), v_email, v_phone, v_source, v_fields, v_birth, v_company)
        returning id into v_cid;
        v_created := true;
      else
        -- Já existia: só completa o que falta (como o lead-intake), nunca apaga.
        update contacts c set
          name = case when v_name <> '' and (c.name is null or c.name = '' or c.name = 'Sem nome') then v_name else c.name end,
          email = case when c.email is null and v_email is not null
                        and not exists (select 1 from contacts x where x.brand_id = v_brand and lower(x.email) = v_email) then v_email else c.email end,
          phone = case when c.phone is null and v_phone is not null
                        and not exists (select 1 from contacts x where x.brand_id = v_brand and x.phone = v_phone) then v_phone else c.phone end,
          birth_date = coalesce(c.birth_date, v_birth),
          company_id = coalesce(c.company_id, v_company),
          custom_fields = case when v_fields = '{}'::jsonb then c.custom_fields else coalesce(c.custom_fields, '{}'::jsonb) || v_fields end
        where c.id = v_cid;
      end if;

      v_tags := agent_gw_list(v_args->'tags');
      foreach v_t in array v_tags loop
        v_tid := agent_gw_tag(v_brand, v_t);
        if v_tid is not null then
          insert into contact_tags (brand_id, contact_id, tag_id) values (v_brand, v_cid, v_tid) on conflict do nothing;
        end if;
      end loop;

      v_text := left(btrim(coalesce(v_args->>'nota', '')), 20000);
      if v_text <> '' then
        insert into activities (brand_id, contact_id, type, body) values (v_brand, v_cid, 'note', v_text);
      end if;

      insert into agent_gateway_log (key_id, agent, action, brand_id, target_id, detail)
      values (v_key.id, v_agent, v_act, v_brand, v_cid, case when v_created then 'criado' else 'completado' end || coalesce(' tags: ' || nullif(array_to_string(v_tags, ', '), ''), ''));
      return jsonb_build_object('ok', true, 'id', v_cid, 'criado', v_created, 'tags', to_jsonb(v_tags));
    end if;

    -- ------------------------------------------------------------ atualizar_contacto
    if v_act = 'atualizar_contacto' then
      v_cid := agent_gw_contact(v_brand, v_args->>'contacto');
      v_name := left(btrim(coalesce(v_args->>'nome', '')), 200);
      v_email := lower(btrim(coalesce(v_args->>'email', '')));
      if v_email <> '' and v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$' then raise exception 'Email inválido: %', v_email; end if;
      v_email := nullif(v_email, '');
      v_phone := agent_gw_phone(v_args->>'telefone');
      if btrim(coalesce(v_args->>'telefone', '')) <> '' and v_phone is null then raise exception 'Telefone inválido: %', v_args->>'telefone'; end if;
      if v_email is not null and exists (select 1 from contacts x where x.brand_id = v_brand and lower(x.email) = v_email and x.id <> v_cid) then
        raise exception 'Já há outro contacto com o email %.', v_email;
      end if;
      if v_phone is not null and exists (select 1 from contacts x where x.brand_id = v_brand and x.phone = v_phone and x.id <> v_cid) then
        raise exception 'Já há outro contacto com o telefone %.', v_phone;
      end if;
      v_fields := case when jsonb_typeof(v_args->'campos') = 'object' then v_args->'campos' else '{}'::jsonb end;
      v_source := nullif(regexp_replace(lower(coalesce(v_args->>'origem', '')), '[^a-z0-9_:-]', '', 'g'), '');
      v_birth := (agent_gw_day(v_args->>'data_nascimento') at time zone 'Europe/Lisbon')::date;
      v_company := agent_gw_company(v_brand, v_args->>'empresa');
      update contacts c set
        name = coalesce(nullif(v_name, ''), c.name),
        email = coalesce(v_email, c.email),
        phone = coalesce(v_phone, c.phone),
        source = coalesce(v_source, c.source),
        birth_date = coalesce(v_birth, c.birth_date),
        company_id = coalesce(v_company, c.company_id),
        custom_fields = (coalesce(c.custom_fields, '{}'::jsonb) || v_fields) - agent_gw_list(v_args->'remover_campos')
      where c.id = v_cid;
      insert into agent_gateway_log (key_id, agent, action, brand_id, target_id, detail)
      values (v_key.id, v_agent, v_act, v_brand, v_cid, left((v_args - '_agente' - 'marca')::text, 500));
      return jsonb_build_object('ok', true, 'id', v_cid);
    end if;

    -- ------------------------------------------------------------ por_tags / tirar_tags
    if v_act in ('por_tags', 'tirar_tags') then
      v_cid := agent_gw_contact(v_brand, v_args->>'contacto');
      v_tags := agent_gw_list(v_args->'tags');
      if cardinality(v_tags) = 0 then raise exception 'Indica as tags (lista ou separadas por vírgulas).'; end if;
      if v_act = 'por_tags' then
        foreach v_t in array v_tags loop
          v_tid := agent_gw_tag(v_brand, v_t);
          if v_tid is not null then
            insert into contact_tags (brand_id, contact_id, tag_id) values (v_brand, v_cid, v_tid) on conflict do nothing;
          end if;
        end loop;
      else
        delete from contact_tags ctg using tags t
         where ctg.contact_id = v_cid and ctg.brand_id = v_brand and t.id = ctg.tag_id
           and lower(t.name) = any(select lower(x) from unnest(v_tags) x);
        get diagnostics v_n = row_count;
      end if;
      insert into agent_gateway_log (key_id, agent, action, brand_id, target_id, detail)
      values (v_key.id, v_agent, v_act, v_brand, v_cid, array_to_string(v_tags, ', '));
      return jsonb_build_object('ok', true, 'contacto', v_cid, 'tags', to_jsonb(v_tags),
        'retiradas', case when v_act = 'tirar_tags' then v_n end,
        'tags_do_contacto', (select coalesce(jsonb_agg(t.name order by t.name), '[]'::jsonb) from contact_tags ctg join tags t on t.id = ctg.tag_id where ctg.contact_id = v_cid));
    end if;

    -- ------------------------------------------------------------ registar_atividade
    if v_act = 'registar_atividade' then
      v_type := case lower(btrim(coalesce(v_args->>'tipo', 'nota')))
                  when 'nota' then 'note' when 'note' then 'note'
                  when 'chamada' then 'call' when 'call' then 'call'
                  when 'reuniao' then 'meeting' when 'reunião' then 'meeting' when 'meeting' then 'meeting'
                  when 'email' then 'email' when 'whatsapp' then 'whatsapp'
                  when 'tarefa' then 'task' when 'task' then 'task' end;
      if v_type is null then raise exception 'tipo: nota, chamada, reuniao, email, whatsapp ou tarefa'; end if;
      v_text := left(btrim(coalesce(v_args->>'texto', '')), 20000);
      if v_text = '' then raise exception 'Falta o texto.'; end if;
      if btrim(coalesce(v_args->>'contacto', '')) <> '' then v_cid := agent_gw_contact(v_brand, v_args->>'contacto'); end if;
      if btrim(coalesce(v_args->>'negocio', '')) <> '' then
        select id, coalesce(v_cid, contact_id) into v_did, v_cid from deals
         where id::text = btrim(v_args->>'negocio') and brand_id = v_brand;
        if v_did is null then raise exception 'Negócio não encontrado nesta marca.'; end if;
      end if;
      if v_cid is null and v_did is null then raise exception 'Indica o contacto ou o negócio.'; end if;
      insert into activities (brand_id, contact_id, deal_id, type, body, due_at)
      values (v_brand, v_cid, v_did, v_type, v_text, agent_gw_ts(v_args->>'prazo'))
      returning id into v_tid;
      insert into agent_gateway_log (key_id, agent, action, brand_id, target_id, detail)
      values (v_key.id, v_agent, v_act, v_brand, coalesce(v_cid, v_did), v_type);
      return jsonb_build_object('ok', true, 'id', v_tid);
    end if;

    if v_act = 'concluir_tarefa' then
      update activities set completed_at = now()
       where id::text = btrim(coalesce(v_args->>'atividade', '')) and brand_id = v_brand and completed_at is null
      returning id into v_tid;
      if v_tid is null then raise exception 'Tarefa não encontrada nesta marca (ou já concluída).'; end if;
      insert into agent_gateway_log (key_id, agent, action, brand_id, target_id) values (v_key.id, v_agent, v_act, v_brand, v_tid);
      return jsonb_build_object('ok', true, 'id', v_tid);
    end if;

    -- ------------------------------------------------------------ criar_negocio
    if v_act = 'criar_negocio' then
      if btrim(coalesce(v_args->>'contacto', '')) <> '' then v_cid := agent_gw_contact(v_brand, v_args->>'contacto'); end if;
      v_t := nullif(btrim(coalesce(v_args->>'pipeline', '')), '');
      select id into v_pipe from pipelines
       where brand_id = v_brand and (v_t is null or id::text = v_t or lower(name) = lower(v_t))
       order by coalesce(is_default, false) desc, created_at limit 1;
      if v_pipe is null then raise exception 'Pipeline não encontrado nesta marca (vê a ação "pipelines").'; end if;
      v_etapa := nullif(btrim(coalesce(v_args->>'etapa', '')), '');
      select * into v_stage from pipeline_stages
       where pipeline_id = v_pipe
         and (case when v_etapa is null then not coalesce(is_won, false) and not coalesce(is_lost, false)
                   else id::text = v_etapa or lower(name) = lower(v_etapa) end)
       order by position limit 1;
      if v_stage.id is null then raise exception 'Etapa não encontrada neste pipeline.'; end if;
      v_name := left(btrim(coalesce(v_args->>'titulo', '')), 200);
      if v_name = '' then select name into v_name from contacts where id = v_cid; end if;
      if coalesce(v_name, '') = '' then raise exception 'Falta o título do negócio.'; end if;
      insert into deals (brand_id, pipeline_id, stage_id, contact_id, title, value, probability, expected_close_date, status)
      values (v_brand, v_pipe, v_stage.id, v_cid, v_name, agent_gw_num(v_args->>'valor'),
              agent_gw_int(v_args->>'probabilidade', null, 0, 100),
              (agent_gw_day(v_args->>'fecho_previsto') at time zone 'Europe/Lisbon')::date,
              case when v_stage.is_won then 'won' when v_stage.is_lost then 'lost' else 'open' end)
      returning id into v_did;
      insert into agent_gateway_log (key_id, agent, action, brand_id, target_id, detail)
      values (v_key.id, v_agent, v_act, v_brand, v_did, v_name);
      return jsonb_build_object('ok', true, 'id', v_did, 'etapa', v_stage.name);
    end if;

    -- ------------------------------------------------------------ atualizar_negocio
    if v_act = 'atualizar_negocio' then
      select id, pipeline_id into v_did, v_pipe from deals where id::text = btrim(coalesce(v_args->>'negocio', '')) and brand_id = v_brand;
      if v_did is null then raise exception 'Negócio não encontrado nesta marca.'; end if;
      v_etapa := nullif(btrim(coalesce(v_args->>'etapa', '')), '');
      if v_etapa is not null then
        select * into v_stage from pipeline_stages
         where pipeline_id = v_pipe and (id::text = v_etapa or lower(name) = lower(v_etapa)) order by position limit 1;
        if v_stage.id is null then raise exception 'Etapa "%" não existe neste pipeline.', v_etapa; end if;
      end if;
      update deals d set
        stage_id = coalesce(v_stage.id, d.stage_id),
        status = case when v_stage.id is null then d.status when v_stage.is_won then 'won' when v_stage.is_lost then 'lost' else 'open' end,
        title = coalesce(nullif(left(btrim(coalesce(v_args->>'titulo', '')), 200), ''), d.title),
        value = coalesce(agent_gw_num(v_args->>'valor'), d.value),
        probability = coalesce(agent_gw_int(v_args->>'probabilidade', null, 0, 100), d.probability),
        expected_close_date = coalesce((agent_gw_day(v_args->>'fecho_previsto') at time zone 'Europe/Lisbon')::date, d.expected_close_date),
        lost_reason = case when v_args ? 'motivo_perda' then nullif(left(btrim(coalesce(v_args->>'motivo_perda', '')), 500), '') else d.lost_reason end
      where d.id = v_did;
      insert into agent_gateway_log (key_id, agent, action, brand_id, target_id, detail)
      values (v_key.id, v_agent, v_act, v_brand, v_did, left((v_args - '_agente' - 'marca')::text, 500));
      return jsonb_build_object('ok', true, 'id', v_did, 'etapa', coalesce(v_stage.name, (select ps.name from deals d join pipeline_stages ps on ps.id = d.stage_id where d.id = v_did)));
    end if;

    return jsonb_build_object('ok', false, 'erro', 'Ação desconhecida: ' || v_act || ' (vê a ação "ajuda").');
  exception when others then
    return jsonb_build_object('ok', false, 'erro', sqlerrm);
  end;
end
$fn$;

-- Só a função principal fica exposta (anon chama-a pela API, com a chave).
revoke all on function agent_crm(text, text, jsonb) from public;
grant execute on function agent_crm(text, text, jsonb) to anon, authenticated, service_role;

revoke all on function agent_gw_like(text) from public, anon, authenticated;
revoke all on function agent_gw_int(text, int, int, int) from public, anon, authenticated;
revoke all on function agent_gw_num(text) from public, anon, authenticated;
revoke all on function agent_gw_bool(text) from public, anon, authenticated;
revoke all on function agent_gw_day(text) from public, anon, authenticated;
revoke all on function agent_gw_ts(text) from public, anon, authenticated;
revoke all on function agent_gw_phone(text) from public, anon, authenticated;
revoke all on function agent_gw_list(jsonb) from public, anon, authenticated;
revoke all on function agent_gw_brand(uuid[], text) from public, anon, authenticated;
revoke all on function agent_gw_contact(uuid, text) from public, anon, authenticated;
revoke all on function agent_gw_tag(uuid, text) from public, anon, authenticated;
revoke all on function agent_gw_company(uuid, text) from public, anon, authenticated;

-- A API do Supabase passa a ver a função nova.
notify pgrst, 'reload schema';
