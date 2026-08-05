-- =========================================================
-- BIG BOSS — LINK NA BIO: ESTILO DAS PÍLULAS
-- =========================================================
-- Corre isto depois do 15_personal_tasks_week_of_month.sql.
--
-- Permite escolher a cor, o arredondamento e a sombra das pílulas
-- (blocos de link/vídeo/produto/podcast) de cada página de Link na Bio.
-- =========================================================

alter table link_pages add column if not exists pill_style jsonb default '{}'::jsonb;
