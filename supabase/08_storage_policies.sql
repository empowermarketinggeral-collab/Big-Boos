-- =========================================================
-- BIG BOSS — REGRAS DE ACESSO AOS BUCKETS DE STORAGE
-- =========================================================
-- Corre isto depois de teres criado os 4 buckets (brand-logos,
-- content-media, portfolio-media, link-media) no painel do Supabase.
--
-- Marcar um bucket como "público" só permite LER ficheiros sem
-- login — continua a ser preciso autorizar quem pode ENVIAR
-- (insert), SUBSTITUIR (update) e APAGAR (delete) ficheiros, porque
-- isso passa sempre pelas regras de RLS de storage.objects.
--
-- Para já, qualquer conta autenticada (login válido na app) pode
-- enviar/substituir/apagar ficheiros nestes 4 buckets — o controlo
-- fino de "só a equipa pode fazer upload" já é feito no frontend
-- (os botões de upload só aparecem para quem tem papel de equipa).
-- Se mais tarde quiseres reforçar isto ao nível da base de dados,
-- dá para trocar "authenticated" por uma verificação a can_manage_brand
-- assumindo que o caminho do ficheiro começa sempre pelo brand_id.
-- =========================================================

do $$
declare
  bucket text;
begin
  foreach bucket in array array['brand-logos', 'content-media', 'portfolio-media', 'link-media']
  loop
    execute format('drop policy if exists %I on storage.objects', bucket || '_insert');
    execute format('drop policy if exists %I on storage.objects', bucket || '_update');
    execute format('drop policy if exists %I on storage.objects', bucket || '_delete');
    execute format(
      'create policy %I on storage.objects for insert to authenticated with check (bucket_id = %L)',
      bucket || '_insert', bucket
    );
    execute format(
      'create policy %I on storage.objects for update to authenticated using (bucket_id = %L) with check (bucket_id = %L)',
      bucket || '_update', bucket, bucket
    );
    execute format(
      'create policy %I on storage.objects for delete to authenticated using (bucket_id = %L)',
      bucket || '_delete', bucket
    );
  end loop;
end $$;
