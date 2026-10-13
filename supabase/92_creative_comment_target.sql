-- 92 — Criativos: comentários numa imagem específica (também dentro de um carrossel).
-- target = caminho do ficheiro comentado (sempre da própria marca); null = comentário geral.
-- Pode correr-se mais do que uma vez.

alter table creative_comments add column if not exists target text;

alter table creative_comments drop constraint if exists creative_comments_target_check;
alter table creative_comments add constraint creative_comments_target_check
  check (target is null or (char_length(target) <= 500 and target like brand_id::text || '/%' and position('..' in target) = 0));
