-- =========================================================
-- EMPOWER OS — ANIVERSÁRIOS (lembrete para a equipa publicar)
--   Lista anual de aniversários por marca (nome, dia/mês, ano opcional,
--   n.º de sócio, perfil da rede social, observações), com um lembrete
--   interno no sino no dia (e, se quiseres, na véspera ou antes), e um
--   "publicado" por ano para ninguém se esquecer.
-- =========================================================
-- Corre isto depois do 89. Pode correr-se mais do que uma vez.
-- Não precisa de Edge Function: o lembrete é uma função SQL chamada de hora
-- a hora pelo pg_cron (como as datas de automações, migração 63).
--
-- SEGURANÇA
--  - Lê a equipa e o cliente da marca; só a equipa escreve.
--  - O log de lembretes é interno (sem políticas: só a função o toca).
-- =========================================================

-- ---------------------------------------------------------
-- 1. Aniversários
-- ---------------------------------------------------------
create table if not exists brand_birthdays (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  birth_day smallint not null check (birth_day between 1 and 31),
  birth_month smallint not null check (birth_month between 1 and 12),
  birth_year smallint check (birth_year is null or birth_year between 1900 and 2100),
  member_number text check (member_number is null or char_length(member_number) <= 60),
  profile text check (profile is null or char_length(profile) <= 500),
  notes text check (notes is null or char_length(notes) <= 2000),
  created_by uuid references profiles(id),
  created_at timestamptz default now(),
  -- 30/02, 31/04… não existem (29/02 existe: ano bissexto)
  constraint brand_birthdays_valid_date check (birth_day <= (date_part('day', (make_date(2000, birth_month, 1) + interval '1 month - 1 day')))::int)
);
create index if not exists idx_brand_birthdays_brand_md on brand_birthdays(brand_id, birth_month, birth_day);
create unique index if not exists idx_brand_birthdays_member on brand_birthdays(brand_id, lower(member_number)) where member_number is not null;

-- ---------------------------------------------------------
-- 2. Definições do lembrete (por marca)
-- ---------------------------------------------------------
create table if not exists birthday_settings (
  brand_id uuid primary key references brands(id) on delete cascade,
  enabled boolean not null default true,
  -- quando avisar: 0 = no próprio dia, 1 = na véspera, 2…7 = dias antes
  days_before int[] not null default '{0}',
  remind_hour smallint not null default 8 check (remind_hour between 0 and 23),
  updated_at timestamptz default now(),
  constraint birthday_settings_days check (days_before <@ array[0,1,2,3,4,5,6,7])
);

-- ---------------------------------------------------------
-- 3. "Publicado" por pessoa e por ano
-- ---------------------------------------------------------
create table if not exists birthday_posts (
  birthday_id uuid not null references brand_birthdays(id) on delete cascade,
  brand_id uuid not null references brands(id) on delete cascade,
  year smallint not null,
  posted_by uuid references profiles(id),
  posted_at timestamptz default now(),
  primary key (birthday_id, year)
);

-- ---------------------------------------------------------
-- 4. Log dos lembretes enviados (evita duplicados)
-- ---------------------------------------------------------
create table if not exists birthday_reminder_log (
  brand_id uuid not null references brands(id) on delete cascade,
  target_date date not null,
  days_before int not null,
  sent_at timestamptz default now(),
  primary key (brand_id, target_date, days_before)
);

-- A pessoa e o "publicado" têm de ser da mesma marca.
create or replace function trg_birthday_posts_same_brand() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select brand_id from brand_birthdays where id = new.birthday_id) is distinct from new.brand_id then
    raise exception 'Este aniversário não pertence a esta marca.';
  end if;
  return new;
end;
$$;
drop trigger if exists birthday_posts_same_brand on birthday_posts;
create trigger birthday_posts_same_brand before insert or update on birthday_posts for each row execute function trg_birthday_posts_same_brand();

-- ---------------------------------------------------------
-- 5. RLS
-- ---------------------------------------------------------
alter table brand_birthdays enable row level security;
alter table birthday_settings enable row level security;
alter table birthday_posts enable row level security;
alter table birthday_reminder_log enable row level security;

drop policy if exists brand_birthdays_select on brand_birthdays;
drop policy if exists brand_birthdays_write on brand_birthdays;
create policy brand_birthdays_select on brand_birthdays for select using (is_brand_member(brand_id));
create policy brand_birthdays_write on brand_birthdays for all
  using (can_manage_brand(brand_id)) with check (can_manage_brand(brand_id));

drop policy if exists birthday_settings_select on birthday_settings;
drop policy if exists birthday_settings_write on birthday_settings;
create policy birthday_settings_select on birthday_settings for select using (is_brand_member(brand_id));
create policy birthday_settings_write on birthday_settings for all
  using (can_manage_brand(brand_id)) with check (can_manage_brand(brand_id));

drop policy if exists birthday_posts_select on birthday_posts;
drop policy if exists birthday_posts_write on birthday_posts;
create policy birthday_posts_select on birthday_posts for select using (is_brand_member(brand_id));
create policy birthday_posts_write on birthday_posts for all
  using (can_manage_brand(brand_id)) with check (can_manage_brand(brand_id));

-- ---------------------------------------------------------
-- 6. Área "aniversarios" nas notificações (mantém as áreas que já existem)
-- ---------------------------------------------------------
do $$
declare
  v_def text;
  v_areas text[];
