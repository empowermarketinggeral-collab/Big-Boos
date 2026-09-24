-- =========================================================
-- WINGCARE — 3 frentes: reativação/nutrição, formação e marcas
-- =========================================================
-- Corre isto depois do 61_wingcare_brand_crm.sql (um único Run).
-- Requer o motor atualizado (automations-run com update_contact e
-- passos "optional").
--
-- COMO FUNCIONA (independente da porta de entrada)
--  Cada lead recebe 2 tipos de tag:
--   - ORIGEM: Lead_Website, Lead_LandingPage, Lead_GoogleAds, Lead_MetaAds,
--     Lead_Instagram, Lead_Facebook, Lead_WhatsApp…  (só para relatórios)
--   - INTERESSE: Interesse_<Marca>_<Tratamento>, Interesse_Podocare ou
--     Curso_<curso>  (é esta que dispara o fluxo com o conteúdo certo)
--  Assim, o mesmo tratamento recebe o mesmo conteúdo venha do site, da
--  LP, do Google Ads ou do Instagram/Facebook.
--
--  MARCAS: um fluxo por tratamento (JMF Cosmetics e World of Beauty) e um
--  transversal para a Podocare. Guarda linha_interesse no contacto,
--  aplica a tag da marca, cria tarefa para a equipa contactar por
--  WhatsApp e envia por email o conjunto padrão de conteúdos:
--  D0 descrição + imagem · D2 3 antes/depois · D4 tabela de preços · D7 convite.
--  Para quando: o contacto responde no WhatsApp, recebe orçamento
--  (Orcamento_Enviado_Produtos) ou passa a cliente (Cliente_Produtos).
--
--  FORMAÇÃO: tag Curso_<curso> guarda curso_interesse e aplica
--  Interesse_Formacao (→ Boas-vindas Formação do 61). Tag Concluiu_<curso>
--  guarda curso_concluido/linha_recomendada/tecnica_curso e aplica
--  Formacao_Concluida + Alumni (→ cross-selling e ciclo pós-formação).
--
-- Tudo fica em 'draft'. Os conteúdos marcados [ENTRE PARÊNTESES RETOS]
-- são substituídos à medida que chegam à pasta CRM do cliente.
-- =========================================================

-- ---------------------------------------------------------
-- Helpers temporários (iguais aos do 61)
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

create or replace function pg_temp.wc_step(p_auto uuid, p_type text, p_action text, p_config jsonb, p_wait int default null) returns void
language plpgsql as $$
begin
  if p_auto is null then return; end if;
  insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
  select brand_id, id,
         (select coalesce(max(position), 0) + 1 from automation_steps where automation_id = p_auto),
         p_type, p_action, p_config, p_wait
  from automations where id = p_auto;
end;
$$;

create or replace function pg_temp.wc_wait(p_auto uuid, p_minutes int) returns void
language sql as $$ select pg_temp.wc_step(p_auto, 'wait', null, '{}'::jsonb, p_minutes) $$;

create or replace function pg_temp.wc_tag(p_auto uuid, p_tag text) returns void
language plpgsql as $$
declare v_tag uuid;
begin
  if p_auto is null then return; end if;
  select pg_temp.wc_tag_id(brand_id, p_tag) into v_tag from automations where id = p_auto;
  if v_tag is null then raise exception 'Tag inexistente: %', p_tag; end if;
  perform pg_temp.wc_step(p_auto, 'action', 'add_tag', jsonb_build_object('tagId', v_tag));
end;
$$;

create or replace function pg_temp.wc_fields(p_auto uuid, p_fields jsonb) returns void
language sql as $$ select pg_temp.wc_step(p_auto, 'action', 'update_contact', jsonb_build_object('fields', p_fields)) $$;

create or replace function pg_temp.wc_task(p_auto uuid, p_title text, p_due_minutes int default 1440) returns void
language sql as $$ select pg_temp.wc_step(p_auto, 'action', 'create_task', jsonb_build_object('title', p_title, 'dueInMinutes', p_due_minutes)) $$;

