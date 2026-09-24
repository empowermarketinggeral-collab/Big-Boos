-- =========================================================
-- EMPOWER OS — HORA DE ENVIO CONFIGURÁVEL NOS GATILHOS POR DATA
-- =========================================================
-- Corre isto depois do 63. Pode correr-se mais do que uma vez.
--
-- Cada automação de aniversário / data especial passa a ter
-- trigger_config->>'hourLocal' (0-23, hora de Lisboa; por omissão 9).
-- O pg_cron passa a correr de hora a hora; a função só arranca as
-- automações cuja hora já chegou nesse dia. Se uma automação for ativada
-- depois da hora escolhida, arranca na hora seguinte. A tabela
-- automation_date_fires continua a impedir envios duplicados.
-- =========================================================

drop function if exists fire_date_automations(date);

-- p_ignore_hour = true ignora a hora (útil para testar à mão):
--   select fire_date_automations(current_date, true);
create or replace function fire_date_automations(p_today date default null, p_ignore_hour boolean default false) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_today date := coalesce(p_today, (now() at time zone 'Europe/Lisbon')::date);
  v_hour int := extract(hour from (now() at time zone 'Europe/Lisbon'))::int;
  auto record;
  r record;
  v_send_hour int;
  v_days int;
  v_target date;
  v_year int;
  v_leap boolean;
  v_rows int;
  v_started int := 0;
begin
  for auto in
    select id, brand_id, trigger_type, trigger_config
    from automations
    where status = 'active' and trigger_type in ('contact_birthday', 'annual_date')
  loop
    -- Uma configuração inválida (ex: tagId mal formado) não pode travar
    -- as restantes automações neste ciclo.
    begin
      v_send_hour := greatest(0, least(coalesce((auto.trigger_config->>'hourLocal')::int, 9), 23));
      if not p_ignore_hour and v_hour < v_send_hour then
        continue;
      end if;

      v_days := greatest(0, least(coalesce((auto.trigger_config->>'daysBefore')::int, 0), 60));
      v_target := v_today + v_days;
      v_year := extract(year from v_target)::int;
      v_leap := (v_year % 4 = 0 and (v_year % 100 <> 0 or v_year % 400 = 0));

      for r in
        select ct.id
        from contacts ct
        where ct.brand_id = auto.brand_id
          and (
            (auto.trigger_type = 'contact_birthday' and ct.birth_date is not null and (
              (extract(month from ct.birth_date) = extract(month from v_target)
                and extract(day from ct.birth_date) = extract(day from v_target))
              -- quem nasceu a 29/02 celebra a 28/02 nos anos não bissextos
              or (not v_leap and extract(month from v_target) = 2 and extract(day from v_target) = 28
                and extract(month from ct.birth_date) = 2 and extract(day from ct.birth_date) = 29)
            ))
            or
            (auto.trigger_type = 'annual_date'
              and extract(month from v_target) = (auto.trigger_config->>'month')::int
              and extract(day from v_target) = (auto.trigger_config->>'day')::int)
          )
          and (
            coalesce((auto.trigger_config->>'requireConsent')::boolean, true) = false
            or ct.opted_in_whatsapp or ct.opted_in_email or ct.opted_in_sms
          )
          and (
            auto.trigger_config->>'tagId' is null
            or exists (
              select 1 from contact_tags t
              where t.contact_id = ct.id and t.tag_id = (auto.trigger_config->>'tagId')::uuid
            )
          )
      loop
        insert into automation_date_fires (automation_id, contact_id, period)
        values (auto.id, r.id, v_year::text)
        on conflict do nothing;
        get diagnostics v_rows = row_count;
        if v_rows > 0 then
          perform start_automation_run(auto.id, auto.brand_id, r.id);
          v_started := v_started + 1;
        end if;
      end loop;
    exception when others then
      raise warning 'fire_date_automations: automação % falhou: %', auto.id, sqlerrm;
    end;
  end loop;

  return v_started;
end;
$$;

revoke execute on function fire_date_automations(date, boolean) from public, anon, authenticated;

-- De hora a hora, à hora certa (substitui o job diário da migração 63).
select cron.unschedule(jobid) from cron.job
where jobname in ('automations-date-triggers-daily', 'automations-date-triggers-hourly');

select cron.schedule('automations-date-triggers-hourly', '0 * * * *', $$select public.fire_date_automations();$$);
