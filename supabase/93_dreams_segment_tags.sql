-- =========================================================
-- 93 — Tags de segmentação das clientes (Dreams Studio)
-- =========================================================
-- Corre depois da 92. Pode correr-se mais do que uma vez.
--
-- Tags AUTOMÁTICAS (calculadas pelas marcações; ninguém as põe à mão):
--   Ativa: veio nos últimos 3 meses   última visita há menos de 3 meses, ou tem marcação futura
--   Em risco: 3 a 6 meses sem vir     última visita há 3 a 6 meses e sem marcação futura
--   Inativa: mais de 6 meses          última visita há 6 meses a 2 anos e sem marcação futura
--   Inativa: mais de 2 anos           última visita há mais de 2 anos e sem marcação futura
--   Nova cliente (1 visita)           só uma visita
--   Cliente fiel (10+ visitas)        10 visitas ou mais
--   Faltou nos últimos 12 meses       tem um "faltou" no último ano
--   Ainda não marcou                  contacto sem nenhuma visita nem marcação futura
-- Visita = marcação concluída, ou confirmada que já passou (inclui o
-- histórico importado). São revistas todos os dias às 06:00 (Lisboa) por
-- refresh_booking_segments(); a tag sai sozinha quando deixa de se aplicar.
--
-- Tags MANUAIS (a equipa põe na ficha da cliente): Cliente VIP,
-- Interessada em pack, Indicou amigas, Não contactar, e "Cliente antiga"
-- (se ainda não existir; é a que dispensa o sinal no Agendamento).
--
-- Atenção: pôr uma tag arranca as automações com o gatilho "tag
-- adicionada" para essa tag. Não há nenhuma para estas tags; se criares
-- uma, ela passa a disparar na revisão diária.
-- =========================================================