-- Email opcional: um contacto sem email (ex.: veio do Instagram) não trava o fluxo.
create or replace function pg_temp.wc_email(p_auto uuid, p_subject text, p_html text) returns void
language sql as $$ select pg_temp.wc_step(p_auto, 'action', 'send_email', jsonb_build_object('subject', p_subject, 'body', p_html, 'optional', true)) $$;

-- Moldura HTML comum dos emails
create or replace function pg_temp.wc_html(p_inner text) returns text
language sql as $$
  select '<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#222;line-height:1.55;font-size:15px">'
      || p_inner
      || '<p style="margin-top:28px">Com os melhores cumprimentos,<br><strong>Equipa Wingcare Institute</strong></p>'
      || '<p style="font-size:12px;color:#888">Recebeu este email porque demonstrou interesse nas soluções Wingcare. Se não pretender receber mais comunicações, responda a este email com "REMOVER".</p>'
      || '</div>'
$$;

-- Fluxo padrão de uma linha/tratamento
create or replace function pg_temp.wc_treatment(p_brand uuid, p_trigger_tag text, p_marca text, p_marca_tag text, p_trat text) returns void
language plpgsql as $$
declare
  a uuid;
  v_label text := case when p_trat = p_marca then p_marca else p_trat || ' (' || p_marca || ')' end;
begin
  a := pg_temp.wc_auto(p_brand, 'Marca — ' || v_label, p_trigger_tag,
                       array['Cliente_Produtos', 'Orcamento_Enviado_Produtos'], true);
  if a is null then return; end if;

  perform pg_temp.wc_fields(a, jsonb_build_object('linha_interesse', p_trat, 'marca_interesse', p_marca));
  perform pg_temp.wc_tag(a, p_marca_tag);
  perform pg_temp.wc_task(a, 'Novo lead ' || v_label || ': contactar por WhatsApp e criar negócio no pipeline Produtos (origem nas tags Lead_*)', 60);

  -- D0 — descrição comercial + imagem
  perform pg_temp.wc_email(a, p_trat || ' | Wingcare', pg_temp.wc_html(
    '<p>Olá {{primeiro_nome}},</p>'
    || '<p>Obrigado pelo interesse em <strong>' || p_trat || '</strong>' || case when p_trat = p_marca then '' else ', da ' || p_marca end || '.</p>'
    || '<p><img src="[URL IMAGEM DA LINHA/TRATAMENTO]" alt="' || p_trat || '" style="max-width:100%;border-radius:8px"></p>'
    || '<p>[DESCRIÇÃO COMERCIAL DO TRATAMENTO — A FORNECER PELO CLIENTE]</p>'
    || '<p>Nos próximos dias vamos partilhar consigo resultados reais e a tabela de preços profissional. Se preferir falar já connosco, basta responder a este email.</p>'));
  perform pg_temp.wc_wait(a, 2880);

  -- D2 — 3 resultados antes/depois
  perform pg_temp.wc_email(a, 'Resultados reais com ' || p_trat, pg_temp.wc_html(
    '<p>{{primeiro_nome}}, deixamos-lhe três resultados reais obtidos em gabinete com <strong>' || p_trat || '</strong>:</p>'
    || '<p><img src="[URL ANTES/DEPOIS 1]" alt="Resultado 1" style="max-width:100%;border-radius:8px"></p>'
    || '<p><img src="[URL ANTES/DEPOIS 2]" alt="Resultado 2" style="max-width:100%;border-radius:8px"></p>'
    || '<p><img src="[URL ANTES/DEPOIS 3]" alt="Resultado 3" style="max-width:100%;border-radius:8px"></p>'
    || '<p>Tem alguma dúvida técnica sobre o protocolo? Estamos disponíveis para ajudar.</p>'));
  perform pg_temp.wc_wait(a, 2880);

  -- D4 — tabela de preços
  perform pg_temp.wc_email(a, 'Tabela de preços profissional — ' || p_trat, pg_temp.wc_html(
    '<p>{{primeiro_nome}}, conforme prometido, segue a tabela de preços profissional de <strong>' || p_trat || '</strong>.</p>'
    || '<p>[TABELA DE PREÇOS — IMAGEM OU LINK A FORNECER PELO CLIENTE]</p>'
    || '<p>Se quiser, preparamos-lhe um orçamento à medida do seu gabinete.</p>'));
  perform pg_temp.wc_wait(a, 4320);

  -- D7 — convite
  perform pg_temp.wc_email(a, 'Vamos levar ' || p_trat || ' ao seu gabinete?', pg_temp.wc_html(
    '<p>{{primeiro_nome}}, esperamos que os conteúdos sobre <strong>' || p_trat || '</strong> lhe tenham sido úteis.</p>'
    || '<p>Deseja que lhe preparemos um orçamento ou que agendemos uma conversa para perceber as necessidades do seu gabinete? Basta responder a este email.</p>'));
  perform pg_temp.wc_task(a, 'Follow-up ' || v_label || ': sem resposta após 7 dias de conteúdos, contactar por WhatsApp', 1440);
