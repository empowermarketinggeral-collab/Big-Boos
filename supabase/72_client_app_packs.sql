-- =========================================================
-- EMPOWER OS — APP DAS CLIENTES (ex: Dream Studio), PACKS DE
-- SESSÕES E STRIPE PRÓPRIO DE CADA MARCA
-- =========================================================
-- Corre isto depois do 71_invoice_links.sql. Pode correr-se uma vez.
--
-- 1. brands.client_app_enabled: liga a app /app/<booking_slug>.
-- 2. client_accounts: liga um utilizador do Supabase Auth (a cliente
--    final, sem linha em profiles) a um contacto do CRM de uma marca.
--    A ligação só é feita pela função client_portal_link, e só com o
--    email já confirmado. Clientes não leem tabelas diretamente:
--    tudo o que veem passa por client_portal_data.
-- 3. booking_packs (catálogo) e client_packs (packs comprados ou
--    atribuídos à mão). Cada marcação paga com pack gasta 1 sessão;
--    se a marcação for cancelada, a sessão volta ao pack.
-- 4. brand_stripe_accounts: chave Stripe da própria marca (no Vault).
--    Sinais e packs dessa marca passam a cair na conta dela.
-- 5. booking_public_page: a página /agendar/<slug> e a app leem os
--    serviços por aqui. Antes a página lia as tabelas diretamente e
--    as regras de acesso bloqueavam quem não tinha sessão iniciada.
-- 6. Marcações: estado "no_show" (faltou), origem e pack usado.
-- =========================================================

-- ---------------------------------------------------------
-- 1. Interruptor da app por marca
-- ---------------------------------------------------------
alter table brands add column if not exists client_app_enabled boolean default false;

-- ---------------------------------------------------------
-- Telefones no formato E.164 (+351…), igual ao lead-intake
-- ---------------------------------------------------------
create or replace function normalize_phone(p text, p_cc text default '351') returns text
language plpgsql immutable set search_path = public as $$
declare
  v text := regexp_replace(coalesce(p, ''), '[^0-9+]', '', 'g');
begin
  if v = '' then return null; end if;
  if left(v, 2) = '00' then v := '+' || substr(v, 3); end if;
  if left(v, 1) <> '+' then
    if length(v) = 9 then v := '+' || p_cc || v;
    elsif length(v) >= 10 then v := '+' || v;
    else return null;
    end if;
  end if;
  if substr(v, 2) !~ '^\d{8,15}$' then return null; end if;
  return v;
end;
$$;

-- ---------------------------------------------------------
-- 3. Packs
-- ---------------------------------------------------------
create table if not exists booking_packs (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade not null,
  name text not null,
  description text,
  price numeric not null check (price > 0),
  sessions_count int not null check (sessions_count > 0),
  service_ids uuid[] default '{}',          -- vazio = serve para qualquer serviço
  validity_days int check (validity_days is null or validity_days > 0),
  status text default 'active' check (status in ('active', 'archived')),
  created_at timestamptz default now()
);
create index if not exists idx_booking_packs_brand on booking_packs(brand_id);

create table if not exists client_packs (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade not null,
  contact_id uuid references contacts(id) on delete cascade not null,
  pack_id uuid references booking_packs(id) on delete set null,
  name text not null,                        -- cópia do nome no momento da compra
  service_ids uuid[] default '{}',
  sessions_total int not null check (sessions_total > 0),
  sessions_used int not null default 0 check (sessions_used >= 0),
  price_paid numeric,
  status text default 'active' check (status in ('pending_payment', 'active', 'cancelled')),
  source text default 'manual' check (source in ('app', 'manual')),
  expires_at timestamptz,
  purchased_at timestamptz,
  stripe_checkout_session_id text,
  created_at timestamptz default now()
);
create index if not exists idx_client_packs_contact on client_packs(brand_id, contact_id);

alter table booking_packs enable row level security;
drop policy if exists booking_packs_all on booking_packs;
create policy booking_packs_all on booking_packs for all using (is_brand_member(brand_id)) with check (is_brand_member(brand_id));

alter table client_packs enable row level security;
drop policy if exists client_packs_all on client_packs;
create policy client_packs_all on client_packs for all using (is_brand_member(brand_id)) with check (is_brand_member(brand_id));

-- ---------------------------------------------------------
-- 6. Marcações
-- ---------------------------------------------------------
alter table booking_appointments drop constraint if exists booking_appointments_status_check;
alter table booking_appointments add constraint booking_appointments_status_check
  check (status in ('confirmed', 'cancelled', 'completed', 'pending_payment', 'no_show'));

alter table booking_appointments add column if not exists client_pack_id uuid references client_packs(id) on delete set null;
alter table booking_appointments add column if not exists source text default 'online';
create index if not exists idx_booking_appointments_contact on booking_appointments(brand_id, contact_id, starts_at);

-- Gasta 1 sessão do pack, só se ainda houver, estiver ativo, dentro da
-- validade e servir para o serviço. Só a service role a chama
-- (booking-create), para ninguém gastar/forjar sessões pelo browser.
create or replace function client_pack_consume(p_pack uuid, p_service uuid) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  update client_packs
     set sessions_used = sessions_used + 1
   where id = p_pack
     and status = 'active'
     and sessions_used < sessions_total
     and (expires_at is null or expires_at > now())
     and (cardinality(coalesce(service_ids, '{}')) = 0 or p_service = any(service_ids));
  return found;
