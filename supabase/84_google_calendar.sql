-- =========================================================
-- EMPOWER OS — GOOGLE AGENDA POR PROFISSIONAL
-- =========================================================
-- Corre isto depois do 76. Pode correr-se mais do que uma vez.
-- Depois: cola as funções google-calendar-connect (Verify JWT LIGADO),
-- google-calendar-oauth e google-calendar-sync (Verify JWT DESLIGADO),
-- cria os segredos GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET e atualiza as
-- funções booking-availability e booking-create. Passo a passo em
-- docs/GUIA_GOOGLE_AGENDA.md.
--
-- COMO FUNCIONA
--  - A equipa gera um LINK PESSOAL para cada profissional (ela não precisa
--    de conta na Big Boss): abre-o, entra com a conta Google dela e
--    autoriza. O token fica no Vault; aqui só fica a referência.
--  - Google -> Big Boss: de 5 em 5 minutos a função google-calendar-sync
--    lê só os períodos OCUPADOS (nunca o conteúdo dos eventos) e guarda-os
--    em booking_external_busy. A disponibilidade passa a excluí-los; e a
--    booking-create faz ainda uma verificação ao vivo no momento de
--    confirmar, para cobrir os minutos entre sincronizações.
--  - Big Boss -> Google: as marcações confirmadas são escritas no Google
--    Agenda dela (desligável por profissional).
--
-- SEGURANÇA
--  - Os tokens nunca chegam ao browser: a tabela de ligações só deixa ler
--    colunas sem segredos, e só a service role escreve.
--  - Os links pessoais guardam apenas o hash (SHA-256) do token.
-- =========================================================

-- ---------------------------------------------------------
-- 1. Ligação Google de cada profissional
-- ---------------------------------------------------------
create table if not exists booking_staff_google (
  staff_id uuid primary key references booking_staff(id) on delete cascade,
  brand_id uuid not null references brands(id) on delete cascade,
  google_email text,
  refresh_token_ref uuid,                      -- referência ao Vault, nunca o token
  calendar_id text not null default 'primary',
  push_enabled boolean not null default true,  -- escrever as marcações no Google Agenda
  status text not null default 'connected' check (status in ('connected', 'needs_reauth')),
  last_error text,
  last_sync_at timestamptz,
  connected_at timestamptz default now()
);
create index if not exists idx_booking_staff_google_brand on booking_staff_google(brand_id);

alter table booking_staff_google enable row level security;
drop policy if exists booking_staff_google_select on booking_staff_google;
create policy booking_staff_google_select on booking_staff_google for select using (can_manage_brand(brand_id));

-- Só se podem LER colunas sem segredos; escrever é só da service role.
revoke all on booking_staff_google from anon, authenticated;
grant select (staff_id, brand_id, google_email, calendar_id, push_enabled, status, last_error, last_sync_at, connected_at)
  on booking_staff_google to authenticated;

-- ---------------------------------------------------------
-- 2. Links pessoais para a profissional ligar a conta
-- ---------------------------------------------------------
create table if not exists booking_google_links (
  token_hash text primary key,                 -- SHA-256 do token (o token só existe no link)
  staff_id uuid not null references booking_staff(id) on delete cascade,
  brand_id uuid not null references brands(id) on delete cascade,
  app_origin text not null,                    -- onde a profissional volta no fim (definido por quem gerou o link)
  expires_at timestamptz not null,
  used_at timestamptz,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);
create index if not exists idx_booking_google_links_staff on booking_google_links(staff_id);
alter table booking_google_links enable row level security;
-- Sem políticas: só a service role (Edge Functions) lê e escreve.

-- ---------------------------------------------------------
-- 3. Períodos ocupados lidos do Google Agenda
-- ---------------------------------------------------------
create table if not exists booking_external_busy (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references booking_staff(id) on delete cascade,
  brand_id uuid not null references brands(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  source text not null default 'google'
);
create index if not exists idx_booking_external_busy_staff_time on booking_external_busy(staff_id, starts_at, ends_at);
alter table booking_external_busy enable row level security;
drop policy if exists booking_external_busy_select on booking_external_busy;
create policy booking_external_busy_select on booking_external_busy for select using (can_manage_brand(brand_id));

-- ---------------------------------------------------------
-- 4. Que evento do Google corresponde a cada marcação
-- ---------------------------------------------------------
-- Sem chave estrangeira para a marcação de propósito: se a marcação for
-- apagada, o evento tem de poder ser limpo do Google na mesma.
create table if not exists booking_google_events (
  appointment_id uuid primary key,
  staff_id uuid not null references booking_staff(id) on delete cascade,
  google_event_id text not null,
  calendar_id text not null default 'primary',
  synced_starts_at timestamptz not null,
  synced_ends_at timestamptz not null,
  synced_at timestamptz default now()
);
create index if not exists idx_booking_google_events_staff on booking_google_events(staff_id);
alter table booking_google_events enable row level security;
-- Sem políticas: só a service role.

-- ---------------------------------------------------------
-- 5. Funções de apoio (só a service role as chama)
-- ---------------------------------------------------------
-- Troca, numa só transação, os períodos ocupados de uma profissional
-- (sem uma janela vazia onde a disponibilidade veria tudo livre).
create or replace function replace_external_busy(p_staff uuid, p_from timestamptz, p_to timestamptz, p_blocks jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_brand uuid;
begin
  select brand_id into v_brand from booking_staff where id = p_staff;
  if v_brand is null then
    return;
  end if;
  delete from booking_external_busy
  where staff_id = p_staff and source = 'google' and ends_at > p_from and starts_at < p_to;
  insert into booking_external_busy (staff_id, brand_id, starts_at, ends_at)
  select p_staff, v_brand, (b->>'start')::timestamptz, (b->>'end')::timestamptz
  from jsonb_array_elements(coalesce(p_blocks, '[]'::jsonb)) b
  where (b->>'end')::timestamptz > (b->>'start')::timestamptz;
end;
$$;
revoke execute on function replace_external_busy(uuid, timestamptz, timestamptz, jsonb) from public, anon, authenticated;

create or replace function vault_delete_secret(p_id uuid) returns void
language sql security definer set search_path = public as $$
  delete from vault.secrets where id = p_id;
$$;
revoke all on function vault_delete_secret(uuid) from public, authenticated, anon;

-- ---------------------------------------------------------
-- 6. Avisos internos quando a Google deixa de aceitar a ligação
-- ---------------------------------------------------------
alter table notifications drop constraint if exists notifications_area_check;
alter table notifications add constraint notifications_area_check check (area in (
  'conteudos','roteiros','stories','plano_estrategico','propostas','portfolio','automacoes','agendamento'
));

-- ---------------------------------------------------------
-- 7. Sincronização de 5 em 5 minutos
-- ---------------------------------------------------------
-- Usa os mesmos segredos do Vault dos outros agendadores
-- (automations_project_url / automations_service_role_key).
select cron.unschedule(jobid) from cron.job where jobname = 'google-calendar-sync-every-5-minutes';
select cron.schedule(
  'google-calendar-sync-every-5-minutes',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'automations_project_url') || '/functions/v1/google-calendar-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'automations_service_role_key')
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);
