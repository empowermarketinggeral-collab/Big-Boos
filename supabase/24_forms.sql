-- =========================================================
-- EMPOWER OS — FORMULÁRIOS, QUESTIONÁRIOS E LEAD MAGNETS
-- =========================================================
-- Corre isto depois do 23_automations.sql.
-- RASCUNHO PARA REVISÃO — Fase 1 (modelo de dados).
--
-- Reutiliza o padrão de página pública por slug já usado em
-- proposals/presentations/link_pages/growth_maps (03_public_access.sql,
-- 13_growth_maps.sql) — mas é a PRIMEIRA tabela do schema com escrita
-- pública (form_submissions, por visitantes anónimos). Isto é um
-- vetor novo que as anteriores não tinham: recomenda-se acrescentar
-- rate limiting (por IP, por form_id) na Edge Function ou no
-- frontend antes de abrir isto a tráfego real — não é só RLS.
-- =========================================================

create table forms (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade not null,
  name text not null,
  slug text unique not null,
  type text check (type in ('form','questionario','lead_magnet')) default 'form',
  fields jsonb default '[]'::jsonb,          -- [{ id, label, type, required, options, condition }]
  on_submit_tags uuid[] default '{}',
  on_submit_automation_id uuid references automations(id),
  thank_you_message text,
  file_delivery_url text,                    -- entrega automática (PDF/guia) para lead magnets
  status text default 'draft' check (status in ('draft','published')),
  created_at timestamptz default now()
);

create table form_submissions (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade not null,
  form_id uuid references forms(id) on delete cascade not null,
  contact_id uuid references contacts(id) on delete set null,
  answers jsonb default '{}'::jsonb,
  score int,
  submitted_at timestamptz default now()
);
create index idx_form_submissions_form on form_submissions(form_id, submitted_at desc);

-- ---------------------------------------------------------
-- RLS
-- ---------------------------------------------------------
alter table forms enable row level security;
create policy forms_all on forms for all using (is_brand_member(brand_id)) with check (is_brand_member(brand_id));
create policy forms_public_read on forms for select to anon using (status = 'published');

alter table form_submissions enable row level security;
create policy form_submissions_team on form_submissions for select using (is_brand_member(brand_id));
create policy form_submissions_public_insert on form_submissions for insert to anon with check (
  exists (select 1 from forms f where f.id = form_submissions.form_id and f.status = 'published')
);
