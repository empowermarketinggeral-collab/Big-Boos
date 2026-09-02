-- =========================================================
-- EMPOWER OS — MOTOR DE AUTOMAÇÕES
-- =========================================================
-- Corre isto depois do 22_whatsapp.sql.
-- RASCUNHO PARA REVISÃO — Fase 1 (modelo de dados).
--
-- Não é um motor BPMN nem uma coleção de if/else hardcoded — é uma
-- máquina de estados simples e orientada a dados. Cada automação é
-- uma sequência de "steps"; cada execução por contacto é uma linha
-- em automation_runs que avança quando um Edge Function agendado
-- por pg_cron processa as que já passaram do next_run_at.
-- =========================================================

create table automations (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade not null,
  name text not null,
  trigger_type text check (trigger_type in (
    'contact_created','contact_tagged','deal_stage_changed','form_submitted',
    'whatsapp_message_received','email_opened','email_clicked','date_time','webhook'
  )) not null,
  trigger_config jsonb default '{}'::jsonb,
  status text default 'draft' check (status in ('draft','active','paused')),
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

create table automation_steps (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade not null,
  automation_id uuid references automations(id) on delete cascade not null,
  position int not null,
  type text check (type in ('action','condition','wait')) not null,
  action_type text check (action_type in (
    'send_whatsapp','send_email','add_tag','remove_tag','create_task',
    'assign_user','create_deal','update_contact','move_pipeline_stage',
    'http_request','start_automation'
  )),
  config jsonb default '{}'::jsonb,
  on_true_step_id uuid references automation_steps(id),
  on_false_step_id uuid references automation_steps(id),
  wait_minutes int,
  created_at timestamptz default now()
);
create index idx_automation_steps_automation on automation_steps(automation_id, position);

create table automation_runs (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade not null,
  automation_id uuid references automations(id) on delete cascade not null,
  contact_id uuid references contacts(id) on delete cascade not null,
  current_step_id uuid references automation_steps(id),
  status text default 'running' check (status in ('running','waiting','completed','failed','cancelled')),
  next_run_at timestamptz,
  error text,
  created_at timestamptz default now()
);
-- Índice usado diretamente pelo Edge Function agendado (pg_cron) para
-- encontrar rapidamente as execuções que já podem avançar.
create index idx_automation_runs_due on automation_runs(next_run_at) where status = 'waiting';

-- ---------------------------------------------------------
-- RLS
-- ---------------------------------------------------------
alter table automations enable row level security;
create policy automations_all on automations for all using (is_brand_member(brand_id)) with check (is_brand_member(brand_id));

alter table automation_steps enable row level security;
create policy automation_steps_all on automation_steps for all using (is_brand_member(brand_id)) with check (is_brand_member(brand_id));

alter table automation_runs enable row level security;
create policy automation_runs_all on automation_runs for all using (is_brand_member(brand_id)) with check (is_brand_member(brand_id));
