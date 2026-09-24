-- =========================================================
-- WINGCARE — templates de WhatsApp dos restantes fluxos (Twilio)
-- =========================================================
-- Corre isto depois do 67 (um único Run; pode voltar a correr sem
-- duplicar).
--
-- Cria 21 templates em rascunho e liga cada um ao passo de WhatsApp
-- correspondente das automações do 61:
--   Boas-vindas Formação (3) · Boas-vindas Produtos (2)
--   Recuperação de orçamento Formação (3) e Produtos (3)
--   Cross-selling pós-formação (3) · Onboarding por curso (3, UTILITY)
--   Ciclo pós-formação (3) · NPS pós-compra (1)
-- Submetem-se em WhatsApp > Templates > "Submeter".
--
-- FICAM DE FORA (têm conteúdo por preencher — um template aprovado com
-- "[testemunho…]" enviaria esse texto tal e qual). Criam-se quando o
-- conteúdo chegar:
--   Boas-vindas Formação dia 3 · Boas-vindas Produtos dias 1 e 3 ·
--   Cross-selling dia 15 · Onboarding 7 dias antes (checklist) ·
--   Ciclo pós-formação dia 0 (link) · Onboarding após cada sessão (link;
--   também não está nas automações).
--
-- Regras do WhatsApp aplicadas ao texto aprovado:
--  - não pode começar numa variável → "Olá {{1}}," no início;
--  - não pode terminar numa variável → pequena frase final quando a
--    mensagem acabava em {{…}}?;
--  - poucas palavras para muitas variáveis → o lembrete da véspera
--    ganhou "Estamos à sua espera na".
-- =========================================================

do $wc68$
declare
  b uuid := (select id from brands where name = 'WingCare' order by created_at limit 1);
  r record;
  v_vars jsonb;
  v_body text;
  v_i int;
