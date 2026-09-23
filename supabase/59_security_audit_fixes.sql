-- =========================================================
-- EMPOWER OS — CORREÇÕES DA AUDITORIA DE SEGURANÇA
-- =========================================================
-- Corre isto depois do 58_agency_plan_limits.sql. Cada secção é
-- independente — se alguma falhar por já ter sido corrida antes,
-- as restantes continuam a aplicar-se.
--
-- =========================================================
-- 1. CRÍTICO — auto-promoção a admin_geral
-- =========================================================
-- A política "profiles_update_self" (02_rls_policies.sql) deixava
-- QUALQUER conta autenticada mudar o seu próprio role/agency_id/
-- brand_ids, porque não tinha WITH CHECK nenhum — bastava um UPDATE
-- direto (ex: via API) a pôr role='admin_geral' para ganhar acesso
-- total à plataforma. Isto corrige com um trigger que bloqueia
-- mudanças a essas 3 colunas quando é a própria pessoa a editar-se
-- (edições feitas por um admin a OUTRA pessoa continuam a funcionar
-- normalmente, via profiles_manage).
-- =========================================================

create or replace function prevent_self_privilege_escalation() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() = old.id then
    if new.role is distinct from old.role
       or new.agency_id is distinct from old.agency_id
       or new.brand_ids is distinct from old.brand_ids then
      raise exception 'Não podes alterar o teu próprio papel, agência ou marcas associadas.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_self_privilege_escalation on profiles;
create trigger trg_prevent_self_privilege_escalation before update on profiles
  for each row execute function prevent_self_privilege_escalation();

-- Defesa em profundidade: torna o WITH CHECK explícito também na
-- própria política (o trigger acima já bloqueia sozinho, isto é só
-- para não depender só de uma peça).
drop policy if exists profiles_update_self on profiles;
create policy profiles_update_self on profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

-- =========================================================
-- 2. Storage — upload/edição/eliminação de ficheiros só pelo dono
-- =========================================================
-- Antes: qualquer conta autenticada podia enviar/substituir/apagar
-- ficheiros em QUALQUER pasta de marca/agência/reunião/deck nestes
-- buckets — só o bucket_id era verificado. Agora confirma que o
-- primeiro segmento do caminho (ex: "<brandId>/logo.png") pertence
-- mesmo a uma marca/agência que a pessoa consegue gerir.
-- =========================================================

create or replace function storage_path_owner_id(object_name text) returns uuid
language plpgsql immutable as $$
declare
  v_id uuid;
begin
  v_id := split_part(object_name, '/', 1)::uuid;
  return v_id;
exception when others then
  return null;
end;
$$;

-- brand-logos / content-media: primeiro segmento é sempre um brand_id.
do $$
declare
  bucket text;
begin
  foreach bucket in array array['brand-logos', 'content-media']
  loop
    execute format('drop policy if exists %I on storage.objects', bucket || '_insert');
    execute format('drop policy if exists %I on storage.objects', bucket || '_update');
    execute format('drop policy if exists %I on storage.objects', bucket || '_delete');
    execute format(
      'create policy %I on storage.objects for insert to authenticated with check (bucket_id = %L and can_manage_brand(storage_path_owner_id(name)))',
      bucket || '_insert', bucket
    );
    execute format(
      'create policy %I on storage.objects for update to authenticated using (bucket_id = %L and can_manage_brand(storage_path_owner_id(name))) with check (bucket_id = %L and can_manage_brand(storage_path_owner_id(name)))',
      bucket || '_update', bucket, bucket
    );
    execute format(
      'create policy %I on storage.objects for delete to authenticated using (bucket_id = %L and can_manage_brand(storage_path_owner_id(name)))',
      bucket || '_delete', bucket
    );
  end loop;
end $$;

-- portfolio-media: primeiro segmento é o id de um "deck" (presentations.id), agência dona = presentations.agency_id.
drop policy if exists "portfolio-media_insert" on storage.objects;
drop policy if exists "portfolio-media_update" on storage.objects;
drop policy if exists "portfolio-media_delete" on storage.objects;
create policy "portfolio-media_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'portfolio-media' and exists (select 1 from presentations p where p.id = storage_path_owner_id(name) and can_manage_agency(p.agency_id)));
create policy "portfolio-media_update" on storage.objects for update to authenticated
  using (bucket_id = 'portfolio-media' and exists (select 1 from presentations p where p.id = storage_path_owner_id(name) and can_manage_agency(p.agency_id)))
  with check (bucket_id = 'portfolio-media' and exists (select 1 from presentations p where p.id = storage_path_owner_id(name) and can_manage_agency(p.agency_id)));
