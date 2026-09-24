-- =========================================================
-- WINGCARE — templates de WhatsApp das datas especiais (Twilio)
-- =========================================================
-- Corre isto depois do 65 e do 66 (um único Run; pode voltar a correr
-- sem duplicar).
--
-- Cria 4 templates em rascunho (Aniversário, Natal, Ano Novo, Dia da
-- Mulher) e liga-os às automações do 65, para chegarem também a quem
-- não fala connosco há mais de 24h. Submetem-se em WhatsApp > Templates
-- > "Submeter" (vão para a subconta Twilio ligada à marca WingCare).
--
-- Regra do WhatsApp (não pode começar numa variável): as mensagens
-- passam a começar por "Olá {{1}}," em vez de "{{1}},".
-- =========================================================

do $$
declare
  b uuid := (select id from brands where name = 'WingCare' order by created_at limit 1);
  r record;
begin
  if b is null then raise exception 'Marca WingCare não encontrada.'; end if;

  for r in
    select * from (values
      ('wc_data_aniversario',
       'Olá {{1}}, hoje é o seu dia! Toda a equipa Wingcare deseja-lhe um feliz aniversário e um ano repleto de sucessos, pessoais e profissionais.',
       '["Ana"]', 'Aniversário', '["{{primeiro_nome}}"]'),
      ('wc_data_natal',
       'Olá {{1}}, a equipa Wingcare deseja-lhe um Feliz Natal! Obrigado por fazer parte da nossa comunidade este ano.',
       '["Ana"]', 'Natal', '["{{primeiro_nome}}"]'),
      ('wc_data_ano_novo',
       'Olá {{1}}, um novo ano começa! Desejamos-lhe um {{2}} cheio de crescimento profissional e boas conquistas. Obrigado por confiar na Wingcare.',
       '["Ana", "2027"]', 'Ano Novo', '["{{primeiro_nome}}", "{{ano_seguinte}}"]'),
      ('wc_data_dia_mulher',
       'Olá {{1}}, hoje é o Dia Internacional da Mulher. A Wingcare quer agradecer-lhe o trabalho, a dedicação e o cuidado que coloca todos os dias na sua profissão. Feliz Dia da Mulher!',
       '["Ana"]', 'Dia da Mulher (8 de março)', '["{{primeiro_nome}}"]')
    ) as t(name, body, samples, automation_name, vars)
  loop
    if not exists (select 1 from whatsapp_templates where brand_id = b and name = r.name) then
      insert into whatsapp_templates (brand_id, name, language, category, body, variables, status)
      values (b, r.name, 'pt_PT', 'MARKETING', r.body, r.samples::jsonb, 'draft');
    end if;

    update automation_steps s
    set config = s.config || jsonb_build_object(
          'templateName', r.name,
          'templateVariables', r.vars::jsonb,
          'body', replace(replace(r.body, '{{1}}', '{{primeiro_nome}}'), '{{2}}', '{{ano_seguinte}}'))
    from automations a
    where a.id = s.automation_id
      and a.brand_id = b and a.name = r.automation_name
      and s.action_type = 'send_whatsapp';
  end loop;
end;
$$;

-- Verificação: 4 linhas, cada automação ligada ao seu template em rascunho
select a.name as automacao, s.config->>'templateName' as template, t.status
from automation_steps s
join automations a on a.id = s.automation_id
left join whatsapp_templates t on t.brand_id = a.brand_id and t.name = s.config->>'templateName'
where a.brand_id = (select id from brands where name = 'WingCare' order by created_at limit 1)
  and a.name in ('Aniversário', 'Natal', 'Ano Novo', 'Dia da Mulher (8 de março)')
  and s.action_type = 'send_whatsapp'
order by a.name;
