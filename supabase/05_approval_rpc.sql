-- =========================================================
-- BIG BOSS — APROVAÇÃO SEGURA DE CONTEÚDOS E ROTEIROS
-- =========================================================
-- Corre isto depois do 04_seed.sql, no SQL Editor do Supabase.
--
-- Substitui o UPDATE direto de aprovadores (que technically permitia
-- alterar qualquer coluna da linha) por duas funções RPC "security
-- definer" que só tocam em approval_status/status + client_note —
-- exatamente a robustez recomendada no fim do 02_rls_policies.sql.
-- =========================================================

create or replace function approve_content(p_id uuid, p_status text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_brand_id uuid;
begin
  if p_status not in ('approved', 'rejected') then
    raise exception 'status inválido: %', p_status;
  end if;

  select brand_id into v_brand_id from contents where id = p_id;
  if v_brand_id is null then
    raise exception 'conteúdo não encontrado';
  end if;

  if not (can_manage_brand(v_brand_id) or is_approver_of(v_brand_id)) then
    raise exception 'sem permissão para aprovar este conteúdo';
  end if;

  update contents
     set approval_status = p_status,
         client_note = p_note
   where id = p_id;
end;
$$;

create or replace function approve_script(p_id uuid, p_status text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_brand_id uuid;
begin
  if p_status not in ('approved', 'rejected') then
    raise exception 'status inválido: %', p_status;
  end if;

  select brand_id into v_brand_id from scripts where id = p_id;
  if v_brand_id is null then
    raise exception 'roteiro não encontrado';
  end if;

  if not (can_manage_brand(v_brand_id) or is_approver_of(v_brand_id)) then
    raise exception 'sem permissão para aprovar este roteiro';
  end if;

  update scripts
     set status = p_status,
         client_note = p_note
   where id = p_id;
end;
$$;

grant execute on function approve_content(uuid, text, text) to authenticated;
grant execute on function approve_script(uuid, text, text) to authenticated;

-- ---------------------------------------------------------
-- Aperta as policies de UPDATE: aprovadores deixam de poder fazer
-- UPDATE direto a "contents"/"scripts" (só através das RPCs acima).
-- A equipa (can_manage_brand) mantém UPDATE total, incluindo editar
-- caption/media/scheduled_date, etc.
-- ---------------------------------------------------------
drop policy if exists contents_update on contents;
create policy contents_update on contents for update using (can_manage_brand(brand_id))
  with check (can_manage_brand(brand_id));

drop policy if exists scripts_update on scripts;
create policy scripts_update on scripts for update using (can_manage_brand(brand_id))
  with check (can_manage_brand(brand_id));
