-- =========================================================
-- EMPOWER OS — AGENDAMENTO: LISTA DE UPSELLS, OPÇÕES OBRIGATÓRIAS,
-- PACKS COM OFERTA, PÓS-VISITA POR NÚMERO DE VISITA E GOHIGHLEVEL
-- =========================================================
-- Corre isto depois do 81_client_app_team_preview.sql. Pode correr-se mais
-- do que uma vez.
--
-- 1. Upsells passam a ser uma LISTA DA MARCA (booking_upsells) que se liga
--    a cada serviço (booking_service_upsell_links). Um upsell criado uma vez
--    serve para vários serviços. Os upsells antigos (booking_service_upsells,
--    um por serviço) são copiados para a lista e ligados aos mesmos
--    serviços; a tabela antiga fica só como histórico.
-- 2. Opções obrigatórias por serviço (booking_services.option_groups): ex.
--    Coloração → "Brushing": sem brushing (+0), brushing longo (+10 €,
--    +20 min); Massagem → "Duração": 30 min, 60 min (+25 €, +30 min). Cada
--    grupo obriga a escolher uma opção; a escolha fica guardada na marcação
--    (booking_appointments.selected_options).
-- 3. Packs com sessões oferecidas: booking_packs.bonus_sessions +
--    bonus_service_ids (ex: 9 pagas + 1 de oferta de Brushing). Quando o pack
--    da cliente fica ativo (pago ou atribuído à mão), um trigger cria um
--    segundo pack "Oferta" com essas sessões.
-- 4. Pós-visita só em certas visitas (booking_reminder_settings.visit_numbers,
--    ex: {1,10,30}) e com texto próprio por visita (visit_messages).
-- 5. GoHighLevel: brand_ghl_accounts (token no Vault) e
--    booking_appointments.external_source/external_id para importar
--    marcações sem duplicar.
-- =========================================================

-- ---------------------------------------------------------
-- 1. Lista de upsells da marca
-- ---------------------------------------------------------
create table if not exists booking_upsells (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade not null,
  name text not null,
  description text,
  price numeric,
  extra_duration_minutes int not null default 0,
  status text not null default 'active' check (status in ('active', 'archived')),
  legacy_id uuid,                          -- upsell antigo (booking_service_upsells) de onde veio
  created_at timestamptz default now()
);
create index if not exists idx_booking_upsells_brand on booking_upsells(brand_id);

create table if not exists booking_service_upsell_links (
  service_id uuid references booking_services(id) on delete cascade not null,
  upsell_id uuid references booking_upsells(id) on delete cascade not null,
  brand_id uuid references brands(id) on delete cascade not null,
  created_at timestamptz default now(),
  primary key (service_id, upsell_id)
);

alter table booking_upsells enable row level security;
drop policy if exists booking_upsells_all on booking_upsells;
create policy booking_upsells_all on booking_upsells for all using (is_brand_member(brand_id)) with check (is_brand_member(brand_id));

alter table booking_service_upsell_links enable row level security;
drop policy if exists booking_service_upsell_links_all on booking_service_upsell_links;
create policy booking_service_upsell_links_all on booking_service_upsell_links for all using (is_brand_member(brand_id)) with check (is_brand_member(brand_id));

-- O serviço e o upsell de uma ligação têm de ser da mesma marca da ligação.
create or replace function trg_upsell_link_same_brand() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from booking_services where id = new.service_id and brand_id = new.brand_id)
     or not exists (select 1 from booking_upsells where id = new.upsell_id and brand_id = new.brand_id) then
    raise exception 'Serviço e upsell têm de ser da mesma marca.';
  end if;
  return new;
end;
$$;
drop trigger if exists booking_service_upsell_links_same_brand on booking_service_upsell_links;
create trigger booking_service_upsell_links_same_brand
  before insert or update on booking_service_upsell_links
  for each row execute function trg_upsell_link_same_brand();

