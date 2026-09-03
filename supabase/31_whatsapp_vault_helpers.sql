-- =========================================================
-- EMPOWER OS — HELPERS PARA O SUPABASE VAULT (segredos do WhatsApp)
-- =========================================================
-- Corre isto depois do 30_crm_pipeline_delete_cascade.sql.
-- RASCUNHO PARA REVISÃO — acompanha as Edge Functions em
-- supabase/functions/whatsapp-*.
--
-- O token de acesso do WhatsApp de cada marca nunca é guardado numa
-- coluna normal — vive encriptado no Supabase Vault. Estas duas
-- funções são a única forma de lá escrever/ler, e só podem ser
-- chamadas pela service role (usada dentro das Edge Functions,
-- nunca pelo frontend) — por isso o revoke explícito no fim.
-- =========================================================

create or replace function vault_upsert_secret(p_name text, p_secret text) returns uuid
language plpgsql security definer as $$
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
language sql security definer as $$
  select decrypted_secret from vault.decrypted_secrets where id = p_id
$$;

revoke all on function vault_upsert_secret(text, text) from public, authenticated, anon;
revoke all on function vault_read_secret(uuid) from public, authenticated, anon;
