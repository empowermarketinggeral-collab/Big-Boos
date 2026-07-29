-- =========================================================
-- BIG BOSS — SCHEMA DA BASE DE DADOS (Supabase / Postgres)
-- =========================================================
-- Corre este ficheiro primeiro, no SQL Editor do Supabase.
-- Cria todas as tabelas, relações e valores por defeito.
-- =========================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------
-- 1. ORGANIZATION (a tua empresa — Biamelo, "root tenant")
-- ---------------------------------------------------------
create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  logo_url text,
  primary_color text default '#7C4DE0',
  created_at timestamptz default now()
);

-- ---------------------------------------------------------
-- 2. AGENCY (a tua agência e agências-clientes que revendem a plataforma)
-- ---------------------------------------------------------
create table agencies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  name text not null,
  logo_url text,
  primary_color text default '#7C4DE0',
  secondary_color text,
  font text,
  is_root boolean default false,               -- true para a Biamelo
  status text default 'active' check (status in ('active','suspended')),
  created_at timestamptz default now()
);

-- ---------------------------------------------------------
-- 3. PROFILES (perfil de utilizador — liga-se ao login do Supabase)
-- ---------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  email text,
  role text not null check (role in (
    'admin_geral','membro','aprovador_marca',
    'agencia_admin','agencia_membro','agencia_aprovador'
  )),
  agency_id uuid references agencies(id) on delete set null,
  brand_ids uuid[] default '{}',                -- usado quando role = aprovador
  avatar_url text,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------
