-- =========================================================
-- BIG BOSS — STORAGE PARA PDFs DE REUNIÕES
-- =========================================================
-- Antes de correr isto, cria o bucket "meeting-files" no painel do
-- Supabase (Storage → New bucket), marcado como público — mesmo
-- processo dos outros 4 buckets do README.
--
-- Corre isto depois de criares o bucket.
-- =========================================================

drop policy if exists meeting_files_insert on storage.objects;
drop policy if exists meeting_files_update on storage.objects;
drop policy if exists meeting_files_delete on storage.objects;
drop policy if exists meeting_files_select on storage.objects;

create policy meeting_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'meeting-files');
create policy meeting_files_update on storage.objects for update to authenticated
  using (bucket_id = 'meeting-files') with check (bucket_id = 'meeting-files');
create policy meeting_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'meeting-files');
create policy meeting_files_select on storage.objects for select to anon, authenticated
  using (bucket_id = 'meeting-files');
