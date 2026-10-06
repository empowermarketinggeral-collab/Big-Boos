-- =========================================================
-- HOTMART — várias contas Hotmart na mesma marca
-- =========================================================
-- Corre isto depois do 86 (e do 87). Pode correr-se mais do que uma vez.
-- Cada conta Hotmart tem o seu hottok. O endereço do webhook é o mesmo
-- para todas: a função hotmart-webhook aceita o pedido se o hottok
-- recebido for o de qualquer conta ligada à marca.
-- =========================================================

create table if not exists brand_hotmart_accounts (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade not null,
  label text not null check (length(trim(label)) between 1 and 60),
  hottok_ref uuid not null,                      -- segredo no Vault
  created_at timestamptz default now(),
  unique (brand_id, label)
);
alter table brand_hotmart_accounts enable row level security;
drop policy if exists brand_hotmart_accounts_read on brand_hotmart_accounts;
create policy brand_hotmart_accounts_read on brand_hotmart_accounts for select using (can_manage_brand(brand_id));
drop policy if exists brand_hotmart_accounts_delete on brand_hotmart_accounts;
create policy brand_hotmart_accounts_delete on brand_hotmart_accounts for delete using (can_manage_brand(brand_id));
revoke insert, update on brand_hotmart_accounts from authenticated, anon;

-- O hottok guardado pelo 86 passa a ser a "Conta principal".
insert into brand_hotmart_accounts (brand_id, label, hottok_ref)
select brand_id, 'Conta principal', hottok_ref
from brand_hotmart_settings
where hottok_ref is not null
on conflict (brand_id, label) do nothing;

-- Guarda (ou troca) o hottok de uma conta, identificada pelo nome.
create or replace function hotmart_save_account(p_brand_id uuid, p_label text, p_hottok text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_label text := trim(coalesce(p_label, ''));
  v_ref uuid;
begin
  if not can_manage_brand(p_brand_id) then raise exception 'Sem permissão.'; end if;
  if length(v_label) < 1 or length(v_label) > 60 then raise exception 'Dá um nome à conta (ex.: Patrícia).'; end if;
  if p_hottok is null or length(trim(p_hottok)) < 10 or length(p_hottok) > 300 then
    raise exception 'O hottok parece incompleto.';
  end if;
  v_ref := vault_upsert_secret('hotmart_hottok_' || p_brand_id::text || '_' || md5(lower(v_label)), trim(p_hottok));
  insert into brand_hotmart_accounts (brand_id, label, hottok_ref)
  values (p_brand_id, v_label, v_ref)
  on conflict (brand_id, label) do update set hottok_ref = excluded.hottok_ref;
  -- linha de definições (ligar/desligar, último evento)
  insert into brand_hotmart_settings (brand_id, enabled, connected_at)
  values (p_brand_id, true, now())
  on conflict (brand_id) do nothing;
end;
$$;
revoke all on function hotmart_save_account(uuid, text, text) from public, anon;
grant execute on function hotmart_save_account(uuid, text, text) to authenticated;
