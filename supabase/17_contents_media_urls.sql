-- =========================================================
-- BIG BOSS — CONTEÚDOS: VÁRIOS FICHEIROS DE MÍDIA (imagem/vídeo/carrossel)
-- =========================================================
-- Corre isto depois do 16_link_pages_pill_style.sql.
--
-- `media_url` (singular) nunca teve interface para o preencher — não
-- havia forma de anexar imagem/vídeo a um post/reel/carrossel. Passa a
-- `media_urls` (array), para também suportar várias imagens no mesmo
-- carrossel. Mantém a coluna antiga por segurança, com backfill.
-- =========================================================

alter table contents add column if not exists media_urls text[] default '{}'::text[];

update contents
set media_urls = array[media_url]
where media_url is not null and (media_urls is null or media_urls = '{}');
