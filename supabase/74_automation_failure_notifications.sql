-- =========================================================
-- EMPOWER OS — NOTIFICAÇÕES INTERNAS DE FALHAS EM AUTOMAÇÕES
-- =========================================================
-- Corre isto depois do 73 (ou do 71/72, se ainda não tiveres corrido o 73 — não depende dele). Pode correr-se mais do que uma vez.
--
-- A tabela `notifications` já existia no schema (01_schema.sql) mas
-- nunca foi usada por nada — nem escrita, nem lida. Este ficheiro:
--   1. alarga o campo `area` para aceitar 'automacoes';
--   2. deixa o cliente da marca ver as notificações da sua marca (hoje
--      só a equipa via, via can_manage_agency);
--   3. acrescenta a `automation_runs.notified_at`, para saber que
--      execuções falhadas já entraram numa notificação — evita repetir
--      a mesma falha em cada ciclo do cron;
--   4. cria `notify_automation_failures()`, chamada pela função
--      automations-run no fim de cada ciclo: agrupa as execuções
--      falhadas (e ainda não notificadas) por automação e cria UMA
--      notificação por automação, com a lista de números/contactos que
--      falharam e o motivo. Visível à agência e à marca.
-- =========================================================

alter table notifications drop constraint if exists notifications_area_check;
alter table notifications add constraint notifications_area_check check (area in (
  'conteudos','roteiros','stories','plano_estrategico','propostas','portfolio','automacoes'
));

drop policy if exists notifications_select on notifications;
create policy notifications_select on notifications for select using (
  can_manage_agency(agency_id) or (brand_id is not null and is_brand_member(brand_id))
);

alter table automation_runs add column if not exists notified_at timestamptz;
create index if not exists idx_automation_runs_failed_unnotified
  on automation_runs(automation_id) where status = 'failed' and notified_at is null;

-- Agrupa as execuções falhadas (status='failed', ainda sem notificação)
-- por automação, e cria uma notificação por automação com a lista de
-- contactos/números afetados e o motivo. Devolve quantas notificações criou.
create or replace function notify_automation_failures() returns integer
language plpgsql security definer set search_path = public as $$
declare
  grp record;
  detail record;
  v_lines text;
  v_message text;
  v_created int := 0;
begin
  for grp in
    select r.automation_id, r.brand_id, a.name as automation_name, count(*) as n
    from automation_runs r
    join automations a on a.id = r.automation_id
    where r.status = 'failed' and r.notified_at is null
    group by r.automation_id, r.brand_id, a.name
  loop
    v_lines := '';
    for detail in
      select coalesce(nullif(ct.phone, ''), nullif(ct.email, ''), ct.name, 'contacto sem telefone/email') as quem,
             coalesce(r.error, 'erro desconhecido') as motivo
      from automation_runs r
      left join contacts ct on ct.id = r.contact_id
      where r.automation_id = grp.automation_id and r.brand_id = grp.brand_id
        and r.status = 'failed' and r.notified_at is null
      order by r.created_at
      limit 20
    loop
      v_lines := v_lines || E'\n— ' || detail.quem || ': ' || detail.motivo;
    end loop;

    v_message := grp.n || ' execução(ões) da automação "' || grp.automation_name || '" falharam:' || v_lines;
    if grp.n > 20 then
      v_message := v_message || E'\n(mostrando as primeiras 20 de ' || grp.n || ')';
    end if;

    insert into notifications (agency_id, brand_id, area, message)
    values (brand_agency(grp.brand_id), grp.brand_id, 'automacoes', v_message);
    v_created := v_created + 1;

    update automation_runs
    set notified_at = now()
    where automation_id = grp.automation_id and brand_id = grp.brand_id
      and status = 'failed' and notified_at is null;
  end loop;

  return v_created;
end;
$$;

revoke execute on function notify_automation_failures() from public, anon, authenticated;

-- Marca notificações como lidas por quem chama (acrescenta o próprio id a
-- read_by; nunca apaga quem já lá estava — evita perder leituras de outra
-- pessoa por causa de duas pessoas a abrir o sino ao mesmo tempo). Só marca
-- as que a pessoa já podia ver (a RLS de select aplica-se na mesma).
create or replace function mark_notifications_read(p_ids uuid[]) returns void
language sql security definer set search_path = public as $$
  update notifications
  set read_by = array(select distinct unnest(read_by || array[auth.uid()]))
  where id = any(p_ids)
    and (can_manage_agency(agency_id) or (brand_id is not null and is_brand_member(brand_id)))
    and not (auth.uid() = any(read_by));
$$;

revoke execute on function mark_notifications_read(uuid[]) from public, anon;
grant execute on function mark_notifications_read(uuid[]) to authenticated;
