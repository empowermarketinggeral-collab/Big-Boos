-- =========================================================
-- EMPOWER OS — SERVIÇOS POR PROFISSIONAL, CLIENTES ANTIGAS SEM SINAL
-- E LIGAÇÃO DA CONTA PELO TELEMÓVEL (CÓDIGO POR SMS)
-- =========================================================
-- Corre isto depois do 74_dreams_studio_setup.sql. Pode correr-se uma vez.
--
-- 1. booking_service_staff: que profissionais fazem cada serviço. Um
--    serviço sem ninguém escolhido pode ser feito por qualquer uma.
-- 2. booking_payment_settings.exempt_tag_id: contactos com esta tag
--    (ex: "Cliente antiga") nunca pagam o sinal de cliente nova.
-- 3. A app liga a conta à ficha pelo email; se não houver email igual
--    mas o telemóvel indicado já estiver numa ficha, pede um código por
--    SMS (função client-phone-verify) antes de ligar. Nunca liga só
--    porque alguém escreveu o número.
-- 4. booking_public_page devolve os profissionais de cada serviço;
--    client_portal_data conta a tag de cliente antiga.
-- =========================================================

-- ---------------------------------------------------------
-- 1. Serviços por profissional
-- ---------------------------------------------------------
create table if not exists booking_service_staff (
  service_id uuid references booking_services(id) on delete cascade not null,
  staff_id uuid references booking_staff(id) on delete cascade not null,
  brand_id uuid references brands(id) on delete cascade not null,
  primary key (service_id, staff_id)
);
create index if not exists idx_booking_service_staff_staff on booking_service_staff(staff_id);

alter table booking_service_staff enable row level security;
drop policy if exists booking_service_staff_all on booking_service_staff;
create policy booking_service_staff_all on booking_service_staff for all using (is_brand_member(brand_id)) with check (is_brand_member(brand_id));

-- ---------------------------------------------------------
-- 2. Clientes antigas sem sinal
-- ---------------------------------------------------------
alter table booking_payment_settings add column if not exists exempt_tag_id uuid references tags(id) on delete set null;

-- Cliente "conhecida": já teve marcação confirmada/concluída, ou tem a
-- tag de isenção da marca.
create or replace function is_returning_customer(p_brand uuid, p_contact uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from booking_appointments
    where brand_id = p_brand and contact_id = p_contact and status in ('confirmed', 'completed')
  ) or exists (
    select 1 from contact_tags ct
    join booking_payment_settings ps on ps.brand_id = p_brand and ps.exempt_tag_id = ct.tag_id
    where ct.contact_id = p_contact
  );
$$;
revoke all on function is_returning_customer(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------
-- 3. Verificação do telemóvel (só a service role lê/escreve)
-- ---------------------------------------------------------
create table if not exists client_phone_verifications (
  user_id uuid references auth.users(id) on delete cascade not null,
  brand_id uuid references brands(id) on delete cascade not null,
  contact_id uuid references contacts(id) on delete cascade not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts int default 0,
  sends int default 1,
  last_sent_at timestamptz default now(),
  created_at timestamptz default now(),
  primary key (user_id, brand_id)
);
alter table client_phone_verifications enable row level security;
-- Sem policies: só a Edge Function (service role) mexe aqui.

-- Nova versão com p_skip_phone: a cliente pode seguir sem ligar à ficha
-- antiga (fica com uma ficha nova, sem esse telemóvel).
drop function if exists client_portal_link(uuid, text, text);
create or replace function client_portal_link(p_brand uuid, p_name text default null, p_phone text default null, p_skip_phone boolean default false) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_confirmed timestamptz;
  v_contact uuid;
  v_phone text;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select contact_id into v_contact from client_accounts where user_id = v_uid and brand_id = p_brand;
  if v_contact is not null then return v_contact; end if;

  if exists (select 1 from profiles where id = v_uid) then raise exception 'team_account'; end if;
  if not exists (select 1 from brands where id = p_brand and client_app_enabled) then raise exception 'app_disabled'; end if;

  select email, email_confirmed_at into v_email, v_confirmed from auth.users where id = v_uid;
  if v_email is null or v_confirmed is null then raise exception 'email_not_confirmed'; end if;

  select id into v_contact from contacts where brand_id = p_brand and lower(email) = lower(v_email) limit 1;

  if v_contact is null then
    v_phone := normalize_phone(p_phone);
    if v_phone is not null and exists (select 1 from contacts where brand_id = p_brand and phone = v_phone) then
      if not coalesce(p_skip_phone, false) then
        -- Já há uma ficha com este telemóvel: a app pede o código por SMS.
        raise exception 'phone_verification_required';
      end if;
      v_phone := null;
    end if;
    insert into contacts (brand_id, name, email, phone, source)
    values (p_brand, coalesce(nullif(trim(p_name), ''), split_part(v_email, '@', 1)), v_email, v_phone, 'app')
    returning id into v_contact;
  end if;

  if exists (select 1 from client_accounts where brand_id = p_brand and contact_id = v_contact) then
    raise exception 'contact_already_linked';
  end if;

  insert into client_accounts (user_id, brand_id, contact_id, email) values (v_uid, p_brand, v_contact, v_email);
  return v_contact;
end;
$$;
revoke all on function client_portal_link(uuid, text, text, boolean) from public, anon;
grant execute on function client_portal_link(uuid, text, text, boolean) to authenticated;

-- ---------------------------------------------------------
-- 4a. Dados da app (substitui a versão do 73: isNewCustomer conta a tag)
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
    'isNewCustomer', not is_returning_customer(p_brand, v_contact)
  );
end;
$$;
revoke all on function client_portal_data(uuid) from public, anon;
grant execute on function client_portal_data(uuid) to authenticated;

-- ---------------------------------------------------------
-- 4b. Página pública (substitui a versão do 73): staff_ids por serviço
-- (vazio = qualquer profissional).
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