create policy "portfolio-media_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'portfolio-media' and exists (select 1 from presentations p where p.id = storage_path_owner_id(name) and can_manage_agency(p.agency_id)));

-- meeting-files: primeiro segmento é o id de uma reunião (meetings.id), agência dona = meetings.agency_id.
drop policy if exists meeting_files_insert on storage.objects;
drop policy if exists meeting_files_update on storage.objects;
drop policy if exists meeting_files_delete on storage.objects;
create policy meeting_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'meeting-files' and exists (select 1 from meetings m where m.id = storage_path_owner_id(name) and can_manage_agency(m.agency_id)));
create policy meeting_files_update on storage.objects for update to authenticated
  using (bucket_id = 'meeting-files' and exists (select 1 from meetings m where m.id = storage_path_owner_id(name) and can_manage_agency(m.agency_id)))
  with check (bucket_id = 'meeting-files' and exists (select 1 from meetings m where m.id = storage_path_owner_id(name) and can_manage_agency(m.agency_id)));
create policy meeting_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'meeting-files' and exists (select 1 from meetings m where m.id = storage_path_owner_id(name) and can_manage_agency(m.agency_id)));

-- link-media: primeiro segmento pode ser um brand_id, um agency_id OU
-- o próprio utilizador (link_pages.owner_type = 'user') — aceita
-- qualquer um dos três, tal como a tabela link_pages já permite.
drop policy if exists "link-media_insert" on storage.objects;
drop policy if exists "link-media_update" on storage.objects;
drop policy if exists "link-media_delete" on storage.objects;
create policy "link-media_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'link-media' and (storage_path_owner_id(name) = auth.uid() or can_manage_brand(storage_path_owner_id(name)) or can_manage_agency(storage_path_owner_id(name))));
create policy "link-media_update" on storage.objects for update to authenticated
  using (bucket_id = 'link-media' and (storage_path_owner_id(name) = auth.uid() or can_manage_brand(storage_path_owner_id(name)) or can_manage_agency(storage_path_owner_id(name))))
  with check (bucket_id = 'link-media' and (storage_path_owner_id(name) = auth.uid() or can_manage_brand(storage_path_owner_id(name)) or can_manage_agency(storage_path_owner_id(name))));
create policy "link-media_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'link-media' and (storage_path_owner_id(name) = auth.uid() or can_manage_brand(storage_path_owner_id(name)) or can_manage_agency(storage_path_owner_id(name))));

-- =========================================================
-- 3. Decks de portfólio pendentes/rejeitados deixam de ser públicos
-- =========================================================
-- presentations_public_read usava "using (true)" — qualquer deck
-- (mesmo em rascunho) ficava legível por slug. Alinha com o mesmo
-- padrão já usado em proposals_public_read (só o que está pronto a
-- mostrar externamente).
-- =========================================================

drop policy if exists presentations_public_read on presentations;
create policy presentations_public_read on presentations for select
  to anon
  using (approval_status = 'approved');

-- link_pages_public_read mantém-se "using (true)" de propósito — uma
-- página de Link na Bio é sempre pública assim que criada (é o
-- próprio produto, como uma Linktree), não tem noção de rascunho.

-- =========================================================
-- 4. messaging_usage_daily — cliente só lê, nunca escreve
-- =========================================================
-- Só a Edge Function twilio-usage-sync (service role) deve escrever
-- aqui. Deixar is_brand_member escrever significava que o próprio
-- cliente podia editar/apagar os registos de gasto que a agência usa
-- para detetar excesso de utilização.
-- =========================================================

drop policy if exists messaging_usage_daily_all on messaging_usage_daily;
create policy messaging_usage_daily_select on messaging_usage_daily for select using (is_brand_member(brand_id));

-- =========================================================
-- 5. search_path fixo em todas as funções SECURITY DEFINER
-- =========================================================
-- Sem "set search_path", uma função SECURITY DEFINER com referências
-- a tabelas sem prefixo de esquema pode, em teoria, ser enganada para
-- chamar um objeto com o mesmo nome mas de outro esquema. Todas as
-- funções abaixo já existem — isto só acrescenta o search_path fixo,
-- sem mudar o comportamento nenhum.
-- =========================================================

create or replace function my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid()
$$;

create or replace function my_agency() returns uuid
language sql stable security definer set search_path = public as $$
  select agency_id from profiles where id = auth.uid()
$$;

create or replace function my_brand_ids() returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(brand_ids, '{}') from profiles where id = auth.uid()
$$;

create or replace function is_root_agency(target_agency uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_root from agencies where id = target_agency), false)
$$;

