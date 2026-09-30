-- =========================================================
-- EMPOWER MARKETING — todos os fluxos de email do briefing
-- =========================================================
-- Corre isto no SQL Editor do Supabase, depois do 78 (Índice de Posição)
-- e DEPOIS de publicares a nova versão da função automations-run.
-- SQL simples: pode correr-se mais do que uma vez sem duplicar.
--
-- O QUE CRIA (tudo na marca com booking_slug = 'empowermarketing')
--  - Tags manuais e automáticas do briefing (grupo:valor).
--  - contact_tags.created_at, para "parar se respondeu depois de começar".
--  - Fluxos com emails, em RASCUNHO (nada é enviado até os ativares):
--      REA  Reativação          gatilho: tag fluxo:reativacao (aplica em lotes de 15-20/dia)
--      EXC  Ex-clientes         gatilho: tag fluxo:ex-cliente (precisa de data_fim_projeto)
--      MAP-00                   gatilho: tag comercial:mapa-comprado
--      MAP-01 a MAP-07          gatilho: tag comercial:mapa-entregue (preenche antes
--                               data_entrega_mapa, resumo_mapa, prioridade_1, link_documento_mapa)
--      REU  Pós-reunião         gatilho: tag comercial:reuniao-realizada (preenche antes
--                               dor_principal e, se tiveres, link_recurso)
--  - Regras e variantes (não enviam emails, ficam ATIVAS):
--      resposta recebida (sinal:respondeu → tarefa + sai dos fluxos), opt-out,
--      e as variantes de texto por relação, recência, motivo e setor.
--  - DIA-02 a DIA-04: passa a respeitar a janela de envio e o máximo de 2 emails/semana.
--  - Newsletter: campanha "Carta de Posição #1" em rascunho (Email → Campanhas).
--
-- ANTES DE ATIVAR: os emails com [AJUSTAR] não saem (o motor bloqueia) até
-- editares o texto em Automações: casos de estudo (REA-03, MAP-03, REU-03),
-- link do caso geral, kick-off (MAP-00) e tendência do trimestre (REU-60).
-- =========================================================

-- 0. Confirma a marca (tem de devolver 1 linha).
select id, name from brands where booking_slug = 'empowermarketing';

-- 1. Data em que cada tag foi posta (para "parar se respondeu depois de começar").
alter table contact_tags add column if not exists created_at timestamptz default now();

-- 2. Tags (as que já existem ficam como estão).
insert into tags (brand_id, name)
select b.id, t.name
from brands b
cross join (values
  ('comercial:core-contratado'),
  ('comercial:mapa-comprado'),
  ('comercial:mapa-entregue'),
  ('comercial:perdido'),
  ('comercial:reuniao-marcada'),
  ('comercial:reuniao-realizada'),
  ('concluiu:ex-cliente'),
  ('concluiu:pos-mapa'),
  ('concluiu:pos-reuniao'),
  ('concluiu:reativacao'),
  ('fit:icp-nao'),
  ('fluxo:diagnostico'),
  ('fluxo:ex-cliente'),
  ('fluxo:pos-mapa'),
  ('fluxo:pos-reuniao'),
  ('fluxo:reativacao'),
  ('motivo:escolheu-outro'),
  ('motivo:preco'),
  ('motivo:timing'),
  ('motivo:valor-nao-claro'),
  ('newsletter:ativo'),
  ('recencia:12m-mais'),
  ('relacao:cliente-ativo'),
  ('relacao:ex-cliente'),
  ('relacao:reuniao-sem-fecho'),
  ('relacao:sem-reuniao'),
  ('rgpd:opt-out'),
  ('setor:beleza'),
  ('setor:marca-conceito'),
  ('setor:marca-pessoal'),
  ('setor:mobiliario'),
  ('setor:moda'),
  ('setor:restauracao'),
  ('sinal:respondeu')
) as t(name)
where b.booking_slug = 'empowermarketing'
  and not exists (select 1 from tags x where x.brand_id = b.id and lower(x.name) = lower(t.name));

-- 3. REA — Reativação "Porta Reaberta" (REA-01 a REA-05) (rascunho)
insert into automations (brand_id, name, trigger_type, trigger_config, status)
select (select id from brands where booking_slug = 'empowermarketing' limit 1), 'REA — Reativação "Porta Reaberta" (REA-01 a REA-05)', 'contact_tagged', jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('fluxo:reativacao')), 'stopTagIds', jsonb_build_array((select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('fit:icp-nao')), (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('rgpd:opt-out')), (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('comercial:perdido')), (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('comercial:core-contratado')), (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('relacao:ex-cliente')), (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('relacao:cliente-ativo')), (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('fluxo:pos-mapa')), (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('fluxo:pos-reuniao')), (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('fluxo:diagnostico')), (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('fluxo:ex-cliente'))), 'stopIfTaggedAfterStartIds', jsonb_build_array((select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('sinal:respondeu')), (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('comercial:reuniao-marcada')), (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('comercial:reuniao-realizada')), (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('comercial:mapa-comprado'))), 'sendWindow', '{"days": [2, 3, 4], "start": "08:30", "end": "10:00", "tz": "Europe/Lisbon"}'::jsonb, 'maxEmailsPerWeek', 2), 'draft'
where (select id from brands where booking_slug = 'empowermarketing' limit 1) is not null
  and not exists (select 1 from automations where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and name = 'REA — Reativação "Porta Reaberta" (REA-01 a REA-05)');

