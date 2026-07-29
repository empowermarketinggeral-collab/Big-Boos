-- =========================================================
-- BIG BOSS — CONTEÚDOS: MÚLTIPLAS REDES SOCIAIS POR POST
-- =========================================================
-- Corre isto depois do 06_schema_adjustments.sql.
--
-- Um conteúdo pode sair em mais do que uma rede social ao mesmo
-- tempo (ex: Instagram + Facebook). Troca "platform" de texto único
-- para uma lista de textos.
-- =========================================================

alter table contents drop constraint if exists contents_platform_check;

alter table contents
  alter column platform type text[] using case when platform is null then '{}'::text[] else array[platform] end;

alter table contents alter column platform set default '{}';
alter table contents alter column platform set not null;

alter table contents add constraint contents_platform_check
  check (platform <@ array['instagram', 'facebook', 'tiktok', 'linkedin', 'threads']::text[]);
