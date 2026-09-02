-- =========================================================
-- EMPOWER OS — FUNIS E LANDING PAGES
-- =========================================================
-- Corre isto depois do 25_email.sql.
-- RASCUNHO PARA REVISÃO — Fase 1 (modelo de dados).
--
-- Propositadamente NÃO mexe na tabela link_pages (é uma
-- funcionalidade já em produção da Big Boss, "Link na Bio").
-- Em vez disso, funnel_pages.blocks usa deliberadamente o MESMO
-- formato jsonb que link_pages.blocks, para que o frontend possa
-- reutilizar o motor de blocos/editor já construído, com um
-- vocabulário de blocos alargado (headline, testemunho, preços,
-- FAQ, formulário embutido) — sem duplicar o construtor de páginas.
-- =========================================================

create table funnels (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade not null,
  name text not null,
  created_at timestamptz default now()
);

create table funnel_pages (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade not null,
  funnel_id uuid references funnels(id) on delete cascade not null,
  position int not null,
  slug text unique not null,
  type text check (type in ('landing','thank_you','website')) default 'landing',
  blocks jsonb default '[]'::jsonb,
  seo jsonb default '{}'::jsonb,
  custom_domain text,
  status text default 'draft' check (status in ('draft','published')),
  created_at timestamptz default now()
);
create index idx_funnel_pages_funnel on funnel_pages(funnel_id, position);

create table funnel_events (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade not null,
  funnel_page_id uuid references funnel_pages(id) on delete cascade not null,
  contact_id uuid references contacts(id) on delete set null,
  type text check (type in ('view','submit','conversion')) not null,
  utm jsonb default '{}'::jsonb,
  occurred_at timestamptz default now()
);
create index idx_funnel_events_page on funnel_events(funnel_page_id, occurred_at desc);

-- ---------------------------------------------------------
-- RLS — mesmo padrão de leitura/escrita pública do link_pages
-- (03_public_access.sql) para as páginas publicadas, e do
-- form_submissions (24_forms.sql) para o tracking de eventos.
-- ---------------------------------------------------------
alter table funnels enable row level security;
create policy funnels_all on funnels for all using (is_brand_member(brand_id)) with check (is_brand_member(brand_id));

alter table funnel_pages enable row level security;
create policy funnel_pages_all on funnel_pages for all using (is_brand_member(brand_id)) with check (is_brand_member(brand_id));
create policy funnel_pages_public_read on funnel_pages for select to anon using (status = 'published');

alter table funnel_events enable row level security;
create policy funnel_events_team on funnel_events for select using (is_brand_member(brand_id));
create policy funnel_events_public_insert on funnel_events for insert to anon with check (
  exists (select 1 from funnel_pages fp where fp.id = funnel_events.funnel_page_id and fp.status = 'published')
);
