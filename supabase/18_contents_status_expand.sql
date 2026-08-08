-- =========================================================
-- BIG BOSS — CONTEÚDOS: MAIS ESTADOS (agendado, publicado)
-- =========================================================
-- Corre isto depois do 17_contents_media_urls.sql.
--
-- Além de pending/approved/rejected (aprovação do cliente), a equipa
-- agora também marca o conteúdo como agendado ou já publicado.
-- =========================================================

alter table contents drop constraint if exists contents_approval_status_check;
alter table contents add constraint contents_approval_status_check
  check (approval_status in ('pending', 'approved', 'rejected', 'scheduled', 'published'));
