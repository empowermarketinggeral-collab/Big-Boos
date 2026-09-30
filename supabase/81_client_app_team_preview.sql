-- =========================================================
-- EMPOWER OS — APP DAS CLIENTES: VISTA DE CLIENTE PARA A EQUIPA
-- =========================================================
-- Corre isto depois do 75_service_staff_returning_clients.sql. Pode correr-se
-- mais do que uma vez. Só substitui a função client_portal_link.
--
-- Até aqui, qualquer conta com linha em `profiles` (equipa da agência ou
-- aprovador da marca) era recusada na app das clientes ("Esta conta é da
-- equipa"). Agora quem tem acesso à marca (is_brand_member) pode entrar em
-- /app/<slug> e fica ligado, pelo email, a uma ficha própria no CRM — vê
-- exatamente o que uma cliente vê, sem código por SMS. Contas da equipa sem
-- acesso a esta marca continuam recusadas. Eliminar a conta pela app continua
-- bloqueado para contas da equipa (client_portal_delete_account).
-- =========================================================

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

  -- Contas da equipa só entram se tiverem acesso a esta marca (vista de cliente).
  if exists (select 1 from profiles where id = v_uid) and not is_brand_member(p_brand) then raise exception 'team_account'; end if;
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
