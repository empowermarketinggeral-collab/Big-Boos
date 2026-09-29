-- =========================================================
-- EMPOWER OS — APP DAS CLIENTES, PARTE 2: CATEGORIAS DE SERVIÇOS,
-- NOTAS DE CUIDADO, RECOMENDAÇÕES, NOTIFICAÇÕES E ELIMINAR CONTA
-- =========================================================
-- Corre isto depois do 72_client_app_packs.sql. Pode correr-se uma vez.
--
-- 1. booking_services: categoria (ex: Cabelo, Mãos), preço máximo
--    (serviços "de 25 € a 44 €"), ordem e recomendações de cuidado
--    (o que a cliente deve fazer depois; aparece no histórico dela).
-- 2. contact_care_notes: alergias, sensibilidades e contraindicações.
--    A equipa escreve team_text; a cliente escreve client_text na app
--    (client_portal_save_note). A cliente nunca altera o texto da equipa.
-- 3. client_portal_set_consent: a cliente liga/desliga WhatsApp, SMS e
--    email (opted_in_*), que é o que as campanhas e aniversários usam.
-- 4. client_portal_delete_account: a cliente apaga a conta de acesso.
--    A ficha e o histórico ficam na marca (registo do negócio).
-- 5. client_portal_data e booking_public_page passam a devolver isto.
-- =========================================================

-- ---------------------------------------------------------
-- 1. Serviços
-- ---------------------------------------------------------
alter table booking_services add column if not exists category text;
alter table booking_services add column if not exists price_max numeric;
alter table booking_services add column if not exists sort_order int default 0;
alter table booking_services add column if not exists care_recommendations text;

-- ---------------------------------------------------------
-- 2. Notas de cuidado
-- ---------------------------------------------------------
create table if not exists contact_care_notes (
  contact_id uuid references contacts(id) on delete cascade not null,
  brand_id uuid references brands(id) on delete cascade not null,
  category text not null check (category in ('allergies', 'sensitivities', 'contraindications')),
  team_text text,
  client_text text,
  updated_at timestamptz default now(),
  primary key (contact_id, category)
);
create index if not exists idx_contact_care_notes_brand on contact_care_notes(brand_id);

alter table contact_care_notes enable row level security;
drop policy if exists contact_care_notes_all on contact_care_notes;
create policy contact_care_notes_all on contact_care_notes for all using (is_brand_member(brand_id)) with check (is_brand_member(brand_id));

