-- =========================================================
-- BIG BOSS — REUNIÕES (nova tabela)
-- =========================================================
-- Corre isto depois do 10_content_schedules.sql.
--
-- Módulo interno de preparação de reuniões com prospects/clientes —
-- isolado por agência, sem qualquer acesso de aprovadores/clientes
-- (mesmo padrão de knowledge_articles).
-- =========================================================

create table meetings (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid references agencies(id) on delete cascade not null,
  created_by uuid references profiles(id),
  person_name text,
  sector text,
  meeting_date date,
  how_arrived text,
  relevant_data text,
  pdf_url text,
  pdf_name text,
  structure jsonb default '[]'::jsonb,        -- [{ text, done }]
  proposal_notes text,
  created_at timestamptz default now()
);

alter table meetings enable row level security;

create policy meetings_all on meetings for all using (can_manage_agency(agency_id))
  with check (can_manage_agency(agency_id));

create index idx_meetings_agency on meetings(agency_id);