begin
  if b is null then raise exception 'Marca WingCare não encontrada.'; end if;

  -- name, categoria, texto, exemplos, automação, n.º do passo de WhatsApp, campos das variáveis
  for r in
    select * from (values
      -- BOAS-VINDAS — FORMAÇÃO
      ('wc_bv_formacao_d0', 'MARKETING',
       'Olá {{1}}! Bem-vinda à Wingcare Institute. Somos um instituto focado em formar profissionais de estética, saúde e bem-estar com critério, raciocínio terapêutico e resultados reais, com prática desde o primeiro dia (é a nossa metodologia Learn by Doing). Nos próximos dias iremos partilhar consigo como funciona a formação em {{2}} e o que pode esperar. Qualquer dúvida, escreva por aqui.',
       '["Ana", "Skin Expert em Limpeza de Pele & Aparatologia"]', 'Boas-vindas — Formação (7 dias)', 1, '["primeiro_nome", "curso_interesse"]'),
      ('wc_bv_formacao_d1', 'MARKETING',
       'Olá {{1}}, sabia que na maioria das nossas formações a prática é feita em modelos reais e com supervisão? É por isso que as nossas alunas saem preparadas para trabalhar, não só com certificado, mas com mão treinada. Deseja que lhe expliquemos como é o dia-a-dia da formação em {{2}}? Basta responder a esta mensagem.',
       '["Ana", "Skin Expert em Limpeza de Pele & Aparatologia"]', 'Boas-vindas — Formação (7 dias)', 2, '["primeiro_nome", "curso_interesse"]'),
      ('wc_bv_formacao_d7', 'MARKETING',
       'Olá {{1}}, para quem se inscreve esta semana temos a Masterclass Transversal. Deseja que lhe enviemos os detalhes e as próximas datas de turma?',
       '["Ana"]', 'Boas-vindas — Formação (7 dias)', 4, '["primeiro_nome"]'),

      -- BOAS-VINDAS — PRODUTOS
      ('wc_bv_produtos_d0', 'MARKETING',
       'Olá {{1}}! Obrigado pelo interesse nos nossos dermocosméticos exclusivos da Wingcare. Oferecemos-lhe soluções pensadas para gabinete profissional e Homecare: Podocare Dermocosmetics, JMF Cosmetics e World of Beauty. Podemos já perceber: o seu interesse é mais para pedicure, tratamentos faciais/corporais ou dermocosmética premium?',
       '["Ana"]', 'Boas-vindas — Produtos (7 dias)', 1, '["primeiro_nome"]'),
      ('wc_bv_produtos_d7', 'MARKETING',
       'Olá {{1}}, para a sua primeira encomenda temos a Masterclass Transversal. Enviamos-lhe a tabela atualizada para avançar?',
       '["Ana"]', 'Boas-vindas — Produtos (7 dias)', 4, '["primeiro_nome"]'),

      -- RECUPERAÇÃO DE ORÇAMENTO — FORMAÇÃO
      ('wc_orc_formacao_t1', 'MARKETING',
       'Olá {{1}}, ainda tem interesse na formação de {{2}}? Ficou alguma dúvida sobre o programa, datas ou valores que possamos esclarecer?',
       '["Ana", "Skin Expert em Peelings Químicos & Integrativos"]', 'Recuperação de orçamento — Formação', 1, '["primeiro_nome", "curso_interesse"]'),
      ('wc_orc_formacao_t2', 'MARKETING',
       'Sabemos que decidir investir numa formação não é rápido, e é suposto não ser. Se ajudar, podemos mostrar-lhe o percurso de uma aluna que fez este curso, ou esclarecer dúvidas sobre saídas profissionais depois da certificação.',
       '[]', 'Recuperação de orçamento — Formação', 2, '[]'),
      ('wc_orc_formacao_t3', 'MARKETING',
       'Não queremos insistir, {{1}}, só gostaríamos de lhe deixar a saber que as vagas são limitadas e a inscrição só fica válida com o preenchimento da ficha de inscrição e o pagamento na modalidade escolhida. Sempre que desejar avançar, ficamos à disposição por aqui.',
       '["Ana"]', 'Recuperação de orçamento — Formação', 3, '["primeiro_nome"]'),

      -- RECUPERAÇÃO DE ORÇAMENTO — PRODUTOS
      ('wc_orc_produtos_t1', 'MARKETING',
       'Olá {{1}}, chegou a receber o orçamento de {{2}}? Ficamos a saber se ficou alguma questão sobre quantidades, prazos de entrega ou aplicação do produto.',
       '["Ana", "Skin Cleansing"]', 'Recuperação de orçamento — Produtos', 1, '["primeiro_nome", "linha_interesse"]'),
      ('wc_orc_produtos_t2', 'MARKETING',
       'Se ajudar, podemos explicar melhor como funciona {{1}} na prática ou partilhar resultados (antes e depois) de outras profissionais que já trabalham com a linha.',
       '["Skin Cleansing"]', 'Recuperação de orçamento — Produtos', 2, '["linha_interesse"]'),
      ('wc_orc_produtos_t3', 'MARKETING',
       'Olá {{1}}, o orçamento continua válido e à sua disposição sempre que desejar avançar. Qualquer dúvida, estamos por aqui.',
       '["Ana"]', 'Recuperação de orçamento — Produtos', 3, '["primeiro_nome"]'),

      -- CROSS-SELLING PÓS-FORMAÇÃO
      ('wc_cross_d0', 'MARKETING',
       'Olá {{1}}, parabéns pela conclusão da formação em {{2}}! É um orgulho tê-la como Alumni Wingcare. Para continuar a colocar em prática o que aprendeu, temos a linha {{3}}, pensada exatamente para os protocolos que trabalhámos na formação. Gostaria de conhecer melhor?',
       '["Ana", "Skin Expert em Limpeza de Pele & Aparatologia", "de limpeza de pele e homecare"]', 'Cross-selling pós-formação (30 dias)', 1, '["primeiro_nome", "curso_concluido", "linha_recomendada"]'),
      ('wc_cross_d7', 'MARKETING',
       'Olá {{1}}, lembra-se do protocolo de {{2}} que praticámos na formação? A linha {{3}} foi desenvolvida para dar continuidade exatamente a esse tipo de resultado em gabinete. Deseja que lhe enviemos a ficha técnica e a tabela profissional?',
       '["Ana", "limpeza de pele", "de limpeza de pele e homecare"]', 'Cross-selling pós-formação (30 dias)', 2, '["primeiro_nome", "tecnica_curso", "linha_recomendada"]'),
      ('wc_cross_d30', 'MARKETING',
       'Olá {{1}}, como Alumni Wingcare tem 5% de desconto na sua primeira encomenda da linha {{2}}. Deseja avançar com o pedido?',
       '["Ana", "de limpeza de pele e homecare"]', 'Cross-selling pós-formação (30 dias)', 4, '["primeiro_nome", "linha_recomendada"]'),

      -- ONBOARDING POR CURSO (transacional)
      ('wc_onb_inscricao', 'UTILITY',
       'Olá {{1}}, a sua inscrição em {{2}} está confirmada! Seja bem-vinda. Nos próximos dias enviaremos tudo o que precisa de saber antes do primeiro dia: datas, local, materiais e o que deve trazer.',
       '["Ana", "Skin Expert em Limpeza de Pele & Aparatologia"]', 'Onboarding por curso', 1, '["primeiro_nome", "curso_inscrito"]'),
      ('wc_onb_vespera', 'UTILITY',
       'Olá {{1}}, é já amanhã! Estamos à sua espera na formação de {{2}}, às {{3}}, em {{4}}. Qualquer imprevisto, contacte-nos por aqui.',
       '["Ana", "Skin Expert em Limpeza de Pele & Aparatologia", "09:30", "Wingcare Institute, Lisboa"]', 'Onboarding por curso', 3, '["primeiro_nome", "curso_inscrito", "hora_inicio", "local_formacao"]'),
      ('wc_onb_fim', 'UTILITY',
       'Olá {{1}}, chegámos ao fim da formação em {{2}}! Nos próximos dias vamos tratar da entrega do certificado e dar-lhe as boas-vindas oficiais à comunidade Alumni Wingcare.',
       '["Ana", "Skin Expert em Limpeza de Pele & Aparatologia"]', 'Onboarding por curso', 4, '["primeiro_nome", "curso_inscrito"]'),

      -- CICLO PÓS-FORMAÇÃO
      ('wc_ciclo_d45_nps', 'MARKETING',
       'Olá {{1}}, já teve oportunidade de aplicar o que aprendeu em {{2}}? Gostaríamos de saber como foi a sua experiência connosco. Numa escala de 0 a 10, qual a probabilidade de recomendar a Wingcare a uma colega?',
       '["Ana", "Skin Expert em Limpeza de Pele & Aparatologia"]', 'Ciclo pós-formação (90 dias) — PENDENTE decisão do cliente', 2, '["primeiro_nome", "curso_concluido"]'),
      ('wc_ciclo_d60', 'MARKETING',
       'Olá {{1}}, sabia que também dispomos de soluções na área de corpo e rosto? Trabalhamos com marcas exclusivas e temos soluções que vão desde a limpeza de pele, peelings químicos, bioestimulação facial e corporal, microagulhamento, nanoagulhamento, entre outros. Podemos agendar uma reunião para apurar as suas necessidades e perceber se a podemos ajudar a evoluir profissionalmente?',
       '["Ana"]', 'Ciclo pós-formação (90 dias) — PENDENTE decisão do cliente', 3, '["primeiro_nome"]'),
      ('wc_ciclo_d90', 'MARKETING',
       'Olá {{1}}, passaram já 90 dias desde a sua certificação em {{2}}! Esperamos que este percurso esteja a correr bem. Continuamos por aqui sempre que precisar, seja para dúvidas técnicas ou para os nossos produtos profissionais. Faz parte da família Wingcare.',
       '["Ana", "Skin Expert em Limpeza de Pele & Aparatologia"]', 'Ciclo pós-formação (90 dias) — PENDENTE decisão do cliente', 4, '["primeiro_nome", "curso_concluido"]'),

      -- NPS PÓS-COMPRA
      ('wc_nps_produto', 'MARKETING',
       'Olá {{1}}, já teve oportunidade de experimentar {{2}}? Gostaríamos de saber a sua opinião. Numa escala de 0 a 10, qual a probabilidade de recomendar a Wingcare a uma colega?',
       '["Ana", "Podocare Dermocosmetics"]', 'NPS — pós-compra de produto', 1, '["primeiro_nome", "linha_comprada"]')
    ) as t(name, category, body, samples, automation_name, touch, fields)
  loop
    if not exists (select 1 from whatsapp_templates where brand_id = b and name = r.name) then
      insert into whatsapp_templates (brand_id, name, language, category, body, variables, status)
      values (b, r.name, 'pt_PT', r.category, r.body, r.samples::jsonb, 'draft');
    end if;

    -- Variáveis do passo: {{1}} → {{primeiro_nome}}, {{2}} → {{campo}}…
    select coalesce(jsonb_agg('{{' || f || '}}' order by n), '[]'::jsonb)
      into v_vars
      from jsonb_array_elements_text(r.fields::jsonb) with ordinality as x(f, n);
    v_body := r.body;
    for v_i in 1 .. jsonb_array_length(r.fields::jsonb) loop
      v_body := replace(v_body, '{{' || v_i || '}}', '{{' || (r.fields::jsonb ->> (v_i - 1)) || '}}');
    end loop;

    update automation_steps s
    set config = s.config || jsonb_build_object('templateName', r.name, 'templateVariables', v_vars, 'body', v_body)
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
$wc68$;

-- Verificação: todos os passos de WhatsApp da WingCare e o template de cada um
-- (sem template = ainda texto livre, só chega dentro da janela de 24h)
select a.name as automacao, s.position, s.config->>'templateName' as template, t.status
from automation_steps s
join automations a on a.id = s.automation_id
left join whatsapp_templates t on t.brand_id = a.brand_id and t.name = s.config->>'templateName'
where a.brand_id = (select id from brands where name = 'WingCare' order by created_at limit 1)
  and s.action_type = 'send_whatsapp'
order by (s.config->>'templateName') is null desc, a.name, s.position;
