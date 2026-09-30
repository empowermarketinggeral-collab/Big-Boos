-- =========================================================
-- EMPOWER MARKETING — Fluxo 6 "Índice de Posição" (DIA-01 a DIA-04)
-- =========================================================
-- Corre isto no SQL Editor do Supabase (tudo de uma vez, Run).
-- SQL simples: pode correr-se mais do que uma vez sem duplicar.
--
-- SEGURANÇA
--  - Todas as automações ficam em 'draft': NADA é enviado até alguém as
--    ativar em Automações.
--  - Idempotente: o que já existe (mesmo nome / mesma tag) não duplica.
--  - Os emails saem pelo email ligado à marca (Resend). Sem email ligado,
--    os envios falham e aparecem como falhados em Automações.
--
-- DE ONDE VÊM OS DADOS
--  O quiz em www.empowermarketing.online/indice-de-posicao cria o contacto
--  pela Entrada de leads com as tags setor:*, fit:*, diagnostico:concluido,
--  diagnostico:perfil-N (e sinal:intencao-alta / newsletter:ativo) e os
--  campos usados nos emails: nome_marca, indice_total, perfil, texto_perfil,
--  bloco_dimensao_fraca_1/2, dimensao_fraca_1, indice_dimensao_fraca_1,
--  explicacao_dimensao_fraca_1.
--
-- FLUXOS
--  1. DIA-01 — Relatório do Índice de Posição
--       gatilho: tag diagnostico:concluido → envia logo o relatório (todos,
--       incluindo fit:icp-nao, que só recebe este email).
--  2. DIA-02 a DIA-04 — Sequência do diagnóstico
--       gatilho: tag diagnostico:concluido. Para de imediato se o contacto
--       tiver fit:icp-nao, e a qualquer momento com rgpd:opt-out,
--       sinal:respondeu, comercial:reuniao-marcada ou comercial:mapa-comprado
--       (prioridade de fluxos do briefing).
--       +2 dias DIA-02 · +5 dias DIA-03 · +9 dias DIA-04 → concluiu:diagnostico.
--  3. Alerta — intenção alta (ICP)
--       gatilho: tag sinal:intencao-alta; só continua se NÃO for icp-talvez
--       nem icp-nao (ou seja, icp-sim) → tarefa para ligar no próprio dia.
--
-- LIMITES DO MOTOR (a saber)
--  - Respostas por email não são detetadas: quando alguém responder, põe à
--    mão a tag sinal:respondeu (para a sequência).
--  - As esperas contam a partir do quiz; a janela ter–qui 08:30–10:00 do
--    briefing não é aplicada.
-- =========================================================

-- 0. Confirma a marca (tem de devolver 1 linha).
select id, name from brands where booking_slug = 'empowermarketing';

-- 1. Tags usadas pelos fluxos (as que já existem ficam como estão).
insert into tags (brand_id, name)
select b.id, t.name
from brands b
cross join (values ('diagnostico:concluido'), ('fit:icp-sim'), ('fit:icp-talvez'), ('fit:icp-nao'), ('sinal:intencao-alta'), ('sinal:respondeu'), ('rgpd:opt-out'), ('comercial:reuniao-marcada'), ('comercial:mapa-comprado'), ('fluxo:diagnostico'), ('concluiu:diagnostico')) as t(name)
where b.booking_slug = 'empowermarketing'
  and not exists (select 1 from tags x where x.brand_id = b.id and lower(x.name) = lower(t.name));

-- 2. DIA-01 — Relatório do Índice de Posição (fica em rascunho)
insert into automations (brand_id, name, trigger_type, trigger_config, status)
select (select id from brands where booking_slug = 'empowermarketing' limit 1), 'DIA-01 — Relatório do Índice de Posição', 'contact_tagged', jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('diagnostico:concluido')), 'stopTagIds', jsonb_build_array((select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('rgpd:opt-out')))), 'draft'
where (select id from brands where booking_slug = 'empowermarketing' limit 1) is not null
  and not exists (select 1 from automations where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and name = 'DIA-01 — Relatório do Índice de Posição');