insert into automation_steps (brand_id, automation_id, position, type, action_type, wait_minutes, config)
select a.brand_id, a.id, s.position, s.type, s.action_type, s.wait_minutes, s.config
from automations a
cross join (values
  (1, 'action', 'send_email', null::int, '{"subject": "desde a nossa conversa", "body": "{{primeiro_nome}},\n\n{{rea_abertura}} Não avançámos na altura, e está tudo bem.\n\nEscrevo-te porque a Empower mudou desde então. Deixámos de funcionar como agência. Hoje somos uma consultora de crescimento estratégico: não vendemos packs de conteúdo, construímos a posição da marca e o ecossistema à volta dela.\n\nMudámos porque vimos o mesmo padrão em quase todas as marcas premium com que falámos: marcas bonitas, ativas e, mesmo assim, invisíveis. O problema raramente era falta de conteúdo. Era falta de posição.\n\nNas próximas semanas vou partilhar contigo algumas coisas que aprendemos sobre isto. Se preferires não receber, responde \"não\" e fico por aqui.\n\nBeatriz Melo\nEmpower Marketing", "preheader": "Não é uma proposta. É contexto."}'::jsonb),
  (2, 'wait', null, 5760::int, '{}'::jsonb),
  (3, 'action', 'send_email', null::int, '{"subject": "a pergunta que fazemos primeiro", "body": "{{primeiro_nome}},\n\nHá uma pergunta que fazemos a todos os fundadores logo no início: se amanhã a tua marca desaparecesse, o que é que os teus clientes perderiam que não encontram em mais lado nenhum?\n\nA maioria demora a responder. E essa hesitação explica quase tudo.\n\nQuando uma marca não tem uma posição clara, o reflexo é produzir mais: mais conteúdo, mais campanhas, mais investimento em anúncios. Mas volume não cria diferença. Só amplifica a que já existe, ou a falta dela.\n\nPor isso começamos sempre pela causa, não pelo sintoma. Primeiro a posição. Depois os canais. Só no fim, o conteúdo.\n\nComo responderias tu a essa pergunta sobre a {{nome_marca|tua marca}}?\n\nBeatriz Melo\nEmpower Marketing", "preheader": "A maioria dos fundadores demora a responder."}'::jsonb),
  (4, 'wait', null, 7200::int, '{}'::jsonb),
  (5, 'action', 'send_email', null::int, '{"subject": "um caso de {{setor|marcas premium}}", "body": "{{primeiro_nome}},\n\nQuero mostrar-te um caso concreto, porque acho que te vai soar familiar.\n\n[AJUSTAR: descrição da marca, ex.: \"Uma marca de mobiliário de autor no Porto\"] chegou até nós com [AJUSTAR: situação inicial, ex.: produto excelente, presença ativa nas redes e vendas paradas há 18 meses].\n\nA primeira decisão não foi fazer mais. Foi definir que espaço a marca ia ocupar: [AJUSTAR: a posição numa frase].\n\nA partir daí, [AJUSTAR: 2 ou 3 mudanças concretas em canais, oferta ou comunicação].\n\nEm [AJUSTAR: X meses], [AJUSTAR: resultado com número, ex.: ticket médio +32%, 40% das vendas em canal próprio].\n\nO caso completo está aqui: {{link_caso_setor|[AJUSTAR: link do caso geral]}}\n\nBeatriz Melo\nEmpower Marketing", "preheader": "Acho que te vai soar familiar."}'::jsonb),
  (6, 'wait', null, 7200::int, '{}'::jsonb),
  (7, 'action', 'send_email', null::int, '{"subject": "antes de qualquer projeto", "body": "{{primeiro_nome}},\n\nHoje nenhum projeto da Empower começa com uma proposta. Começa com um diagnóstico: o Mapa de Crescimento.\n\n{{paragrafo_motivo|}}\n\nEm 2 a 3 semanas analisamos a {{nome_marca|tua marca}}, o teu mercado e os teus concorrentes, e entregamos-te três coisas:\n— onde está hoje a posição da marca e onde há espaço livre no mercado\n— o que está realmente a travar o crescimento\n— as prioridades dos próximos 6 meses, por ordem de impacto\n\nO Mapa é teu, quer avances connosco para execução quer não. Foi desenhado para ter valor por si só.\n\nTens tudo explicado aqui: https://www.empowermarketing.online/mapadecrescimento\n\nBeatriz Melo\nEmpower Marketing", "preheader": "Tem valor mesmo que não avances connosco."}'::jsonb),
  (8, 'wait', null, 10080::int, '{}'::jsonb),
  (9, 'action', 'send_email', null::int, '{"subject": "fecho por aqui", "body": "{{primeiro_nome}},\n\nEsta é a última mensagem que te envio sobre este tema. Não quero ocupar a tua caixa de entrada com algo que não é prioridade agora.\n\nAntes de fechar, uma pergunta sincera: {{rea_pergunta_fecho|o que é que te fez não avançar na altura?}} Foi o momento, o investimento, ou não ficou claro o que íamos fazer?\n\nUma linha chega. Ajuda-nos a explicar melhor o nosso trabalho.\n\nDaqui para a frente vais receber apenas a Carta de Posição, uma reflexão curta de 15 em 15 dias sobre marcas premium. Se preferires não receber, responde \"sair\".\n\nSe um dia o tema voltar a fazer sentido, basta responderes a este email.\n\nBeatriz Melo\nEmpower Marketing", "preheader": "Uma pergunta antes de fechar."}'::jsonb),
  (10, 'action', 'remove_tag', null::int, jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('fluxo:reativacao')))),
  (11, 'action', 'add_tag', null::int, jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('concluiu:reativacao')))),
  (12, 'action', 'add_tag', null::int, jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('newsletter:ativo'))))
) as s(position, type, action_type, wait_minutes, config)
where a.brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and a.name = 'REA — Reativação "Porta Reaberta" (REA-01 a REA-05)'
  and not exists (select 1 from automation_steps x where x.automation_id = a.id);

-- 4. EXC — Ex-clientes "Revisão de Posição" (EXC-01 a EXC-03) (rascunho)
insert into automations (brand_id, name, trigger_type, trigger_config, status)
select (select id from brands where booking_slug = 'empowermarketing' limit 1), 'EXC — Ex-clientes "Revisão de Posição" (EXC-01 a EXC-03)', 'contact_tagged', jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('fluxo:ex-cliente')), 'stopTagIds', jsonb_build_array((select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('rgpd:opt-out')), (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('comercial:perdido')), (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('relacao:cliente-ativo')), (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('comercial:core-contratado')), (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('fluxo:pos-mapa')), (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('fluxo:pos-reuniao')), (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('fluxo:diagnostico')), (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('fluxo:reativacao'))), 'stopIfTaggedAfterStartIds', jsonb_build_array((select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('sinal:respondeu')), (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('comercial:reuniao-marcada')), (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('comercial:mapa-comprado'))), 'sendWindow', '{"days": [2, 3, 4], "start": "08:30", "end": "10:00", "tz": "Europe/Lisbon"}'::jsonb, 'maxEmailsPerWeek', 2), 'draft'
where (select id from brands where booking_slug = 'empowermarketing' limit 1) is not null
  and not exists (select 1 from automations where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and name = 'EXC — Ex-clientes "Revisão de Posição" (EXC-01 a EXC-03)');

insert into automation_steps (brand_id, automation_id, position, type, action_type, wait_minutes, config)
select a.brand_id, a.id, s.position, s.type, s.action_type, s.wait_minutes, s.config
from automations a
cross join (values
  (1, 'wait', null, 1::int, '{"untilField": "data_fim_projeto", "offsetDays": 90, "hourUTC": 8}'::jsonb),
  (2, 'action', 'send_email', null::int, '{"subject": "a {{nome_marca|tua marca}}, {{meses_desde_projeto}} meses depois", "body": "{{primeiro_nome}},\n\nPassaram {{meses_desde_projeto}} meses desde que terminámos o trabalho na {{nome_marca|tua marca}}. Tenho acompanhado a marca à distância e queria perguntar-te como estão as coisas por dentro.\n\nPergunto porque o mercado de {{setor|marcas premium}} mudou bastante neste período. E uma posição que era única há um ano pode, entretanto, ter sido ocupada ou copiada.\n\nTrês perguntas rápidas, se tiveres dois minutos:\n— A marca continua a ser escolhida pelas mesmas razões?\n— Apareceu algum concorrente a dizer o mesmo que vocês?\n— O crescimento está a vir de onde esperavas?\n\nNão há proposta nenhuma por trás disto. Gostava mesmo de saber.\n\nBeatriz Melo\nEmpower Marketing", "preheader": "O mercado mudou desde que trabalhámos juntos."}'::jsonb),
  (3, 'wait', null, 10080::int, '{}'::jsonb),
  (4, 'action', 'send_email', null::int, '{"subject": "uma auditoria à posição", "body": "{{primeiro_nome}},\n\nDesde que trabalhámos juntos, a Empower mudou a forma como começa cada projeto. Hoje começamos sempre por um diagnóstico: o Mapa de Crescimento.\n\nPara marcas que já passaram por nós, o Mapa funciona como auditoria. Em vez de partirmos do zero, partimos do que construímos juntos e respondemos a uma pergunta só: a posição da {{nome_marca|tua marca}} continua forte, ou precisa de ser reajustada para os próximos 12 meses?\n\nO resultado é um documento com o estado atual, os riscos e as prioridades por ordem de impacto. Fica contigo, avances ou não com execução.\n\nOs detalhes estão aqui: https://www.empowermarketing.online/mapadecrescimento\n\nBeatriz Melo\nEmpower Marketing", "preheader": "Para marcas que já têm base construída."}'::jsonb),
  (5, 'wait', null, 20160::int, '{}'::jsonb),
  (6, 'action', 'send_email', null::int, '{"subject": "um pedido", "body": "{{primeiro_nome}},\n\nUm pedido direto.\n\nEstamos a reunir o testemunho de fundadores com quem trabalhámos. Se o trabalho na {{nome_marca|tua marca}} teve impacto, as tuas palavras valem mais do que qualquer coisa que eu possa escrever sobre nós.\n\nBasta responderes a este email com duas ou três frases: como estava a marca antes, o que mudou, e o que dirias a outro fundador que esteja a pensar trabalhar connosco.\n\nE se conheceres alguém com uma marca premium que sinta que está bonita mas invisível, fico grata pela apresentação. Tratamos essa pessoa com o mesmo cuidado que tivemos contigo.\n\nBeatriz Melo\nEmpower Marketing", "preheader": "Dois minutos, prometo.", "onlyIf": {"field": "pode_pedir_testemunho", "equals": "sim"}}'::jsonb),
  (7, 'action', 'remove_tag', null::int, jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('fluxo:ex-cliente')))),
  (8, 'action', 'add_tag', null::int, jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('concluiu:ex-cliente')))),
  (9, 'action', 'add_tag', null::int, jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('newsletter:ativo'))))
) as s(position, type, action_type, wait_minutes, config)
where a.brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and a.name = 'EXC — Ex-clientes "Revisão de Posição" (EXC-01 a EXC-03)'
  and not exists (select 1 from automation_steps x where x.automation_id = a.id);

