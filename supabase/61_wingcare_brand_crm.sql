-- =========================================================
-- WINGCARE — marca, CRM (pipelines + tags) e automações
-- =========================================================
-- Corre isto depois do 60_booking_deposit_payments.sql, no SQL Editor
-- do Supabase (um único Run — usa funções temporárias da sessão).
--
-- Fonte: "Copy dos fluxos de automação CRM" (24/08/2026), Wingcare
-- Institute x Empower Marketing.
--
-- SEGURANÇA
--  - Todas as automações ficam em status 'draft': NADA é enviado até
--    alguém as ativar no módulo Automações.
--  - Idempotente: pode voltar a correr; o que já existe não duplica.
--  - Várias mensagens têm [PLACEHOLDERS] que o cliente ainda tem de
--    fornecer (testemunhos, checklist, links). Ver a query final.
--  - NÃO ativar os fluxos de reativação nem importar a base Sage sem
--    confirmar o consentimento (RGPD) dos contactos e ter templates
--    WhatsApp aprovados (mensagens de texto livre só chegam dentro da
--    janela de 24h).
--
-- CAMPOS PERSONALIZADOS (contacts.custom_fields) usados pelas mensagens:
--   curso_interesse, linha_interesse, curso_concluido, tecnica_curso,
--   linha_recomendada, marca_comprada, linha_comprada, curso_inscrito,
--   hora_inicio, local_formacao,
--   data_inicio_curso (AAAA-MM-DD), data_fim_curso (AAAA-MM-DD)
-- Se um contacto não tiver o campo usado pela mensagem, a execução
-- falha com o nome da variável em falta (não envia texto incompleto).
-- Requer o motor atualizado (supabase/functions/automations-run) com
-- variáveis {{...}}, stopTagIds/stopOnReply e esperas por data.
-- =========================================================

-- ---------------------------------------------------------
-- Helpers temporários
-- ---------------------------------------------------------
create or replace function pg_temp.wc_tag_id(p_brand uuid, p_name text) returns uuid
language sql as $$
  select id from tags where brand_id = p_brand and lower(name) = lower(p_name)
$$;

create or replace function pg_temp.wc_auto(p_brand uuid, p_name text, p_trigger_tag text, p_stop_tags text[], p_stop_on_reply boolean) returns uuid
language plpgsql as $$
declare
  v_id uuid;
  v_config jsonb := '{}'::jsonb;
  v_stop uuid[];
begin
  if exists (select 1 from automations where brand_id = p_brand and name = p_name) then
    return null;
  end if;
  if pg_temp.wc_tag_id(p_brand, p_trigger_tag) is null then
    raise exception 'Tag de gatilho inexistente: %', p_trigger_tag;
  end if;
  v_config := jsonb_build_object('tagId', pg_temp.wc_tag_id(p_brand, p_trigger_tag));
  if p_stop_tags is not null and array_length(p_stop_tags, 1) > 0 then
    select array_agg(pg_temp.wc_tag_id(p_brand, t)) into v_stop from unnest(p_stop_tags) t;
    if array_position(v_stop, null) is not null then
      raise exception 'Tag de paragem inexistente em: %', p_stop_tags;
    end if;
    v_config := v_config || jsonb_build_object('stopTagIds', to_jsonb(v_stop));
  end if;
  if p_stop_on_reply then
    v_config := v_config || jsonb_build_object('stopOnReply', true);
  end if;
  insert into automations (brand_id, name, trigger_type, trigger_config, status)
  values (p_brand, p_name, 'contact_tagged', v_config, 'draft')
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function pg_temp.wc_next_pos(p_auto uuid) returns int
language sql as $$
  select coalesce(max(position), 0) + 1 from automation_steps where automation_id = p_auto
$$;