-- Cópia dos upsells antigos: um por (marca, nome, preço, minutos) — o mesmo
-- "Brushing" repetido em vários serviços passa a ser um só na lista.
insert into booking_upsells (brand_id, name, price, extra_duration_minutes, legacy_id)
select distinct on (u.brand_id, lower(trim(u.name)), coalesce(u.price, -1), coalesce(u.extra_duration_minutes, 0))
       u.brand_id, trim(u.name), u.price, coalesce(u.extra_duration_minutes, 0), u.id
from booking_service_upsells u
where not exists (
  select 1 from booking_upsells b
  where b.brand_id = u.brand_id and lower(b.name) = lower(trim(u.name))
    and coalesce(b.price, -1) = coalesce(u.price, -1) and b.extra_duration_minutes = coalesce(u.extra_duration_minutes, 0)
)
order by u.brand_id, lower(trim(u.name)), coalesce(u.price, -1), coalesce(u.extra_duration_minutes, 0), u.created_at;

insert into booking_service_upsell_links (service_id, upsell_id, brand_id)
select u.service_id, b.id, u.brand_id
from booking_service_upsells u
join booking_upsells b
  on b.brand_id = u.brand_id and lower(b.name) = lower(trim(u.name))
 and coalesce(b.price, -1) = coalesce(u.price, -1) and b.extra_duration_minutes = coalesce(u.extra_duration_minutes, 0)
on conflict do nothing;

-- ---------------------------------------------------------
-- 2. Opções obrigatórias por serviço
-- ---------------------------------------------------------
-- option_groups = [{ id, name, choices: [{ id, name, description, price, extra_minutes }] }]
-- price e extra_minutes somam-se ao preço e à duração base do serviço.
alter table booking_services add column if not exists option_groups jsonb not null default '[]'::jsonb;
-- Snapshot na marcação: [{ group_id, group, id, name, price, extra_minutes }]
alter table booking_appointments add column if not exists selected_options jsonb not null default '[]'::jsonb;

-- ---------------------------------------------------------
-- 3. Packs com sessões oferecidas
-- ---------------------------------------------------------
alter table booking_packs add column if not exists bonus_sessions int not null default 0;
alter table booking_packs drop constraint if exists booking_packs_bonus_sessions_check;
alter table booking_packs add constraint booking_packs_bonus_sessions_check check (bonus_sessions >= 0);
alter table booking_packs add column if not exists bonus_service_ids uuid[] not null default '{}';
alter table client_packs add column if not exists bonus_of uuid references client_packs(id) on delete cascade;

create or replace function trg_client_pack_bonus() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_pack booking_packs%rowtype;
begin
  if new.status <> 'active' or new.bonus_of is not null or new.pack_id is null then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'active' then return new; end if;
  select * into v_pack from booking_packs where id = new.pack_id;
  if not found or coalesce(v_pack.bonus_sessions, 0) <= 0 then return new; end if;
  if exists (select 1 from client_packs where bonus_of = new.id) then return new; end if;

  insert into client_packs (brand_id, contact_id, pack_id, name, service_ids, sessions_total, price_paid, status, source, expires_at, purchased_at, bonus_of)
  values (new.brand_id, new.contact_id, null, 'Oferta: ' || new.name, coalesce(v_pack.bonus_service_ids, '{}'), v_pack.bonus_sessions, 0,
          'active', new.source, new.expires_at, coalesce(new.purchased_at, now()), new.id);
  return new;
end;
$$;
drop trigger if exists client_packs_bonus on client_packs;
create trigger client_packs_bonus
  after insert or update of status on client_packs
  for each row execute function trg_client_pack_bonus();

-- ---------------------------------------------------------
-- 4. Pós-visita por número de visita
-- ---------------------------------------------------------
-- visit_numbers: null = todas as visitas; {1,10,30} = só na 1.ª, 10.ª e 30.ª.
-- visit_messages: { "1": "texto", "10": "texto" } — sem texto próprio usa message_template.
alter table booking_reminder_settings add column if not exists visit_numbers int[];
alter table booking_reminder_settings add column if not exists visit_messages jsonb not null default '{}'::jsonb;