-- 5. MAP-00 — Confirmação da compra do Mapa (rascunho)
insert into automations (brand_id, name, trigger_type, trigger_config, status)
select (select id from brands where booking_slug = 'empowermarketing' limit 1), 'MAP-00 — Confirmação da compra do Mapa', 'contact_tagged', jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('comercial:mapa-comprado')), 'stopTagIds', jsonb_build_array((select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('rgpd:opt-out')), (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('comercial:core-contratado')))), 'draft'
where (select id from brands where booking_slug = 'empowermarketing' limit 1) is not null
  and not exists (select 1 from automations where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and name = 'MAP-00 — Confirmação da compra do Mapa');

insert into automation_steps (brand_id, automation_id, position, type, action_type, wait_minutes, config)
select a.brand_id, a.id, s.position, s.type, s.action_type, s.wait_minutes, s.config
from automations a
cross join (values
  (1, 'action', 'remove_tag', null::int, jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('fluxo:reativacao')))),
  (2, 'action', 'remove_tag', null::int, jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('fluxo:ex-cliente')))),
  (3, 'action', 'remove_tag', null::int, jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('fluxo:pos-reuniao')))),
  (4, 'action', 'remove_tag', null::int, jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('fluxo:diagnostico')))),
  (5, 'action', 'add_tag', null::int, jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('fluxo:pos-mapa')))),
  (6, 'action', 'send_email', null::int, '{"subject": "o Mapa da {{nome_marca|tua marca}} começa hoje", "body": "{{primeiro_nome}},\n\nObrigada pela confiança. O Mapa de Crescimento da {{nome_marca|tua marca}} começa hoje.\n\nO que acontece a seguir:\n1. Nos próximos 2 dias úteis recebes um questionário curto sobre a marca, os clientes e os números principais.\n2. [AJUSTAR: sessão de kick-off, data e duração]\n3. Em 2 a 3 semanas apresentamos-te o Mapa numa sessão dedicada.\n\nSe entretanto te lembrares de algo que devamos saber (um concorrente que te incomoda, uma ideia que ficou na gaveta), responde a este email. Tudo conta.\n\nBeatriz Melo", "sendNow": true}'::jsonb)
) as s(position, type, action_type, wait_minutes, config)
where a.brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and a.name = 'MAP-00 — Confirmação da compra do Mapa'
  and not exists (select 1 from automation_steps x where x.automation_id = a.id);

-- 6. MAP-01 a MAP-07 — Pós-Mapa (a partir da entrega) (rascunho)
insert into automations (brand_id, name, trigger_type, trigger_config, status)
select (select id from brands where booking_slug = 'empowermarketing' limit 1), 'MAP-01 a MAP-07 — Pós-Mapa (a partir da entrega)', 'contact_tagged', jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('comercial:mapa-entregue')), 'stopTagIds', jsonb_build_array((select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('rgpd:opt-out')), (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('comercial:core-contratado'))), 'sendWindow', '{"days": [1, 2, 3, 4, 5], "start": "08:30", "end": "19:00", "tz": "Europe/Lisbon"}'::jsonb), 'draft'
where (select id from brands where booking_slug = 'empowermarketing' limit 1) is not null
  and not exists (select 1 from automations where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and name = 'MAP-01 a MAP-07 — Pós-Mapa (a partir da entrega)');

