-- =========================================================
-- EMPOWER MARKETING — guia "Da Estética à Posição"
-- =========================================================
-- Corre no SQL Editor do Supabase depois do 79. Pode correr-se mais do
-- que uma vez sem duplicar.
--  1. Tag guia:pedido (aplicada pela landing do guia no site).
--  2. GUIA-01: email de entrega do guia, logo a seguir ao pedido (rascunho).
--  3. DIA-01: passa a incluir o link do guia, como o briefing pede.
-- =========================================================

insert into tags (brand_id, name)
select (select id from brands where booking_slug = 'empowermarketing' limit 1), 'guia:pedido'
where (select id from brands where booking_slug = 'empowermarketing' limit 1) is not null
  and not exists (select 1 from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = 'guia:pedido');

insert into automations (brand_id, name, trigger_type, trigger_config, status)
select (select id from brands where booking_slug = 'empowermarketing' limit 1), 'GUIA-01 — Entrega do guia "Da Estética à Posição"', 'contact_tagged',
  jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('guia:pedido')), 'stopTagIds', jsonb_build_array((select id from tags where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and lower(name) = lower('rgpd:opt-out')))), 'draft'
where (select id from brands where booking_slug = 'empowermarketing' limit 1) is not null
  and not exists (select 1 from automations where brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and name = 'GUIA-01 — Entrega do guia "Da Estética à Posição"');

insert into automation_steps (brand_id, automation_id, position, type, action_type, config)
select a.brand_id, a.id, 1, 'action', 'send_email', '{"subject": "o guia que pediste", "body": "{{primeiro_nome}},\n\nAqui está o guia \"Da Estética à Posição\": https://www.empowermarketing.online/guia/da-estetica-a-posicao.pdf\n\nSão 21 páginas, cinco movimentos e um exercício por capítulo. Não precisas de o ler de uma vez. Se tiveres pouco tempo, começa pela introdução: explica porque é que a ordem dos movimentos importa.\n\nE se quiseres saber por qual movimento começar na {{nome_marca|tua marca}}, o Índice de Posição diz-te em 4 minutos quais são as tuas duas dimensões mais fracas: https://www.empowermarketing.online/indice-de-posicao\n\nBeatriz Melo\nEmpower Marketing", "preheader": "Os 5 movimentos das marcas premium que crescem de forma sustentável.", "sendNow": true}'::jsonb
from automations a
where a.brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and a.name = 'GUIA-01 — Entrega do guia "Da Estética à Posição"'
  and not exists (select 1 from automation_steps x where x.automation_id = a.id);

update automation_steps s
set config = jsonb_set(s.config, '{body}', to_jsonb(replace(s.config->>'body', '<p>Uma nota:', '<p>Como prometido, o guia "Da Estética à Posição" está aqui: <a href="https://www.empowermarketing.online/guia/da-estetica-a-posicao.pdf">https://www.empowermarketing.online/guia/da-estetica-a-posicao.pdf</a></p>
<p>Uma nota:')))
from automations a
where a.id = s.automation_id and a.brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1)
  and a.name = 'DIA-01 — Relatório do Índice de Posição'
  and s.action_type = 'send_email'
  and s.config->>'body' not like '%da-estetica-a-posicao%';

-- Verificação: as duas linhas devem dizer "sim".
select a.name, case when s.config->>'body' like '%da-estetica-a-posicao%' then 'sim' else 'não' end as tem_link_do_guia
from automations a join automation_steps s on s.automation_id = a.id
where a.brand_id = (select id from brands where booking_slug = 'empowermarketing' limit 1) and a.name in ('GUIA-01 — Entrega do guia "Da Estética à Posição"', 'DIA-01 — Relatório do Índice de Posição');
