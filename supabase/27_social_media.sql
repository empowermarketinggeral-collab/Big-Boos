-- =========================================================
-- EMPOWER OS — SOCIAL MEDIA
-- =========================================================
-- Corre isto depois do 26_funnels_landing_pages.sql.
-- RASCUNHO PARA REVISÃO — Fase 1 (modelo de dados).
--
-- Estende social_accounts (já existe desde 01_schema.sql, hoje sem
-- nenhuma lógica associada). status='manual_only' em social_posts
-- existe deliberadamente para plataformas sem publicação direta por
-- API oficial (TikTok/LinkedIn hoje) — nunca simular uma publicação
-- que não aconteceu de verdade (ver secção 16 do documento de
-- arquitetura).
--
-- Agendamento + publicação automática: mesma arquitetura do motor de
-- automações (23_automations.sql) — um Edge Function "social-publish"
-- agendado por pg_cron (ex: a cada minuto) procura social_posts com
-- status='scheduled' e scheduled_at <= now(), chama a API oficial da
-- plataforma (Meta Graph API para IG/FB, YouTube Data API v3), e
-- atualiza para 'published' (com platform_post_id) ou 'failed' (com
-- failure_reason). Só entra em 'scheduled' depois de approval_status
-- = 'approved' quando a marca exige aprovação do cliente. Plataformas
-- sem API de publicação direta nunca passam por 'scheduled' — ficam
-- 'manual_only' e o utilizador publica-as manualmente fora do sistema.
-- =========================================================

alter table social_accounts add column if not exists external_account_id text;
alter table social_accounts add column if not exists display_name text;

create table social_posts (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade not null,
  social_account_id uuid references social_accounts(id) on delete cascade not null,
  caption text,
  media_urls text[] default '{}',
  scheduled_at timestamptz,
  published_at timestamptz,
  platform_post_id text,
  status text default 'draft' check (status in (
    'draft','pending_approval','scheduled','publishing','published','failed','manual_only'
  )),
  approval_status text default 'pending' check (approval_status in ('pending','approved','rejected')),
  failure_reason text,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);
create index idx_social_posts_brand_scheduled on social_posts(brand_id, scheduled_at);
-- Índice usado diretamente pelo Edge Function "social-publish" para
-- encontrar rapidamente os posts agendados que já podem ser publicados.
create index idx_social_posts_due on social_posts(scheduled_at) where status = 'scheduled';

create table social_post_metrics (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade not null,
  social_post_id uuid references social_posts(id) on delete cascade not null,
  reach int,
  impressions int,
  likes int,
  comments int,
  shares int,
  saves int,
  captured_at timestamptz default now()
);
create index idx_social_post_metrics_post on social_post_metrics(social_post_id, captured_at desc);

-- ---------------------------------------------------------
-- RLS
-- ---------------------------------------------------------
alter table social_posts enable row level security;
create policy social_posts_all on social_posts for all using (is_brand_member(brand_id)) with check (is_brand_member(brand_id));

alter table social_post_metrics enable row level security;
create policy social_post_metrics_all on social_post_metrics for all using (is_brand_member(brand_id)) with check (is_brand_member(brand_id));