insert into automation_steps (brand_id, automation_id, position, type, action_type, wait_minutes, config)
select a.brand_id, a.id, s.position, s.type, s.action_type, s.wait_minutes, s.config
from automations a
cross join (values
  (1, 'action', 'create_task', null::int, '{"title": "Mapa entregue: confirma que preencheste data_entrega_mapa, resumo_mapa, prioridade_1 e link_documento_mapa (o MAP-01 sai 3h depois de aplicares a tag)", "dueInMinutes": 120}'::jsonb),
  (2, 'wait', null, 180::int, '{}'::jsonb),
  (3, 'action', 'send_email', null::int, '{"subject": "o Mapa da {{nome_marca|tua marca}}, e o que vem a seguir", "body": "{{primeiro_nome}},\n\nObrigada pela sessão de hoje. Deixo-te o Mapa completo aqui: {{link_documento_mapa}}\n\nSe tivesse de resumir numa frase: {{resumo_mapa}}\n\nO Mapa é teu. Podes executá-lo com a tua equipa, com outro parceiro ou connosco.\n\nSe quiseres que seja a Empower a construí-lo, há um detalhe prático: se o projeto arrancar até {{data_limite_integracao}}, o investimento no Mapa fica integrado no projeto. Não é uma condição comercial. É o período em que o diagnóstico continua atual e em que conseguimos partir dele sem refazer análise.\n\nNos próximos dias vou enviar-te algumas notas sobre as prioridades. Qualquer dúvida, responde aqui.\n\nBeatriz Melo", "sendNow": true, "optional": true}'::jsonb),
  (4, 'wait', null, 1::int, '{"untilField": "data_entrega_mapa", "offsetDays": 3, "hourUTC": 8}'::jsonb),
  (5, 'action', 'create_task', null::int, '{"title": "Pós-Mapa: falta o campo prioridade_1, por isso o MAP-02 não foi enviado. Preenche e envia à mão.", "dueInMinutes": 1440, "onlyIf": {"field": "prioridade_1", "empty": true}}'::jsonb),
  (6, 'action', 'send_email', null::int, '{"subject": "sobre a prioridade nº 1", "body": "{{primeiro_nome}},\n\nDe tudo o que está no Mapa, há uma coisa que eu faria primeiro: {{prioridade_1}}.\n\nPorquê esta e não as outras? Porque é a única que muda a forma como tudo o resto funciona. Enquanto não estiver resolvida, cada euro investido em conteúdo, campanhas ou canais rende menos do que devia.\n\nÉ o mesmo princípio de sempre: tratar a causa antes do sintoma.\n\nFaz sentido para ti esta ordem, ou vês a coisa de outra forma?\n\nBeatriz Melo", "onlyIf": {"field": "prioridade_1"}}'::jsonb),
  (7, 'wait', null, 1::int, '{"untilField": "data_entrega_mapa", "offsetDays": 7, "hourUTC": 8}'::jsonb),
  (8, 'action', 'send_email', null::int, '{"subject": "como foi a execução noutra marca", "body": "{{primeiro_nome}},\n\nUma pergunta que costumo ouvir depois do Mapa: \"e na prática, como é que isto se executa?\"\n\nA melhor resposta é um caso. [AJUSTAR: marca do caso] começou exatamente onde a {{nome_marca|tua marca}} está agora: com o diagnóstico feito e as prioridades definidas.\n\nNos primeiros 90 dias, [AJUSTAR: o que foi feito, por ordem]. Aos 6 meses, [AJUSTAR: resultado com número].\n\nO que fez a diferença não foi nenhuma ação isolada. Foi termos seguido a ordem do Mapa sem saltar etapas.\n\nO caso completo está aqui: {{link_caso_setor|[AJUSTAR: link do caso geral]}}\n\nBeatriz Melo"}'::jsonb),
  (9, 'wait', null, 1::int, '{"untilField": "data_entrega_mapa", "offsetDays": 14, "hourUTC": 8}'::jsonb),
  (10, 'action', 'send_email', null::int, '{"subject": "as 3 perguntas que todos fazem", "body": "{{primeiro_nome}},\n\nAntes de avançarem para o projeto, quase todos os fundadores fazem as mesmas três perguntas. Deixo-te as respostas, caso também estejam na tua cabeça.\n\n\"E se aparecerem custos que não estavam previstos?\"\nNão aparecem. Apresentamos um número fechado. Se a execução exigir mais do que previmos, o risco é nosso.\n\n\"Quanto tempo até ver resultados?\"\nA posição começa a notar-se nas primeiras semanas, na forma como a marca é percebida. O crescimento consistente aparece entre o 4.º e o 6.º mês, e é por isso que os projetos têm 6 ou 12 meses.\n\n\"Vou perder o controlo da minha marca?\"\nNão. Tu decides, nós construímos. Cada fase é validada contigo antes de avançar.\n\nSe tiveres outra pergunta que não esteja aqui, responde. É provavelmente a mais importante.\n\nBeatriz Melo"}'::jsonb),
  (11, 'action', 'create_task', null::int, '{"title": "Pós-Mapa: preparar a proposta (número fechado) até ao dia +19 depois da entrega", "dueInMinutes": 7200}'::jsonb),
  (12, 'wait', null, 1::int, '{"untilField": "data_entrega_mapa", "offsetDays": 21, "hourUTC": 8}'::jsonb),
  (13, 'action', 'create_task', null::int, '{"title": "Pós-Mapa: enviar hoje o MAP-05 (proposta) por email pessoal. Assunto: a proposta para a marca. Duração, o que construímos, investimento (valor_proposta, fechado) e integração do Mapa até à data-limite. Link para rever em 20 min: https://big-boos.vercel.app/agendar/empowermarketing", "dueInMinutes": 1440}'::jsonb),
  (14, 'wait', null, 1::int, '{"untilField": "data_entrega_mapa", "offsetDays": 27, "hourUTC": 8}'::jsonb),
  (15, 'action', 'send_email', null::int, '{"subject": "até {{data_limite_integracao}}", "body": "{{primeiro_nome}},\n\nUma nota prática: a janela para integrar o Mapa no projeto termina a {{data_limite_integracao}}.\n\nDepois disso, o Mapa continua teu e continua válido como orientação. Mas se decidirmos avançar mais tarde, teremos de atualizar a análise antes de começar, porque o mercado não fica parado.\n\nSe ainda tens alguma dúvida que esteja a travar a decisão, responde a este email e resolvemos antes dessa data.\n\nBeatriz Melo"}'::jsonb),
  (16, 'wait', null, 1::int, '{"untilField": "data_entrega_mapa", "offsetDays": 31, "hourUTC": 8}'::jsonb),
  (17, 'action', 'send_email', null::int, '{"subject": "o Mapa continua teu", "body": "{{primeiro_nome}},\n\nA janela de integração terminou, e está tudo bem. Nem todas as marcas estão no momento certo ao mesmo tempo.\n\nO Mapa continua a ser teu. Se o executares com outra equipa, uma sugestão: não saltes a prioridade nº 1. É a que faz o resto funcionar.\n\nVou continuar a enviar-te a Carta de Posição de 15 em 15 dias. E se daqui a uns meses quiseres rever o Mapa à luz do que mudou, sabes onde estou.\n\nBeatriz Melo"}'::jsonb),
  (18, 'action', 'remove_tag', null::int, jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('fluxo:pos-mapa')))),
  (19, 'action', 'add_tag', null::int, jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('concluiu:pos-mapa')))),
  (20, 'action', 'add_tag', null::int, jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('newsletter:ativo')))),
  (21, 'wait', null, 1::int, '{"untilField": "data_entrega_mapa", "offsetDays": 60, "hourUTC": 8}'::jsonb),
  (22, 'action', 'create_task', null::int, '{"title": "Resgate pós-Mapa (+60 dias): mensagem pessoal (email ou WhatsApp) a perguntar como está a correr a execução", "dueInMinutes": 2880}'::jsonb),
  (23, 'wait', null, 1::int, '{"untilField": "data_entrega_mapa", "offsetDays": 90, "hourUTC": 8}'::jsonb),
  (24, 'action', 'create_task', null::int, '{"title": "Resgate pós-Mapa (+90 dias): mensagem pessoal (email ou WhatsApp) a perguntar como está a correr a execução", "dueInMinutes": 2880}'::jsonb)
) as s(position, type, action_type, wait_minutes, config)
where a.brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and a.name = 'MAP-01 a MAP-07 — Pós-Mapa (a partir da entrega)'
  and not exists (select 1 from automation_steps x where x.automation_id = a.id);

-- 7. REU — Pós-reunião (REU-01 a REU-90) (rascunho)
insert into automations (brand_id, name, trigger_type, trigger_config, status)
select (select id from brands where booking_slug = 'empowermarketing' limit 1), 'REU — Pós-reunião (REU-01 a REU-90)', 'contact_tagged', jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('comercial:reuniao-realizada')), 'stopTagIds', jsonb_build_array((select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('rgpd:opt-out')), (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('comercial:mapa-comprado')), (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('comercial:core-contratado')), (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('comercial:perdido')), (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('fluxo:pos-mapa'))), 'stopIfTaggedAfterStartIds', jsonb_build_array((select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('sinal:respondeu'))), 'sendWindow', '{"days": [1, 2, 3, 4, 5], "start": "08:30", "end": "19:00", "tz": "Europe/Lisbon"}'::jsonb), 'draft'
where (select id from brands where booking_slug = 'empowermarketing' limit 1) is not null
  and not exists (select 1 from automations where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and name = 'REU — Pós-reunião (REU-01 a REU-90)');

