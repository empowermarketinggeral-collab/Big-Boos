-- =========================================================
-- BIG BOSS — LEITURA/LISTAGEM NOS BUCKETS DE STORAGE
-- =========================================================
-- Corre isto depois do 08_storage_policies.sql.
--
-- O bucket "público" só deixa descarregar um ficheiro se souberes o
-- URL exato — listar o conteúdo de uma pasta (storage.list) passa
-- sempre pelas regras de RLS de storage.objects, tal como o upload.
-- Sem isto, o upload funciona mas a app não consegue confirmar/listar
-- o que lá está.
-- =========================================================

do $$
declare
  bucket text;
begin
  foreach bucket in array array['brand-logos', 'content-media', 'portfolio-media', 'link-media']
  loop
    execute format('drop policy if exists %I on storage.objects', bucket || '_select');
    execute format(
      'create policy %I on storage.objects for select to anon, authenticated using (bucket_id = %L)',
      bucket || '_select', bucket
    );
  end loop;
end $$;
