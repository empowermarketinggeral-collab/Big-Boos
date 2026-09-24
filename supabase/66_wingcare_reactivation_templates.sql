-- =========================================================
-- WINGCARE — templates de WhatsApp da reativação (Twilio)
-- =========================================================
-- Corre isto depois do 65 (ou só depois do 62 — não
-- depende do 63). Um único Run; pode voltar a correr sem duplicar.
--
-- 1. whatsapp_templates passa a aceitar o estado 'draft' (rascunho por
--    submeter).
-- 2. Cria os 12 templates da reativação (4 segmentos x 3 toques) em
--    rascunho, na marca WingCare. Submetem-se no módulo WhatsApp >
--    Templates > "Submeter" — vão para a conta Twilio ligada à marca
--    WingCare (a subconta dela) e daí para aprovação do WhatsApp.
-- 3. Os passos de WhatsApp das 4 automações de reativação passam a
--    enviar por template (templateName + templateVariables). Enquanto o
--    template não estiver aprovado, o passo falha com essa indicação.
--
-- Alterações ao texto aprovado no documento (regra do WhatsApp: um
-- template não pode começar nem terminar com uma variável):
--  - os toques 2 e 3 começam por "Olá {{1}}," em vez de "{{1}},";
--  - Ex-Cliente 12-24m, toque 1: "Continua a trabalhar com {{2}} no seu
--    dia a dia?" (antes terminava na variável).
-- =========================================================

alter table whatsapp_templates drop constraint if exists whatsapp_templates_meta_status_check;
alter table whatsapp_templates drop constraint if exists whatsapp_templates_status_check;
alter table whatsapp_templates add constraint whatsapp_templates_status_check
  check (status in ('draft', 'pending', 'approved', 'rejected'));

do $$
declare
  b uuid := (select id from brands where name = 'WingCare' order by created_at limit 1);
  r record;
