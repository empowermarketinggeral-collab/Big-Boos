-- =========================================================
-- EMPOWER OS — AGENDAMENTO / MARCAÇÕES
-- =========================================================
-- Corre isto depois do 39_social_publish_cron.sql.
-- RASCUNHO PARA REVISÃO — acompanha as Edge Functions
-- booking-availability e booking-create.
--
-- Deliberadamente sem policy pública (anon) nestas 3 tabelas — ao
-- contrário de forms/funnels, uma marcação tem uma consequência real
-- (um horário fica ocupado) e precisa de verificação atómica no
-- servidor para evitar duas pessoas a marcar o mesmo horário ao
-- mesmo tempo. Por isso o acesso público passa sempre pelas Edge
-- Functions (service role), nunca por RLS direto.
--
-- v1 não inclui ligação ao Google Calendar (isso é OAuth a sério,
-- com refresh token — próximo passo, não este). v1 também não separa
-- por "profissional/recurso" — um brand tem uma única agenda; duas
-- marcações não podem sobrepor-se, seja qual for o serviço.
-- =========================================================

alter table brands add column if not exists booking_slug text unique;

create table booking_services (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade not null,
  name text not null,
  description text,
  price numeric,
  duration_minutes int not null,
  color text default '#7C4DE0',
  status text default 'active' check (status in ('active', 'archived')),
  created_at timestamptz default now()
);

-- Regras semanais recorrentes de disponibilidade — sem exceções por
-- data específica (feriados, etc.) nesta primeira versão.
create table booking_availability (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade not null,
  weekday int not null check (weekday between 0 and 6),  -- 0 = domingo
  start_time time not null,
  end_time time not null,
  created_at timestamptz default now()
);

create table booking_appointments (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade not null,
  service_id uuid references booking_services(id) not null,
  contact_id uuid references contacts(id) on delete set null,
  customer_name text not null,
  customer_phone text,
  customer_email text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text default 'confirmed' check (status in ('confirmed', 'cancelled', 'completed')),
  created_at timestamptz default now()
);
create index idx_booking_appointments_brand_time on booking_appointments(brand_id, starts_at);

-- ---------------------------------------------------------
-- RLS — só a equipa/cliente da marca (is_brand_member). O público
-- nunca lê/escreve estas tabelas diretamente.
-- ---------------------------------------------------------
alter table booking_services enable row level security;
create policy booking_services_all on booking_services for all using (is_brand_member(brand_id)) with check (is_brand_member(brand_id));

alter table booking_availability enable row level security;
create policy booking_availability_all on booking_availability for all using (is_brand_member(brand_id)) with check (is_brand_member(brand_id));

alter table booking_appointments enable row level security;
create policy booking_appointments_all on booking_appointments for all using (is_brand_member(brand_id)) with check (is_brand_member(brand_id));
