-- Tags automáticas do Agendamento (migração 93): a revisão diária passa a
-- tirar SÓ as tags que ela própria pôs. Uma tag posta à mão (ex.: "Inativa:
-- mais de 6 meses" numa cliente cujas visitas antigas não estão no Big Boss)
-- nunca mais é retirada pela revisão.
-- booking_segment_auto guarda o que foi posto automaticamente.
-- Na primeira revisão, as tags que já existem e que a revisão poria na mesma
-- ficam marcadas como automáticas; todas as outras contam como postas à mão.
-- Pode correr-se mais do que uma vez.

create table if not exists booking_segment_auto (
  brand_id uuid not null references brands(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  tag_id uuid not null references tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (contact_id, tag_id)
);
alter table booking_segment_auto enable row level security;
-- Sem políticas: só as funções (security definer) leem e escrevem.

create or replace function refresh_booking_segments(p_brand uuid) returns void
language plpgsql security definer set search_path = public as $fn$
declare
  v_names text[] := booking_segment_tag_names();
  v_colors text[] := array['#2F9E63', '#C9821F', '#D3455B', '#8A2B3E', '#3B5FC2', '#7C52A8', '#E07B39', '#6B7280'];
  v_first boolean;
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

  -- Primeira revisão com este registo: as tags automáticas que já existem e
  -- batem certo com a agenda passam a contar como postas pela revisão.
  select not exists (select 1 from booking_segment_auto where brand_id = p_brand) into v_first;
  if v_first then
    insert into booking_segment_auto (brand_id, contact_id, tag_id)
    select p_brand, ct.contact_id, ct.tag_id
    from contact_tags ct
    join _seg_wanted w on w.contact_id = ct.contact_id and w.tag_id = ct.tag_id
    on conflict do nothing;
  end if;

  -- Quem tirou à mão uma tag automática: deixa de estar no registo.
  delete from booking_segment_auto a
  where a.brand_id = p_brand
    and not exists (select 1 from contact_tags ct where ct.contact_id = a.contact_id and ct.tag_id = a.tag_id);

  -- Tira só as que a revisão pôs e que deixaram de se aplicar.
  delete from contact_tags ct
  using booking_segment_auto a
  where a.brand_id = p_brand and ct.contact_id = a.contact_id and ct.tag_id = a.tag_id
    and not exists (select 1 from _seg_wanted w where w.contact_id = ct.contact_id and w.tag_id = ct.tag_id);
  delete from booking_segment_auto a
  where a.brand_id = p_brand
    and not exists (select 1 from _seg_wanted w where w.contact_id = a.contact_id and w.tag_id = a.tag_id);

  -- Põe as novas (as que já lá estão, postas à mão, ficam como manuais).
  insert into booking_segment_auto (brand_id, contact_id, tag_id)
  select p_brand, w.contact_id, w.tag_id from _seg_wanted w
  where not exists (select 1 from contact_tags ct where ct.contact_id = w.contact_id and ct.tag_id = w.tag_id)
  on conflict do nothing;
  insert into contact_tags (brand_id, contact_id, tag_id)
  select p_brand, w.contact_id, w.tag_id from _seg_wanted w
  where not exists (select 1 from contact_tags ct where ct.contact_id = w.contact_id and ct.tag_id = w.tag_id);
end;
$fn$;
revoke all on function refresh_booking_segments(uuid) from public, anon, authenticated;
