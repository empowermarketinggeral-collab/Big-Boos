-- =========================================================
-- EMPOWER OS — CRM (contactos, empresas, pipelines, negócios)
-- =========================================================
-- Corre isto depois do 20_empower_os_foundations.sql.
-- RASCUNHO PARA REVISÃO — Fase 1 (modelo de dados).
--
-- Módulo genérico — não é feito para salões, moda ou beleza
-- especificamente. custom_fields (jsonb) é onde cada tipo de
-- negócio guarda os seus campos próprios sem alterar o schema.
-- =========================================================

create table companies (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade not null,
  name text not null,
  domain text,
  phone text,
  notes text,
  custom_fields jsonb default '{}'::jsonb,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

create table contacts (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade not null,
  company_id uuid references companies(id) on delete set null,
  name text not null,
  email text,
  phone text,                                    -- formato E.164; também a chave de correspondência com o WhatsApp
  source text,                                    -- 'manual','formulario','whatsapp','importacao','lead_magnet','funil'
  avatar_url text,
  custom_fields jsonb default '{}'::jsonb,
  opted_in_whatsapp boolean default false,
  opted_in_email boolean default false,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

-- Deteção de duplicados simples: um contacto por email/telefone e por marca.
-- Não é fuzzy-matching — é o suficiente para o MVP sem construir um motor à parte.
create unique index idx_contacts_brand_phone on contacts(brand_id, phone) where phone is not null;
create unique index idx_contacts_brand_email on contacts(brand_id, lower(email)) where email is not null;
create index idx_contacts_brand_company on contacts(brand_id, company_id);

create table tags (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade not null,
  name text not null,
  color text default '#7C4DE0',
  created_at timestamptz default now()
);
create unique index idx_tags_brand_name on tags(brand_id, lower(name));

create table contact_tags (
  brand_id uuid references brands(id) on delete cascade not null,
  contact_id uuid references contacts(id) on delete cascade not null,
  tag_id uuid references tags(id) on delete cascade not null,
  primary key (contact_id, tag_id)
);

-- ---------------------------------------------------------
-- PIPELINES — cada marca cria os seus próprios, com as fases que quiser
-- ---------------------------------------------------------
create table pipelines (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade not null,
  name text not null,
  is_default boolean default false,
  created_at timestamptz default now()
);

create table pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade not null,
  pipeline_id uuid references pipelines(id) on delete cascade not null,
  name text not null,
  position int not null,
  is_won boolean default false,
  is_lost boolean default false,
  created_at timestamptz default now()
);
create index idx_pipeline_stages_pipeline on pipeline_stages(pipeline_id, position);

create table deals (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade not null,
  pipeline_id uuid references pipelines(id) not null,
  stage_id uuid references pipeline_stages(id) not null,
  contact_id uuid references contacts(id) on delete set null,
  company_id uuid references companies(id) on delete set null,
  title text not null,
  value numeric,
  probability int check (probability between 0 and 100),
  expected_close_date date,
  lost_reason text,
  status text default 'open' check (status in ('open','won','lost')),
  owner_id uuid references profiles(id),
  created_at timestamptz default now()
);
create index idx_deals_pipeline_stage on deals(pipeline_id, stage_id);
create index idx_deals_contact on deals(contact_id);

-- ---------------------------------------------------------
-- ACTIVITIES — linha do tempo unificada: notas, tarefas, chamadas,
-- reuniões, e um registo automático de emails/WhatsApp trocados
-- (preenchido pelos módulos respetivos, não por escrita manual).
-- ---------------------------------------------------------
create table activities (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade not null,
  contact_id uuid references contacts(id) on delete cascade,
  deal_id uuid references deals(id) on delete cascade,
  type text check (type in ('note','task','call','meeting','email','whatsapp','stage_change','system')) not null,
  body text,
  due_at timestamptz,
  completed_at timestamptz,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);
create index idx_activities_contact on activities(contact_id, created_at desc);
create index idx_activities_deal on activities(deal_id, created_at desc);

-- ---------------------------------------------------------
-- RLS — is_brand_member cobre equipa (CRUD total) e cliente
-- (também CRUD total: o CRM é a ferramenta de trabalho dele).
-- ---------------------------------------------------------
alter table companies enable row level security;
create policy companies_all on companies for all using (is_brand_member(brand_id)) with check (is_brand_member(brand_id));

alter table contacts enable row level security;
create policy contacts_all on contacts for all using (is_brand_member(brand_id)) with check (is_brand_member(brand_id));

alter table tags enable row level security;
create policy tags_all on tags for all using (is_brand_member(brand_id)) with check (is_brand_member(brand_id));

alter table contact_tags enable row level security;
create policy contact_tags_all on contact_tags for all using (is_brand_member(brand_id)) with check (is_brand_member(brand_id));

alter table pipelines enable row level security;
create policy pipelines_all on pipelines for all using (is_brand_member(brand_id)) with check (is_brand_member(brand_id));

alter table pipeline_stages enable row level security;
create policy pipeline_stages_all on pipeline_stages for all using (is_brand_member(brand_id)) with check (is_brand_member(brand_id));

alter table deals enable row level security;
create policy deals_all on deals for all using (is_brand_member(brand_id)) with check (is_brand_member(brand_id));

alter table activities enable row level security;
create policy activities_all on activities for all using (is_brand_member(brand_id)) with check (is_brand_member(brand_id));