end;
$$;

-- Router de curso (interesse)
create or replace function pg_temp.wc_course_interest(p_brand uuid, p_tag text, p_curso text) returns void
language plpgsql as $$
declare a uuid;
begin
  a := pg_temp.wc_auto(p_brand, 'Formação — interesse: ' || p_curso, p_tag, null, false);
  if a is null then return; end if;
  perform pg_temp.wc_fields(a, jsonb_build_object('curso_interesse', p_curso));
  perform pg_temp.wc_tag(a, 'Interesse_Formacao');
  perform pg_temp.wc_task(a, 'Novo lead de formação — ' || p_curso || ': contactar e criar negócio no pipeline Formação', 60);
end;
$$;

-- Router de curso (concluído)
create or replace function pg_temp.wc_course_done(p_brand uuid, p_tag text, p_curso text, p_linha text, p_tecnica text, p_cross_sell boolean) returns void
language plpgsql as $$
declare a uuid;
begin
  a := pg_temp.wc_auto(p_brand, 'Formação — concluiu: ' || p_curso, p_tag, null, false);
  if a is null then return; end if;
  if p_cross_sell then
    perform pg_temp.wc_fields(a, jsonb_build_object('curso_concluido', p_curso, 'linha_recomendada', p_linha, 'tecnica_curso', p_tecnica));
    perform pg_temp.wc_tag(a, 'Formacao_Concluida');
  else
    perform pg_temp.wc_fields(a, jsonb_build_object('curso_concluido', p_curso));
  end if;
  perform pg_temp.wc_tag(a, 'Alumni');
end;
$$;

-- ---------------------------------------------------------
-- 1. Tags
-- ---------------------------------------------------------
do $$
declare b uuid := (select id from brands where name = 'WingCare' order by created_at limit 1);
begin
  if b is null then raise exception 'Marca WingCare não encontrada — corre primeiro o 61.'; end if;

  insert into tags (brand_id, name, color) values
    -- origem (complementa as do 61)
    (b, 'Lead_LandingPage', '#3B82F6'),
    (b, 'Lead_Instagram', '#E1306C'),
    (b, 'Lead_Facebook', '#1877F2'),
    -- marcas: interesse
    (b, 'Interesse_Podocare', '#0EA5E9'),
    (b, 'Interesse_JMF_Skin_Cleansing', '#F472B6'),
    (b, 'Interesse_JMF_Composit_Viso', '#F472B6'),
    (b, 'Interesse_JMF_Spa_Viso', '#F472B6'),
    (b, 'Interesse_JMF_ActiveGym_Tonic', '#F472B6'),
    (b, 'Interesse_JMF_Water_Forces', '#F472B6'),
    (b, 'Interesse_JMF_Saffron_Elisir', '#F472B6'),
    (b, 'Interesse_JMF_Body_Awakening', '#F472B6'),
    (b, 'Interesse_JMF_Body_Method', '#F472B6'),
    (b, 'Interesse_WoB_Carboxy_Face', '#14B8A6'),
    (b, 'Interesse_WoB_Carboxy_Body', '#14B8A6'),
    (b, 'Interesse_WoB_Carboxy_Capilar', '#14B8A6'),
    (b, 'Interesse_WoB_Peelings_MD', '#14B8A6'),
    (b, 'Interesse_WoB_Microbiome_Restore', '#14B8A6'),
    (b, 'Interesse_WoB_Exosomes', '#14B8A6'),
    (b, 'Interesse_WoB_Collagen_DNA_Derm', '#14B8A6'),
    -- formação: interesse por curso
    (b, 'Curso_Pedicure_Terapeutica', '#7C4DE0'),
    (b, 'Curso_Premium_Foot_Master', '#7C4DE0'),
    (b, 'Curso_Skin_Expert_Limpeza', '#7C4DE0'),
    (b, 'Curso_Skin_Expert_Peelings', '#7C4DE0'),
    (b, 'Curso_Premium_Skin_Master', '#7C4DE0'),
    (b, 'Curso_Mentoria_Negocio_Magnetico', '#7C4DE0'),
    (b, 'Curso_Remodelacao_Corporal', '#7C4DE0'),
    -- formação: concluído por curso
    (b, 'Concluiu_Pedicure_Terapeutica', '#10B981'),
    (b, 'Concluiu_Premium_Foot_Master', '#10B981'),
    (b, 'Concluiu_Skin_Expert_Limpeza', '#10B981'),
    (b, 'Concluiu_Skin_Expert_Peelings', '#10B981'),
    (b, 'Concluiu_Premium_Skin_Master', '#10B981'),
    (b, 'Concluiu_Mentoria_Negocio_Magnetico', '#10B981'),
    (b, 'Concluiu_Remodelacao_Corporal', '#10B981')
  on conflict do nothing;