insert into automation_steps (brand_id, automation_id, position, type, action_type, wait_minutes, config)
select a.brand_id, a.id, s.position, s.type, s.action_type, s.wait_minutes, s.config
from automations a
cross join (values
  (1, 'action', 'send_email', null::int, jsonb_build_object('subject', 'o Índice de Posição da {{nome_marca}}: {{indice_total}}/100', 'body', '<p>{{primeiro_nome}},</p>
<p>Aqui está o Índice de Posição da {{nome_marca}}: {{indice_total}}/100.<br>Perfil: {{perfil}}.</p>
<p>{{texto_perfil}}</p>
<p><strong>AS TUAS 3 PRIORIDADES PARA OS PRÓXIMOS 90 DIAS</strong></p>
<p>1. {{bloco_dimensao_fraca_1}}</p>
<p>2. {{bloco_dimensao_fraca_2}}</p>
<p>3. Decidir antes de executar. Qualquer destas prioridades funciona melhor quando parte de um diagnóstico completo do mercado e da marca, e não de ações isoladas.</p>
<p>Uma nota: 15 perguntas dão-te uma fotografia, não um diagnóstico. Se quiseres perceber o que está por trás do teu índice, responde a este email e digo-te o que eu olharia primeiro na tua marca.</p>
<p>Beatriz Melo</p>'))
) as s(position, type, action_type, wait_minutes, config)
where a.brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and a.name = 'DIA-01 — Relatório do Índice de Posição'
  and not exists (select 1 from automation_steps x where x.automation_id = a.id);

-- 3. DIA-02 a DIA-04 — Sequência do diagnóstico (fica em rascunho)
insert into automations (brand_id, name, trigger_type, trigger_config, status)
select (select id from brands where booking_slug = 'empowermarketing' limit 1), 'DIA-02 a DIA-04 — Sequência do diagnóstico', 'contact_tagged', jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('diagnostico:concluido')), 'stopTagIds', jsonb_build_array((select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('fit:icp-nao')), (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('rgpd:opt-out')), (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('sinal:respondeu')), (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('comercial:reuniao-marcada')), (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('comercial:mapa-comprado')))), 'draft'
where (select id from brands where booking_slug = 'empowermarketing' limit 1) is not null
  and not exists (select 1 from automations where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and name = 'DIA-02 a DIA-04 — Sequência do diagnóstico');