create or replace function pg_temp.wc_wait(p_auto uuid, p_minutes int) returns void
language plpgsql as $$
begin
  if p_auto is null then return; end if;
  insert into automation_steps (brand_id, automation_id, position, type, wait_minutes, config)
  select brand_id, id, pg_temp.wc_next_pos(id), 'wait', p_minutes, '{}'::jsonb from automations where id = p_auto;
end;
$$;

create or replace function pg_temp.wc_until(p_auto uuid, p_field text, p_offset_days int, p_hour_utc int default 9) returns void
language plpgsql as $$
begin
  if p_auto is null then return; end if;
  insert into automation_steps (brand_id, automation_id, position, type, wait_minutes, config)
  select brand_id, id, pg_temp.wc_next_pos(id), 'wait', 1,
         jsonb_build_object('untilField', p_field, 'offsetDays', p_offset_days, 'hourUTC', p_hour_utc)
  from automations where id = p_auto;
end;
$$;

create or replace function pg_temp.wc_wa(p_auto uuid, p_body text) returns void
language plpgsql as $$
begin
  if p_auto is null then return; end if;
  insert into automation_steps (brand_id, automation_id, position, type, action_type, config)
  select brand_id, id, pg_temp.wc_next_pos(id), 'action', 'send_whatsapp', jsonb_build_object('body', p_body)
  from automations where id = p_auto;
end;
$$;

create or replace function pg_temp.wc_tag(p_auto uuid, p_tag text) returns void
language plpgsql as $$
begin
  if p_auto is null then return; end if;
  insert into automation_steps (brand_id, automation_id, position, type, action_type, config)
  select brand_id, id, pg_temp.wc_next_pos(id), 'action', 'add_tag', jsonb_build_object('tagId', pg_temp.wc_tag_id(brand_id, p_tag))
  from automations where id = p_auto;
end;
$$;

create or replace function pg_temp.wc_task(p_auto uuid, p_title text, p_due_minutes int default 1440) returns void
language plpgsql as $$
begin
  if p_auto is null then return; end if;
  insert into automation_steps (brand_id, automation_id, position, type, action_type, config)
  select brand_id, id, pg_temp.wc_next_pos(id), 'action', 'create_task',
         jsonb_build_object('title', p_title, 'dueInMinutes', p_due_minutes)
  from automations where id = p_auto;
end;
$$;

-- ---------------------------------------------------------
-- 1. Marca, tags e pipelines
-- ---------------------------------------------------------
do $$
declare
  v_agency uuid;
  v_brand uuid;
  v_pipe uuid;