end;
$$;

-- ---------------------------------------------------------
-- 2. Automações (todas em rascunho)
-- ---------------------------------------------------------
do $$
declare b uuid := (select id from brands where name = 'WingCare' order by created_at limit 1);
begin
  -- MARCAS ---------------------------------------------------
  perform pg_temp.wc_treatment(b, 'Interesse_Podocare', 'Podocare Dermocosmetics', 'Marca_Podocare', 'Podocare Dermocosmetics');

  perform pg_temp.wc_treatment(b, 'Interesse_JMF_Skin_Cleansing',   'JMF Cosmetics', 'Marca_JMF_Cosmetics', 'Skin Cleansing');
  perform pg_temp.wc_treatment(b, 'Interesse_JMF_Composit_Viso',    'JMF Cosmetics', 'Marca_JMF_Cosmetics', 'Composit Viso');
  perform pg_temp.wc_treatment(b, 'Interesse_JMF_Spa_Viso',         'JMF Cosmetics', 'Marca_JMF_Cosmetics', 'Spa Viso');
  perform pg_temp.wc_treatment(b, 'Interesse_JMF_ActiveGym_Tonic',  'JMF Cosmetics', 'Marca_JMF_Cosmetics', 'ActiveGym Tonic');
  perform pg_temp.wc_treatment(b, 'Interesse_JMF_Water_Forces',     'JMF Cosmetics', 'Marca_JMF_Cosmetics', 'Water Forces');
  perform pg_temp.wc_treatment(b, 'Interesse_JMF_Saffron_Elisir',   'JMF Cosmetics', 'Marca_JMF_Cosmetics', 'Saffron Elisir');
  perform pg_temp.wc_treatment(b, 'Interesse_JMF_Body_Awakening',   'JMF Cosmetics', 'Marca_JMF_Cosmetics', 'Body Awakening');
  perform pg_temp.wc_treatment(b, 'Interesse_JMF_Body_Method',      'JMF Cosmetics', 'Marca_JMF_Cosmetics', 'Body Method');

  perform pg_temp.wc_treatment(b, 'Interesse_WoB_Carboxy_Face',       'World of Beauty', 'Marca_World_of_Beauty', 'Carboxy Lift CO₂ Face');
  perform pg_temp.wc_treatment(b, 'Interesse_WoB_Carboxy_Body',       'World of Beauty', 'Marca_World_of_Beauty', 'Carboxy Lift CO₂ Body');
  perform pg_temp.wc_treatment(b, 'Interesse_WoB_Carboxy_Capilar',    'World of Beauty', 'Marca_World_of_Beauty', 'Carboxy Lift CO₂ Capilar');
  perform pg_temp.wc_treatment(b, 'Interesse_WoB_Peelings_MD',        'World of Beauty', 'Marca_World_of_Beauty', 'Peelings Químicos Funcionais MD');
  perform pg_temp.wc_treatment(b, 'Interesse_WoB_Microbiome_Restore', 'World of Beauty', 'Marca_World_of_Beauty', 'Microbiome Restore Therapy');
  perform pg_temp.wc_treatment(b, 'Interesse_WoB_Exosomes',           'World of Beauty', 'Marca_World_of_Beauty', 'Exosomes and Cellular Regeneration');
  perform pg_temp.wc_treatment(b, 'Interesse_WoB_Collagen_DNA_Derm',  'World of Beauty', 'Marca_World_of_Beauty', 'Collagen Induction Therapy com DNA Derm');

  -- FORMAÇÃO: interesse --------------------------------------
  -- Nomes completos (com ® quando registado) — o cliente confirma os restantes.
  perform pg_temp.wc_course_interest(b, 'Curso_Pedicure_Terapeutica',       'Especialização em Pedicure Profissional e Terapêutica®');
  perform pg_temp.wc_course_interest(b, 'Curso_Premium_Foot_Master',        'Premium Foot Master: Avaliação, Performance e Gestão Integrativa do Pé');
  perform pg_temp.wc_course_interest(b, 'Curso_Skin_Expert_Limpeza',        'Skin Expert em Limpeza de Pele & Aparatologia');
  perform pg_temp.wc_course_interest(b, 'Curso_Skin_Expert_Peelings',       'Skin Expert em Peelings Químicos & Integrativos');
  perform pg_temp.wc_course_interest(b, 'Curso_Premium_Skin_Master',        'Premium Skin Master em Estética Corporal e Facial');
  perform pg_temp.wc_course_interest(b, 'Curso_Mentoria_Negocio_Magnetico', 'Mentoria Negócio Magnético');
  perform pg_temp.wc_course_interest(b, 'Curso_Remodelacao_Corporal',       'Remodelação Corporal Bioestimulada');

  -- FORMAÇÃO: concluído → cross-selling (linha do documento de validação) --
  perform pg_temp.wc_course_done(b, 'Concluiu_Pedicure_Terapeutica', 'Especialização em Pedicure Profissional e Terapêutica®',
    'Mico Pro', '[TÉCNICA DO CURSO — CONFIRMAR]', true);
  perform pg_temp.wc_course_done(b, 'Concluiu_Premium_Foot_Master', 'Premium Foot Master: Avaliação, Performance e Gestão Integrativa do Pé',
    'de equipamento profissional (cadeira de pedicure, banco e micromotor)', '[TÉCNICA DO CURSO — CONFIRMAR]', true);
  perform pg_temp.wc_course_done(b, 'Concluiu_Skin_Expert_Limpeza', 'Skin Expert em Limpeza de Pele & Aparatologia',
    'de limpeza de pele e homecare', 'limpeza de pele', true);
  perform pg_temp.wc_course_done(b, 'Concluiu_Skin_Expert_Peelings', 'Skin Expert em Peelings Químicos & Integrativos',
    'de peelings químicos e homecare', 'peelings químicos', true);
  perform pg_temp.wc_course_done(b, 'Concluiu_Premium_Skin_Master', 'Premium Skin Master em Estética Corporal e Facial',
    '[LINHA RECOMENDADA — CONFIRMAR]', '[TÉCNICA DO CURSO — CONFIRMAR]', true);
  perform pg_temp.wc_course_done(b, 'Concluiu_Remodelacao_Corporal', 'Remodelação Corporal Bioestimulada',
    'dos protocolos corporais', 'remodelação corporal bioestimulada', true);
  -- Mentoria: perfil de negócio, sem produto associado → só Alumni (sem cross-selling).
  perform pg_temp.wc_course_done(b, 'Concluiu_Mentoria_Negocio_Magnetico', 'Mentoria Negócio Magnético', null, null, false);
end;
$$;

-- ---------------------------------------------------------
-- 3. Verificação
-- ---------------------------------------------------------
select a.name, a.status, count(s.id) as passos,
       count(*) filter (where s.config::text like '%[%') as passos_com_conteudo_por_preencher
from automations a
left join automation_steps s on s.automation_id = a.id
where a.brand_id = (select id from brands where name = 'WingCare' order by created_at limit 1)
group by a.name, a.status
order by a.name;