create or replace function brand_agency(target_brand uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select agency_id from brands where id = target_brand
$$;

create or replace function can_manage_agency(target_agency uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select
    my_role() = 'admin_geral'
    or (my_role() = 'membro' and is_root_agency(target_agency))
    or (my_role() in ('agencia_admin','agencia_membro') and target_agency = my_agency())
$$;

create or replace function can_manage_brand(target_brand uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select can_manage_agency(brand_agency(target_brand))
$$;

create or replace function is_approver_of(target_brand uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select my_role() in ('aprovador_marca','agencia_aprovador') and target_brand = any(my_brand_ids())
$$;

create or replace function is_brand_member(target_brand uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select can_manage_brand(target_brand) or is_approver_of(target_brand)
$$;

create or replace function vault_upsert_secret(p_name text, p_secret text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  select id into v_id from vault.secrets where name = p_name;
  if v_id is null then
    v_id := vault.create_secret(p_secret, p_name);
  else
    perform vault.update_secret(v_id, p_secret);
  end if;
  return v_id;
end;
$$;

create or replace function vault_read_secret(p_id uuid) returns text
language sql stable security definer set search_path = public as $$
  select decrypted_secret from vault.decrypted_secrets where id = p_id
$$;

revoke all on function vault_upsert_secret(text, text) from public, authenticated, anon;
revoke all on function vault_read_secret(uuid) from public, authenticated, anon;

-- As 5 funções abaixo (start_automation_run + 4 triggers) são cópia
-- exata de 34_forms_and_trigger_filters.sql — a ÚNICA mudança é
-- acrescentar "set search_path = public"; a lógica interna (incluindo
-- o filtro trigger_config->>'tagId'/'formId') fica byte-a-byte igual,
-- para não alterar nenhum comportamento das automações já em uso.

create or replace function start_automation_run(p_automation_id uuid, p_brand_id uuid, p_contact_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into automation_runs (brand_id, automation_id, contact_id, current_step_id, status, next_run_at)
  values (p_brand_id, p_automation_id, p_contact_id, null, 'waiting', now());
end;
$$;

create or replace function trg_contact_created() returns trigger
language plpgsql security definer set search_path = public as $$
declare auto record;
begin
  for auto in
    select id from automations
    where brand_id = new.brand_id and trigger_type = 'contact_created' and status = 'active'
  loop
    perform start_automation_run(auto.id, new.brand_id, new.id);
  end loop;
  return new;
end;
$$;

create or replace function trg_contact_tagged() returns trigger
language plpgsql security definer set search_path = public as $$
declare auto record;
begin
  for auto in
    select id from automations
    where brand_id = new.brand_id and trigger_type = 'contact_tagged' and status = 'active'
      and (trigger_config->>'tagId' is null or (trigger_config->>'tagId')::uuid = new.tag_id)
  loop
    perform start_automation_run(auto.id, new.brand_id, new.contact_id);
  end loop;
  return new;
end;
$$;

create or replace function trg_whatsapp_message_received() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_contact_id uuid;
  auto record;
begin
  if new.direction = 'inbound' then
    select contact_id into v_contact_id from whatsapp_conversations where id = new.conversation_id;
    for auto in
      select id from automations
      where brand_id = new.brand_id and trigger_type = 'whatsapp_message_received' and status = 'active'
    loop
      perform start_automation_run(auto.id, new.brand_id, v_contact_id);
    end loop;
  end if;
  return new;
end;
$$;

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
  auto record;
begin
  select * into v_form from forms where id = new.form_id;
  if v_form is null then
    return new;
  end if;

  for v_field in select * from jsonb_array_elements(coalesce(v_form.fields, '[]'::jsonb))
  loop
    if v_field->>'mapsTo' = 'name' then v_name := new.answers->>(v_field->>'id'); end if;
    if v_field->>'mapsTo' = 'email' then v_email := new.answers->>(v_field->>'id'); end if;
    if v_field->>'mapsTo' = 'phone' then v_phone := new.answers->>(v_field->>'id'); end if;
  end loop;

  if v_phone is not null and v_phone <> '' then
    select id into v_contact_id from contacts where brand_id = new.brand_id and phone = v_phone;
  end if;
  if v_contact_id is null and v_email is not null and v_email <> '' then
    select id into v_contact_id from contacts where brand_id = new.brand_id and lower(email) = lower(v_email);
  end if;

  if v_contact_id is null then
    insert into contacts (brand_id, name, email, phone, source)
    values (new.brand_id, coalesce(nullif(v_name, ''), 'Sem nome'), nullif(v_email, ''), nullif(v_phone, ''), 'formulario')
    returning id into v_contact_id;
  end if;

  update form_submissions set contact_id = v_contact_id where id = new.id;

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