-- 4. BRANDS (marcas)
-- ---------------------------------------------------------
create table brands (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid references agencies(id) on delete cascade not null,
  name text not null,
  logo_url text,
  goal text,
  category text check (category in (
    'salao','estetica','barbearia','clinica','restaurante','varejo','servicos','outro'
  )) default 'outro',
  status text default 'green' check (status in ('green','yellow','red')),
  contract_scope text,
  brand_book jsonb default '{}'::jsonb,          -- { colors, typography, visual_elements, strategic_guidelines }
  active_clients int,
  total_clients int,
  revenue numeric,
  average_ticket numeric,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------
-- 5. CONTENTS (posts / reels)
-- ---------------------------------------------------------
create table contents (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade not null,
  type text check (type in ('post','reel')) not null,
  caption text,
  media_url text,
  scheduled_date date,
  approval_status text default 'pending' check (approval_status in ('pending','approved','rejected')),
  client_note text,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

-- ---------------------------------------------------------
-- 6. STORY_WEEK_PLANS (cronograma de stories)
-- ---------------------------------------------------------
create table story_week_plans (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade not null,
  week_start_date date not null,
  objective text,
  days jsonb default '{}'::jsonb,               -- { segunda: [...], terca: [...], ... }
  created_at timestamptz default now()
);

-- ---------------------------------------------------------
-- 7. STORY_ANALYSES (checklist de análise por marca)
-- ---------------------------------------------------------
create table story_analyses (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade not null,
  format_answers jsonb default '{}'::jsonb,
  communication_answers jsonb default '{}'::jsonb,
  brand_moment text check (brand_moment in ('crescimento','construcao','expansao','inicio','reposicionamento')),
  opening_approach text[],
  audience_retention text check (audience_retention in ('alta','media','baixa')),
  audience_responses text check (audience_responses in ('frequentes','poucas','nenhuma')),
  narrative_flow text check (narrative_flow in ('completa','parcial','fragmentado')),
  intention text check (intention in ('aproximar','engajar','converter','depende')),
  notes text,
  updated_at timestamptz default now()
);

-- ---------------------------------------------------------
-- 8. SCRIPTS (roteiros)
-- ---------------------------------------------------------
create table scripts (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade not null,
  title text not null,
  content text,
  status text default 'pending' check (status in ('pending','approved','rejected')),
  client_note text,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------
-- 9. ACTION_PLANS (plano estratégico — fases)
-- ---------------------------------------------------------
create table action_plans (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade not null,
  title text not null,
  type text check (type in ('operational','strategic')) default 'strategic',
  description text,
  review_frequency text check (review_frequency in ('daily','weekly','biweekly','monthly')),
  status text default 'active' check (status in ('active','completed','paused')),
  goals jsonb default '[]'::jsonb,               -- [{ description, target_date, completed }]
  created_at timestamptz default now()
);

-- ---------------------------------------------------------
-- 10. TASKS
-- ---------------------------------------------------------
create table tasks (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade not null,
  action_plan_id uuid references action_plans(id) on delete set null,
  title text not null,
  status text default 'pending' check (status in ('pending','in_progress','completed','overdue')),
  priority text default 'medium' check (priority in ('low','medium','high','urgent')),
  responsible uuid references profiles(id),
  due_date date,
  steps jsonb default '[]'::jsonb,               -- [{ description, completed }]
  created_at timestamptz default now()
);

-- ---------------------------------------------------------
-- 11. PERSONAL_TASKS (só admin geral)
-- ---------------------------------------------------------
create table personal_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) not null,
  title text not null,
  description text,
  allocation_type text check (allocation_type in ('dia_especifico','periodo','sem_dia')),
  weekdays text[],
  start_date date,
  end_date date,
  week_reference text,
  fixed boolean default false,
  completed boolean default false,
  color_tag text check (color_tag in ('purple','blue','green','yellow','orange','red','pink','teal')) default 'purple',
  sort_order int default 0,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------
-- 12. REPORTS (dashboards de performance)
-- ---------------------------------------------------------
create table reports (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade not null,
  title text not null,
  period_label text,
  branding_color text default '#7C4DE0',
  top_metrics jsonb default '{}'::jsonb,
  demographics jsonb default '{}'::jsonb,
  campaigns jsonb default '[]'::jsonb,
  format_comparison jsonb default '{}'::jsonb,
  history_projection jsonb default '[]'::jsonb,
  best_times jsonb default '[]'::jsonb,
  next_steps jsonb default '[]'::jsonb,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------
-- 13. PROPOSALS
-- ---------------------------------------------------------
create table proposals (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid references agencies(id) on delete cascade not null,
  client_name text not null,
  slug text unique not null,
  branding_color text default '#7C4DE0',
  phases jsonb default '[]'::jsonb,              -- [{ title, description, order }]
  status text default 'draft' check (status in ('draft','sent','accepted','rejected')),
  approval_status text default 'pending' check (approval_status in ('pending','approved','rejected')),
  client_note text,
  ai_generated boolean default false,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------
-- 14. PRESENTATIONS (portfólio)
-- ---------------------------------------------------------
create table presentations (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid references agencies(id) on delete cascade not null,
  title text not null,
  branding_color text default '#7C4DE0',
  slides jsonb default '[]'::jsonb,              -- [{ order, type, ...campos por layout }]
  approval_status text default 'pending' check (approval_status in ('pending','approved','rejected')),
  client_note text,
  ai_generated boolean default false,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------
-- 15. KNOWLEDGE_ARTICLES (base de conhecimento / SOPs)
-- ---------------------------------------------------------
create table knowledge_articles (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid references agencies(id) on delete cascade not null,
  title text not null,
  category text default 'SOP',
  steps jsonb default '[]'::jsonb,               -- [{ order, title, content, media_url }]
  created_at timestamptz default now()
);

-- ---------------------------------------------------------
-- 16. NOTIFICATIONS
-- ---------------------------------------------------------
create table notifications (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid references agencies(id) on delete cascade not null,
  brand_id uuid references brands(id) on delete cascade,
  area text check (area in ('conteudos','roteiros','stories','plano_estrategico','propostas','portfolio')),
  actor_user_id uuid references profiles(id),
  message text not null,
  read_by uuid[] default '{}',
  created_at timestamptz default now()
);

-- ---------------------------------------------------------
-- 17. SOCIAL_ACCOUNTS (ligações às redes sociais — fase futura)
-- ---------------------------------------------------------
create table social_accounts (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade not null,
  platform text check (platform in ('facebook','instagram','tiktok','linkedin','threads')) not null,
  external_account_id text,
  access_token_ref text,                         -- nunca guardar o token em claro; só uma referência
  token_expires_at timestamptz,
  connected_by uuid references profiles(id),
  status text default 'connected' check (status in ('connected','expired','revoked')),
  created_at timestamptz default now()
);

-- ---------------------------------------------------------
-- 18. LINK_PAGES (link na bio)
-- ---------------------------------------------------------
create table link_pages (
  id uuid primary key default gen_random_uuid(),
  owner_type text check (owner_type in ('brand','agency','user')) not null,
  owner_id uuid not null,
  slug text unique not null,
  profile_photo_url text,
  background_removed boolean default false,
  background_style jsonb default '{}'::jsonb,
  about_text text,
  blocks jsonb default '[]'::jsonb,
  products jsonb default '[]'::jsonb,
  quiz jsonb default '{}'::jsonb,
  branding_color text default '#7C4DE0',
  created_at timestamptz default now()
);

-- ---------------------------------------------------------
-- 19. PRICING_CATEGORIES + PRICING_CALCULATIONS (calculadora)
-- ---------------------------------------------------------
create table pricing_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_scope text check (owner_scope in ('global','agency_custom')) default 'agency_custom',
  agency_id uuid references agencies(id) on delete cascade,   -- null se for global/predefinida
  parameters jsonb default '[]'::jsonb,          -- [{ key, label, type, unit }]
  created_at timestamptz default now()
);

create table pricing_calculations (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade,
  agency_id uuid references agencies(id) on delete cascade,
  category_id uuid references pricing_categories(id),
  pricing_type text check (pricing_type in ('servico_hora','produto_fisico','pacote_projeto','recorrente')) not null,
  name text not null,
  inputs jsonb default '{}'::jsonb,
  cost_lines jsonb default '[]'::jsonb,
  deliverables jsonb default '[]'::jsonb,        -- só usado quando pricing_type = pacote_projeto
  margin_pct numeric default 0,
  exclusivity numeric default 1,
  current_price_practiced numeric,
  calculated jsonb default '{}'::jsonb,          -- { total_cost, suggested_price, estimated_profit, real_margin_pct }
  created_at timestamptz default now()
);

-- ---------------------------------------------------------
-- Índices úteis (consultas mais rápidas por marca/agência)
-- ---------------------------------------------------------
create index idx_brands_agency on brands(agency_id);
create index idx_contents_brand on contents(brand_id);
create index idx_scripts_brand on scripts(brand_id);
create index idx_tasks_brand on tasks(brand_id);
create index idx_reports_brand on reports(brand_id);
create index idx_proposals_agency on proposals(agency_id);
create index idx_presentations_agency on presentations(agency_id);
create index idx_notifications_agency on notifications(agency_id);
create index idx_profiles_agency on profiles(agency_id);