insert into automation_steps (brand_id, automation_id, position, type, action_type, wait_minutes, config)
select a.brand_id, a.id, s.position, s.type, s.action_type, s.wait_minutes, s.config
from automations a
cross join (values
  (1, 'action', 'remove_tag', null::int, jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('fluxo:reativacao')))),
  (2, 'action', 'remove_tag', null::int, jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('fluxo:ex-cliente')))),
  (3, 'action', 'remove_tag', null::int, jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('fluxo:diagnostico')))),
  (4, 'action', 'add_tag', null::int, jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('fluxo:pos-reuniao')))),
  (5, 'wait', null, 60::int, '{}'::jsonb),
  (6, 'action', 'create_task', null::int, '{"title": "URGENTE: reunião registada sem dor_principal, por isso o REU-01 não foi enviado. Preenche o campo e envia o resumo à mão.", "dueInMinutes": 120, "onlyIf": {"field": "dor_principal", "empty": true}}'::jsonb),
  (7, 'action', 'send_email', null::int, '{"subject": "a nossa conversa de hoje", "body": "{{primeiro_nome}},\n\nObrigada pelo tempo de hoje.\n\nO que retive da conversa: {{dor_principal}}\n\nPela minha experiência, isto raramente se resolve com mais execução. Resolve-se quando a marca sabe exatamente que espaço ocupa, e todos os canais passam a trabalhar para essa posição.\n\nAmanhã envio-te uma leitura que acho que te vai ser útil. Se me escapou algo importante na conversa, diz-me.\n\nBeatriz Melo", "sendNow": true, "onlyIf": {"field": "dor_principal"}}'::jsonb),
  (8, 'wait', null, 1380::int, '{}'::jsonb),
  (9, 'action', 'send_email', null::int, '{"subject": "o que te prometi ontem", "body": "{{primeiro_nome}},\n\nComo prometido: {{link_recurso|https://www.empowermarketing.online/insights/dreams-academy-rebranding}}\n\nEscolhi este porque toca diretamente no que me disseste sobre a {{nome_marca|tua marca}}. São 5 minutos de leitura.\n\nDepois de leres, gostava de saber: reconheces a tua marca naquilo?\n\nBeatriz Melo"}'::jsonb),
  (10, 'wait', null, 2880::int, '{}'::jsonb),
  (11, 'action', 'send_email', null::int, '{"subject": "uma marca parecida com a tua", "body": "{{primeiro_nome}},\n\nLembrei-me da nossa conversa ao rever um projeto recente.\n\n[AJUSTAR: descrição da marca] tinha um desafio muito parecido com o da {{nome_marca|tua marca}}: [AJUSTAR: desafio numa frase].\n\nEm [AJUSTAR: X meses], [AJUSTAR: resultado com número].\n\nO caso completo está aqui: {{link_caso_setor|[AJUSTAR: link do caso geral]}}\n\nBeatriz Melo"}'::jsonb),
  (12, 'wait', null, 5760::int, '{}'::jsonb),
  (13, 'action', 'send_email', null::int, '{"subject": "o próximo passo que recomendo", "body": "{{primeiro_nome}},\n\nDepois da nossa conversa, a minha recomendação para a {{nome_marca|tua marca}} é começar pelo Mapa de Crescimento.\n\nÉ um diagnóstico de 2 a 3 semanas que responde a três perguntas: onde está hoje a posição da marca, o que está realmente a travar o crescimento, e o que fazer nos próximos 6 meses, por ordem.\n\nFica contigo, quer avances connosco para execução quer não. E se avançares nos 30 dias seguintes, o investimento no Mapa fica integrado no projeto.\n\nOs detalhes estão aqui: https://www.empowermarketing.online/mapadecrescimento\n\nBeatriz Melo"}'::jsonb),
  (14, 'wait', null, 33120::int, '{}'::jsonb),
  (15, 'action', 'send_email', null::int, '{"subject": "{{nome_marca|a tua marca}}, um mês depois", "body": "{{primeiro_nome}},\n\nPassou um mês desde a nossa conversa. Como está a {{nome_marca|tua marca}}?\n\nPergunto sem agenda. Lembro-me de falares em {{dor_principal}} e fiquei curiosa sobre se mudou alguma coisa.\n\nBeatriz Melo", "onlyIf": {"field": "dor_principal"}}'::jsonb),
  (16, 'wait', null, 43200::int, '{}'::jsonb),
  (17, 'action', 'send_email', null::int, '{"subject": "uma ideia para a {{nome_marca|tua marca}}", "body": "{{primeiro_nome}},\n\nEstive a olhar para o mercado de {{setor|marcas premium}} nas últimas semanas e há um movimento que acho que te interessa: {{tendencia_setor|[AJUSTAR: 1 tendência ou movimento concreto do setor, atualizado trimestralmente]}}.\n\nPara uma marca como a {{nome_marca|tua marca}}, isto pode ser uma oportunidade de posição, se for ocupada antes dos concorrentes.\n\nQueres que te diga como a leria no teu caso?\n\nBeatriz Melo"}'::jsonb),
  (18, 'wait', null, 43200::int, '{}'::jsonb),
  (19, 'action', 'send_email', null::int, '{"subject": "fecho o ciclo", "body": "{{primeiro_nome}},\n\nÚltima mensagem da minha parte sobre o tema da nossa conversa.\n\nSe o momento não era este, faz todo o sentido. Vou continuar a enviar-te a Carta de Posição, uma reflexão curta de 15 em 15 dias sobre marcas premium. Se preferires não receber, responde \"sair\".\n\nE se um dia quiseres retomar, é só responderes aqui.\n\nBeatriz Melo"}'::jsonb),
  (20, 'action', 'remove_tag', null::int, jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('fluxo:pos-reuniao')))),
  (21, 'action', 'add_tag', null::int, jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('concluiu:pos-reuniao')))),
  (22, 'action', 'add_tag', null::int, jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('newsletter:ativo')))),
  (23, 'action', 'create_task', null::int, '{"title": "Pós-reunião terminou sem Mapa: aplica a tag de motivo (motivo:preco, motivo:timing, motivo:valor-nao-claro, motivo:escolheu-outro, motivo:sem-resposta ou motivo:desconhecido)", "dueInMinutes": 2880}'::jsonb)
) as s(position, type, action_type, wait_minutes, config)
where a.brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and a.name = 'REU — Pós-reunião (REU-01 a REU-90)'
  and not exists (select 1 from automation_steps x where x.automation_id = a.id);

-- 8. Regra — resposta recebida (tarefa e saída dos fluxos) (ATIVA: não envia emails)
insert into automations (brand_id, name, trigger_type, trigger_config, status)
select (select id from brands where booking_slug = 'empowermarketing' limit 1), 'Regra — resposta recebida (tarefa e saída dos fluxos)', 'contact_tagged', jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('sinal:respondeu'))), 'active'
where (select id from brands where booking_slug = 'empowermarketing' limit 1) is not null
  and not exists (select 1 from automations where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and name = 'Regra — resposta recebida (tarefa e saída dos fluxos)');

insert into automation_steps (brand_id, automation_id, position, type, action_type, wait_minutes, config)
select a.brand_id, a.id, s.position, s.type, s.action_type, s.wait_minutes, s.config
from automations a
cross join (values
  (1, 'action', 'create_task', null::int, '{"title": "O contacto respondeu a um email: responder em 24h (e aplicar rgpd:opt-out se pediu para sair)", "dueInMinutes": 1440}'::jsonb),
  (2, 'action', 'remove_tag', null::int, jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('fluxo:reativacao')))),
  (3, 'action', 'remove_tag', null::int, jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('fluxo:ex-cliente')))),
  (4, 'action', 'remove_tag', null::int, jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('fluxo:pos-reuniao')))),
  (5, 'action', 'remove_tag', null::int, jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('fluxo:diagnostico'))))
) as s(position, type, action_type, wait_minutes, config)
where a.brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and a.name = 'Regra — resposta recebida (tarefa e saída dos fluxos)'
  and not exists (select 1 from automation_steps x where x.automation_id = a.id);

-- 9. Regra — opt-out (sair de tudo) (ATIVA: não envia emails)
insert into automations (brand_id, name, trigger_type, trigger_config, status)
select (select id from brands where booking_slug = 'empowermarketing' limit 1), 'Regra — opt-out (sair de tudo)', 'contact_tagged', jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('rgpd:opt-out'))), 'active'
where (select id from brands where booking_slug = 'empowermarketing' limit 1) is not null
  and not exists (select 1 from automations where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and name = 'Regra — opt-out (sair de tudo)');

insert into automation_steps (brand_id, automation_id, position, type, action_type, wait_minutes, config)
select a.brand_id, a.id, s.position, s.type, s.action_type, s.wait_minutes, s.config
from automations a
cross join (values
  (1, 'action', 'remove_tag', null::int, jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('fluxo:reativacao')))),
  (2, 'action', 'remove_tag', null::int, jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('fluxo:ex-cliente')))),
  (3, 'action', 'remove_tag', null::int, jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('fluxo:pos-reuniao')))),
  (4, 'action', 'remove_tag', null::int, jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('fluxo:diagnostico')))),
  (5, 'action', 'remove_tag', null::int, jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('fluxo:pos-mapa')))),
  (6, 'action', 'remove_tag', null::int, jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('newsletter:ativo'))))
) as s(position, type, action_type, wait_minutes, config)
where a.brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and a.name = 'Regra — opt-out (sair de tudo)'
  and not exists (select 1 from automation_steps x where x.automation_id = a.id);

-- 10. Variante — abertura (reunião sem fecho) (ATIVA: não envia emails)
insert into automations (brand_id, name, trigger_type, trigger_config, status)
select (select id from brands where booking_slug = 'empowermarketing' limit 1), 'Variante — abertura (reunião sem fecho)', 'contact_tagged', jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('relacao:reuniao-sem-fecho')), 'stopTagIds', jsonb_build_array((select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('recencia:12m-mais')))), 'active'
where (select id from brands where booking_slug = 'empowermarketing' limit 1) is not null
  and not exists (select 1 from automations where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and name = 'Variante — abertura (reunião sem fecho)');

insert into automation_steps (brand_id, automation_id, position, type, action_type, wait_minutes, config)
select a.brand_id, a.id, s.position, s.type, s.action_type, s.wait_minutes, s.config
from automations a
cross join (values
  (1, 'action', 'update_contact', null::int, '{"fields": {"rea_abertura": "Falámos {{em_mes_reuniao|há algum tempo}} sobre a {{nome_marca|tua marca}}."}}'::jsonb)
) as s(position, type, action_type, wait_minutes, config)
where a.brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and a.name = 'Variante — abertura (reunião sem fecho)'
  and not exists (select 1 from automation_steps x where x.automation_id = a.id);