begin
  select id into v_agency from agencies where is_root = true limit 1;
  if v_agency is null then
    raise exception 'Não foi encontrada a agência raiz (agencies.is_root = true).';
  end if;

  select id into v_brand from brands where agency_id = v_agency and name = 'WingCare' limit 1;
  if v_brand is null then
    insert into brands (agency_id, name, category, status, goal, contract_scope)
    values (
      v_agency, 'WingCare', 'estetica', 'green',
      'CRM em 3 frentes: reativação e nutrição da base, formação (captação, nutrição, inscrição, cross-sell) e marcas (Podocare Dermocosmetics, JMF Cosmetics, World of Beauty).',
      'CRM e automações Wingcare Institute: captação (Google/Meta Ads + WhatsApp), boas-vindas, recuperação de orçamento, cross-selling pós-formação, onboarding por curso, reativação de base, ciclo pós-formação, NPS, programa de indicação e datas especiais.'
    )
    returning id into v_brand;
  end if;

  -- TAGS -----------------------------------------------------
  insert into tags (brand_id, name, color) values
    -- origem
    (v_brand, 'Lead_WhatsApp', '#25D366'),
    (v_brand, 'Lead_Website', '#3B82F6'),
    (v_brand, 'Lead_GoogleAds', '#F59E0B'),
    (v_brand, 'Lead_MetaAds', '#1877F2'),
    (v_brand, 'Lead_Newsletter', '#8B5CF6'),
    (v_brand, 'Lead_Sage', '#6B7280'),
    -- interesse (gatilhos das boas-vindas)
    (v_brand, 'Interesse_Formacao', '#7C4DE0'),
    (v_brand, 'Interesse_Produtos', '#EC4899'),
    -- marcas
    (v_brand, 'Marca_Podocare', '#0EA5E9'),
    (v_brand, 'Marca_JMF_Cosmetics', '#F472B6'),
    (v_brand, 'Marca_World_of_Beauty', '#14B8A6'),
    -- orçamentos
    (v_brand, 'Orcamento_Enviado_Formacao', '#F59E0B'),
    (v_brand, 'Orcamento_Enviado_Produtos', '#F59E0B'),
    (v_brand, 'Orcamento_Respondido', '#10B981'),
    -- formação
    (v_brand, 'Inscricao_Confirmada', '#10B981'),
    (v_brand, 'Formacao_Concluida', '#10B981'),
    (v_brand, 'Alumni', '#7C4DE0'),
    -- produtos
    (v_brand, 'Cliente_Produtos', '#10B981'),
    (v_brand, 'Produto_Entregue', '#10B981'),
    -- reativação (aplicar em massa DEPOIS da migração Sage e só a quem tem consentimento)
    (v_brand, 'Reativar_ExAluna_12-24m', '#EF4444'),
    (v_brand, 'Reativar_ExCliente_12-24m', '#EF4444'),
    (v_brand, 'Reativar_ExAluna_24m+', '#B91C1C'),
    (v_brand, 'Reativar_ExCliente_24m+', '#B91C1C'),
    -- newsletter / NPS / indicação
    (v_brand, 'Newsletter_Segmentada', '#8B5CF6'),
    (v_brand, 'Promotora', '#10B981'),
    (v_brand, 'Detratora', '#EF4444'),
    (v_brand, 'Indicada', '#F59E0B')
  on conflict do nothing;

  -- PIPELINES ------------------------------------------------
  if not exists (select 1 from pipelines where brand_id = v_brand and name = 'Formação') then
    insert into pipelines (brand_id, name, is_default) values (v_brand, 'Formação', true) returning id into v_pipe;
    insert into pipeline_stages (brand_id, pipeline_id, name, position, is_won, is_lost) values
      (v_brand, v_pipe, 'Novo lead', 1, false, false),
      (v_brand, v_pipe, 'Em contacto', 2, false, false),
      (v_brand, v_pipe, 'Orçamento enviado', 3, false, false),
      (v_brand, v_pipe, 'Inscrição confirmada', 4, true, false),
      (v_brand, v_pipe, 'Perdido', 5, false, true);
  end if;

  if not exists (select 1 from pipelines where brand_id = v_brand and name = 'Produtos') then
    insert into pipelines (brand_id, name, is_default) values (v_brand, 'Produtos', false) returning id into v_pipe;
    insert into pipeline_stages (brand_id, pipeline_id, name, position, is_won, is_lost) values
      (v_brand, v_pipe, 'Novo lead', 1, false, false),
      (v_brand, v_pipe, 'Em contacto', 2, false, false),
      (v_brand, v_pipe, 'Orçamento enviado', 3, false, false),
      (v_brand, v_pipe, 'Encomenda confirmada', 4, true, false),
      (v_brand, v_pipe, 'Perdido', 5, false, true);
  end if;

  if not exists (select 1 from pipelines where brand_id = v_brand and name = 'Reativação') then
    insert into pipelines (brand_id, name, is_default) values (v_brand, 'Reativação', false) returning id into v_pipe;
    insert into pipeline_stages (brand_id, pipeline_id, name, position, is_won, is_lost) values
      (v_brand, v_pipe, 'Base inativa', 1, false, false),
      (v_brand, v_pipe, 'Contactada', 2, false, false),
      (v_brand, v_pipe, 'Respondeu', 3, false, false),
      (v_brand, v_pipe, 'Oportunidade', 4, false, false),
      (v_brand, v_pipe, 'Reativada', 5, true, false),
      (v_brand, v_pipe, 'Sem resposta', 6, false, true);
  end if;