begin
  if b is null then raise exception 'Marca WingCare não encontrada.'; end if;

  -- name, texto, valores de exemplo ({{1}}, {{2}}), automação, toque, campo do {{2}}
  for r in
    select * from (values
      ('wc_reativ_exaluna_12_24_t1',
       'Olá {{1}}! Há já algum tempo que não falamos. Espero que esteja tudo bem consigo e com o seu percurso profissional. Lembramo-nos que concluiu a formação em {{2}} connosco. Continua a trabalhar nessa área?',
       '["Ana", "Pedicure Profissional e Terapêutica"]', 'Reativação — Ex-Aluna 12-24 meses', 1, 'curso_concluido'),
      ('wc_reativ_exaluna_12_24_t2',
       'Olá {{1}}, gostaríamos de manter o contacto consigo. Se lhe fizer sentido, podemos voltar a enviar-lhe conteúdo relevante para a sua área: novidades de formação, dicas técnicas, o que fizer sentido. Tem interesse em continuar a acompanhar a Wingcare?',
       '["Ana"]', 'Reativação — Ex-Aluna 12-24 meses', 2, null),
      ('wc_reativ_exaluna_12_24_t3',
       'Olá {{1}}, ficamos sempre disponíveis caso queira retomar o contacto, seja para tirar dúvidas técnicas, saber mais sobre novas formações, ou simplesmente dizer olá. Continuamos por aqui!',
       '["Ana"]', 'Reativação — Ex-Aluna 12-24 meses', 3, null),

      ('wc_reativ_excliente_12_24_t1',
       'Olá {{1}}! Há já algum tempo que não fazia uma encomenda connosco. Esperamos que esteja tudo bem no seu gabinete. Continua a trabalhar com {{2}} no seu dia a dia?',
       '["Ana", "Podocare Dermocosmetics"]', 'Reativação — Ex-Cliente Produtos 12-24 meses', 1, 'marca_comprada'),
      ('wc_reativ_excliente_12_24_t2',
       'Olá {{1}}, se ainda utiliza {{2}} (ou se as suas necessidades mudaram entretanto), temos todo o gosto em enviar-lhe a tabela profissional atualizada. Sem compromisso.',
       '["Ana", "Podocare Dermocosmetics"]', 'Reativação — Ex-Cliente Produtos 12-24 meses', 2, 'marca_comprada'),
      ('wc_reativ_excliente_12_24_t3',
       'Olá {{1}}, ficamos à disposição sempre que precisar, seja para reabastecer, tirar dúvidas técnicas, ou conhecer outras linhas da Wingcare.',
       '["Ana"]', 'Reativação — Ex-Cliente Produtos 12-24 meses', 3, null),

      ('wc_reativ_exaluna_24_t1',
       'Olá {{1}}! Há bastante tempo que não temos notícias suas. Espero que esteja tudo bem. Recordamo-nos que passou pela Wingcare para a formação em {{2}}. Continua ligada à área da estética?',
       '["Ana", "Pedicure Profissional e Terapêutica"]', 'Reativação — Ex-Aluna 24+ meses', 1, 'curso_concluido'),
      ('wc_reativ_exaluna_24_t2',
       'Olá {{1}}, a Wingcare tem crescido bastante desde a última vez que esteve connosco: novas formações, nova estrutura, novos protocolos. Se ainda lhe fizer sentido fazer parte da nossa comunidade, gostaríamos de a voltar a incluir nas nossas comunicações. Tem interesse?',
       '["Ana"]', 'Reativação — Ex-Aluna 24+ meses', 2, null),
      ('wc_reativ_exaluna_24_t3',
       'Olá {{1}}, não queremos insistir, mas se em algum momento quiser voltar a ligar-se à Wingcare, seja para formação ou produtos, temos sempre a porta aberta. Foi um prazer tê-la connosco no passado.',
       '["Ana"]', 'Reativação — Ex-Aluna 24+ meses', 3, null),

      ('wc_reativ_excliente_24_t1',
       'Olá {{1}}! Há bastante tempo que não fazia uma encomenda connosco. Esperamos que esteja tudo bem. Recordamo-nos que trabalhou com {{2}}. Ainda está ligada à área da estética profissional?',
       '["Ana", "JMF Cosmetics"]', 'Reativação — Ex-Cliente Produtos 24+ meses', 1, 'linha_comprada'),
      ('wc_reativ_excliente_24_t2',
       'Olá {{1}}, a Wingcare continua a desenvolver as suas linhas profissionais. Se voltar a fazer sentido para o seu gabinete, temos todo o gosto em enviar-lhe informação atualizada, sem qualquer compromisso.',
       '["Ana"]', 'Reativação — Ex-Cliente Produtos 24+ meses', 2, null),
      ('wc_reativ_excliente_24_t3',
       'Olá {{1}}, ficamos sempre disponíveis caso queira retomar o contacto no futuro. Foi um prazer tê-la como cliente.',
       '["Ana"]', 'Reativação — Ex-Cliente Produtos 24+ meses', 3, null)
    ) as t(name, body, samples, automation_name, touch, field2)
  loop
    -- Template em rascunho
    if not exists (select 1 from whatsapp_templates where brand_id = b and name = r.name) then
      insert into whatsapp_templates (brand_id, name, language, category, body, variables, status)
      values (b, r.name, 'pt_PT', 'MARKETING', r.body, r.samples::jsonb, 'draft');
    end if;

    -- N-ésimo passo de WhatsApp da automação passa a usar o template
    update automation_steps s
    set config = s.config || jsonb_build_object(
          'templateName', r.name,
          'templateVariables', case when r.field2 is null then '["{{primeiro_nome}}"]'::jsonb
                                    else jsonb_build_array('{{primeiro_nome}}', '{{' || r.field2 || '}}') end,
          'body', replace(replace(r.body, '{{1}}', '{{primeiro_nome}}'), '{{2}}', '{{' || coalesce(r.field2, '') || '}}'))
    where s.id = (
      select x.id from (
        select st.id, row_number() over (order by st.position) as n
        from automation_steps st
        join automations a on a.id = st.automation_id
        where a.brand_id = b and a.name = r.automation_name and st.action_type = 'send_whatsapp'
      ) x where x.n = r.touch
    );
  end loop;
end;
$$;

-- Verificação: 12 templates em rascunho e 12 passos ligados
select a.name as automacao, s.position, s.config->>'templateName' as template, t.status
from automation_steps s
join automations a on a.id = s.automation_id
left join whatsapp_templates t on t.brand_id = a.brand_id and t.name = s.config->>'templateName'
where a.brand_id = (select id from brands where name = 'WingCare' order by created_at limit 1)
  and a.name like 'Reativação —%' and s.action_type = 'send_whatsapp'
order by a.name, s.position;