-- 11. Variante — abertura (sem reunião) (ATIVA: não envia emails)
insert into automations (brand_id, name, trigger_type, trigger_config, status)
select (select id from brands where booking_slug = 'empowermarketing' limit 1), 'Variante — abertura (sem reunião)', 'contact_tagged', jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('relacao:sem-reuniao')), 'stopTagIds', jsonb_build_array((select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('recencia:12m-mais')))), 'active'
where (select id from brands where booking_slug = 'empowermarketing' limit 1) is not null
  and not exists (select 1 from automations where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and name = 'Variante — abertura (sem reunião)');

insert into automation_steps (brand_id, automation_id, position, type, action_type, wait_minutes, config)
select a.brand_id, a.id, s.position, s.type, s.action_type, s.wait_minutes, s.config
from automations a
cross join (values
  (1, 'action', 'update_contact', null::int, '{"fields": {"rea_abertura": "Trocámos mensagens {{em_mes_reuniao|há algum tempo}} sobre a {{nome_marca|tua marca}}, mas nunca chegámos a sentar-nos."}}'::jsonb)
) as s(position, type, action_type, wait_minutes, config)
where a.brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and a.name = 'Variante — abertura (sem reunião)'
  and not exists (select 1 from automation_steps x where x.automation_id = a.id);

-- 12. Variante — pergunta de fecho (sem reunião) (ATIVA: não envia emails)
insert into automations (brand_id, name, trigger_type, trigger_config, status)
select (select id from brands where booking_slug = 'empowermarketing' limit 1), 'Variante — pergunta de fecho (sem reunião)', 'contact_tagged', jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('relacao:sem-reuniao'))), 'active'
where (select id from brands where booking_slug = 'empowermarketing' limit 1) is not null
  and not exists (select 1 from automations where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and name = 'Variante — pergunta de fecho (sem reunião)');

insert into automation_steps (brand_id, automation_id, position, type, action_type, wait_minutes, config)
select a.brand_id, a.id, s.position, s.type, s.action_type, s.wait_minutes, s.config
from automations a
cross join (values
  (1, 'action', 'update_contact', null::int, '{"fields": {"rea_pergunta_fecho": "o que é que te fez não avançar para uma conversa na altura?"}}'::jsonb)
) as s(position, type, action_type, wait_minutes, config)
where a.brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and a.name = 'Variante — pergunta de fecho (sem reunião)'
  and not exists (select 1 from automation_steps x where x.automation_id = a.id);

-- 13. Variante — abertura (mais de 12 meses) (ATIVA: não envia emails)
insert into automations (brand_id, name, trigger_type, trigger_config, status)
select (select id from brands where booking_slug = 'empowermarketing' limit 1), 'Variante — abertura (mais de 12 meses)', 'contact_tagged', jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('recencia:12m-mais'))), 'active'
where (select id from brands where booking_slug = 'empowermarketing' limit 1) is not null
  and not exists (select 1 from automations where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and name = 'Variante — abertura (mais de 12 meses)');

insert into automation_steps (brand_id, automation_id, position, type, action_type, wait_minutes, config)
select a.brand_id, a.id, s.position, s.type, s.action_type, s.wait_minutes, s.config
from automations a
cross join (values
  (1, 'action', 'update_contact', null::int, '{"fields": {"rea_abertura": "Já passou mais de um ano desde que falámos sobre a {{nome_marca|tua marca}}."}}'::jsonb)
) as s(position, type, action_type, wait_minutes, config)
where a.brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and a.name = 'Variante — abertura (mais de 12 meses)'
  and not exists (select 1 from automation_steps x where x.automation_id = a.id);

-- 14. Variante — motivo: preço (ATIVA: não envia emails)
insert into automations (brand_id, name, trigger_type, trigger_config, status)
select (select id from brands where booking_slug = 'empowermarketing' limit 1), 'Variante — motivo: preço', 'contact_tagged', jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('motivo:preco'))), 'active'
where (select id from brands where booking_slug = 'empowermarketing' limit 1) is not null
  and not exists (select 1 from automations where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and name = 'Variante — motivo: preço');

insert into automation_steps (brand_id, automation_id, position, type, action_type, wait_minutes, config)
select a.brand_id, a.id, s.position, s.type, s.action_type, s.wait_minutes, s.config
from automations a
cross join (values
  (1, 'action', 'update_contact', null::int, '{"fields": {"paragrafo_motivo": "Sei que na altura o investimento pesou na decisão. O Mapa existe também por isso: é um primeiro passo delimitado, com valor fechado. E se decidires avançar para o projeto nos 30 dias seguintes, esse investimento fica integrado. Nunca pagas duas vezes pela mesma análise."}}'::jsonb)
) as s(position, type, action_type, wait_minutes, config)
where a.brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and a.name = 'Variante — motivo: preço'
  and not exists (select 1 from automation_steps x where x.automation_id = a.id);

-- 15. Variante — motivo: timing (ATIVA: não envia emails)
insert into automations (brand_id, name, trigger_type, trigger_config, status)
select (select id from brands where booking_slug = 'empowermarketing' limit 1), 'Variante — motivo: timing', 'contact_tagged', jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('motivo:timing'))), 'active'
where (select id from brands where booking_slug = 'empowermarketing' limit 1) is not null
  and not exists (select 1 from automations where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and name = 'Variante — motivo: timing');

insert into automation_steps (brand_id, automation_id, position, type, action_type, wait_minutes, config)
select a.brand_id, a.id, s.position, s.type, s.action_type, s.wait_minutes, s.config
from automations a
cross join (values
  (1, 'action', 'update_contact', null::int, '{"fields": {"paragrafo_motivo": "Disseste-me que não era o momento certo. O Mapa é a forma de preparar esse momento sem te comprometeres já com execução."}}'::jsonb)
) as s(position, type, action_type, wait_minutes, config)
where a.brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and a.name = 'Variante — motivo: timing'
  and not exists (select 1 from automation_steps x where x.automation_id = a.id);

-- 16. Variante — motivo: valor não claro (ATIVA: não envia emails)
insert into automations (brand_id, name, trigger_type, trigger_config, status)
select (select id from brands where booking_slug = 'empowermarketing' limit 1), 'Variante — motivo: valor não claro', 'contact_tagged', jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('motivo:valor-nao-claro'))), 'active'
where (select id from brands where booking_slug = 'empowermarketing' limit 1) is not null
  and not exists (select 1 from automations where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and name = 'Variante — motivo: valor não claro');

insert into automation_steps (brand_id, automation_id, position, type, action_type, wait_minutes, config)
select a.brand_id, a.id, s.position, s.type, s.action_type, s.wait_minutes, s.config
from automations a
cross join (values
  (1, 'action', 'update_contact', null::int, '{"fields": {"paragrafo_motivo": "Talvez na altura não tenha ficado claro o que ias receber. O Mapa resolve isso: vês o diagnóstico completo antes de decidires qualquer projeto."}}'::jsonb)
) as s(position, type, action_type, wait_minutes, config)
where a.brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and a.name = 'Variante — motivo: valor não claro'
  and not exists (select 1 from automation_steps x where x.automation_id = a.id);

-- 17. Variante — motivo: escolheu outro (ATIVA: não envia emails)
insert into automations (brand_id, name, trigger_type, trigger_config, status)
select (select id from brands where booking_slug = 'empowermarketing' limit 1), 'Variante — motivo: escolheu outro', 'contact_tagged', jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('motivo:escolheu-outro'))), 'active'
where (select id from brands where booking_slug = 'empowermarketing' limit 1) is not null
  and not exists (select 1 from automations where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and name = 'Variante — motivo: escolheu outro');