end;
$$;
revoke all on function client_pack_consume(uuid, uuid) from public, anon, authenticated;

-- Marcação paga com pack cancelada = a sessão volta ao pack.
create or replace function trg_booking_pack_refund() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.client_pack_id is not null
     and new.status = 'cancelled'
     and old.status in ('confirmed', 'pending_payment') then
    update client_packs set sessions_used = greatest(sessions_used - 1, 0) where id = new.client_pack_id;
  end if;
  return new;
end;
$$;
drop trigger if exists booking_appointments_pack_refund on booking_appointments;
create trigger booking_appointments_pack_refund
  after update of status on booking_appointments
  for each row execute function trg_booking_pack_refund();

-- ---------------------------------------------------------
-- 4. Stripe da própria marca
-- ---------------------------------------------------------
-- Escrita só pela função stripe-brand-connect (service role). A equipa
-- da agência vê se está ligada; as chaves ficam no Vault.
create table if not exists brand_stripe_accounts (
  brand_id uuid primary key references brands(id) on delete cascade,
  account_id text,
  account_name text,
  livemode boolean default false,
  secret_key_ref uuid,
  webhook_secret_ref uuid,
  webhook_endpoint_id text,
  connected_at timestamptz default now()
);
alter table brand_stripe_accounts enable row level security;
drop policy if exists brand_stripe_accounts_select on brand_stripe_accounts;
create policy brand_stripe_accounts_select on brand_stripe_accounts for select using (can_manage_brand(brand_id));

-- ---------------------------------------------------------
-- 2. Contas das clientes
-- ---------------------------------------------------------
create table if not exists client_accounts (
  user_id uuid references auth.users(id) on delete cascade not null,
  brand_id uuid references brands(id) on delete cascade not null,
  contact_id uuid references contacts(id) on delete cascade not null,
  email text,
  created_at timestamptz default now(),
  primary key (user_id, brand_id),
  unique (brand_id, contact_id)
);
alter table client_accounts enable row level security;
drop policy if exists client_accounts_select on client_accounts;
drop policy if exists client_accounts_update on client_accounts;
drop policy if exists client_accounts_delete on client_accounts;
create policy client_accounts_select on client_accounts for select using (user_id = auth.uid() or is_brand_member(brand_id));
-- A equipa da marca pode religar uma conta a outro contacto (ex: a
-- cliente criou conta com um email que não estava na ficha antiga).
create policy client_accounts_update on client_accounts for update using (is_brand_member(brand_id)) with check (is_brand_member(brand_id));
create policy client_accounts_delete on client_accounts for delete using (is_brand_member(brand_id));
-- Sem policy de insert: só a client_portal_link cria ligações.

-- Liga a conta com sessão iniciada à ficha da cliente nesta marca.
-- Procura o contacto pelo email (já confirmado no Auth); se não houver,
-- cria um contacto novo. Nunca liga por telefone: o telefone não foi
-- verificado e daria acesso ao histórico de outra pessoa.
create or replace function client_portal_link(p_brand uuid, p_name text default null, p_phone text default null) returns uuid
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
      v_phone := null; -- esse telefone já é de outra ficha; a equipa junta as duas se for a mesma pessoa
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
revoke all on function client_portal_link(uuid, text, text) from public, anon;
grant execute on function client_portal_link(uuid, text, text) to authenticated;

-- Tudo o que a cliente vê na app, só dela e só desta marca.
create or replace function client_portal_data(p_brand uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_contact uuid;
begin
  select contact_id into v_contact from client_accounts where user_id = auth.uid() and brand_id = p_brand;
  if v_contact is null then return null; end if;

  return jsonb_build_object(
    'contact', (select jsonb_build_object('id', id, 'name', name, 'email', email, 'phone', phone) from contacts where id = v_contact),
    'appointments', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', a.id, 'starts_at', a.starts_at, 'ends_at', a.ends_at, 'status', a.status,
        'service', s.name, 'staff', st.name, 'total_price', a.total_price,
        'deposit_status', a.deposit_status, 'deposit_amount', a.deposit_amount,
        'upsells', coalesce(a.selected_upsells, '[]'::jsonb), 'paid_with_pack', a.client_pack_id is not null
      ) order by a.starts_at desc), '[]'::jsonb)
      from booking_appointments a
      left join booking_services s on s.id = a.service_id
      left join booking_staff st on st.id = a.staff_id
      where a.brand_id = p_brand and a.contact_id = v_contact
        and not (a.status = 'cancelled' and a.deposit_status = 'failed') -- sinais abandonados
    ),
    'packs', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'service_ids', p.service_ids, 'sessions_total', p.sessions_total,
        'sessions_used', p.sessions_used, 'expires_at', p.expires_at, 'purchased_at', coalesce(p.purchased_at, p.created_at)
      ) order by p.created_at desc), '[]'::jsonb)
      from client_packs p
      where p.brand_id = p_brand and p.contact_id = v_contact and p.status = 'active'
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
-- 5. Dados públicos da página de marcação e da app
-- ---------------------------------------------------------
-- Só o que já é público (nome, serviços, preços, profissionais).
-- Nunca devolve marcações nem contactos.
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
      select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'description', description, 'price', price, 'duration_minutes', duration_minutes) order by created_at), '[]'::jsonb)
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