-- ---------------------------------------------------------
-- 5. GoHighLevel (importar marcações)
-- ---------------------------------------------------------
create table if not exists brand_ghl_accounts (
  brand_id uuid primary key references brands(id) on delete cascade,
  location_id text not null,
  token_ref uuid,                          -- Private Integration token no Vault
  last_import_at timestamptz,
  last_import_stats jsonb,
  connected_at timestamptz default now()
);
alter table brand_ghl_accounts enable row level security;
drop policy if exists brand_ghl_accounts_select on brand_ghl_accounts;
create policy brand_ghl_accounts_select on brand_ghl_accounts for select using (can_manage_brand(brand_id));
-- Sem insert/update/delete pelo browser: só a função ghl-sync (service role).

-- Contacto do GoHighLevel → ficha do CRM (para não voltar a pedir o mesmo
-- contacto à API em cada importação).
create table if not exists ghl_contact_map (
  brand_id uuid references brands(id) on delete cascade not null,
  ghl_contact_id text not null,
  contact_id uuid references contacts(id) on delete cascade not null,
  primary key (brand_id, ghl_contact_id)
);
alter table ghl_contact_map enable row level security;
drop policy if exists ghl_contact_map_select on ghl_contact_map;
create policy ghl_contact_map_select on ghl_contact_map for select using (can_manage_brand(brand_id));

alter table booking_appointments add column if not exists external_source text;
alter table booking_appointments add column if not exists external_id text;
create unique index if not exists idx_booking_appointments_external
  on booking_appointments(brand_id, external_source, external_id)
  where external_id is not null;

-- ---------------------------------------------------------
-- 6. Página pública (substitui a versão do 75): opções dos serviços,
--    upsells da lista com descrição, packs com oferta.
-- ---------------------------------------------------------
create or replace function booking_public_page(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  b brands%rowtype;
begin
  select * into b from brands where booking_slug = p_slug;
  if not found then return null; end if;

  return jsonb_build_object(
    'brand', jsonb_build_object(
      'id', b.id, 'name', b.name, 'slug', b.booking_slug, 'logo_url', b.logo_url,
      'style', coalesce(b.booking_style, '{}'::jsonb), 'client_app_enabled', coalesce(b.client_app_enabled, false)
    ),
    'services', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name, 'description', s.description, 'category', s.category,
        'price', s.price, 'price_max', s.price_max, 'duration_minutes', s.duration_minutes,
        'option_groups', coalesce(s.option_groups, '[]'::jsonb),
        'staff_ids', coalesce((
          select jsonb_agg(ss.staff_id) from booking_service_staff ss
          join booking_staff st on st.id = ss.staff_id and st.status = 'active'
          where ss.service_id = s.id
        ), '[]'::jsonb)
      ) order by s.sort_order, s.created_at), '[]'::jsonb)
      from booking_services s where s.brand_id = b.id and s.status = 'active'
    ),
    'staff', (
      select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'photo_url', photo_url) order by created_at), '[]'::jsonb)
      from booking_staff where brand_id = b.id and status = 'active'
    ),
    'upsells', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', u.id, 'service_id', l.service_id, 'name', u.name, 'description', u.description,
        'price', u.price, 'extra_duration_minutes', u.extra_duration_minutes
      ) order by u.created_at), '[]'::jsonb)
      from booking_service_upsell_links l
      join booking_upsells u on u.id = l.upsell_id and u.status = 'active'
      join booking_services s on s.id = l.service_id and s.status = 'active'
      where l.brand_id = b.id
    ),
    'packs', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'name', name, 'description', description, 'price', price, 'sessions_count', sessions_count,
        'service_ids', service_ids, 'validity_days', validity_days,
        'bonus_sessions', coalesce(bonus_sessions, 0), 'bonus_service_ids', coalesce(bonus_service_ids, '{}')
      ) order by price), '[]'::jsonb)
      from booking_packs where brand_id = b.id and status = 'active'
    ),
    'online_payments', exists (select 1 from brand_stripe_accounts where brand_id = b.id),
    'deposit', (
      select jsonb_build_object('enabled', coalesce(enabled, false), 'percentage', percentage, 'scope', scope)
      from booking_payment_settings where brand_id = b.id
    )
  );
end;
$$;
grant execute on function booking_public_page(text) to anon, authenticated;