insert into automation_steps (brand_id, automation_id, position, type, action_type, wait_minutes, config)
select a.brand_id, a.id, s.position, s.type, s.action_type, s.wait_minutes, s.config
from automations a
cross join (values
  (1, 'action', 'update_contact', null::int, '{"fields": {"paragrafo_motivo": "Não sei como está a correr o trabalho com a equipa que escolheste. Se estiver bem, ótimo. Se sentires que há muita execução e pouca direção, o Mapa funciona como segunda opinião independente."}}'::jsonb)
) as s(position, type, action_type, wait_minutes, config)
where a.brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and a.name = 'Variante — motivo: escolheu outro'
  and not exists (select 1 from automation_steps x where x.automation_id = a.id);

-- 18. Variante — setor: moda (ATIVA: não envia emails)
insert into automations (brand_id, name, trigger_type, trigger_config, status)
select (select id from brands where booking_slug = 'empowermarketing' limit 1), 'Variante — setor: moda', 'contact_tagged', jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('setor:moda'))), 'active'
where (select id from brands where booking_slug = 'empowermarketing' limit 1) is not null
  and not exists (select 1 from automations where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and name = 'Variante — setor: moda');

insert into automation_steps (brand_id, automation_id, position, type, action_type, wait_minutes, config)
select a.brand_id, a.id, s.position, s.type, s.action_type, s.wait_minutes, s.config
from automations a
cross join (values
  (1, 'action', 'update_contact', null::int, '{"fields": {"setor": "moda"}}'::jsonb)
) as s(position, type, action_type, wait_minutes, config)
where a.brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and a.name = 'Variante — setor: moda'
  and not exists (select 1 from automation_steps x where x.automation_id = a.id);

-- 19. Variante — setor: beleza (ATIVA: não envia emails)
insert into automations (brand_id, name, trigger_type, trigger_config, status)
select (select id from brands where booking_slug = 'empowermarketing' limit 1), 'Variante — setor: beleza', 'contact_tagged', jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('setor:beleza'))), 'active'
where (select id from brands where booking_slug = 'empowermarketing' limit 1) is not null
  and not exists (select 1 from automations where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and name = 'Variante — setor: beleza');

insert into automation_steps (brand_id, automation_id, position, type, action_type, wait_minutes, config)
select a.brand_id, a.id, s.position, s.type, s.action_type, s.wait_minutes, s.config
from automations a
cross join (values
  (1, 'action', 'update_contact', null::int, '{"fields": {"setor": "beleza"}}'::jsonb)
) as s(position, type, action_type, wait_minutes, config)
where a.brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and a.name = 'Variante — setor: beleza'
  and not exists (select 1 from automation_steps x where x.automation_id = a.id);

-- 20. Variante — setor: restauração (ATIVA: não envia emails)
insert into automations (brand_id, name, trigger_type, trigger_config, status)
select (select id from brands where booking_slug = 'empowermarketing' limit 1), 'Variante — setor: restauração', 'contact_tagged', jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('setor:restauracao'))), 'active'
where (select id from brands where booking_slug = 'empowermarketing' limit 1) is not null
  and not exists (select 1 from automations where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and name = 'Variante — setor: restauração');

insert into automation_steps (brand_id, automation_id, position, type, action_type, wait_minutes, config)
select a.brand_id, a.id, s.position, s.type, s.action_type, s.wait_minutes, s.config
from automations a
cross join (values
  (1, 'action', 'update_contact', null::int, '{"fields": {"setor": "restauração"}}'::jsonb)
) as s(position, type, action_type, wait_minutes, config)
where a.brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and a.name = 'Variante — setor: restauração'
  and not exists (select 1 from automation_steps x where x.automation_id = a.id);

-- 21. Variante — setor: mobiliário (ATIVA: não envia emails)
insert into automations (brand_id, name, trigger_type, trigger_config, status)
select (select id from brands where booking_slug = 'empowermarketing' limit 1), 'Variante — setor: mobiliário', 'contact_tagged', jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('setor:mobiliario'))), 'active'
where (select id from brands where booking_slug = 'empowermarketing' limit 1) is not null
  and not exists (select 1 from automations where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and name = 'Variante — setor: mobiliário');

insert into automation_steps (brand_id, automation_id, position, type, action_type, wait_minutes, config)
select a.brand_id, a.id, s.position, s.type, s.action_type, s.wait_minutes, s.config
from automations a
cross join (values
  (1, 'action', 'update_contact', null::int, '{"fields": {"setor": "mobiliário e design"}}'::jsonb)
) as s(position, type, action_type, wait_minutes, config)
where a.brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and a.name = 'Variante — setor: mobiliário'
  and not exists (select 1 from automation_steps x where x.automation_id = a.id);

-- 22. Variante — setor: marca conceito (ATIVA: não envia emails)
insert into automations (brand_id, name, trigger_type, trigger_config, status)
select (select id from brands where booking_slug = 'empowermarketing' limit 1), 'Variante — setor: marca conceito', 'contact_tagged', jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('setor:marca-conceito'))), 'active'
where (select id from brands where booking_slug = 'empowermarketing' limit 1) is not null
  and not exists (select 1 from automations where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and name = 'Variante — setor: marca conceito');

insert into automation_steps (brand_id, automation_id, position, type, action_type, wait_minutes, config)
select a.brand_id, a.id, s.position, s.type, s.action_type, s.wait_minutes, s.config
from automations a
cross join (values
  (1, 'action', 'update_contact', null::int, '{"fields": {"setor": "lifestyle"}}'::jsonb)
) as s(position, type, action_type, wait_minutes, config)
where a.brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and a.name = 'Variante — setor: marca conceito'
  and not exists (select 1 from automation_steps x where x.automation_id = a.id);

-- 23. Variante — setor: marca pessoal (ATIVA: não envia emails)
insert into automations (brand_id, name, trigger_type, trigger_config, status)
select (select id from brands where booking_slug = 'empowermarketing' limit 1), 'Variante — setor: marca pessoal', 'contact_tagged', jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('setor:marca-pessoal'))), 'active'
where (select id from brands where booking_slug = 'empowermarketing' limit 1) is not null
  and not exists (select 1 from automations where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and name = 'Variante — setor: marca pessoal');

insert into automation_steps (brand_id, automation_id, position, type, action_type, wait_minutes, config)
select a.brand_id, a.id, s.position, s.type, s.action_type, s.wait_minutes, s.config
from automations a
cross join (values
  (1, 'action', 'update_contact', null::int, '{"fields": {"setor": "serviços de autor"}}'::jsonb)
) as s(position, type, action_type, wait_minutes, config)
where a.brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and a.name = 'Variante — setor: marca pessoal'
  and not exists (select 1 from automation_steps x where x.automation_id = a.id);

-- 24. Variantes para contactos que já tinham as tags antes de existirem estas regras.
update contacts c set custom_fields = coalesce(c.custom_fields, '{}'::jsonb) || '{"rea_abertura": "Falámos {{em_mes_reuniao|há algum tempo}} sobre a {{nome_marca|tua marca}}."}'::jsonb
where c.brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1)
  and exists (select 1 from contact_tags ct where ct.contact_id = c.id and ct.tag_id = (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('relacao:reuniao-sem-fecho')))
  and not exists (select 1 from contact_tags ct where ct.contact_id = c.id and ct.tag_id = (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('recencia:12m-mais')));

update contacts c set custom_fields = coalesce(c.custom_fields, '{}'::jsonb) || '{"rea_abertura": "Trocámos mensagens {{em_mes_reuniao|há algum tempo}} sobre a {{nome_marca|tua marca}}, mas nunca chegámos a sentar-nos."}'::jsonb
where c.brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1)
  and exists (select 1 from contact_tags ct where ct.contact_id = c.id and ct.tag_id = (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('relacao:sem-reuniao')))
  and not exists (select 1 from contact_tags ct where ct.contact_id = c.id and ct.tag_id = (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('recencia:12m-mais')));

update contacts c set custom_fields = coalesce(c.custom_fields, '{}'::jsonb) || '{"rea_pergunta_fecho": "o que é que te fez não avançar para uma conversa na altura?"}'::jsonb
where c.brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1)
  and exists (select 1 from contact_tags ct where ct.contact_id = c.id and ct.tag_id = (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('relacao:sem-reuniao')));