insert into automation_steps (brand_id, automation_id, position, type, action_type, wait_minutes, config)
select a.brand_id, a.id, s.position, s.type, s.action_type, s.wait_minutes, s.config
from automations a
cross join (values
  (1, 'action', 'add_tag', null::int, jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('fluxo:diagnostico')))),
  (2, 'wait', null, 2880::int, '{}'::jsonb),
  (3, 'action', 'send_email', null::int, jsonb_build_object('subject', 'o que está por trás do teu resultado em {{dimensao_fraca_1}}', 'body', '<p>{{primeiro_nome}},</p>
<p>No teu Índice de Posição, a dimensão com pontuação mais baixa foi {{dimensao_fraca_1}}: {{indice_dimensao_fraca_1}}/100.</p>
<p>{{explicacao_dimensao_fraca_1}}</p>
<p>O que quase nunca funciona é atacar este ponto com mais execução. Mais conteúdo, mais campanhas, mais canais: tudo isso amplifica o problema em vez de o resolver.</p>
<p>Conseguiste fazer o exercício que te deixei no relatório? Se sim, diz-me o que descobriste.</p>
<p>Beatriz Melo</p>')),
  (4, 'wait', null, 4320::int, '{}'::jsonb),
  (5, 'action', 'send_email', null::int, jsonb_build_object('subject', 'uma marca com o mesmo perfil que a tua', 'body', '<p>{{primeiro_nome}},</p>
<p>Quando uma marca aparece como "{{perfil}}" no Índice de Posição, lembro-me sempre de um caso.</p>
<p>A Dreams Academy, uma academia de formação para profissionais de estética, tinha o conhecimento e a qualidade, mas uma imagem igual à de tantas outras escolas de cursos. A fundadora tinha de justificar o preço em cada venda.</p>
<p>Não começámos pelo logótipo. Começámos pela posição: deixou de ser "uma escola de cursos" para ser uma academia premium de formação, com um inimigo claro, os cursos superficiais. Só depois veio a identidade. A partir daí, a marca passou a fazer a pré-venda: a fundadora deixou de ter de explicar porque é mais cara e lançou produtos de maior valor com menos resistência à compra.</p>
<p>O ponto de partida era muito parecido com o da {{nome_marca}}. O que mudou foi a ordem das decisões: primeiro a posição, depois tudo o resto.</p>
<p>Beatriz Melo</p>')),
  (6, 'wait', null, 5760::int, '{}'::jsonb),
  (7, 'action', 'send_email', null::int, jsonb_build_object('subject', 'do índice ao mapa', 'body', '<p>{{primeiro_nome}},</p>
<p>O Índice de Posição foram 15 perguntas. Deu-te uma fotografia de onde a {{nome_marca}} está.</p>
<p>O Mapa de Crescimento é o diagnóstico completo: 2 a 3 semanas a analisar a tua marca, o teu mercado e os teus concorrentes, para chegar a três respostas:</p>
<p>— que espaço a {{nome_marca}} pode ocupar que mais ninguém ocupa<br>— o que está realmente a travar o crescimento<br>— o que fazer nos próximos 6 meses, e por que ordem</p>
<p>Fica contigo, quer avances connosco para execução quer não.</p>
<p>Se o teu índice te deixou com perguntas, é aqui que elas têm resposta: <a href="https://www.empowermarketing.online/mapadecrescimento">www.empowermarketing.online/mapadecrescimento</a></p>
<p>Beatriz Melo</p>')),
  (8, 'action', 'remove_tag', null::int, jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('fluxo:diagnostico')))),
  (9, 'action', 'add_tag', null::int, jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('concluiu:diagnostico'))))
) as s(position, type, action_type, wait_minutes, config)
where a.brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and a.name = 'DIA-02 a DIA-04 — Sequência do diagnóstico'
  and not exists (select 1 from automation_steps x where x.automation_id = a.id);

-- 4. Alerta — intenção alta (ICP) (fica em rascunho)
insert into automations (brand_id, name, trigger_type, trigger_config, status)
select (select id from brands where booking_slug = 'empowermarketing' limit 1), 'Alerta — intenção alta (ICP)', 'contact_tagged', jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('sinal:intencao-alta')), 'stopTagIds', jsonb_build_array((select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('fit:icp-talvez')), (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('fit:icp-nao')))), 'draft'
where (select id from brands where booking_slug = 'empowermarketing' limit 1) is not null
  and not exists (select 1 from automations where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and name = 'Alerta — intenção alta (ICP)');

insert into automation_steps (brand_id, automation_id, position, type, action_type, wait_minutes, config)
select a.brand_id, a.id, s.position, s.type, s.action_type, s.wait_minutes, s.config
from automations a
cross join (values
  (1, 'action', 'create_task', null::int, jsonb_build_object('title', 'Índice de Posição: lead ICP com intenção alta (quer começar este trimestre). Ligar ou enviar mensagem pessoal hoje.', 'dueInMinutes', 1440))
) as s(position, type, action_type, wait_minutes, config)
where a.brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and a.name = 'Alerta — intenção alta (ICP)'
  and not exists (select 1 from automation_steps x where x.automation_id = a.id);

-- Verificação: 3 linhas, todas em 'draft' (passos: 1, 9 e 1).
select a.name, a.trigger_type, a.status, count(s.id) as passos
from automations a
left join automation_steps s on s.automation_id = a.id
where a.brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1)
  and a.name in ('DIA-01 — Relatório do Índice de Posição', 'DIA-02 a DIA-04 — Sequência do diagnóstico', 'Alerta — intenção alta (ICP)')
group by a.name, a.trigger_type, a.status
order by a.name;