-- Marcas com as tags automáticas ligadas.
create table if not exists booking_segment_brands (
  brand_id uuid primary key references brands(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table booking_segment_brands enable row level security;
drop policy if exists booking_segment_brands_select on booking_segment_brands;
create policy booking_segment_brands_select on booking_segment_brands for select using (can_manage_brand(brand_id));

-- Nomes das tags automáticas (uma só fonte para a função).
create or replace function booking_segment_tag_names() returns text[]
language sql immutable set search_path = public as $fn$
  select array[
    'Ativa: veio nos últimos 3 meses',
    'Em risco: 3 a 6 meses sem vir',
    'Inativa: mais de 6 meses',
    'Inativa: mais de 2 anos',
    'Nova cliente (1 visita)',
    'Cliente fiel (10+ visitas)',
    'Faltou nos últimos 12 meses',
    'Ainda não marcou'
  ];
$fn$;

-- Revê as tags automáticas de uma marca: põe as que se aplicam e tira as que deixaram de se aplicar.
create or replace function refresh_booking_segments(p_brand uuid) returns void
language plpgsql security definer set search_path = public as $fn$
declare
  v_names text[] := booking_segment_tag_names();
  v_colors text[] := array['#2F9E63', '#C9821F', '#D3455B', '#8A2B3E', '#3B5FC2', '#7C52A8', '#E07B39', '#6B7280'];
  i int;
begin
  -- Garante que as tags existem (o nome é único por marca, sem diferenciar maiúsculas).
  for i in 1 .. array_length(v_names, 1) loop
    insert into tags (brand_id, name, color)
    select p_brand, v_names[i], v_colors[i]
    where not exists (select 1 from tags where brand_id = p_brand and lower(name) = lower(v_names[i]));
  end loop;

  create temporary table if not exists _seg_wanted (contact_id uuid, tag_id uuid) on commit drop;
  delete from _seg_wanted;

  with stats as (
    select c.id as contact_id,
      count(a.id) filter (where a.status = 'completed' or (a.status = 'confirmed' and a.ends_at < now())) as visits,
      max(a.starts_at) filter (where a.status = 'completed' or (a.status = 'confirmed' and a.ends_at < now())) as last_visit,
      coalesce(bool_or(a.status = 'no_show' and a.starts_at > now() - interval '12 months'), false) as missed,
      coalesce(bool_or(a.status in ('confirmed', 'pending_payment') and a.starts_at > now()), false) as upcoming
    from contacts c
    left join booking_appointments a on a.contact_id = c.id and a.brand_id = p_brand
    where c.brand_id = p_brand
    group by c.id
  ), wanted as (
    select contact_id, v_names[1] as name from stats where upcoming or last_visit >= now() - interval '3 months'
    union all select contact_id, v_names[2] from stats where not upcoming and last_visit < now() - interval '3 months' and last_visit >= now() - interval '6 months'
    union all select contact_id, v_names[3] from stats where not upcoming and last_visit < now() - interval '6 months' and last_visit >= now() - interval '2 years'
    union all select contact_id, v_names[4] from stats where not upcoming and last_visit < now() - interval '2 years'
    union all select contact_id, v_names[5] from stats where visits = 1
    union all select contact_id, v_names[6] from stats where visits >= 10
    union all select contact_id, v_names[7] from stats where missed
    union all select contact_id, v_names[8] from stats where visits = 0 and not upcoming
  )
  insert into _seg_wanted (contact_id, tag_id)
  select w.contact_id, t.id from wanted w
  join tags t on t.brand_id = p_brand and lower(t.name) = lower(w.name);

  -- Tira as que deixaram de se aplicar.
  delete from contact_tags ct
  using tags t
  where ct.tag_id = t.id and t.brand_id = p_brand
    and lower(t.name) = any (select lower(n) from unnest(v_names) as n)
    and not exists (select 1 from _seg_wanted w where w.contact_id = ct.contact_id and w.tag_id = ct.tag_id);

  -- Põe as novas.
  insert into contact_tags (brand_id, contact_id, tag_id)
  select p_brand, w.contact_id, w.tag_id from _seg_wanted w
  where not exists (select 1 from contact_tags ct where ct.contact_id = w.contact_id and ct.tag_id = w.tag_id);
end;
$fn$;
revoke all on function refresh_booking_segments(uuid) from public, anon, authenticated;

create or replace function refresh_all_booking_segments() returns void
language plpgsql security definer set search_path = public as $fn$
declare r record;
begin
  for r in select brand_id from booking_segment_brands loop
    begin
      perform refresh_booking_segments(r.brand_id);
    exception when others then
      raise warning 'refresh_booking_segments falhou para %: %', r.brand_id, sqlerrm;
    end;
  end loop;
end;
$fn$;
revoke all on function refresh_all_booking_segments() from public, anon, authenticated;

-- Todos os dias às 05:00 UTC (06:00 em Lisboa no verão, 05:00 no inverno).
select cron.unschedule(jobid) from cron.job where jobname = 'booking-segments-daily';
select cron.schedule('booking-segments-daily', '0 5 * * *', 'select refresh_all_booking_segments();');

-- Dreams Studio: liga, cria as tags manuais e corre já a primeira vez.
do $do$
declare
  v_brand uuid;
  v_count int;
  v_manual text[] := array['Cliente VIP', 'Interessada em pack', 'Indicou amigas', 'Não contactar', 'Cliente antiga'];
  v_mcolors text[] := array['#B0820D', '#C23B85', '#2E9E9E', '#4B5563', '#1F7A4D'];
  i int;
begin
  select count(*) into v_count from brands where name ilike 'dream%studio%';
  if v_count = 0 then raise exception 'Não encontrei a marca "Dreams Studio".'; end if;
  if v_count > 1 then raise exception 'Há % marcas com nome parecido com "Dreams Studio". Deixa só uma.', v_count; end if;
  select id into v_brand from brands where name ilike 'dream%studio%';

  insert into booking_segment_brands (brand_id) values (v_brand) on conflict do nothing;

  for i in 1 .. array_length(v_manual, 1) loop
    insert into tags (brand_id, name, color)
    select v_brand, v_manual[i], v_mcolors[i]
    where not exists (select 1 from tags where brand_id = v_brand and lower(name) = lower(v_manual[i]));
  end loop;

  perform refresh_booking_segments(v_brand);
end;
$do$;

-- Para ver quantas clientes ficaram em cada tag:
-- select t.name, count(ct.contact_id) from tags t left join contact_tags ct on ct.tag_id = t.id
-- join brands b on b.id = t.brand_id where b.name ilike 'dream%studio%' group by t.name order by t.name;