update contacts c set custom_fields = coalesce(c.custom_fields, '{}'::jsonb) || '{"rea_abertura": "Já passou mais de um ano desde que falámos sobre a {{nome_marca|tua marca}}."}'::jsonb
where c.brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1)
  and exists (select 1 from contact_tags ct where ct.contact_id = c.id and ct.tag_id = (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('recencia:12m-mais')));

update contacts c set custom_fields = coalesce(c.custom_fields, '{}'::jsonb) || '{"paragrafo_motivo": "Sei que na altura o investimento pesou na decisão. O Mapa existe também por isso: é um primeiro passo delimitado, com valor fechado. E se decidires avançar para o projeto nos 30 dias seguintes, esse investimento fica integrado. Nunca pagas duas vezes pela mesma análise."}'::jsonb
where c.brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1)
  and exists (select 1 from contact_tags ct where ct.contact_id = c.id and ct.tag_id = (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('motivo:preco')));

update contacts c set custom_fields = coalesce(c.custom_fields, '{}'::jsonb) || '{"paragrafo_motivo": "Disseste-me que não era o momento certo. O Mapa é a forma de preparar esse momento sem te comprometeres já com execução."}'::jsonb
where c.brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1)
  and exists (select 1 from contact_tags ct where ct.contact_id = c.id and ct.tag_id = (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('motivo:timing')));

update contacts c set custom_fields = coalesce(c.custom_fields, '{}'::jsonb) || '{"paragrafo_motivo": "Talvez na altura não tenha ficado claro o que ias receber. O Mapa resolve isso: vês o diagnóstico completo antes de decidires qualquer projeto."}'::jsonb
where c.brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1)
  and exists (select 1 from contact_tags ct where ct.contact_id = c.id and ct.tag_id = (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('motivo:valor-nao-claro')));

update contacts c set custom_fields = coalesce(c.custom_fields, '{}'::jsonb) || '{"paragrafo_motivo": "Não sei como está a correr o trabalho com a equipa que escolheste. Se estiver bem, ótimo. Se sentires que há muita execução e pouca direção, o Mapa funciona como segunda opinião independente."}'::jsonb
where c.brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1)
  and exists (select 1 from contact_tags ct where ct.contact_id = c.id and ct.tag_id = (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('motivo:escolheu-outro')));

update contacts c set custom_fields = coalesce(c.custom_fields, '{}'::jsonb) || '{"setor": "moda"}'::jsonb
where c.brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1)
  and exists (select 1 from contact_tags ct where ct.contact_id = c.id and ct.tag_id = (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('setor:moda')));

update contacts c set custom_fields = coalesce(c.custom_fields, '{}'::jsonb) || '{"setor": "beleza"}'::jsonb
where c.brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1)
  and exists (select 1 from contact_tags ct where ct.contact_id = c.id and ct.tag_id = (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('setor:beleza')));

update contacts c set custom_fields = coalesce(c.custom_fields, '{}'::jsonb) || '{"setor": "restauração"}'::jsonb
where c.brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1)
  and exists (select 1 from contact_tags ct where ct.contact_id = c.id and ct.tag_id = (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('setor:restauracao')));

update contacts c set custom_fields = coalesce(c.custom_fields, '{}'::jsonb) || '{"setor": "mobiliário e design"}'::jsonb
where c.brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1)
  and exists (select 1 from contact_tags ct where ct.contact_id = c.id and ct.tag_id = (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('setor:mobiliario')));

update contacts c set custom_fields = coalesce(c.custom_fields, '{}'::jsonb) || '{"setor": "lifestyle"}'::jsonb
where c.brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1)
  and exists (select 1 from contact_tags ct where ct.contact_id = c.id and ct.tag_id = (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('setor:marca-conceito')));

update contacts c set custom_fields = coalesce(c.custom_fields, '{}'::jsonb) || '{"setor": "serviços de autor"}'::jsonb
where c.brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1)
  and exists (select 1 from contact_tags ct where ct.contact_id = c.id and ct.tag_id = (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('setor:marca-pessoal')));

-- 25. DIA-02 a DIA-04: janela de envio, máximo 2/semana e "respondeu" só depois de começar.
update automations set trigger_config = (trigger_config - 'stopTagIds')
  || jsonb_build_object('stopTagIds', jsonb_build_array((select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('fit:icp-nao')), (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('rgpd:opt-out')), (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('comercial:reuniao-marcada')), (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('comercial:mapa-comprado'))),
     'stopIfTaggedAfterStartIds', jsonb_build_array((select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('sinal:respondeu'))),
     'sendWindow', '{"days": [2, 3, 4], "start": "08:30", "end": "10:00", "tz": "Europe/Lisbon"}'::jsonb, 'maxEmailsPerWeek', 2)
where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and name = 'DIA-02 a DIA-04 — Sequência do diagnóstico';

-- 26. Newsletter: Carta de Posição #1 (campanha em rascunho).
insert into email_campaigns (brand_id, name, subject, body_html, status)
select (select id from brands where booking_slug = 'empowermarketing' limit 1), 'Carta de Posição #1', 'bonita não é o mesmo que escolhida', '<div style="background:#ffffff;padding:32px 16px"><div style="max-width:600px;margin:0 auto;font-family:Georgia,''Times New Roman'',serif;font-size:17px;line-height:1.6;color:#1c1a20"><p style="margin:0 0 32px;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:3px;color:#5a3d7a">EMPOWER MARKETING · CARTA DE POSIÇÃO</p><p style="margin:0 0 18px">{{primeiro_nome|Olá}},</p><p style="margin:0 0 18px">Nas últimas semanas falei com três fundadores de marcas de {{setor|nicho premium}} que me disseram quase a mesma frase: "toda a gente elogia a marca, mas as vendas não acompanham."</p><p style="margin:0 0 18px">É um dos padrões mais comuns nas marcas premium. Investe-se em fotografia, em packaging, numa identidade visual cuidada. A marca fica bonita. E fica, ao mesmo tempo, igual a dezenas de outras marcas igualmente bonitas.</p><p style="margin:0 0 18px">O problema é que a estética só resolve a atenção. Faz alguém parar. Não faz ninguém escolher.</p><p style="margin:0 0 18px">A escolha acontece quando o cliente percebe, sem esforço, porque é que aquela marca é a única que serve o que ele procura. Isso não se desenha. Define-se. É posição.</p><p style="margin:0 0 18px">As marcas que crescem de forma sustentável não são as mais bonitas do mercado. São as que ocupam um espaço que mais ninguém ocupa, e que tornam essa diferença evidente em cada ponto de contacto.</p><p style="margin:0 0 18px"><strong>A estética é a embalagem da posição. Nunca o substituto.</strong></p><p style="margin:0 0 18px"><em>Uma pergunta para a tua marca:</em> se tirasses o logótipo de tudo o que a {{nome_marca|tua marca}} comunica, um cliente saberia que era vossa?</p><p style="margin:0 0 18px">Se a resposta te deixou desconfortável, responde a esta carta. Leio todas.</p><p style="margin:0 0 18px">Beatriz Melo<br><span style="color:#6b6572">Empower Marketing · Estratégia que posiciona. Crescimento que sustenta.</span></p><p style="margin:40px 0 0;padding-top:16px;border-top:1px solid #e6e2ea;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#8a8490">Recebes a Carta de Posição porque te inscreveste ou já falámos sobre a tua marca. Para deixares de receber, responde "sair" ou <a href="mailto:empowermarketing.geral@gmail.com?subject=Sair%20da%20Carta%20de%20Posi%C3%A7%C3%A3o" style="color:#5a3d7a">clica aqui</a>.</p></div></div>', 'draft'
where (select id from brands where booking_slug = 'empowermarketing' limit 1) is not null
  and not exists (select 1 from email_campaigns where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and name = 'Carta de Posição #1');

-- Verificação: automações da Empower, estado e número de passos.
select a.name, a.status, count(s.id) as passos
from automations a
left join automation_steps s on s.automation_id = a.id
where a.brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1)
group by a.name, a.status
order by a.status, a.name;
