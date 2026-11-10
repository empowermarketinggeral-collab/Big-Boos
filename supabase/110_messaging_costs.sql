-- Gastos de mensagens (SMS e WhatsApp) por marca e por mês, para cobrar aos
-- clientes. Os valores vêm da Twilio, pela função messaging-costs (relatório
-- de uso de cada conta); aqui fica só a margem de cada agência.
-- A equipa vê o custo Twilio, a margem e o valor a cobrar; o cliente vê só o
-- valor a cobrar da sua marca.
-- Pode correr-se mais do que uma vez.

create table if not exists messaging_cost_settings (
  agency_id uuid primary key references agencies(id) on delete cascade,
  margin_percent numeric not null default 5 check (margin_percent >= 0 and margin_percent <= 100),
  updated_at timestamptz not null default now()
);
alter table messaging_cost_settings enable row level security;
drop policy if exists messaging_cost_settings_team on messaging_cost_settings;
create policy messaging_cost_settings_team on messaging_cost_settings for all
  using (can_manage_agency(agency_id)) with check (can_manage_agency(agency_id));