begin
  select pg_get_constraintdef(oid) into v_def
  from pg_constraint
  where conrelid = 'notifications'::regclass and conname = 'notifications_area_check';

  if v_def is null then
    v_areas := array['conteudos','roteiros','stories','plano_estrategico','propostas','portfolio','automacoes','agendamento','criativos','crm'];
  else
    select coalesce(array_agg(m[1]), '{}') into v_areas from regexp_matches(v_def, '''([a-z_]+)''::text', 'g') as m;
  end if;
  if not ('aniversarios' = any(v_areas)) then
    v_areas := array_append(v_areas, 'aniversarios');
  end if;

  alter table notifications drop constraint if exists notifications_area_check;
  execute format(
    'alter table notifications add constraint notifications_area_check check (area in (%s))',
    (select string_agg(quote_literal(a), ',') from unnest(v_areas) as a)
  );
end $$;

-- ---------------------------------------------------------
-- 7. Quem faz anos num dia (29/02 festeja-se a 28/02 nos anos não bissextos)
-- ---------------------------------------------------------
create or replace function birthday_is_leap(p_year int) returns boolean
language sql immutable as $$
  select (p_year % 4 = 0 and p_year % 100 <> 0) or p_year % 400 = 0;
$$;

create or replace function birthday_text_for(p_brand uuid, p_target date) returns text
language sql stable security definer set search_path = public as $$
  select string_agg(
    b.name
      || case when b.member_number is not null then ' (sócio n.º ' || b.member_number || ')' else '' end
      || case when b.birth_year is not null then ', ' || (extract(year from p_target)::int - b.birth_year) || ' anos' else '' end
      || case when b.profile is not null and b.profile <> '' then ' — perfil: ' || b.profile else '' end
      || case when b.notes is not null and b.notes <> '' then ' — obs.: ' || b.notes else '' end,
    E'\n' order by b.name)
  from brand_birthdays b
  where b.brand_id = p_brand
    and (
      (b.birth_month = extract(month from p_target)::int and b.birth_day = extract(day from p_target)::int)
      or (b.birth_month = 2 and b.birth_day = 29
          and extract(month from p_target)::int = 2 and extract(day from p_target)::int = 28
          and not birthday_is_leap(extract(year from p_target)::int))
    );
$$;
revoke execute on function birthday_text_for(uuid, date) from public, anon, authenticated;

create or replace function birthday_heading(p_days int, p_target date) returns text
language sql immutable as $$
  select case
    when p_days = 0 then 'Aniversários de hoje'
    when p_days = 1 then 'Amanhã fazem anos'
    else 'Daqui a ' || p_days || ' dias (' || to_char(p_target, 'DD/MM') || ') fazem anos'
  end;
$$;

-- ---------------------------------------------------------
-- 8. O lembrete: chamado de hora a hora; envia uma vez por marca/dia/antecedência
-- ---------------------------------------------------------
create or replace function notify_birthdays(p_now timestamptz default now()) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_local timestamp := p_now at time zone 'Europe/Lisbon';
  v_today date := (p_now at time zone 'Europe/Lisbon')::date;
  s record;
  d int;
  v_target date;
  v_text text;
  v_agency uuid;
  v_total int := 0;
begin
  for s in select * from birthday_settings where enabled loop
    if extract(hour from v_local) < s.remind_hour then continue; end if;
    v_agency := brand_agency(s.brand_id);
    if v_agency is null then continue; end if;

    foreach d in array s.days_before loop
      v_target := v_today + d;
      if exists (select 1 from birthday_reminder_log where brand_id = s.brand_id and target_date = v_target and days_before = d) then
        continue;
      end if;
      v_text := birthday_text_for(s.brand_id, v_target);
      if v_text is null then continue; end if;

      insert into notifications (agency_id, brand_id, area, message)
      values (v_agency, s.brand_id, 'aniversarios', left(birthday_heading(d, v_target) || E':\n' || v_text, 1900));
      insert into birthday_reminder_log (brand_id, target_date, days_before) values (s.brand_id, v_target, d);
      v_total := v_total + 1;
    end loop;
  end loop;

  -- o log só serve para evitar duplicados: guarda 60 dias
  delete from birthday_reminder_log where target_date < v_today - 60;
  return v_total;
end;
$$;
revoke execute on function notify_birthdays(timestamptz) from public, anon, authenticated;

-- Botão "Enviar um lembrete de teste" no módulo: mostra já no sino o que vem aí.
create or replace function birthday_reminder_test(p_brand uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_today date := (now() at time zone 'Europe/Lisbon')::date;
  v_agency uuid;
  v_parts text := '';
  v_text text;
  d int;
  v_found int := 0;
begin
  if not can_manage_brand(p_brand) then
    raise exception 'Sem permissão.';
  end if;
  v_agency := brand_agency(p_brand);
  if v_agency is null then raise exception 'Marca não encontrada.'; end if;

  for d in 0..7 loop
    v_text := birthday_text_for(p_brand, v_today + d);
    if v_text is not null then
      v_parts := v_parts || case when v_parts = '' then '' else E'\n\n' end || birthday_heading(d, v_today + d) || E':\n' || v_text;
      v_found := v_found + 1;
    end if;
  end loop;

  insert into notifications (agency_id, brand_id, area, message)
  values (v_agency, p_brand, 'aniversarios',
    left('Teste do lembrete de aniversários. ' || case when v_found = 0 then 'Nos próximos 7 dias não há aniversários.' else E'Próximos 7 dias:\n' || v_parts end, 1900));
  return v_found;
end;
$$;
revoke execute on function birthday_reminder_test(uuid) from public, anon;
grant execute on function birthday_reminder_test(uuid) to authenticated;

-- ---------------------------------------------------------
-- 9. Agendamento: de hora a hora (a função decide pela hora de Lisboa)
-- ---------------------------------------------------------
select cron.unschedule(jobid) from cron.job where jobname = 'birthday-reminders-hourly';
select cron.schedule('birthday-reminders-hourly', '10 * * * *', $$select public.notify_birthdays();$$);
