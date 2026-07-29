-- =========================================================
-- BIG BOSS — AJUSTES DE SCHEMA (protótipo → produção)
-- =========================================================
-- Corre isto depois do 05_approval_rpc.sql.
--
-- O protótipo visual tinha campos que o schema original não previa:
-- um título curto por conteúdo (separado da legenda/caption), a
-- plataforma de destino (Instagram/Facebook/TikTok/...), e o tipo
-- "Carrossel" além de post/reel.
-- =========================================================

alter table contents add column if not exists title text;

alter table contents add column if not exists platform text
  check (platform in ('instagram', 'facebook', 'tiktok', 'linkedin', 'threads'));

alter table contents drop constraint if exists contents_type_check;
alter table contents add constraint contents_type_check
  check (type in ('post', 'reel', 'carrossel'));
