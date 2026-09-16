-- =========================================================
-- EMPOWER OS — AGENDAMENTO v2: PROFISSIONAIS, FÉRIAS, UPSELLS, LEMBRETES
-- =========================================================
-- Corre isto depois do 40_booking.sql.
-- RASCUNHO PARA REVISÃO — acompanha as Edge Functions
-- booking-availability/booking-create (atualizadas) e booking-reminders (nova).
--
-- Muda o modelo de "uma agenda por marca" para "uma agenda por
-- profissional dentro da marca" — booking_availability e
-- booking_time_off passam a apontar para booking_staff, não só para
-- brand_id. A disponibilidade antiga (sem staff_id) fica órfã e
-- deixa de ser usada; não há dados reais a perder nesta fase.
-- =========================================================

create table booking_staff (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade not null,
  name text not null,
  email text,
  photo_url text,
  status text default 'active' check (status in ('active', 'archived')),
  created_at timestamptz default now()
);

alter table booking_availability add column if not exists staff_id uuid references booking_staff(id) on delete cascade;

create table booking_time_off (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade not null,
  staff_id uuid references booking_staff(id) on delete cascade not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  created_at timestamptz default now()
);
create index idx_booking_time_off_staff on booking_time_off(staff_id, starts_at);

create table booking_service_upsells (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade not null,
  service_id uuid references booking_services(id) on delete cascade not null,
  name text not null,
  price numeric,
  extra_duration_minutes int default 0,
  created_at timestamptz default now()
);

alter table booking_appointments add column if not exists staff_id uuid references booking_staff(id) on delete set null;
alter table booking_appointments add column if not exists selected_upsells jsonb default '[]'::jsonb; -- snapshot: [{ id, name, price, extra_duration_minutes }]
alter table booking_appointments add column if not exists total_price numeric;
alter table booking_appointments add column if not exists reminder_24h_sent boolean default false;
alter table booking_appointments add column if not exists reminder_1h_sent boolean default false;
alter table booking_appointments add column if not exists post_visit_sent boolean default false;

-- Uma linha por tipo de lembrete, por marca. channel: nunca "sms" —
-- não há fornecedor de SMS ligado; só whatsapp/email são reais.
create table booking_reminder_settings (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade not null,
  type text not null check (type in ('confirmation', 'reminder_24h', 'reminder_1h', 'post_visit')),
  enabled boolean default false,
  channel text default 'whatsapp' check (channel in ('whatsapp', 'email')),
  message_template text,
  review_link text, -- só usado pelo tipo post_visit (link de avaliação, ex: Google My Business)
  created_at timestamptz default now(),
  unique (brand_id, type)
);

-- ---------------------------------------------------------
-- RLS
-- ---------------------------------------------------------
alter table booking_staff enable row level security;
create policy booking_staff_all on booking_staff for all using (is_brand_member(brand_id)) with check (is_brand_member(brand_id));

alter table booking_time_off enable row level security;
create policy booking_time_off_all on booking_time_off for all using (is_brand_member(brand_id)) with check (is_brand_member(brand_id));

alter table booking_service_upsells enable row level security;
create policy booking_service_upsells_all on booking_service_upsells for all using (is_brand_member(brand_id)) with check (is_brand_member(brand_id));

alter table booking_reminder_settings enable row level security;
create policy booking_reminder_settings_all on booking_reminder_settings for all using (is_brand_member(brand_id)) with check (is_brand_member(brand_id));