create or replace function client_portal_save_note(p_brand uuid, p_category text, p_text text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_contact uuid;
begin
  select contact_id into v_contact from client_accounts where user_id = auth.uid() and brand_id = p_brand;
  if v_contact is null then raise exception 'not_linked'; end if;
  if p_category not in ('allergies', 'sensitivities', 'contraindications') then raise exception 'invalid_category'; end if;

  insert into contact_care_notes (contact_id, brand_id, category, client_text, updated_at)
  values (v_contact, p_brand, p_category, nullif(left(trim(coalesce(p_text, '')), 2000), ''), now())
  on conflict (contact_id, category) do update
    set client_text = excluded.client_text, updated_at = now();
end;
$$;
revoke all on function client_portal_save_note(uuid, text, text) from public, anon;
grant execute on function client_portal_save_note(uuid, text, text) to authenticated;

-- ---------------------------------------------------------
-- 3. Notificações (consentimento)
-- ---------------------------------------------------------
create or replace function client_portal_set_consent(p_brand uuid, p_whatsapp boolean, p_sms boolean, p_email boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_contact uuid;
begin
  select contact_id into v_contact from client_accounts where user_id = auth.uid() and brand_id = p_brand;
  if v_contact is null then raise exception 'not_linked'; end if;
  update contacts
     set opted_in_whatsapp = coalesce(p_whatsapp, opted_in_whatsapp),
         opted_in_sms = coalesce(p_sms, opted_in_sms),
         opted_in_email = coalesce(p_email, opted_in_email)
   where id = v_contact and brand_id = p_brand;
end;
$$;
revoke all on function client_portal_set_consent(uuid, boolean, boolean, boolean) from public, anon;
grant execute on function client_portal_set_consent(uuid, boolean, boolean, boolean) to authenticated;

-- ---------------------------------------------------------
-- 4. Eliminar conta (só a conta de acesso da própria cliente)
-- ---------------------------------------------------------
create or replace function client_portal_delete_account() returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if exists (select 1 from profiles where id = v_uid) then raise exception 'team_account'; end if;
  if not exists (select 1 from client_accounts where user_id = v_uid) then raise exception 'not_linked'; end if;
  delete from client_accounts where user_id = v_uid;
  delete from auth.users where id = v_uid;
end;
$$;
revoke all on function client_portal_delete_account() from public, anon;
grant execute on function client_portal_delete_account() to authenticated;

-- ---------------------------------------------------------
-- 5a. Dados da app (substitui a versão do 72)
-- ---------------------------------------------------------
create or replace function client_portal_data(p_brand uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_contact uuid;
begin
  select contact_id into v_contact from client_accounts where user_id = auth.uid() and brand_id = p_brand;
  if v_contact is null then return null; end if;

  return jsonb_build_object(
    'contact', (
      select jsonb_build_object(
        'id', id, 'name', name, 'email', email, 'phone', phone,
        'opted_in_whatsapp', coalesce(opted_in_whatsapp, false), 'opted_in_sms', coalesce(opted_in_sms, false), 'opted_in_email', coalesce(opted_in_email, false)
      ) from contacts where id = v_contact
    ),
    'appointments', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', a.id, 'starts_at', a.starts_at, 'ends_at', a.ends_at, 'status', a.status,
        'service_id', a.service_id, 'service', s.name, 'category', s.category, 'staff', st.name, 'total_price', a.total_price,
        'deposit_status', a.deposit_status, 'deposit_amount', a.deposit_amount,
        'upsells', coalesce(a.selected_upsells, '[]'::jsonb), 'paid_with_pack', a.client_pack_id is not null
      ) order by a.starts_at desc), '[]'::jsonb)
      from booking_appointments a
      left join booking_services s on s.id = a.service_id
      left join booking_staff st on st.id = a.staff_id
      where a.brand_id = p_brand and a.contact_id = v_contact
        and not (a.status = 'cancelled' and a.deposit_status = 'failed')
    ),
    'packs', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'description', bp.description, 'service_ids', p.service_ids,
        'sessions_total', p.sessions_total, 'sessions_used', p.sessions_used,
        'expires_at', p.expires_at, 'purchased_at', coalesce(p.purchased_at, p.created_at)
      ) order by p.created_at desc), '[]'::jsonb)
      from client_packs p
      left join booking_packs bp on bp.id = p.pack_id
      where p.brand_id = p_brand and p.contact_id = v_contact and p.status = 'active'
    ),
    'careNotes', (
      select coalesce(jsonb_agg(jsonb_build_object('category', category, 'team_text', team_text, 'client_text', client_text)), '[]'::jsonb)
      from contact_care_notes where contact_id = v_contact and brand_id = p_brand
    ),
    -- Recomendações dos serviços que ela já fez (um por serviço).
    'recommendations', (
      select coalesce(jsonb_agg(jsonb_build_object('service', r.name, 'text', r.care_recommendations, 'last_at', r.last_at) order by r.last_at desc), '[]'::jsonb)
      from (
        select s.name, s.care_recommendations, max(a.starts_at) as last_at
        from booking_appointments a
        join booking_services s on s.id = a.service_id
        where a.brand_id = p_brand and a.contact_id = v_contact
          and a.status in ('completed', 'confirmed') and a.starts_at < now()
          and nullif(trim(coalesce(s.care_recommendations, '')), '') is not null
        group by s.name, s.care_recommendations
      ) r
    ),
    'isNewCustomer', not exists (
      select 1 from booking_appointments
      where brand_id = p_brand and contact_id = v_contact and status in ('confirmed', 'completed')
    )
  );
end;
$$;
revoke all on function client_portal_data(uuid) from public, anon;
grant execute on function client_portal_data(uuid) to authenticated;

-- ---------------------------------------------------------
-- 5b. Página pública (substitui a versão do 72): serviços com
-- categoria, preço máximo e ordem.
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
        'id', id, 'name', name, 'description', description, 'category', category,
        'price', price, 'price_max', price_max, 'duration_minutes', duration_minutes
      ) order by sort_order, created_at), '[]'::jsonb)
      from booking_services where brand_id = b.id and status = 'active'
    ),
    'staff', (
      select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'photo_url', photo_url) order by created_at), '[]'::jsonb)
      from booking_staff where brand_id = b.id and status = 'active'
    ),
    'upsells', (
      select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'service_id', u.service_id, 'name', u.name, 'price', u.price, 'extra_duration_minutes', u.extra_duration_minutes) order by u.created_at), '[]'::jsonb)
      from booking_service_upsells u join booking_services s on s.id = u.service_id
      where u.brand_id = b.id and s.status = 'active'
    ),
    'packs', (
      select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'description', description, 'price', price, 'sessions_count', sessions_count, 'service_ids', service_ids, 'validity_days', validity_days) order by price), '[]'::jsonb)
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
