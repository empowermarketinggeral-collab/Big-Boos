-- =========================================================
-- WINGCARE — pipeline próprio da Mentoria Negócio Magnético
-- =========================================================
-- Corre isto depois do 68 (um único Run; pode voltar a correr sem
-- duplicar).
--
-- A Mentoria tem um perfil de lead diferente (donas de negócio) e um
-- processo de venda com reunião e proposta, por isso sai do pipeline
-- "Formação". Os restantes cursos continuam todos no pipeline
-- "Formação", identificados pela tag Curso_<curso>.
-- A tarefa criada quando chega um lead da Mentoria passa a apontar
-- para este pipeline.
-- =========================================================

do $wc69$
declare
  b uuid := (select id from brands where name = 'WingCare' order by created_at limit 1);
  v_pipe uuid;
begin
  if b is null then raise exception 'Marca WingCare não encontrada.'; end if;

  if not exists (select 1 from pipelines where brand_id = b and name = 'Mentoria Negócio Magnético') then
    insert into pipelines (brand_id, name, is_default) values (b, 'Mentoria Negócio Magnético', false) returning id into v_pipe;
    insert into pipeline_stages (brand_id, pipeline_id, name, position, is_won, is_lost) values
      (b, v_pipe, 'Novo lead', 1, false, false),
      (b, v_pipe, 'Em contacto', 2, false, false),
      (b, v_pipe, 'Reunião agendada', 3, false, false),
      (b, v_pipe, 'Proposta enviada', 4, false, false),
      (b, v_pipe, 'Inscrição confirmada', 5, true, false),
      (b, v_pipe, 'Perdido', 6, false, true);
  end if;

  update automation_steps s
  set config = s.config || jsonb_build_object('title',
        'Novo lead da Mentoria Negócio Magnético: contactar e criar negócio no pipeline Mentoria Negócio Magnético')
  from automations a
  where a.id = s.automation_id
    and a.brand_id = b
    and a.name = 'Formação — interesse: Mentoria Negócio Magnético'
    and s.action_type = 'create_task';
end;
$wc69$;

-- Verificação: 6 etapas
select p.name as pipeline, st.position, st.name as etapa, st.is_won, st.is_lost
from pipelines p
join pipeline_stages st on st.pipeline_id = p.id
where p.brand_id = (select id from brands where name = 'WingCare' order by created_at limit 1)
  and p.name = 'Mentoria Negócio Magnético'
order by st.position;