end;
$$;

-- ---------------------------------------------------------
-- 2. Automações (todas em rascunho)
-- ---------------------------------------------------------
do $wc$
declare
  b uuid := (select id from brands where name = 'WingCare' order by created_at limit 1);
  a uuid;
begin
  if b is null then raise exception 'Marca WingCare não encontrada.'; end if;

  -- BOAS-VINDAS — FORMAÇÃO (7 dias) ---------------------------
  a := pg_temp.wc_auto(b, 'Boas-vindas — Formação (7 dias)', 'Interesse_Formacao', null, false);
  perform pg_temp.wc_wa(a, $$Olá {{primeiro_nome}}! Bem-vinda à Wingcare Institute. Somos um instituto focado em formar profissionais de estética, saúde e bem-estar com critério, raciocínio terapêutico e resultados reais, com prática desde o primeiro dia (é a nossa metodologia Learn by Doing). Nos próximos dias iremos partilhar consigo como funciona a formação em {{curso_interesse}} e o que pode esperar. Qualquer dúvida, escreva por aqui.$$);
  perform pg_temp.wc_wait(a, 1440);
  perform pg_temp.wc_wa(a, $$Sabia, {{primeiro_nome}}, que na maioria das nossas formações é em modelos reais e prática supervisionada? É por isso que as nossas alunas saem preparadas para trabalhar, não só com certificado, mas com mão treinada. Deseja que lhe expliquemos como é o dia-a-dia da formação em {{curso_interesse}}?$$);
  perform pg_temp.wc_wait(a, 2880);
  perform pg_temp.wc_wa(a, $$Uma das nossas alunas partilhou isto sobre a formação: [TESTEMUNHO REAL — A FORNECER PELO CLIENTE]. Deseja ver mais testemunhos ou saber as datas disponíveis para {{curso_interesse}}?$$);
  perform pg_temp.wc_wait(a, 2880);
  perform pg_temp.wc_task(a, 'Dia 5: enviar mini aula / mini produto ("salame") — conteúdo ainda por definir com o cliente', 1440);
  perform pg_temp.wc_wait(a, 2880);
  perform pg_temp.wc_wa(a, $$Para quem se inscreve esta semana, {{primeiro_nome}}, temos a Masterclass Transversal. Deseja que lhe enviemos os detalhes e as próximas datas de turma?$$);

  -- BOAS-VINDAS — PRODUTOS (7 dias) ---------------------------
  a := pg_temp.wc_auto(b, 'Boas-vindas — Produtos (7 dias)', 'Interesse_Produtos', null, false);
  perform pg_temp.wc_wa(a, $$Olá {{primeiro_nome}}! Obrigado pelo interesse nos nossos dermacosméticos exclusivos da Wingcare. Oferecemos-lhe soluções pensadas para gabinete profissional e Homecare: Podocare Dermocosmetics, JMF Cosmetics e World of Beauty. Podemos já perceber: o seu interesse é mais para pedicure, tratamentos faciais/corporais ou dermocosmética premium?$$);
  perform pg_temp.wc_wait(a, 1440);
  perform pg_temp.wc_wa(a, $$Deixamos-lhe um destaque de {{linha_interesse}}, {{primeiro_nome}}: [BENEFÍCIO TÉCNICO PRINCIPAL E RESULTADO CLÍNICO — A FORNECER]. Deseja a tabela de preços profissional ou tem alguma dúvida técnica primeiro?$$);
  perform pg_temp.wc_wait(a, 2880);
  perform pg_temp.wc_wa(a, $$Clínicas e institutos de beleza e bem-estar que já trabalham com {{linha_interesse}} reportam [RESULTADO/BENEFÍCIO EM GABINETE — TESTEMUNHO REAL A FORNECER]. Se desejar, podemos mostrar-lhe fotos de antes e depois reais.$$);
  perform pg_temp.wc_wait(a, 5760);
  perform pg_temp.wc_wa(a, $$Para a sua primeira encomenda, {{primeiro_nome}}, temos a Masterclass Transversal. Enviamos-lhe a tabela atualizada para avançar?$$);

  -- RECUPERAÇÃO DE ORÇAMENTO — FORMAÇÃO -----------------------
  a := pg_temp.wc_auto(b, 'Recuperação de orçamento — Formação', 'Orcamento_Enviado_Formacao', array['Inscricao_Confirmada','Orcamento_Respondido'], true);
  perform pg_temp.wc_wait(a, 10080);
  perform pg_temp.wc_wa(a, $${{primeiro_nome}}, ainda tem interesse na formação de {{curso_interesse}}? Ficou alguma dúvida sobre o programa, datas ou valores que possamos esclarecer?$$);
  perform pg_temp.wc_wait(a, 4320);
  perform pg_temp.wc_wa(a, $$Sabemos que decidir investir numa formação não é rápido, e é suposto não ser. Se ajudar, podemos mostrar-lhe o percurso de uma aluna que fez este curso, ou esclarecer dúvidas sobre saídas profissionais depois da certificação.$$);
  perform pg_temp.wc_wait(a, 5760);
  perform pg_temp.wc_wa(a, $$Não queremos insistir, {{primeiro_nome}}, só gostaríamos de deixar a saber que as vagas são limitadas e a inscrição só fica válida com o preenchimento da ficha de inscrição e o pagamento na modalidade escolhida. Sempre que desejar avançar, ficamos à disposição por aqui.$$);
  perform pg_temp.wc_tag(a, 'Newsletter_Segmentada');

  -- RECUPERAÇÃO DE ORÇAMENTO — PRODUTOS -----------------------
  a := pg_temp.wc_auto(b, 'Recuperação de orçamento — Produtos', 'Orcamento_Enviado_Produtos', array['Cliente_Produtos','Orcamento_Respondido'], true);
  perform pg_temp.wc_wait(a, 10080);
  perform pg_temp.wc_wa(a, $${{primeiro_nome}}, chegou a receber o orçamento de {{linha_interesse}}? Ficamos a saber se ficou alguma questão sobre quantidades, prazos de entrega ou aplicação do produto.$$);
  perform pg_temp.wc_wait(a, 4320);
  perform pg_temp.wc_wa(a, $$Se ajudar, podemos explicar melhor como funciona {{linha_interesse}} na prática ou partilhar resultados (antes e depois) de outras profissionais que já trabalham com a linha.$$);
  perform pg_temp.wc_wait(a, 5760);
  perform pg_temp.wc_wa(a, $${{primeiro_nome}}, o orçamento continua válido e à sua disposição sempre que desejar avançar. Qualquer dúvida, estamos por aqui.$$);
  perform pg_temp.wc_tag(a, 'Newsletter_Segmentada');

  -- CROSS-SELLING PÓS-FORMAÇÃO (30 dias) ----------------------
  -- Quem já comprou (tag Cliente_Produtos) é cancelado antes do 1.º envio.
  a := pg_temp.wc_auto(b, 'Cross-selling pós-formação (30 dias)', 'Formacao_Concluida', array['Cliente_Produtos'], true);
  perform pg_temp.wc_wa(a, $${{primeiro_nome}}, parabéns pela conclusão da formação em {{curso_concluido}}! É um orgulho tê-la como Alumni Wingcare. Para continuar a colocar em prática o que aprendeu, temos a linha {{linha_recomendada}}, pensada exatamente para os protocolos que trabalhámos na formação. Gostaria de conhecer melhor?$$);
  perform pg_temp.wc_wait(a, 10080);
  perform pg_temp.wc_wa(a, $${{primeiro_nome}}, lembra-se do protocolo de {{tecnica_curso}} que praticámos na formação? A linha {{linha_recomendada}} foi desenvolvida para dar continuidade exatamente a esse tipo de resultado em gabinete. Deseja que lhe enviemos a ficha técnica e a tabela profissional?$$);
  perform pg_temp.wc_wait(a, 11520);
  perform pg_temp.wc_wa(a, $$Várias colegas que concluíram {{curso_concluido}} já integraram {{linha_recomendada}} no gabinete. [TESTEMUNHO/RESULTADO REAL — A FORNECER PELO CLIENTE] Se tiver dúvidas técnicas sobre a aplicação, estamos por aqui para ajudar.$$);
  perform pg_temp.wc_wait(a, 21600);
  perform pg_temp.wc_wa(a, $${{primeiro_nome}}, como Alumni Wingcare tem 5% de desconto na sua primeira encomenda de {{linha_recomendada}}. Deseja avançar com o pedido?$$);

  -- ONBOARDING POR CURSO --------------------------------------
  -- Depende de data_inicio_curso / data_fim_curso / hora_inicio / local_formacao no contacto.
  -- Mensagem "após cada sessão presencial" NÃO incluída (precisa de calendário de sessões).
  a := pg_temp.wc_auto(b, 'Onboarding por curso', 'Inscricao_Confirmada', null, false);
  perform pg_temp.wc_wa(a, $${{primeiro_nome}}, a sua inscrição em {{curso_inscrito}} está confirmada! Seja bem-vinda. Nos próximos dias enviaremos tudo o que precisa de saber antes do primeiro dia: datas, local, materiais e o que deve trazer.$$);
  perform pg_temp.wc_until(a, 'data_inicio_curso', -7);
  perform pg_temp.wc_wa(a, $${{primeiro_nome}}, a formação em {{curso_inscrito}} aproxima-se! Deixamos aqui o checklist do que deve trazer/preparar: [LISTA ESPECÍFICA POR CURSO — A FORNECER PELO CLIENTE]. Já a incluímos no grupo de WhatsApp da turma?$$);
  perform pg_temp.wc_until(a, 'data_inicio_curso', -1);
  perform pg_temp.wc_wa(a, $${{primeiro_nome}}, é já amanhã! Formação de {{curso_inscrito}}, às {{hora_inicio}}, em {{local_formacao}}. Qualquer imprevisto, contacte-nos por aqui.$$);
  perform pg_temp.wc_until(a, 'data_fim_curso', 0, 17);
  perform pg_temp.wc_wa(a, $${{primeiro_nome}}, chegámos ao fim da formação em {{curso_inscrito}}! Nos próximos dias vamos tratar da entrega do certificado e dar-lhe as boas-vindas oficiais à comunidade Alumni Wingcare.$$);

  -- REATIVAÇÃO DE BASE (270 inativos) — dias 0 / 10 / 20 -------
  -- Ativar SÓ depois da migração Sage, com consentimento e template aprovado.
  a := pg_temp.wc_auto(b, 'Reativação — Ex-Aluna 12-24 meses', 'Reativar_ExAluna_12-24m', null, true);
  perform pg_temp.wc_wa(a, $$Olá {{primeiro_nome}}! Há já algum tempo que não falamos. Espero que esteja tudo bem consigo e com o seu percurso profissional. Lembramo-nos que concluiu a formação em {{curso_concluido}} connosco. Continua a trabalhar nessa área?$$);
  perform pg_temp.wc_wait(a, 14400);
  perform pg_temp.wc_wa(a, $${{primeiro_nome}}, gostaríamos de manter o contacto consigo. Se lhe fizer sentido, podemos voltar a enviar-lhe conteúdo relevante para a sua área: novidades de formação, dicas técnicas, o que fizer sentido. Tem interesse em continuar a acompanhar a Wingcare?$$);
  perform pg_temp.wc_wait(a, 14400);
  perform pg_temp.wc_wa(a, $${{primeiro_nome}}, ficamos sempre disponíveis caso queira retomar o contacto, seja para tirar dúvidas técnicas, saber mais sobre novas formações, ou simplesmente dizer olá. Continuamos por aqui!$$);
  perform pg_temp.wc_tag(a, 'Newsletter_Segmentada');
  perform pg_temp.wc_wait(a, 262080);
  perform pg_temp.wc_task(a, 'Nova tentativa de reativação (6 meses depois, sem resposta)', 10080);

  a := pg_temp.wc_auto(b, 'Reativação — Ex-Cliente Produtos 12-24 meses', 'Reativar_ExCliente_12-24m', null, true);
  perform pg_temp.wc_wa(a, $$Olá {{primeiro_nome}}! Há já algum tempo que não fazia uma encomenda connosco. Esperamos que esteja tudo bem no seu gabinete. Continua a trabalhar com {{marca_comprada}}?$$);
  perform pg_temp.wc_wait(a, 14400);
  perform pg_temp.wc_wa(a, $${{primeiro_nome}}, se ainda utiliza {{marca_comprada}} (ou se as suas necessidades mudaram entretanto), temos todo o gosto em enviar-lhe a tabela profissional atualizada. Sem compromisso.$$);
  perform pg_temp.wc_wait(a, 14400);
  perform pg_temp.wc_wa(a, $${{primeiro_nome}}, ficamos à disposição sempre que precisar, seja para reabastecer, tirar dúvidas técnicas, ou conhecer outras linhas da Wingcare.$$);
  perform pg_temp.wc_tag(a, 'Newsletter_Segmentada');
  perform pg_temp.wc_wait(a, 262080);
  perform pg_temp.wc_task(a, 'Nova tentativa de reativação (6 meses depois, sem resposta)', 10080);

  a := pg_temp.wc_auto(b, 'Reativação — Ex-Aluna 24+ meses', 'Reativar_ExAluna_24m+', null, true);
  perform pg_temp.wc_wa(a, $$Olá {{primeiro_nome}}! Há bastante tempo que não temos notícias suas. Espero que esteja tudo bem. Recordamo-nos que passou pela Wingcare para a formação em {{curso_concluido}}. Continua ligada à área da estética?$$);
  perform pg_temp.wc_wait(a, 14400);
  perform pg_temp.wc_wa(a, $${{primeiro_nome}}, a Wingcare tem crescido bastante desde a última vez que esteve connosco: novas formações, nova estrutura, novos protocolos. Se ainda lhe fizer sentido fazer parte da nossa comunidade, gostaríamos de a voltar a incluir nas nossas comunicações. Tem interesse?$$);
  perform pg_temp.wc_wait(a, 14400);
  perform pg_temp.wc_wa(a, $${{primeiro_nome}}, não queremos insistir, mas se em algum momento quiser voltar a ligar-se à Wingcare, seja para formação ou produtos, temos sempre a porta aberta. Foi um prazer tê-la connosco no passado.$$);
  perform pg_temp.wc_tag(a, 'Newsletter_Segmentada');
  perform pg_temp.wc_wait(a, 262080);
  perform pg_temp.wc_task(a, 'Nova tentativa de reativação (6 meses depois, sem resposta)', 10080);

  a := pg_temp.wc_auto(b, 'Reativação — Ex-Cliente Produtos 24+ meses', 'Reativar_ExCliente_24m+', null, true);
  perform pg_temp.wc_wa(a, $$Olá {{primeiro_nome}}! Há bastante tempo que não fazia uma encomenda connosco. Esperamos que esteja tudo bem. Recordamo-nos que trabalhou com {{linha_comprada}}. Ainda está ligada à área da estética profissional?$$);
  perform pg_temp.wc_wait(a, 14400);
  perform pg_temp.wc_wa(a, $${{primeiro_nome}}, a Wingcare continua a desenvolver as suas linhas profissionais. Se voltar a fazer sentido para o seu gabinete, temos todo o gosto em enviar-lhe informação atualizada, sem qualquer compromisso.$$);
  perform pg_temp.wc_wait(a, 14400);
  perform pg_temp.wc_wa(a, $${{primeiro_nome}}, ficamos sempre disponíveis caso queira retomar o contacto no futuro. Foi um prazer tê-la como cliente.$$);
  perform pg_temp.wc_tag(a, 'Newsletter_Segmentada');
  perform pg_temp.wc_wait(a, 262080);
  perform pg_temp.wc_task(a, 'Nova tentativa de reativação (6 meses depois, sem resposta)', 10080);

  -- CICLO PÓS-FORMAÇÃO (90 dias) — PENDENTE DECISÃO DO CLIENTE --
  a := pg_temp.wc_auto(b, 'Ciclo pós-formação (90 dias) — PENDENTE decisão do cliente', 'Formacao_Concluida', null, false);
  perform pg_temp.wc_wa(a, $${{primeiro_nome}}, bem-vinda à comunidade Wingcare Alumni. Vamos mantê-la a par de conteúdos técnicos exclusivos, novidades e oportunidades pensadas especialmente para quem já é certificada por nós. [LINK — A FORNECER]$$);
  perform pg_temp.wc_wait(a, 64800);
  perform pg_temp.wc_wa(a, $${{primeiro_nome}}, já teve oportunidade de aplicar o que aprendeu em {{curso_concluido}}? Gostaríamos de saber como foi a sua experiência connosco. Numa escala de 0 a 10, qual a probabilidade de recomendar a Wingcare a uma colega?$$);
  perform pg_temp.wc_wait(a, 21600);
  perform pg_temp.wc_wa(a, $${{primeiro_nome}}, sabia que também dispomos de soluções na área de corpo e rosto? Trabalhamos com marcas exclusivas e temos soluções que vão desde a limpeza de pele, peelings químicos, bioestimulação facial e corporal, microagulhamento, nanoagulhamento, entre outros. Podemos agendar uma reunião para apurar as suas necessidades e perceber se a podemos ajudar a evoluir profissionalmente?$$);
  perform pg_temp.wc_wait(a, 43200);
  perform pg_temp.wc_wa(a, $${{primeiro_nome}}, passaram já 90 dias desde a sua certificação em {{curso_concluido}}! Esperamos que este percurso esteja a correr bem. Continuamos por aqui sempre que precisar, seja para dúvidas técnicas ou para os nossos produtos profissionais. Faz parte da família Wingcare.$$);

  -- NPS PÓS-COMPRA DE PRODUTO ---------------------------------
  -- Doc: "15 dias após entrega - após 48h" (ambíguo). Implementado: 15 dias após a tag Produto_Entregue.
  a := pg_temp.wc_auto(b, 'NPS — pós-compra de produto', 'Produto_Entregue', null, false);
  perform pg_temp.wc_wait(a, 21600);
  perform pg_temp.wc_wa(a, $${{primeiro_nome}}, já teve oportunidade de experimentar {{linha_comprada}}? Gostaríamos de saber a sua opinião. Numa escala de 0 a 10, qual a probabilidade de recomendar a Wingcare a uma colega?$$);
end;
$wc$;

-- ---------------------------------------------------------
-- 3. Verificação
-- ---------------------------------------------------------
select a.name, a.status, count(s.id) as passos,
       count(*) filter (where s.config->>'body' like '%[%' or s.config->>'title' like '%por definir%') as passos_com_pendencias
from automations a
left join automation_steps s on s.automation_id = a.id
where a.brand_id = (select id from brands where name = 'WingCare' order by created_at limit 1)
group by a.name, a.status
order by a.name;
