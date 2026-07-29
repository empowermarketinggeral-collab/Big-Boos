-- =========================================================
-- BIG BOSS — CRONOGRAMA DE CONTEÚDOS (nova tabela)
-- =========================================================
-- Corre isto depois do 09_storage_select_policy.sql.
--
-- O protótipo tinha um módulo "Cronograma de Conteúdos" (planeamento
-- do que vai ser criado, por semana/mês) que o schema original não
-- previa nenhuma tabela — é diferente de "contents" (que é aprovação
-- do que já foi produzido). Esta tabela segue o mesmo padrão de
-- story_week_plans: equipa lê/edita, aprovador só lê.
-- =========================================================

create table content_schedules (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade not null,
  title text not null,
  focus text,
  specific_actions jsonb default '[]'::jsonb,   -- [{ id, timing, label, description }]
  weeks jsonb default '[]'::jsonb,              -- [{ id, label, action, contentIdeas: [{id,type,description,inspiration}] }]
  created_at timestamptz default now()
);

alter table content_schedules enable row level security;

create policy content_schedules_select on content_schedules for select using (
  can_manage_brand(brand_id) or is_approver_of(brand_id)
);
create policy content_schedules_write on content_schedules for all using (can_manage_brand(brand_id))
  with check (can_manage_brand(brand_id));

create index idx_content_schedules_brand on content_schedules(brand_id);
