-- =========================================================
-- DREAMS ACADEMY — CRM e email marketing (plano de 30/09/2026)
-- =========================================================
-- Corre isto no SQL Editor do Supabase DEPOIS do 86 e depois de
-- publicares as funções automations-run, email-send, email-click e
-- hotmart-webhook. SQL simples: pode correr-se mais do que uma vez.
-- Gerado por script (sem blocos com cifrão).
--
-- O QUE CRIA (marca com nome parecido com "Dreams Academy"):
--  - Produtos e links (CRM → Hotmart): falta pôr o ID Hotmart e o link de
--    compra de cada produto, e o link da checklist, do Programa e da
--    candidatura nas linhas sem venda.
--  - Tags das 5 famílias (origem:, lm:, comprou:/carrinho:/reembolso:,
--    int:, ciclo:) e as de regras, com pontos (pontuação 0-100) e os
--    patamares 30, 60 e 80. "Frias" ao fim de 60 dias sem interagir.
--  - Pipeline "Programa Dreams Academy" (Interessada → Inscrita, com
--    Lista de espera, Perdida e Não qualificada).
--  - Regras (ATIVAS, não enviam emails): cenário e trilho por clique,
--    entrada na sequência do Programa, avisos e tarefas para a Beatriz
--    (60+ e 80+), pipeline.
--  - Fluxos F1 a F12 com emails, em RASCUNHO (nada é enviado até os
--    ativares em Automações). Emails de marketing só seguem para quem
--    deu consentimento de email.
--  - Campanhas em rascunho: newsletter "Referência #1", C1 (Ondas, 8) e
--    C2 (abertura do Programa, 9). Têm [AJUSTAR] onde faltam dados.
--
-- ANTES DE ATIVAR: os passos com [AJUSTAR] não saem (o motor bloqueia)
-- até editares o texto: F9 (acessos, calendário, questionário) e F10
-- (questionário, bónus de indicação).
-- =========================================================

-- 0. Confirma a marca (tem de devolver 1 linha).
select id, name from brands where name ilike 'dream%academy%';

-- 1. Produtos e links (os que já existem ficam como estão).
insert into hotmart_products (brand_id, slug, name, track, price, next_offer_slug, active)
select (select id from brands where name ilike 'dream%academy%' order by created_at limit 1), p.slug, p.name, p.track, p.price, p.next_offer, p.active
from (values
  ('checklist-7-erros', 'Checklist 7 Erros Invisíveis', 'tecnica', 0, null, false),
  ('checklist-bio-magnetica', 'Checklist de Bio Magnética', 'marketing', 0, null, false),
  ('anti-erros', 'Guia Anti-Erros', 'tecnica', 27, 'ondas', true),
  ('invisivel', 'Do Invisível ao Inesquecível', 'marketing', 27, 'click', true),
  ('click', 'Do Click ao Compromisso', 'marketing', 37, 'fluxo', true),
  ('fluxo', 'Masterclass Fluxo Estratégico', 'marketing', 47, 'programa', true),
  ('ondas', 'Masterclass Ondas que Fidelizam', 'tecnica', 57, 'invisivel', true),
  ('programa', 'Programa Dreams Academy', 'ambos', null::numeric, null, true),
  ('candidatura', 'Candidatura ao Programa', 'ambos', null::numeric, null, false)
) as p(slug, name, track, price, next_offer, active)
where (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) is not null
  and not exists (select 1 from hotmart_products x where x.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and x.slug = p.slug);

-- 2. Tags.
insert into tags (brand_id, name)
select (select id from brands where name ilike 'dream%academy%' order by created_at limit 1), t.name
from (values
  ('origem:ig-organico'),
  ('origem:meta-ads'),
  ('origem:site-home'),
  ('origem:indicacao'),
  ('origem:workshop'),
  ('origem:dreams-studio'),
  ('lm:checklist-7-erros'),
  ('lm:checklist-bio-magnetica'),
  ('lm:newsletter'),
  ('lm:candidatura-programa'),
  ('lm:espera-coloracao'),
  ('lm:espera-corte'),
  ('lm:espera-formacao-completa'),
  ('comprou:anti-erros'),
  ('carrinho:anti-erros'),
  ('reembolso:anti-erros'),
  ('int:clicou-anti-erros'),
  ('comprou:invisivel'),
  ('carrinho:invisivel'),
  ('reembolso:invisivel'),
  ('int:clicou-invisivel'),
  ('comprou:click'),
  ('carrinho:click'),
  ('reembolso:click'),
  ('int:clicou-click'),
  ('comprou:fluxo'),
  ('carrinho:fluxo'),
  ('reembolso:fluxo'),
  ('int:clicou-fluxo'),
  ('comprou:ondas'),
  ('carrinho:ondas'),
  ('reembolso:ondas'),
  ('int:clicou-ondas'),
  ('comprou:dois-trilhos'),
  ('evento:compra'),
  ('evento:carrinho'),
  ('evento:reembolso'),
  ('ciclo:compradora-1'),
  ('ciclo:compradora-2'),
  ('ciclo:candidata'),
  ('ciclo:aluna'),
  ('ciclo:top'),
  ('cenario:a'),
  ('cenario:b'),
  ('cenario:ambos'),
  ('situacao:autonoma-ou-salao'),
  ('indicacao:alumni'),
  ('int:viu-programa'),
  ('int:abriu-candidatura'),
  ('int:clicou-oferta'),
  ('int:respondeu'),
  ('int:quer-conversar'),
  ('int:agora-nao'),
  ('int:tem-duvida'),
  ('int:quero-continuar'),
  ('score:30'),
  ('score:60'),
  ('score:80'),
  ('fluxo:programa'),
  ('fluxo:cross-marketing'),
  ('fluxo:cross-tecnica'),
  ('programa:conversa-marcada'),
  ('programa:inscrita'),
  ('programa:concluiu'),
  ('programa:lista-espera'),
  ('pausa:ofertas'),
  ('estado:fria'),
  ('estado:inativa'),
  ('rgpd:opt-out')
) as t(name)
where (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) is not null
  and not exists (select 1 from tags x where x.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(x.name) = lower(t.name));

-- 3. Pontuação: pontos por tag (aberturas de email: +1 até 10, pela função
--    email-click; 30 dias sem interagir: -10, uma vez por dia).
insert into lead_score_rules (brand_id, tag_id, points, reset)
select (select id from brands where name ilike 'dream%academy%' order by created_at limit 1), x.id, r.points, false
from (values
  ('lm:newsletter', 5),
  ('lm:checklist-7-erros', 5),
  ('lm:checklist-bio-magnetica', 5),
  ('cenario:a', 10),
  ('cenario:b', 10),
  ('cenario:ambos', 10),
  ('situacao:autonoma-ou-salao', 10),
  ('int:clicou-anti-erros', 5),
  ('int:clicou-invisivel', 5),
  ('int:clicou-click', 5),
  ('int:clicou-fluxo', 5),
  ('int:clicou-ondas', 5),
  ('int:clicou-oferta', 5),
  ('comprou:anti-erros', 20),
  ('comprou:invisivel', 20),
  ('comprou:click', 25),
  ('comprou:fluxo', 25),
  ('comprou:ondas', 25),
  ('comprou:dois-trilhos', 15),
  ('int:viu-programa', 20),
  ('int:abriu-candidatura', 20),
  ('int:respondeu', 20),
  ('int:quer-conversar', 20),
  ('indicacao:alumni', 20),
  ('reembolso:anti-erros', -20),
  ('reembolso:invisivel', -20),
  ('reembolso:click', -20),
  ('reembolso:fluxo', -20),
  ('reembolso:ondas', -20)
) as r(name, points)
join tags x on x.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(x.name) = lower(r.name)
on conflict (tag_id) do nothing;

insert into lead_score_rules (brand_id, tag_id, points, reset)
select (select id from brands where name ilike 'dream%academy%' order by created_at limit 1), (select id from tags where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(name) = lower('rgpd:opt-out')), 0, true
where (select id from tags where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(name) = lower('rgpd:opt-out')) is not null
on conflict (tag_id) do nothing;

insert into lead_score_levels (brand_id, min_score, tag_id)
select (select id from brands where name ilike 'dream%academy%' order by created_at limit 1), l.min_score, x.id
from (values (30, 'score:30'), (60, 'score:60'), (80, 'score:80')) as l(min_score, name)
join tags x on x.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(x.name) = lower(l.name)
on conflict (brand_id, min_score) do nothing;

insert into brand_crm_settings (brand_id, cold_after_days, cold_tag_id)
select (select id from brands where name ilike 'dream%academy%' order by created_at limit 1), 60, (select id from tags where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(name) = lower('estado:fria'))
where (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) is not null
on conflict (brand_id) do nothing;

-- 4. Pipeline "Programa Dreams Academy".
insert into pipelines (brand_id, name, is_default)
select (select id from brands where name ilike 'dream%academy%' order by created_at limit 1), 'Programa Dreams Academy', false
where (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) is not null
  and not exists (select 1 from pipelines where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and name = 'Programa Dreams Academy');

insert into pipeline_stages (brand_id, pipeline_id, name, position, is_won, is_lost)
select (select id from brands where name ilike 'dream%academy%' order by created_at limit 1), (select id from pipelines where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and name = 'Programa Dreams Academy' limit 1), s.name, s.position, s.is_won, s.is_lost
from (values
  ('Interessada', 0, false, false),
  ('Candidatura recebida', 1, false, false),
  ('Conversa marcada', 2, false, false),
  ('Proposta enviada', 3, false, false),
  ('Inscrita', 4, true, false),
  ('Lista de espera', 5, false, false),
  ('Perdida', 6, false, true),
  ('Não qualificada', 7, false, true)
) as s(name, position, is_won, is_lost)
where (select id from pipelines where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and name = 'Programa Dreams Academy' limit 1) is not null
  and not exists (select 1 from pipeline_stages x where x.pipeline_id = (select id from pipelines where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and name = 'Programa Dreams Academy' limit 1) and x.name = s.name);

-- 5. Automações (regras ativas; fluxos com emails em rascunho).
-- DA Regra — Cenário A
insert into automations (brand_id, name, trigger_type, trigger_config, status)
select (select id from brands where name ilike 'dream%academy%' order by created_at limit 1), 'DA Regra — Cenário A', 'contact_tagged', jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(name) = lower('cenario:a'))), 'active'
where (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) is not null
  and not exists (select 1 from automations where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and name = 'DA Regra — Cenário A');
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 1, 'action', 'update_contact', '{"fields":{"cenario":"A"}}'::jsonb, null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA Regra — Cenário A'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 1);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 2, 'action', 'update_contact', '{"fields":{"trilho":"Técnica"},"onlyIf":{"field":"trilho","empty":true}}'::jsonb, null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA Regra — Cenário A'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 2);

-- DA Regra — Cenário B
insert into automations (brand_id, name, trigger_type, trigger_config, status)
select (select id from brands where name ilike 'dream%academy%' order by created_at limit 1), 'DA Regra — Cenário B', 'contact_tagged', jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(name) = lower('cenario:b'))), 'active'
where (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) is not null
  and not exists (select 1 from automations where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and name = 'DA Regra — Cenário B');
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 1, 'action', 'update_contact', '{"fields":{"cenario":"B"}}'::jsonb, null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA Regra — Cenário B'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 1);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 2, 'action', 'update_contact', '{"fields":{"trilho":"Marketing & Negócio"},"onlyIf":{"field":"trilho","empty":true}}'::jsonb, null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA Regra — Cenário B'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 2);

-- DA Regra — Ambos os trilhos
insert into automations (brand_id, name, trigger_type, trigger_config, status)
select (select id from brands where name ilike 'dream%academy%' order by created_at limit 1), 'DA Regra — Ambos os trilhos', 'contact_tagged', jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(name) = lower('cenario:ambos'))), 'active'
where (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) is not null
  and not exists (select 1 from automations where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and name = 'DA Regra — Ambos os trilhos');
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 1, 'action', 'update_contact', '{"fields":{"trilho":"Ambos"}}'::jsonb, null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA Regra — Ambos os trilhos'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 1);

-- DA Regra — Entra na sequência do Programa (pontuação 30+)
insert into automations (brand_id, name, trigger_type, trigger_config, status)
select (select id from brands where name ilike 'dream%academy%' order by created_at limit 1), 'DA Regra — Entra na sequência do Programa (pontuação 30+)', 'contact_tagged', jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(name) = lower('score:30'))), 'active'
where (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) is not null
  and not exists (select 1 from automations where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and name = 'DA Regra — Entra na sequência do Programa (pontuação 30+)');
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 1, 'action', 'add_tag', '{}'::jsonb || jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(name) = lower('fluxo:programa'))), null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA Regra — Entra na sequência do Programa (pontuação 30+)'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 1);

-- DA Regra — Entra na sequência do Programa (2 ou mais compras)
insert into automations (brand_id, name, trigger_type, trigger_config, status)
select (select id from brands where name ilike 'dream%academy%' order by created_at limit 1), 'DA Regra — Entra na sequência do Programa (2 ou mais compras)', 'contact_tagged', jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(name) = lower('ciclo:compradora-2'))), 'active'
where (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) is not null
  and not exists (select 1 from automations where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and name = 'DA Regra — Entra na sequência do Programa (2 ou mais compras)');
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 1, 'action', 'add_tag', '{}'::jsonb || jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(name) = lower('fluxo:programa'))), null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA Regra — Entra na sequência do Programa (2 ou mais compras)'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 1);

-- DA Regra — Entra na sequência do Programa (viu o Programa)
insert into automations (brand_id, name, trigger_type, trigger_config, status)
select (select id from brands where name ilike 'dream%academy%' order by created_at limit 1), 'DA Regra — Entra na sequência do Programa (viu o Programa)', 'contact_tagged', jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(name) = lower('int:viu-programa'))), 'active'
where (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) is not null
  and not exists (select 1 from automations where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and name = 'DA Regra — Entra na sequência do Programa (viu o Programa)');
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 1, 'action', 'add_tag', '{}'::jsonb || jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(name) = lower('fluxo:programa'))), null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA Regra — Entra na sequência do Programa (viu o Programa)'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 1);

-- DA Regra — Interessada no Programa (pipeline)
insert into automations (brand_id, name, trigger_type, trigger_config, status)
select (select id from brands where name ilike 'dream%academy%' order by created_at limit 1), 'DA Regra — Interessada no Programa (pipeline)', 'contact_tagged', jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(name) = lower('int:viu-programa'))), 'active'
where (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) is not null
  and not exists (select 1 from automations where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and name = 'DA Regra — Interessada no Programa (pipeline)');
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 1, 'action', 'create_deal', '{"title":"{{nome}} — Programa"}'::jsonb || jsonb_build_object('pipelineId', (select id from pipelines where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and name = 'Programa Dreams Academy' limit 1), 'stageId', (select id from pipeline_stages where pipeline_id = (select id from pipelines where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and name = 'Programa Dreams Academy' limit 1) and name = 'Interessada' limit 1)), null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA Regra — Interessada no Programa (pipeline)'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 1);

-- DA Regra — Quente 60+ (WhatsApp da Beatriz em 1h)
insert into automations (brand_id, name, trigger_type, trigger_config, status)
select (select id from brands where name ilike 'dream%academy%' order by created_at limit 1), 'DA Regra — Quente 60+ (WhatsApp da Beatriz em 1h)', 'contact_tagged', jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(name) = lower('score:60'))), 'active'
where (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) is not null
  and not exists (select 1 from automations where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and name = 'DA Regra — Quente 60+ (WhatsApp da Beatriz em 1h)');
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 1, 'action', 'notify_team', '{"message":"{{nome}} chegou a {{pontuacao}} pontos. WhatsApp pessoal da Beatriz em menos de 1 hora (conversa, não venda)."}'::jsonb, null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA Regra — Quente 60+ (WhatsApp da Beatriz em 1h)'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 1);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 2, 'action', 'create_task', '{"title":"WhatsApp a {{nome}} ({{telefone|sem telefone}}): \"Vi que já tens o {{ultimo_produto_nome|nosso conteúdo}}. Como está a correr a aplicação?\" Perguntar o preço atual e o objetivo a 90 dias antes de falar do Programa.","dueInMinutes":60}'::jsonb, null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA Regra — Quente 60+ (WhatsApp da Beatriz em 1h)'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 2);

-- DA Regra — Muito quente 80+ (propor conversa)
insert into automations (brand_id, name, trigger_type, trigger_config, status)
select (select id from brands where name ilike 'dream%academy%' order by created_at limit 1), 'DA Regra — Muito quente 80+ (propor conversa)', 'contact_tagged', jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(name) = lower('score:80'))), 'active'
where (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) is not null
  and not exists (select 1 from automations where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and name = 'DA Regra — Muito quente 80+ (propor conversa)');
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 1, 'action', 'notify_team', '{"message":"{{nome}} chegou a {{pontuacao}} pontos. Propor conversa com 2 horários concretos em menos de 1 hora."}'::jsonb, null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA Regra — Muito quente 80+ (propor conversa)'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 1);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 2, 'action', 'create_task', '{"title":"Propor a {{nome}} uma conversa de 20 minutos com 2 horários concretos (WhatsApp {{telefone|sem telefone}}).","dueInMinutes":60}'::jsonb, null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA Regra — Muito quente 80+ (propor conversa)'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 2);

-- DA Regra — Pipeline: Conversa marcada
insert into automations (brand_id, name, trigger_type, trigger_config, status)
select (select id from brands where name ilike 'dream%academy%' order by created_at limit 1), 'DA Regra — Pipeline: Conversa marcada', 'deal_stage_changed', jsonb_build_object('stageId', (select id from pipeline_stages where pipeline_id = (select id from pipelines where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and name = 'Programa Dreams Academy' limit 1) and name = 'Conversa marcada' limit 1)), 'active'
where (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) is not null
  and not exists (select 1 from automations where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and name = 'DA Regra — Pipeline: Conversa marcada');
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 1, 'action', 'add_tag', '{}'::jsonb || jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(name) = lower('programa:conversa-marcada'))), null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA Regra — Pipeline: Conversa marcada'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 1);

-- DA Regra — Pipeline: Inscrita
insert into automations (brand_id, name, trigger_type, trigger_config, status)
select (select id from brands where name ilike 'dream%academy%' order by created_at limit 1), 'DA Regra — Pipeline: Inscrita', 'deal_stage_changed', jsonb_build_object('stageId', (select id from pipeline_stages where pipeline_id = (select id from pipelines where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and name = 'Programa Dreams Academy' limit 1) and name = 'Inscrita' limit 1)), 'active'
where (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) is not null
  and not exists (select 1 from automations where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and name = 'DA Regra — Pipeline: Inscrita');
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 1, 'action', 'add_tag', '{}'::jsonb || jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(name) = lower('programa:inscrita'))), null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA Regra — Pipeline: Inscrita'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 1);

-- DA Regra — Pipeline: Lista de espera
insert into automations (brand_id, name, trigger_type, trigger_config, status)
select (select id from brands where name ilike 'dream%academy%' order by created_at limit 1), 'DA Regra — Pipeline: Lista de espera', 'deal_stage_changed', jsonb_build_object('stageId', (select id from pipeline_stages where pipeline_id = (select id from pipelines where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and name = 'Programa Dreams Academy' limit 1) and name = 'Lista de espera' limit 1)), 'active'
where (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) is not null
  and not exists (select 1 from automations where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and name = 'DA Regra — Pipeline: Lista de espera');
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 1, 'action', 'add_tag', '{}'::jsonb || jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(name) = lower('programa:lista-espera'))), null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA Regra — Pipeline: Lista de espera'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 1);

-- DA Regra — Quer conversar (clique)
insert into automations (brand_id, name, trigger_type, trigger_config, status)
select (select id from brands where name ilike 'dream%academy%' order by created_at limit 1), 'DA Regra — Quer conversar (clique)', 'contact_tagged', jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(name) = lower('int:quer-conversar'))), 'active'
where (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) is not null
  and not exists (select 1 from automations where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and name = 'DA Regra — Quer conversar (clique)');
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 1, 'action', 'notify_team', '{"message":"{{nome}} quer conversar sobre o Programa. Propor 2 horários em menos de 1 hora."}'::jsonb, null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA Regra — Quer conversar (clique)'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 1);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 2, 'action', 'create_task', '{"title":"{{nome}} clicou \"sim, quero conversar\". Propor 2 horários por WhatsApp ({{telefone|sem telefone}}).","dueInMinutes":60}'::jsonb, null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA Regra — Quer conversar (clique)'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 2);

-- DA Regra — Tem uma dúvida (clique)
insert into automations (brand_id, name, trigger_type, trigger_config, status)
select (select id from brands where name ilike 'dream%academy%' order by created_at limit 1), 'DA Regra — Tem uma dúvida (clique)', 'contact_tagged', jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(name) = lower('int:tem-duvida'))), 'active'
where (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) is not null
  and not exists (select 1 from automations where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and name = 'DA Regra — Tem uma dúvida (clique)');
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 1, 'action', 'notify_team', '{"message":"{{nome}} tem uma dúvida sobre o Programa."}'::jsonb, null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA Regra — Tem uma dúvida (clique)'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 1);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 2, 'action', 'create_task', '{"title":"Responder à dúvida de {{nome}} sobre o Programa (WhatsApp {{telefone|sem telefone}} ou email {{email|}}).","dueInMinutes":120}'::jsonb, null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA Regra — Tem uma dúvida (clique)'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 2);

-- DA Regra — Agora não (clique)
insert into automations (brand_id, name, trigger_type, trigger_config, status)
select (select id from brands where name ilike 'dream%academy%' order by created_at limit 1), 'DA Regra — Agora não (clique)', 'contact_tagged', jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(name) = lower('int:agora-nao'))), 'active'
where (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) is not null
  and not exists (select 1 from automations where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and name = 'DA Regra — Agora não (clique)');
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 1, 'action', 'update_contact', '{"fields":{"motivo_perda":"Timing"}}'::jsonb, null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA Regra — Agora não (clique)'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 1);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 2, 'action', 'create_task', '{"title":"{{nome}} disse \"agora não\" ao Programa. Passar o negócio para Perdida (motivo Timing) ou Lista de espera.","dueInMinutes":1440}'::jsonb, null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA Regra — Agora não (clique)'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 2);

-- DA Regra — Respondeu a um email
insert into automations (brand_id, name, trigger_type, trigger_config, status)
select (select id from brands where name ilike 'dream%academy%' order by created_at limit 1), 'DA Regra — Respondeu a um email', 'contact_tagged', jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(name) = lower('int:respondeu'))), 'active'
where (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) is not null
  and not exists (select 1 from automations where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and name = 'DA Regra — Respondeu a um email');
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 1, 'action', 'create_task', '{"title":"{{nome}} respondeu a um email. Ver a resposta e, se servir, pedir autorização para usar como testemunho.","dueInMinutes":240}'::jsonb, null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA Regra — Respondeu a um email'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 1);

-- DA F1 — Checklist 7 Erros → Guia Anti-Erros
insert into automations (brand_id, name, trigger_type, trigger_config, status)
select (select id from brands where name ilike 'dream%academy%' order by created_at limit 1), 'DA F1 — Checklist 7 Erros → Guia Anti-Erros', 'contact_tagged', jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(name) = lower('lm:checklist-7-erros')), 'stopTagIds', jsonb_build_array((select id from tags where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(name) = lower('rgpd:opt-out')), (select id from tags where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(name) = lower('estado:inativa')), (select id from tags where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(name) = lower('comprou:anti-erros')))) || '{"singleRun":true,"sendWindow":{"days":[1,2,3,4,5,6,7],"start":"09:00","end":"21:00","tz":"Europe/Lisbon"}}'::jsonb, 'draft'
where (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) is not null
  and not exists (select 1 from automations where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and name = 'DA F1 — Checklist 7 Erros → Guia Anti-Erros');
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 1, 'action', 'update_contact', '{"fields":{"ciclo_vida":"Subscritora"},"onlyIf":{"field":"ciclo_vida","empty":true}}'::jsonb, null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F1 — Checklist 7 Erros → Guia Anti-Erros'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 1);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 2, 'action', 'update_contact', '{"fields":{"trilho":"Técnica"},"onlyIf":{"field":"trilho","empty":true}}'::jsonb, null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F1 — Checklist 7 Erros → Guia Anti-Erros'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 2);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 3, 'action', 'send_email', '{"subject":"A tua checklist está aqui","preheader":"Os 7 erros que a cliente não vê, até não voltar.","body":"{{primeiro_nome|Olá}},\n\nAqui está a tua checklist \"7 Erros Invisíveis\":\n\n[Descarregar a checklist]({{clique:|link_checklist_7_erros}})\n\nSou a Patrícia. Trabalho com cabelo há mais de 30 anos e já formei mais de 500 profissionais. Se há uma coisa que aprendi, é esta: o erro mais caro não é o que se vê no espelho no fim do serviço. É o que se vê três semanas depois, quando a cliente não marca outra vez.\n\nLê a checklist com calma e marca os erros que reconheces no teu dia a dia. Amanhã escrevo-te com uma pergunta.\n\nPatrícia\nDreams Academy® — Formamos talento. Construímos referências.\n\nNão queres receber mais emails? [Anular subscrição]({{anular_subscricao}})","sendNow":true,"button":{"bg":"#B89A57","ink":"#05204C"}}'::jsonb, null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F1 — Checklist 7 Erros → Guia Anti-Erros'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 3);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 4, 'wait', null, '{}'::jsonb, 1440
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F1 — Checklist 7 Erros → Guia Anti-Erros'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 4);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 5, 'action', 'send_email', '{"subject":"Qual destes erros já te custou uma cliente?","preheader":"Um clique e passo a escrever-te sobre o que te falta.","body":"{{primeiro_nome|Olá}},\n\nUma pergunta rápida. Quando um serviço não corre como querias, o que pesa mais?\n\n[Falta-me segurança técnica]({{clique:cenario:a}})\n\n[A técnica está, falta-me vender]({{clique:cenario:b}})\n\nUm clique chega. A partir daqui escrevo-te sobre o que te faz falta a ti, e não sobre tudo ao mesmo tempo.\n\nPatrícia\nDreams Academy® — Formamos talento. Construímos referências.\n\nNão queres receber mais emails? [Anular subscrição]({{anular_subscricao}})","requireConsent":true}'::jsonb, null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F1 — Checklist 7 Erros → Guia Anti-Erros'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 5);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 6, 'wait', null, '{}'::jsonb, 1440
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F1 — Checklist 7 Erros → Guia Anti-Erros'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 6);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 7, 'action', 'send_email', '{"subject":"O diagnóstico que separa profissionais","preheader":"Antes da cor, há uma pergunta que quase ninguém faz.","body":"{{primeiro_nome|Olá}},\n\nHá um erro da checklist que vejo repetir-se mais do que todos: começar o serviço sem um diagnóstico a sério.\n\nOlhar para o cabelo não é diagnosticar. Diagnosticar é saber o que esse cabelo já viveu: colorações anteriores, descolorações, alisamentos, produtos em casa, medicação. É testar antes de prometer.\n\nQuando se salta este passo, o custo não fica no serviço. Fica na cliente que perdes, no serviço que tens de refazer de graça e na confiança que não volta.\n\nA profissional executora faz o que a cliente pede. A profissional de referência sabe dizer o que é possível, quanto tempo leva e porquê. É isso que justifica o teu preço.\n\n[Ler a checklist outra vez]({{clique:|link_checklist_7_erros}})\n\nPatrícia\nDreams Academy® — Formamos talento. Construímos referências.\n\nNão queres receber mais emails? [Anular subscrição]({{anular_subscricao}})","requireConsent":true,"button":{"bg":"#B89A57","ink":"#05204C"}}'::jsonb, null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F1 — Checklist 7 Erros → Guia Anti-Erros'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 7);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 8, 'wait', null, '{}'::jsonb, 2880
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F1 — Checklist 7 Erros → Guia Anti-Erros'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 8);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 9, 'action', 'send_email', '{"subject":"O método completo, por 27€","preheader":"Protocolos de cor, sinais de alerta e 3 meses de apoio.","body":"{{primeiro_nome|Olá}},\n\nA checklist mostra-te os erros. O Guia Anti-Erros mostra-te como não voltar a cometê-los.\n\nLá dentro tens:\n\nProtocolos de coloração e descoloração passo a passo\nOs sinais de alerta que te dizem para parar antes de estragar\nBónus: a checklist, um cronograma de aplicação e 3 meses de apoio\n\nCusta 27€ e tens 15 dias de garantia pela Hotmart. Se não te servir, pedes o reembolso.\n\n[Quero o Guia Anti-Erros]({{clique:int:clicou-anti-erros|link_anti_erros}})\n\nPatrícia\nDreams Academy® — Formamos talento. Construímos referências.\n\nNão queres receber mais emails? [Anular subscrição]({{anular_subscricao}})","requireConsent":true,"button":{"bg":"#B89A57","ink":"#05204C"}}'::jsonb, null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F1 — Checklist 7 Erros → Guia Anti-Erros'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 9);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 10, 'wait', null, '{}'::jsonb, 4320
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F1 — Checklist 7 Erros → Guia Anti-Erros'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 10);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 11, 'action', 'send_email', '{"subject":"Uma pergunta, só para ti","preheader":"Responde a este email. Leio todas as respostas.","body":"{{primeiro_nome|Olá}},\n\nQual foi o serviço que mais te assustou este ano?\n\nResponde a este email com duas linhas. Leio todas as respostas e é com elas que escolho o que ensinar a seguir.\n\nSe ainda quiseres o Guia Anti-Erros, o link é este: [Guia Anti-Erros]({{clique:int:clicou-anti-erros|link_anti_erros}})\n\nPatrícia\n\nNão queres receber mais emails? [Anular subscrição]({{anular_subscricao}})","requireConsent":true}'::jsonb, null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F1 — Checklist 7 Erros → Guia Anti-Erros'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 11);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 12, 'wait', null, '{}'::jsonb, 4320
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F1 — Checklist 7 Erros → Guia Anti-Erros'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 12);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 13, 'action', 'add_tag', '{"onlyIf":{"field":"cenario","equals":"B"}}'::jsonb || jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(name) = lower('fluxo:cross-marketing'))), null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F1 — Checklist 7 Erros → Guia Anti-Erros'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 13);

-- DA F2 — Boas-vindas newsletter
insert into automations (brand_id, name, trigger_type, trigger_config, status)
select (select id from brands where name ilike 'dream%academy%' order by created_at limit 1), 'DA F2 — Boas-vindas newsletter', 'contact_tagged', jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(name) = lower('lm:newsletter')), 'stopTagIds', jsonb_build_array((select id from tags where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(name) = lower('rgpd:opt-out')), (select id from tags where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(name) = lower('estado:inativa'))), 'stopIfTaggedAfterStartIds', jsonb_build_array((select id from tags where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(name) = lower('evento:compra')))) || '{"singleRun":true,"sendWindow":{"days":[1,2,3,4,5,6,7],"start":"09:00","end":"21:00","tz":"Europe/Lisbon"}}'::jsonb, 'draft'
where (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) is not null
  and not exists (select 1 from automations where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and name = 'DA F2 — Boas-vindas newsletter');
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 1, 'action', 'update_contact', '{"fields":{"newsletter":"sim"},"consentEmail":true}'::jsonb, null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F2 — Boas-vindas newsletter'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 1);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 2, 'action', 'update_contact', '{"fields":{"ciclo_vida":"Subscritora"},"onlyIf":{"field":"ciclo_vida","empty":true}}'::jsonb, null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F2 — Boas-vindas newsletter'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 2);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 3, 'action', 'send_email', '{"subject":"Bem-vinda à Dreams Academy","preheader":"Não formamos apenas profissionais. Construímos referências.","body":"{{primeiro_nome|Olá}},\n\nBem-vinda à Dreams Academy.\n\nNão formamos apenas profissionais. Construímos referências. Profissionais que sabem o que fazem, sabem quanto vale e sabem mostrá-lo.\n\nSomos duas. A Patrícia ensina a parte técnica: mais de 30 anos de cabelo e mais de 500 profissionais formadas. A Beatriz ensina marketing e negócio: marca, conteúdo, clientes e vendas.\n\nUma vez por semana recebes a \"Referência\": uma ideia, uma dica para aplicares amanhã e o que está a acontecer na academia.\n\nEntretanto, segue-nos no Instagram:\n\n[Seguir @dreamsacademy.pt]({{clique:|https://www.instagram.com/dreamsacademy.pt/}})\n\nPatrícia e Beatriz\nDreams Academy® — Formamos talento. Construímos referências.\n\nNão queres receber mais emails? [Anular subscrição]({{anular_subscricao}})","sendNow":true,"requireConsent":true,"button":{"bg":"#B89A57","ink":"#05204C"}}'::jsonb, null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F2 — Boas-vindas newsletter'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 3);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 4, 'wait', null, '{}'::jsonb, 1440
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F2 — Boas-vindas newsletter'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 4);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 5, 'action', 'send_email', '{"subject":"O que te falta hoje?","preheader":"Um clique, e escrevemos-te sobre o que importa para ti.","body":"{{primeiro_nome|Olá}},\n\nPara te escrevermos sobre o que te serve, diz-nos o que te falta hoje:\n\n[Segurança técnica]({{clique:cenario:a}})\n\n[Marca, clientes e vendas]({{clique:cenario:b}})\n\n[As duas coisas]({{clique:cenario:ambos}})\n\nBasta um clique.\n\nPatrícia e Beatriz\nDreams Academy® — Formamos talento. Construímos referências.\n\nNão queres receber mais emails? [Anular subscrição]({{anular_subscricao}})","requireConsent":true}'::jsonb, null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F2 — Boas-vindas newsletter'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 5);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 6, 'wait', null, '{}'::jsonb, 4320
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F2 — Boas-vindas newsletter'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 6);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 7, 'action', 'send_email', '{"subject":"Boa técnica sem posicionamento é barata","preheader":"Porque é que a melhor profissional da rua não é a mais cara.","body":"{{primeiro_nome|Olá}},\n\nConheces de certeza uma profissional com mãos de ouro que cobra o mesmo que toda a gente. E outra, com menos técnica, com agenda cheia e preço alto.\n\nA diferença não está no cabelo. Está na forma como cada uma se mostra, explica o que faz e escolhe as clientes.\n\nTécnica sem posicionamento fica barata, porque a cliente não consegue ver a diferença. Posicionamento sem técnica não aguenta, porque a cliente não volta.\n\nNa Dreams Academy trabalhamos as duas coisas, por esta ordem: primeiro a segurança no que fazes, depois a forma de o mostrar e vender.\n\nNa próxima semana dizemos-te por onde começar.\n\nPatrícia e Beatriz\nDreams Academy® — Formamos talento. Construímos referências.\n\nNão queres receber mais emails? [Anular subscrição]({{anular_subscricao}})","requireConsent":true,"button":{"bg":"#B89A57","ink":"#05204C"}}'::jsonb, null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F2 — Boas-vindas newsletter'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 7);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 8, 'wait', null, '{}'::jsonb, 8640
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F2 — Boas-vindas newsletter'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 8);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 9, 'action', 'send_email', '{"subject":"Por onde começar (27€)","preheader":"O primeiro passo certo para o teu momento.","body":"{{primeiro_nome|Olá}},\n\nSe o que te falta é segurança técnica, começa pelo Guia Anti-Erros da Patrícia: protocolos de cor e descoloração, sinais de alerta e 3 meses de apoio. 27€, com 15 dias de garantia.\n\n[Quero o Guia Anti-Erros]({{clique:int:clicou-anti-erros|link_anti_erros}})\n\nPatrícia e Beatriz\nDreams Academy® — Formamos talento. Construímos referências.\n\nNão queres receber mais emails? [Anular subscrição]({{anular_subscricao}})","requireConsent":true,"button":{"bg":"#B89A57","ink":"#05204C"},"onlyIf":{"field":"trilho","equals":"Técnica"}}'::jsonb, null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F2 — Boas-vindas newsletter'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 9);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 10, 'action', 'send_email', '{"subject":"Por onde começar (27€)","preheader":"O primeiro passo certo para o teu momento.","body":"{{primeiro_nome|Olá}},\n\nSe o que te falta é ser vista e escolhida, começa pelo \"Do Invisível ao Inesquecível\" da Beatriz: como construir uma marca pessoal que atrai as clientes certas. 27€, com 15 dias de garantia.\n\n[Quero o Do Invisível ao Inesquecível]({{clique:int:clicou-invisivel|link_invisivel}})\n\nPatrícia e Beatriz\nDreams Academy® — Formamos talento. Construímos referências.\n\nNão queres receber mais emails? [Anular subscrição]({{anular_subscricao}})","requireConsent":true,"button":{"bg":"#B89A57","ink":"#05204C"},"onlyIf":{"field":"trilho","equals":"Marketing & Negócio"}}'::jsonb, null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F2 — Boas-vindas newsletter'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 10);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 11, 'action', 'send_email', '{"subject":"Por onde começar (27€)","preheader":"Dois livros, um para cada lado do teu negócio.","body":"{{primeiro_nome|Olá}},\n\nTens dois pontos de partida, um para cada lado do teu negócio. Cada um custa 27€ e tem 15 dias de garantia.\n\nTécnica: o Guia Anti-Erros da Patrícia, com protocolos de cor e descoloração e os sinais de alerta antes de estragar.\n[Ver o Guia Anti-Erros]({{clique:int:clicou-anti-erros|link_anti_erros}})\n\nMarketing e negócio: o \"Do Invisível ao Inesquecível\" da Beatriz, para construíres uma marca que atrai as clientes certas.\n[Ver o Do Invisível ao Inesquecível]({{clique:int:clicou-invisivel|link_invisivel}})\n\nSe tiveres dúvidas sobre qual escolher, responde a este email.\n\nPatrícia e Beatriz\nDreams Academy® — Formamos talento. Construímos referências.\n\nNão queres receber mais emails? [Anular subscrição]({{anular_subscricao}})","requireConsent":true,"onlyIf":[{"field":"trilho","notEquals":"Técnica"},{"field":"trilho","notEquals":"Marketing & Negócio"}]}'::jsonb, null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F2 — Boas-vindas newsletter'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 11);

-- DA F3 — Carrinho abandonado (Hotmart)
insert into automations (brand_id, name, trigger_type, trigger_config, status)
select (select id from brands where name ilike 'dream%academy%' order by created_at limit 1), 'DA F3 — Carrinho abandonado (Hotmart)', 'contact_tagged', jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(name) = lower('evento:carrinho')), 'stopTagIds', jsonb_build_array((select id from tags where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(name) = lower('rgpd:opt-out')), (select id from tags where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(name) = lower('estado:inativa'))), 'stopIfTaggedAfterStartIds', jsonb_build_array((select id from tags where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(name) = lower('evento:compra')))) || '{"singleRun":true}'::jsonb, 'draft'
where (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) is not null
  and not exists (select 1 from automations where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and name = 'DA F3 — Carrinho abandonado (Hotmart)');
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 1, 'wait', null, '{}'::jsonb, 60
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F3 — Carrinho abandonado (Hotmart)'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 1);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 2, 'action', 'send_email', '{"subject":"Ficou a meio?","preheader":"O teu acesso ao {{carrinho_produto_nome}} está a um passo.","body":"{{primeiro_nome|Olá}},\n\nVimos que começaste a compra do {{carrinho_produto_nome}} e não chegaste ao fim. Às vezes é o cartão, às vezes é a vida a acontecer.\n\nDeixámos-te o caminho de volta, exatamente onde estavas:\n\n[Terminar a compra]({{clique:|carrinho_link}})\n\nPatrícia e Beatriz\nDreams Academy® — Formamos talento. Construímos referências.\n\nNão queres receber mais emails? [Anular subscrição]({{anular_subscricao}})","sendNow":true,"requireConsent":true,"button":{"bg":"#B89A57","ink":"#05204C"}}'::jsonb, null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F3 — Carrinho abandonado (Hotmart)'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 2);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 3, 'wait', null, '{}'::jsonb, 1380
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F3 — Carrinho abandonado (Hotmart)'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 3);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 4, 'action', 'send_email', '{"subject":"A dúvida mais comum sobre o produto","preheader":"Acesso imediato, garantia de 15 dias e para quem é.","body":"{{primeiro_nome|Olá}},\n\nA pergunta que mais recebemos sobre o {{carrinho_produto_nome}} é: \"e se não for para mim?\"\n\nO acesso é imediato, assim que o pagamento é aprovado. Estudas ao teu ritmo.\n\nTens 15 dias de garantia pela Hotmart. Se perceberes que não é para ti, pedes o reembolso e pronto.\n\nÉ para profissionais que querem resultados no dia a dia, não teoria. Se é o teu caso, está aqui:\n\n[Voltar à compra]({{clique:|carrinho_link}})\n\nPatrícia e Beatriz\nDreams Academy® — Formamos talento. Construímos referências.\n\nNão queres receber mais emails? [Anular subscrição]({{anular_subscricao}})","requireConsent":true,"button":{"bg":"#B89A57","ink":"#05204C"}}'::jsonb, null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F3 — Carrinho abandonado (Hotmart)'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 4);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 5, 'wait', null, '{}'::jsonb, 2880
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F3 — Carrinho abandonado (Hotmart)'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 5);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 6, 'action', 'send_email', '{"subject":"Último lembrete","preheader":"Os lotes da Ondas que Fidelizam mudam de preço.","body":"{{primeiro_nome|Olá}},\n\nÚltimo lembrete sobre a Ondas que Fidelizam.\n\nA masterclass é vendida por lotes, e quando um lote esgota o preço sobe para o seguinte. O teu lugar não fica guardado.\n\n[Garantir o meu lugar]({{clique:|carrinho_link}})\n\nPatrícia\n\nNão queres receber mais emails? [Anular subscrição]({{anular_subscricao}})","requireConsent":true,"button":{"bg":"#B89A57","ink":"#05204C"},"onlyIf":{"field":"carrinho_produto_slug","equals":"ondas"}}'::jsonb, null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F3 — Carrinho abandonado (Hotmart)'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 6);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 7, 'action', 'send_email', '{"subject":"Último lembrete","preheader":"O link para terminares a compra, uma última vez.","body":"{{primeiro_nome|Olá}},\n\nÚltimo lembrete sobre o {{carrinho_produto_nome}}: não voltamos a escrever sobre isto.\n\nSe ainda fizer sentido para ti, o caminho está aqui. Tens 15 dias de garantia.\n\n[Terminar a compra]({{clique:|carrinho_link}})\n\nSe alguma coisa te travou, responde a este email e diz-nos o quê.\n\nPatrícia e Beatriz\nDreams Academy® — Formamos talento. Construímos referências.\n\nNão queres receber mais emails? [Anular subscrição]({{anular_subscricao}})","requireConsent":true,"onlyIf":{"field":"carrinho_produto_slug","notEquals":"ondas"}}'::jsonb, null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F3 — Carrinho abandonado (Hotmart)'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 7);

-- DA F4 — Pós-compra e próximo degrau
insert into automations (brand_id, name, trigger_type, trigger_config, status)
select (select id from brands where name ilike 'dream%academy%' order by created_at limit 1), 'DA F4 — Pós-compra e próximo degrau', 'contact_tagged', jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(name) = lower('evento:compra')), 'stopTagIds', jsonb_build_array((select id from tags where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(name) = lower('rgpd:opt-out')), (select id from tags where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(name) = lower('estado:inativa'))), 'stopIfTaggedAfterStartIds', jsonb_build_array((select id from tags where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(name) = lower('evento:reembolso')))) || '{"singleRun":true,"sendWindow":{"days":[1,2,3,4,5,6,7],"start":"09:00","end":"21:00","tz":"Europe/Lisbon"}}'::jsonb, 'draft'
where (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) is not null
  and not exists (select 1 from automations where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and name = 'DA F4 — Pós-compra e próximo degrau');
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 1, 'action', 'send_email', '{"subject":"O teu acesso ao {{ultimo_produto_nome}}","preheader":"Como tirar o máximo do que compraste, em 3 passos.","body":"{{primeiro_nome|Olá}},\n\nObrigada pela confiança. O teu {{ultimo_produto_nome}} está à tua espera na Hotmart: o acesso chega ao teu email logo que o pagamento é aprovado (procura também no spam).\n\nPara tirares o máximo:\n\n1. Reserva 30 minutos esta semana, sem telemóvel, para a primeira leitura.\n2. Escolhe uma cliente real desta semana e aplica uma única coisa.\n3. Responde a este email a contar o que aconteceu.\n\n[Entrar na Hotmart]({{clique:|https://consumer.hotmart.com}})\n\nPatrícia e Beatriz\nDreams Academy® — Formamos talento. Construímos referências.\n\nNão queres receber mais emails? [Anular subscrição]({{anular_subscricao}})","sendNow":true,"button":{"bg":"#B89A57","ink":"#05204C"}}'::jsonb, null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F4 — Pós-compra e próximo degrau'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 1);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 2, 'wait', null, '{}'::jsonb, 2880
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F4 — Pós-compra e próximo degrau'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 2);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 3, 'action', 'send_email', '{"subject":"Começa por aqui","preheader":"Uma ação prática para a tua próxima cliente.","body":"{{primeiro_nome|Olá}},\n\nO erro mais comum depois de comprar um curso é ler tudo e não aplicar nada.\n\nPor isso, uma só tarefa: escolhe a próxima cliente da tua agenda e aplica uma ideia do {{ultimo_produto_nome}}. Só uma. Anota o que mudou: na conversa, no resultado ou na reação dela.\n\nÉ assim que o conteúdo passa a técnica, e a técnica passa a preço.\n\nPatrícia e Beatriz\nDreams Academy® — Formamos talento. Construímos referências.\n\nNão queres receber mais emails? [Anular subscrição]({{anular_subscricao}})"}'::jsonb, null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F4 — Pós-compra e próximo degrau'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 3);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 4, 'wait', null, '{}'::jsonb, 7200
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F4 — Pós-compra e próximo degrau'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 4);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 5, 'action', 'send_email', '{"subject":"Já aplicaste?","preheader":"Conta-nos o que mudou. Lemos todas as respostas.","body":"{{primeiro_nome|Olá}},\n\nJá passou uma semana desde que entraste no {{ultimo_produto_nome}}.\n\nJá aplicaste alguma coisa? O que mudou?\n\nResponde a este email, mesmo que seja só uma linha. Lemos todas as respostas e usamos as dúvidas para melhorar o que ensinamos.\n\nPatrícia e Beatriz\nDreams Academy® — Formamos talento. Construímos referências.\n\nNão queres receber mais emails? [Anular subscrição]({{anular_subscricao}})"}'::jsonb, null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F4 — Pós-compra e próximo degrau'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 5);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 6, 'wait', null, '{}'::jsonb, 4320
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F4 — Pós-compra e próximo degrau'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 6);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 7, 'action', 'send_email', '{"subject":"Conta-nos em 30 segundos","preheader":"A tua experiência ajuda outras profissionais a decidir.","body":"{{primeiro_nome|Olá}},\n\nUm pedido pequeno: conta-nos em 30 segundos como está a ser o {{ultimo_produto_nome}}.\n\nPode ser uma frase em resposta a este email ou um vídeo curto do telemóvel. Diz o que mudou no teu trabalho e, se tiveres, um número (clientes, preço, tempo poupado).\n\nCom a tua autorização, partilhamos o teu testemunho para ajudar outras profissionais a decidir.\n\nPatrícia e Beatriz\nDreams Academy® — Formamos talento. Construímos referências.\n\nNão queres receber mais emails? [Anular subscrição]({{anular_subscricao}})"}'::jsonb, null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F4 — Pós-compra e próximo degrau'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 7);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 8, 'wait', null, '{}'::jsonb, 5760
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F4 — Pós-compra e próximo degrau'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 8);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 9, 'action', 'send_email', '{"subject":"O próximo passo","preheader":"Do {{ultimo_produto_nome}} para o Programa Dreams Academy.","body":"{{primeiro_nome|Olá}},\n\nO próximo passo não é mais um curso: é acompanhamento.\n\nO Programa Dreams Academy são 90 dias com a Patrícia e a Beatriz, a trabalhar a técnica e o negócio ao mesmo tempo, com vagas limitadas.\n\n[Conhecer o Programa]({{clique:int:viu-programa|link_programa}})\n\nPatrícia e Beatriz\nDreams Academy® — Formamos talento. Construímos referências.\n\nNão queres receber mais emails? [Anular subscrição]({{anular_subscricao}})","requireConsent":true,"button":{"bg":"#B89A57","ink":"#05204C"},"onlyIf":{"field":"proxima_oferta_slug","equals":"programa"}}'::jsonb, null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F4 — Pós-compra e próximo degrau'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 9);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 10, 'action', 'send_email', '{"subject":"O próximo passo","preheader":"Depois do {{ultimo_produto_nome}}, isto faz sentido.","body":"{{primeiro_nome|Olá}},\n\nSe o {{ultimo_produto_nome}} te deu a base, o passo natural a seguir é o {{proxima_oferta_nome}}.\n\nÉ o degrau seguinte do mesmo caminho: vais da base para a aplicação no dia a dia.\n\n[Ver o {{proxima_oferta_nome}}]({{clique:int:clicou-oferta|proxima_oferta_link}})\n\nPatrícia e Beatriz\nDreams Academy® — Formamos talento. Construímos referências.\n\nNão queres receber mais emails? [Anular subscrição]({{anular_subscricao}})","requireConsent":true,"button":{"bg":"#B89A57","ink":"#05204C"},"onlyIf":[{"field":"proxima_oferta_slug"},{"field":"proxima_oferta_slug","notEquals":"programa"}]}'::jsonb, null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F4 — Pós-compra e próximo degrau'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 10);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 11, 'wait', null, '{}'::jsonb, 23040
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F4 — Pós-compra e próximo degrau'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 11);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 12, 'action', 'add_tag', '{"onlyIf":{"field":"trilho","equals":"Técnica"}}'::jsonb || jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(name) = lower('fluxo:cross-marketing'))), null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F4 — Pós-compra e próximo degrau'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 12);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 13, 'action', 'add_tag', '{"onlyIf":{"field":"trilho","equals":"Marketing & Negócio"}}'::jsonb || jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(name) = lower('fluxo:cross-tecnica'))), null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F4 — Pós-compra e próximo degrau'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 13);

-- DA F5a — Cross-sell Técnica → Marketing
insert into automations (brand_id, name, trigger_type, trigger_config, status)
select (select id from brands where name ilike 'dream%academy%' order by created_at limit 1), 'DA F5a — Cross-sell Técnica → Marketing', 'contact_tagged', jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(name) = lower('fluxo:cross-marketing')), 'stopTagIds', jsonb_build_array((select id from tags where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(name) = lower('rgpd:opt-out')), (select id from tags where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(name) = lower('estado:inativa')), (select id from tags where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(name) = lower('comprou:invisivel')), (select id from tags where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(name) = lower('pausa:ofertas')))) || '{"sendWindow":{"days":[1,2,3,4,5,6,7],"start":"09:00","end":"21:00","tz":"Europe/Lisbon"}}'::jsonb, 'draft'
where (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) is not null
  and not exists (select 1 from automations where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and name = 'DA F5a — Cross-sell Técnica → Marketing');
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 1, 'action', 'send_email', '{"subject":"Porque é que a agenda não está cheia?","preheader":"A tua técnica já é boa. Falta o resto.","body":"{{primeiro_nome|Olá}},\n\nA tua técnica já é boa. Então porque é que a agenda não está cheia?\n\nPorque a cliente não compra técnica. Compra aquilo que consegue ver e perceber: a forma como te apresentas, o que mostras, a confiança que passas antes de se sentar na tua cadeira.\n\nO \"Do Invisível ao Inesquecível\" é o primeiro passo da Beatriz para isso: construir uma marca pessoal que atrai as clientes certas. 27€, com 15 dias de garantia.\n\n[Ver o Do Invisível ao Inesquecível]({{clique:int:clicou-invisivel|link_invisivel}})\n\nBeatriz\nDreams Academy® — Formamos talento. Construímos referências.\n\nNão queres receber mais emails? [Anular subscrição]({{anular_subscricao}})","requireConsent":true,"button":{"bg":"#B89A57","ink":"#05204C"}}'::jsonb, null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F5a — Cross-sell Técnica → Marketing'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 1);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 2, 'wait', null, '{}'::jsonb, 5760
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F5a — Cross-sell Técnica → Marketing'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 2);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 3, 'action', 'send_email', '{"subject":"Quem te escolhe, e porquê","preheader":"Uma pergunta para o teu Instagram.","body":"{{primeiro_nome|Olá}},\n\nFaz este exercício: abre o teu Instagram como se fosses uma cliente nova. Em 5 segundos percebes porque é que deves escolher-te a ti e não à profissional da rua ao lado?\n\nSe a resposta não for um \"sim\" claro, o problema não é a tua técnica.\n\n[Começar pelo Do Invisível ao Inesquecível]({{clique:int:clicou-invisivel|link_invisivel}})\n\nBeatriz\n\nNão queres receber mais emails? [Anular subscrição]({{anular_subscricao}})","requireConsent":true}'::jsonb, null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F5a — Cross-sell Técnica → Marketing'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 3);

-- DA F5b — Cross-sell Marketing → Técnica
insert into automations (brand_id, name, trigger_type, trigger_config, status)
select (select id from brands where name ilike 'dream%academy%' order by created_at limit 1), 'DA F5b — Cross-sell Marketing → Técnica', 'contact_tagged', jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(name) = lower('fluxo:cross-tecnica')), 'stopTagIds', jsonb_build_array((select id from tags where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(name) = lower('rgpd:opt-out')), (select id from tags where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(name) = lower('estado:inativa')), (select id from tags where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(name) = lower('comprou:anti-erros')), (select id from tags where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(name) = lower('comprou:ondas')), (select id from tags where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(name) = lower('pausa:ofertas')))) || '{"sendWindow":{"days":[1,2,3,4,5,6,7],"start":"09:00","end":"21:00","tz":"Europe/Lisbon"}}'::jsonb, 'draft'
where (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) is not null
  and not exists (select 1 from automations where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and name = 'DA F5b — Cross-sell Marketing → Técnica');
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 1, 'action', 'send_email', '{"subject":"A técnica faz a cliente voltar","preheader":"O marketing traz a cliente. A técnica segura-a.","body":"{{primeiro_nome|Olá}},\n\nO marketing traz a cliente. A técnica faz com que ela volte.\n\nSe já estás a trabalhar a tua marca, o passo seguinte é ter a certeza de que cada serviço confirma o que prometes. Uma coloração que corre mal desfaz meses de conteúdo.\n\nO Guia Anti-Erros da Patrícia dá-te os protocolos e os sinais de alerta para isso. 27€, com 15 dias de garantia.\n\n[Ver o Guia Anti-Erros]({{clique:int:clicou-anti-erros|link_anti_erros}})\n\nPatrícia\nDreams Academy® — Formamos talento. Construímos referências.\n\nNão queres receber mais emails? [Anular subscrição]({{anular_subscricao}})","requireConsent":true,"button":{"bg":"#B89A57","ink":"#05204C"}}'::jsonb, null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F5b — Cross-sell Marketing → Técnica'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 1);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 2, 'wait', null, '{}'::jsonb, 5760
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F5b — Cross-sell Marketing → Técnica'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 2);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 3, 'action', 'send_email', '{"subject":"Ondas que duram, clientes que voltam","preheader":"A masterclass para fidelizar pelo resultado.","body":"{{primeiro_nome|Olá}},\n\nSe já tens as bases, a Ondas que Fidelizam é a masterclass da Patrícia sobre ondas que duram, para a cliente ver o resultado dias depois e voltar por isso.\n\n[Ver a Ondas que Fidelizam]({{clique:int:clicou-ondas|link_ondas}})\n\nPatrícia\n\nNão queres receber mais emails? [Anular subscrição]({{anular_subscricao}})","requireConsent":true}'::jsonb, null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F5b — Cross-sell Marketing → Técnica'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 3);

-- DA F6 — Sequência Programa Dreams Academy
insert into automations (brand_id, name, trigger_type, trigger_config, status)
select (select id from brands where name ilike 'dream%academy%' order by created_at limit 1), 'DA F6 — Sequência Programa Dreams Academy', 'contact_tagged', jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(name) = lower('fluxo:programa')), 'stopTagIds', jsonb_build_array((select id from tags where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(name) = lower('rgpd:opt-out')), (select id from tags where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(name) = lower('estado:inativa')), (select id from tags where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(name) = lower('lm:candidatura-programa')), (select id from tags where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(name) = lower('programa:inscrita')), (select id from tags where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(name) = lower('pausa:ofertas')))) || '{"sendWindow":{"days":[1,2,3,4,5,6,7],"start":"09:00","end":"21:00","tz":"Europe/Lisbon"}}'::jsonb, 'draft'
where (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) is not null
  and not exists (select 1 from automations where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and name = 'DA F6 — Sequência Programa Dreams Academy');
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 1, 'action', 'send_email', '{"subject":"Não precisas de mais cursos genéricos","preheader":"Precisas de direção. E de alguém a acompanhar-te.","body":"{{primeiro_nome|Olá}},\n\nNão precisas de mais cursos genéricos. Precisas de direção.\n\nSe sentes que ainda te falta base técnica, sabes como é: cada cliente nova é um risco, cada pedido diferente é uma dúvida. E sozinha, isso não muda depressa.\n\nO Programa Dreams Academy são 90 dias de acompanhamento com a Patrícia e a Beatriz. Começamos pela segurança técnica, e só depois passamos à marca e às vendas.\n\n[Ver o Programa]({{clique:int:viu-programa|link_programa}})\n\nPatrícia e Beatriz\nDreams Academy® — Formamos talento. Construímos referências.\n\nNão queres receber mais emails? [Anular subscrição]({{anular_subscricao}})","requireConsent":true,"button":{"bg":"#B89A57","ink":"#05204C"},"onlyIf":{"field":"cenario","notEquals":"B"}}'::jsonb, null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F6 — Sequência Programa Dreams Academy'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 1);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 2, 'action', 'send_email', '{"subject":"Não precisas de mais cursos genéricos","preheader":"Precisas de direção. E de clientes que pagam o teu valor.","body":"{{primeiro_nome|Olá}},\n\nNão precisas de mais cursos genéricos. Precisas de direção.\n\nSe a técnica já está lá, o que falta é o resto: as clientes certas, o preço certo, uma agenda que não depende da sorte.\n\nO Programa Dreams Academy são 90 dias de acompanhamento com a Patrícia e a Beatriz, a trabalhar a tua marca, o teu conteúdo e as tuas vendas.\n\n[Ver o Programa]({{clique:int:viu-programa|link_programa}})\n\nPatrícia e Beatriz\nDreams Academy® — Formamos talento. Construímos referências.\n\nNão queres receber mais emails? [Anular subscrição]({{anular_subscricao}})","requireConsent":true,"button":{"bg":"#B89A57","ink":"#05204C"},"onlyIf":{"field":"cenario","equals":"B"}}'::jsonb, null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F6 — Sequência Programa Dreams Academy'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 2);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 3, 'wait', null, '{}'::jsonb, 2880
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F6 — Sequência Programa Dreams Academy'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 3);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 4, 'action', 'send_email', '{"subject":"Os 5 pilares em 90 dias","preheader":"Por onde começa o teu Programa.","body":"{{primeiro_nome|Olá}},\n\nO Programa assenta em 5 pilares, trabalhados ao longo de 90 dias:\n\n1. Técnica e certificação\n2. Mentalidade de valor\n3. Marca pessoal\n4. Conteúdo\n5. Vendas\n\nNo teu caso, começamos pelo primeiro: segurança técnica. É a base de tudo o resto, porque não se vende com confiança o que não se domina.\n\n[Ver o Programa]({{clique:int:viu-programa|link_programa}})\n\nPatrícia e Beatriz\nDreams Academy® — Formamos talento. Construímos referências.\n\nNão queres receber mais emails? [Anular subscrição]({{anular_subscricao}})","requireConsent":true,"button":{"bg":"#B89A57","ink":"#05204C"},"onlyIf":{"field":"cenario","notEquals":"B"}}'::jsonb, null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F6 — Sequência Programa Dreams Academy'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 4);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 5, 'action', 'send_email', '{"subject":"Os 5 pilares em 90 dias","preheader":"Por onde começa o teu Programa.","body":"{{primeiro_nome|Olá}},\n\nO Programa assenta em 5 pilares, trabalhados ao longo de 90 dias:\n\n1. Técnica e certificação\n2. Mentalidade de valor\n3. Marca pessoal\n4. Conteúdo\n5. Vendas\n\nNo teu caso, a técnica já está lá. Por isso o foco vai para a marca, o conteúdo e as vendas: ser vista, ser escolhida e cobrar o que vales.\n\n[Ver o Programa]({{clique:int:viu-programa|link_programa}})\n\nPatrícia e Beatriz\nDreams Academy® — Formamos talento. Construímos referências.\n\nNão queres receber mais emails? [Anular subscrição]({{anular_subscricao}})","requireConsent":true,"button":{"bg":"#B89A57","ink":"#05204C"},"onlyIf":{"field":"cenario","equals":"B"}}'::jsonb, null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F6 — Sequência Programa Dreams Academy'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 5);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 6, 'wait', null, '{}'::jsonb, 4320
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F6 — Sequência Programa Dreams Academy'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 6);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 7, 'action', 'send_email', '{"subject":"\"Não tenho experiência suficiente\"","preheader":"Não é pré-requisito. O compromisso é.","body":"{{primeiro_nome|Olá}},\n\nA frase que mais ouvimos antes de uma candidatura é: \"não tenho experiência suficiente\".\n\nExperiência não é pré-requisito. Compromisso é. O Programa existe precisamente para encurtar o caminho de quem está a construir a base, com acompanhamento direto em vez de tentativa e erro.\n\n[Candidatar-me]({{clique:int:abriu-candidatura|link_candidatura}})\n\nPatrícia\nDreams Academy® — Formamos talento. Construímos referências.\n\nNão queres receber mais emails? [Anular subscrição]({{anular_subscricao}})","requireConsent":true,"button":{"bg":"#B89A57","ink":"#05204C"},"onlyIf":{"field":"cenario","notEquals":"B"}}'::jsonb, null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F6 — Sequência Programa Dreams Academy'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 7);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 8, 'action', 'send_email', '{"subject":"\"Não tenho tempo\"","preheader":"Algumas horas por semana, ajustadas à tua agenda.","body":"{{primeiro_nome|Olá}},\n\nA frase que mais ouvimos antes de uma candidatura é: \"não tenho tempo\".\n\nO Programa pede algumas horas por semana, ajustadas à tua agenda. E o objetivo é precisamente o contrário de te tirar tempo: menos clientes erradas, menos horas mal pagas, mais controlo sobre a agenda.\n\n[Candidatar-me]({{clique:int:abriu-candidatura|link_candidatura}})\n\nBeatriz\nDreams Academy® — Formamos talento. Construímos referências.\n\nNão queres receber mais emails? [Anular subscrição]({{anular_subscricao}})","requireConsent":true,"button":{"bg":"#B89A57","ink":"#05204C"},"onlyIf":{"field":"cenario","equals":"B"}}'::jsonb, null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F6 — Sequência Programa Dreams Academy'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 8);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 9, 'wait', null, '{}'::jsonb, 4320
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F6 — Sequência Programa Dreams Academy'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 9);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 10, 'action', 'send_email', '{"subject":"Como funciona a candidatura","preheader":"Candidatura, conversa e proposta. Sem surpresas.","body":"{{primeiro_nome|Olá}},\n\nO Programa não tem botão de compra. Tem candidatura, e há uma razão: as vagas são limitadas para garantir acompanhamento direto.\n\nO processo é simples:\n\n1. Preenches a candidatura (5 minutos).\n2. Marcamos uma conversa de 20 minutos para percebermos o teu momento.\n3. Se fizer sentido para as duas partes, recebes uma proposta com preço e condições.\n\nNão há compromisso até ao terceiro passo.\n\n[Candidatar-me]({{clique:int:abriu-candidatura|link_candidatura}})\n\nPatrícia e Beatriz\nDreams Academy® — Formamos talento. Construímos referências.\n\nNão queres receber mais emails? [Anular subscrição]({{anular_subscricao}})","requireConsent":true,"button":{"bg":"#B89A57","ink":"#05204C"}}'::jsonb, null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F6 — Sequência Programa Dreams Academy'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 10);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 11, 'wait', null, '{}'::jsonb, 5760
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F6 — Sequência Programa Dreams Academy'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 11);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 12, 'action', 'send_email', '{"subject":"Queres que olhe para o teu caso?","preheader":"Uma pergunta da Patrícia.","body":"{{primeiro_nome|Olá}},\n\nEscrevo-te eu, sem design nem botões.\n\nQueres que olhe para o teu caso? Responde a este email com duas linhas: o que fazes hoje e o que queres estar a fazer daqui a 90 dias.\n\nSe preferires, [a candidatura está aqui]({{clique:int:abriu-candidatura|link_candidatura}}).\n\nPatrícia\n\nNão queres receber mais emails? [Anular subscrição]({{anular_subscricao}})","requireConsent":true,"onlyIf":{"field":"cenario","notEquals":"B"}}'::jsonb, null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F6 — Sequência Programa Dreams Academy'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 12);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 13, 'action', 'send_email', '{"subject":"Queres que olhe para o teu negócio?","preheader":"Uma pergunta da Beatriz.","body":"{{primeiro_nome|Olá}},\n\nEscrevo-te eu, sem design nem botões.\n\nQueres que olhe para o teu negócio? Responde a este email com duas linhas: quanto cobras hoje e onde queres estar daqui a 90 dias.\n\nSe preferires, [a candidatura está aqui]({{clique:int:abriu-candidatura|link_candidatura}}).\n\nBeatriz\n\nNão queres receber mais emails? [Anular subscrição]({{anular_subscricao}})","requireConsent":true,"onlyIf":{"field":"cenario","equals":"B"}}'::jsonb, null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F6 — Sequência Programa Dreams Academy'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 13);

-- DA F7 — Candidatura recebida
insert into automations (brand_id, name, trigger_type, trigger_config, status)
select (select id from brands where name ilike 'dream%academy%' order by created_at limit 1), 'DA F7 — Candidatura recebida', 'contact_tagged', jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(name) = lower('lm:candidatura-programa')), 'stopTagIds', jsonb_build_array((select id from tags where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(name) = lower('rgpd:opt-out'))), 'stopIfTaggedAfterStartIds', jsonb_build_array((select id from tags where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(name) = lower('programa:conversa-marcada')), (select id from tags where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(name) = lower('programa:inscrita')))) || '{"singleRun":true}'::jsonb, 'draft'
where (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) is not null
  and not exists (select 1 from automations where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and name = 'DA F7 — Candidatura recebida');
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 1, 'action', 'update_contact', '{"fields":{"ciclo_vida":"Candidata"},"onlyIf":{"field":"ciclo_vida","notEquals":"Aluna Programa"}}'::jsonb, null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F7 — Candidatura recebida'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 1);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 2, 'action', 'add_tag', '{}'::jsonb || jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(name) = lower('ciclo:candidata'))), null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F7 — Candidatura recebida'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 2);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 3, 'action', 'create_deal', '{"title":"{{nome}} — Programa"}'::jsonb || jsonb_build_object('pipelineId', (select id from pipelines where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and name = 'Programa Dreams Academy' limit 1), 'stageId', (select id from pipeline_stages where pipeline_id = (select id from pipelines where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and name = 'Programa Dreams Academy' limit 1) and name = 'Candidatura recebida' limit 1)), null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F7 — Candidatura recebida'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 3);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 4, 'action', 'notify_team', '{"message":"Nova candidatura ao Programa: {{nome}} ({{telefone|sem telefone}}). Responder em menos de 1 hora."}'::jsonb, null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F7 — Candidatura recebida'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 4);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 5, 'action', 'create_task', '{"title":"WhatsApp a {{nome}} ({{telefone|sem telefone}}) em menos de 1h: agradecer a candidatura e propor 2 horários para a conversa de 20 minutos. Antes do preço, perguntar o preço atual e o objetivo a 90 dias.","dueInMinutes":60}'::jsonb, null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F7 — Candidatura recebida'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 5);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 6, 'action', 'send_email', '{"subject":"Recebemos a tua candidatura","preheader":"O próximo passo é uma conversa de 20 minutos.","body":"{{primeiro_nome|Olá}},\n\nRecebemos a tua candidatura ao Programa Dreams Academy. Obrigada por teres dado este passo.\n\nO próximo é uma conversa de 20 minutos, para percebermos o teu momento e o que queres conseguir. Nas próximas horas a Beatriz envia-te por WhatsApp duas propostas de horário.\n\nSe preferires, responde a este email com os dias e horas que te dão mais jeito.\n\nPatrícia e Beatriz\nDreams Academy® — Formamos talento. Construímos referências.\n\nNão queres receber mais emails? [Anular subscrição]({{anular_subscricao}})","sendNow":true}'::jsonb, null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F7 — Candidatura recebida'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 6);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 7, 'wait', null, '{}'::jsonb, 1440
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F7 — Candidatura recebida'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 7);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 8, 'action', 'send_email', '{"subject":"O que acontece na conversa","preheader":"E o que vais levar dela, mesmo que não entres.","body":"{{primeiro_nome|Olá}},\n\nPara chegares à conversa tranquila, isto é o que vai acontecer:\n\nFalamos do teu momento: o que fazes, quanto cobras, o que te trava.\nDefinimos o objetivo para os próximos 90 dias.\nDizemos-te com honestidade se o Programa é o passo certo agora.\n\nMesmo que não entres, sais com clareza sobre o próximo passo. Não é uma chamada de vendas disfarçada.\n\nPatrícia e Beatriz\nDreams Academy® — Formamos talento. Construímos referências.\n\nNão queres receber mais emails? [Anular subscrição]({{anular_subscricao}})","button":{"bg":"#B89A57","ink":"#05204C"}}'::jsonb, null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F7 — Candidatura recebida'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 8);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 9, 'wait', null, '{}'::jsonb, 2880
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F7 — Candidatura recebida'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 9);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 10, 'action', 'create_task', '{"title":"Seguimento da candidatura de {{nome}}: se ainda não há conversa marcada, voltar a propor 2 horários por WhatsApp.","dueInMinutes":240}'::jsonb, null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F7 — Candidatura recebida'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 10);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 11, 'action', 'send_email', '{"subject":"Quem te vai acompanhar","preheader":"30 anos de técnica e uma estratégia de marca.","body":"{{primeiro_nome|Olá}},\n\nJá que vamos conversar, ficas a saber com quem.\n\nA Patrícia trabalha com cabelo há mais de 30 anos e já formou mais de 500 profissionais. É ela que garante a parte técnica do Programa.\n\nA Beatriz trabalha marca, conteúdo e vendas. É ela que garante que a técnica se transforma em clientes e preço.\n\nNo Programa trabalhas com as duas, ao mesmo tempo.\n\nPatrícia e Beatriz\nDreams Academy® — Formamos talento. Construímos referências.\n\nNão queres receber mais emails? [Anular subscrição]({{anular_subscricao}})"}'::jsonb, null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F7 — Candidatura recebida'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 11);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 12, 'wait', null, '{}'::jsonb, 5760
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F7 — Candidatura recebida'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 12);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 13, 'action', 'send_email', '{"subject":"As vagas desta entrada","preheader":"Vagas limitadas, para garantir acompanhamento direto.","body":"{{primeiro_nome|Olá}},\n\nUm ponto de situação: as vagas desta entrada do Programa são limitadas, para conseguirmos acompanhar cada aluna de perto.\n\nA tua candidatura continua aberta. Se ainda não marcámos a conversa, responde a este email com dois horários que te deem jeito e tratamos do resto.\n\nPatrícia e Beatriz\nDreams Academy® — Formamos talento. Construímos referências.\n\nNão queres receber mais emails? [Anular subscrição]({{anular_subscricao}})"}'::jsonb, null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F7 — Candidatura recebida'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 13);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 14, 'wait', null, '{}'::jsonb, 4320
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F7 — Candidatura recebida'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 14);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 15, 'action', 'send_email', '{"subject":"Fecho a tua candidatura?","preheader":"Um clique, e sei o que fazer.","body":"{{primeiro_nome|Olá}},\n\nNão quero deixar a tua candidatura pendurada. O que preferes?\n\n[Sim, quero conversar]({{clique:int:quer-conversar}})\n\n[Agora não]({{clique:int:agora-nao}})\n\n[Tenho uma dúvida]({{clique:int:tem-duvida}})\n\nBeatriz\n\nNão queres receber mais emails? [Anular subscrição]({{anular_subscricao}})"}'::jsonb, null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F7 — Candidatura recebida'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 15);

-- DA F8 — Proposta enviada sem pagamento
insert into automations (brand_id, name, trigger_type, trigger_config, status)
select (select id from brands where name ilike 'dream%academy%' order by created_at limit 1), 'DA F8 — Proposta enviada sem pagamento', 'deal_stage_changed', jsonb_build_object('stageId', (select id from pipeline_stages where pipeline_id = (select id from pipelines where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and name = 'Programa Dreams Academy' limit 1) and name = 'Proposta enviada' limit 1), 'stopTagIds', jsonb_build_array((select id from tags where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(name) = lower('rgpd:opt-out'))), 'stopIfTaggedAfterStartIds', jsonb_build_array((select id from tags where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(name) = lower('programa:inscrita')))) || '{"singleRun":true,"sendWindow":{"days":[1,2,3,4,5,6,7],"start":"09:00","end":"21:00","tz":"Europe/Lisbon"}}'::jsonb, 'draft'
where (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) is not null
  and not exists (select 1 from automations where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and name = 'DA F8 — Proposta enviada sem pagamento');
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 1, 'wait', null, '{}'::jsonb, 1440
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F8 — Proposta enviada sem pagamento'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 1);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 2, 'action', 'send_email', '{"subject":"A tua proposta, em resumo","preheader":"Pagamento, o que inclui e como é o acompanhamento.","body":"{{primeiro_nome|Olá}},\n\nObrigada pela conversa. Deixo-te o essencial da proposta num só sítio, para decidires com calma.\n\nO que inclui: 90 dias de acompanhamento com a Patrícia e a Beatriz, nos 5 pilares (técnica, mentalidade, marca, conteúdo e vendas).\n\nComo é o acompanhamento: direto, com contacto próximo durante todo o Programa.\n\nPagamento: as condições estão na proposta que te enviámos. Se precisares de outra forma de pagamento, diz-nos.\n\nQualquer dúvida, responde a este email.\n\nPatrícia e Beatriz\nDreams Academy® — Formamos talento. Construímos referências.\n\nNão queres receber mais emails? [Anular subscrição]({{anular_subscricao}})"}'::jsonb, null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F8 — Proposta enviada sem pagamento'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 2);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 3, 'wait', null, '{}'::jsonb, 2880
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F8 — Proposta enviada sem pagamento'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 3);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 4, 'action', 'send_email', '{"subject":"Quanto custa continuar igual?","preheader":"Uma conta simples, com os teus números.","body":"{{primeiro_nome|Olá}},\n\nUma conta simples. Hoje cobras {{preco_medio_atual}}€ por serviço. Se daqui a 90 dias cobrares mais 10€, com 40 clientes por mês são 400€ a mais por mês. Num ano, 4.800€.\n\nFicar igual também tem um preço. Só não aparece na fatura.\n\nSe quiseres rever a proposta comigo, responde a este email.\n\nBeatriz\n\nNão queres receber mais emails? [Anular subscrição]({{anular_subscricao}})","onlyIf":{"field":"preco_medio_atual"}}'::jsonb, null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F8 — Proposta enviada sem pagamento'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 4);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 5, 'action', 'send_email', '{"subject":"Quanto custa continuar igual?","preheader":"Uma conta simples, com os teus números.","body":"{{primeiro_nome|Olá}},\n\nUma conta simples. Se daqui a 90 dias cobrares mais 10€ por serviço, com 40 clientes por mês são 400€ a mais por mês. Num ano, 4.800€.\n\nFicar igual também tem um preço. Só não aparece na fatura.\n\nSe quiseres rever a proposta comigo, responde a este email.\n\nBeatriz\n\nNão queres receber mais emails? [Anular subscrição]({{anular_subscricao}})","onlyIf":{"field":"preco_medio_atual","empty":true}}'::jsonb, null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F8 — Proposta enviada sem pagamento'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 5);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 6, 'action', 'create_task', '{"title":"{{nome}} tem a proposta do Programa há 3 dias sem pagamento. WhatsApp da Beatriz: perguntar que dúvida falta esclarecer.","dueInMinutes":240}'::jsonb, null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F8 — Proposta enviada sem pagamento'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 6);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 7, 'wait', null, '{}'::jsonb, 2880
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F8 — Proposta enviada sem pagamento'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 7);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 8, 'action', 'send_email', '{"subject":"A dúvida que trava quase todas","preheader":"\"E se não conseguir acompanhar?\"","body":"{{primeiro_nome|Olá}},\n\nA dúvida que trava quase todas as profissionais antes de entrar é: \"e se não conseguir acompanhar?\"\n\nO Programa foi desenhado para quem trabalha a tempo inteiro. Algumas horas por semana, com acompanhamento direto, para nunca ficares para trás sozinha.\n\nSe é essa a tua dúvida, ou outra, responde a este email.\n\nPatrícia e Beatriz\nDreams Academy® — Formamos talento. Construímos referências.\n\nNão queres receber mais emails? [Anular subscrição]({{anular_subscricao}})"}'::jsonb, null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F8 — Proposta enviada sem pagamento'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 8);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 9, 'wait', null, '{}'::jsonb, 2880
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F8 — Proposta enviada sem pagamento'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 9);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 10, 'action', 'send_email', '{"subject":"A tua vaga","preheader":"As condições da proposta têm prazo.","body":"{{primeiro_nome|Olá}},\n\nAs condições da tua proposta têm prazo. Depois disso, a vaga passa para a lista de espera e a próxima entrada tem novas condições.\n\nSe queres entrar nesta, responde a este email e tratamos do resto hoje.\n\nBeatriz\n\nNão queres receber mais emails? [Anular subscrição]({{anular_subscricao}})"}'::jsonb, null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F8 — Proposta enviada sem pagamento'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 10);

-- DA F9 — Aluna do Programa (90 dias)
insert into automations (brand_id, name, trigger_type, trigger_config, status)
select (select id from brands where name ilike 'dream%academy%' order by created_at limit 1), 'DA F9 — Aluna do Programa (90 dias)', 'contact_tagged', jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(name) = lower('programa:inscrita'))) || '{"singleRun":true}'::jsonb, 'draft'
where (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) is not null
  and not exists (select 1 from automations where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and name = 'DA F9 — Aluna do Programa (90 dias)');
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 1, 'action', 'update_contact', '{"fields":{"ciclo_vida":"Aluna Programa"}}'::jsonb, null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F9 — Aluna do Programa (90 dias)'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 1);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 2, 'action', 'add_tag', '{}'::jsonb || jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(name) = lower('ciclo:aluna'))), null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F9 — Aluna do Programa (90 dias)'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 2);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 3, 'action', 'send_email', '{"subject":"Bem-vinda ao Programa Dreams Academy","preheader":"Acessos, calendário e o teu contacto direto.","body":"{{primeiro_nome|Olá}},\n\nBem-vinda ao Programa Dreams Academy. A partir de hoje não estás sozinha.\n\nOs teus acessos: [AJUSTAR: plataforma e como entrar]\nCalendário: [AJUSTAR: datas das sessões]\nContacto direto: [AJUSTAR: WhatsApp ou grupo]\nMateriais base: [AJUSTAR: link]\n\nAmanhã envio-te um questionário curto. É o teu ponto de partida, para medirmos o resultado no fim.\n\nPatrícia e Beatriz\nDreams Academy® — Formamos talento. Construímos referências.\n\nNão queres receber mais emails? [Anular subscrição]({{anular_subscricao}})","sendNow":true,"button":{"bg":"#B89A57","ink":"#05204C"}}'::jsonb, null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F9 — Aluna do Programa (90 dias)'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 3);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 4, 'wait', null, '{}'::jsonb, 1440
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F9 — Aluna do Programa (90 dias)'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 4);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 5, 'action', 'send_email', '{"subject":"O teu ponto de partida","preheader":"5 minutos que vão medir os teus 90 dias.","body":"{{primeiro_nome|Olá}},\n\nAntes de começarmos, precisamos do teu ponto de partida: preço médio, clientes por mês, seguidores e o teu objetivo para os 90 dias.\n\nSão 5 minutos e é com estes números que, no fim, vês a diferença.\n\n[Preencher o questionário]([AJUSTAR: link do questionário])\n\nPatrícia e Beatriz\nDreams Academy® — Formamos talento. Construímos referências.\n\nNão queres receber mais emails? [Anular subscrição]({{anular_subscricao}})","button":{"bg":"#B89A57","ink":"#05204C"}}'::jsonb, null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F9 — Aluna do Programa (90 dias)'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 5);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 6, 'action', 'create_task', '{"title":"Confirmar que {{nome}} preencheu o questionário de ponto de partida e guardar preco_medio_atual na ficha.","dueInMinutes":2880}'::jsonb, null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F9 — Aluna do Programa (90 dias)'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 6);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 7, 'wait', null, '{}'::jsonb, 41760
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F9 — Aluna do Programa (90 dias)'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 7);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 8, 'action', 'send_email', '{"subject":"Check-in dos 30 dias","preheader":"As mesmas perguntas do primeiro dia.","body":"{{primeiro_nome|Olá}},\n\nJá passaram 30 dias. Hora de olhar para os números: as mesmas perguntas do primeiro dia, para veres o caminho que já fizeste.\n\n[Responder ao check-in]([AJUSTAR: link do questionário])\n\nPatrícia e Beatriz\nDreams Academy® — Formamos talento. Construímos referências.\n\nNão queres receber mais emails? [Anular subscrição]({{anular_subscricao}})","button":{"bg":"#B89A57","ink":"#05204C"}}'::jsonb, null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F9 — Aluna do Programa (90 dias)'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 8);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 9, 'wait', null, '{}'::jsonb, 43200
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F9 — Aluna do Programa (90 dias)'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 9);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 10, 'action', 'send_email', '{"subject":"Check-in dos 60 dias","preheader":"Dois terços do caminho. Como estão os números?","body":"{{primeiro_nome|Olá}},\n\n60 dias. Faltam 30 e é agora que se consolida o que aprendeste.\n\nResponde ao check-in com os teus números de hoje:\n\n[Responder ao check-in]([AJUSTAR: link do questionário])\n\nPatrícia e Beatriz\nDreams Academy® — Formamos talento. Construímos referências.\n\nNão queres receber mais emails? [Anular subscrição]({{anular_subscricao}})","button":{"bg":"#B89A57","ink":"#05204C"}}'::jsonb, null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F9 — Aluna do Programa (90 dias)'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 10);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 11, 'wait', null, '{}'::jsonb, 43200
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F9 — Aluna do Programa (90 dias)'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 11);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 12, 'action', 'create_task', '{"title":"Fecho do Programa de {{nome}}: certificado, resultados antes/depois, NPS e pedido de testemunho em vídeo. No fim, pôr a tag programa:concluiu.","dueInMinutes":1440}'::jsonb, null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F9 — Aluna do Programa (90 dias)'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 12);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 13, 'action', 'send_email', '{"subject":"Os teus 90 dias","preheader":"Certificado, resultados e um último pedido.","body":"{{primeiro_nome|Olá}},\n\nChegaste ao fim dos 90 dias. Parabéns.\n\nNos próximos dias recebes o teu certificado e o resumo dos teus resultados, antes e depois.\n\nUm último pedido: de 0 a 10, quanto recomendarias o Programa a uma colega? Responde a este email com o número e uma frase.\n\nPatrícia e Beatriz\nDreams Academy® — Formamos talento. Construímos referências.\n\nNão queres receber mais emails? [Anular subscrição]({{anular_subscricao}})"}'::jsonb, null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F9 — Aluna do Programa (90 dias)'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 13);

-- DA F10 — Alumni
insert into automations (brand_id, name, trigger_type, trigger_config, status)
select (select id from brands where name ilike 'dream%academy%' order by created_at limit 1), 'DA F10 — Alumni', 'contact_tagged', jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(name) = lower('programa:concluiu')), 'stopTagIds', jsonb_build_array((select id from tags where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(name) = lower('rgpd:opt-out')), (select id from tags where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(name) = lower('estado:inativa')))) || '{"sendWindow":{"days":[1,2,3,4,5,6,7],"start":"09:00","end":"21:00","tz":"Europe/Lisbon"}}'::jsonb, 'draft'
where (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) is not null
  and not exists (select 1 from automations where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and name = 'DA F10 — Alumni');
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 1, 'action', 'update_contact', '{"fields":{"ciclo_vida":"Top"}}'::jsonb, null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F10 — Alumni'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 1);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 2, 'action', 'add_tag', '{}'::jsonb || jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(name) = lower('ciclo:top'))), null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F10 — Alumni'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 2);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 3, 'wait', null, '{}'::jsonb, 10080
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F10 — Alumni'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 3);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 4, 'action', 'send_email', '{"subject":"O teu testemunho, em 30 segundos","preheader":"Um vídeo curto ou um texto com números.","body":"{{primeiro_nome|Olá}},\n\nPassou uma semana desde o fim do Programa. Tens 30 segundos para nós?\n\nGrava um vídeo curto com o telemóvel, ou escreve três linhas em resposta a este email: onde estavas, o que mudou e um número (preço, clientes, agenda).\n\nÉ a tua história que vai ajudar a próxima aluna a decidir.\n\nPatrícia e Beatriz\nDreams Academy® — Formamos talento. Construímos referências.\n\nNão queres receber mais emails? [Anular subscrição]({{anular_subscricao}})"}'::jsonb, null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F10 — Alumni'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 4);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 5, 'wait', null, '{}'::jsonb, 33120
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F10 — Alumni'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 5);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 6, 'action', 'send_email', '{"subject":"Um mês depois, onde estás?","preheader":"As mesmas perguntas do primeiro dia.","body":"{{primeiro_nome|Olá}},\n\nUm mês depois do fim do Programa, queremos saber onde estás. As mesmas perguntas do diagnóstico, para fecharmos o teu antes e depois.\n\n[Responder]([AJUSTAR: link do questionário])\n\nPatrícia e Beatriz\nDreams Academy® — Formamos talento. Construímos referências.\n\nNão queres receber mais emails? [Anular subscrição]({{anular_subscricao}})","button":{"bg":"#B89A57","ink":"#05204C"}}'::jsonb, null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F10 — Alumni'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 6);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 7, 'wait', null, '{}'::jsonb, 21600
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F10 — Alumni'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 7);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 8, 'action', 'send_email', '{"subject":"Indica uma colega","preheader":"As duas recebem um bónus.","body":"{{primeiro_nome|Olá}},\n\nConheces uma colega que precisa do que tu tiveste nestes 90 dias?\n\nIndica-a. Se ela entrar no Programa, recebem as duas [AJUSTAR: bónus do programa de embaixadoras].\n\nBasta responderes a este email com o nome e o contacto dela, ou pedires-lhe que diga o teu nome na candidatura.\n\nPatrícia e Beatriz\nDreams Academy® — Formamos talento. Construímos referências.\n\nNão queres receber mais emails? [Anular subscrição]({{anular_subscricao}})"}'::jsonb, null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F10 — Alumni'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 8);

-- DA F11 — Lista de espera: Coloração avançada
insert into automations (brand_id, name, trigger_type, trigger_config, status)
select (select id from brands where name ilike 'dream%academy%' order by created_at limit 1), 'DA F11 — Lista de espera: Coloração avançada', 'contact_tagged', jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(name) = lower('lm:espera-coloracao')), 'stopTagIds', jsonb_build_array((select id from tags where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(name) = lower('rgpd:opt-out')), (select id from tags where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(name) = lower('estado:inativa')))), 'draft'
where (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) is not null
  and not exists (select 1 from automations where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and name = 'DA F11 — Lista de espera: Coloração avançada');
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 1, 'action', 'send_email', '{"subject":"Estás na lista","preheader":"Vais saber da Coloração avançada antes de toda a gente.","body":"{{primeiro_nome|Olá}},\n\nEstás na lista de espera da Coloração avançada.\n\nO curso ainda está a ser preparado pela Patrícia, com o mesmo cuidado de sempre: técnica explicada passo a passo, para aplicares com segurança.\n\nQuando abrir, vais saber antes de toda a gente e tens 48 horas de acesso exclusivo antes do público.\n\nPatrícia\nDreams Academy® — Formamos talento. Construímos referências.\n\nNão queres receber mais emails? [Anular subscrição]({{anular_subscricao}})","sendNow":true}'::jsonb, null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F11 — Lista de espera: Coloração avançada'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 1);

-- DA F11 — Lista de espera: Corte com estrutura
insert into automations (brand_id, name, trigger_type, trigger_config, status)
select (select id from brands where name ilike 'dream%academy%' order by created_at limit 1), 'DA F11 — Lista de espera: Corte com estrutura', 'contact_tagged', jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(name) = lower('lm:espera-corte')), 'stopTagIds', jsonb_build_array((select id from tags where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(name) = lower('rgpd:opt-out')), (select id from tags where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(name) = lower('estado:inativa')))), 'draft'
where (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) is not null
  and not exists (select 1 from automations where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and name = 'DA F11 — Lista de espera: Corte com estrutura');
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 1, 'action', 'send_email', '{"subject":"Estás na lista","preheader":"Vais saber da Corte com estrutura antes de toda a gente.","body":"{{primeiro_nome|Olá}},\n\nEstás na lista de espera da Corte com estrutura.\n\nO curso ainda está a ser preparado pela Patrícia, com o mesmo cuidado de sempre: técnica explicada passo a passo, para aplicares com segurança.\n\nQuando abrir, vais saber antes de toda a gente e tens 48 horas de acesso exclusivo antes do público.\n\nPatrícia\nDreams Academy® — Formamos talento. Construímos referências.\n\nNão queres receber mais emails? [Anular subscrição]({{anular_subscricao}})","sendNow":true}'::jsonb, null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F11 — Lista de espera: Corte com estrutura'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 1);

-- DA F11 — Lista de espera: Formação técnica completa
insert into automations (brand_id, name, trigger_type, trigger_config, status)
select (select id from brands where name ilike 'dream%academy%' order by created_at limit 1), 'DA F11 — Lista de espera: Formação técnica completa', 'contact_tagged', jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(name) = lower('lm:espera-formacao-completa')), 'stopTagIds', jsonb_build_array((select id from tags where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(name) = lower('rgpd:opt-out')), (select id from tags where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(name) = lower('estado:inativa')))), 'draft'
where (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) is not null
  and not exists (select 1 from automations where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and name = 'DA F11 — Lista de espera: Formação técnica completa');
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 1, 'action', 'send_email', '{"subject":"Estás na lista","preheader":"Vais saber da Formação técnica completa antes de toda a gente.","body":"{{primeiro_nome|Olá}},\n\nEstás na lista de espera da Formação técnica completa.\n\nO curso ainda está a ser preparado pela Patrícia, com o mesmo cuidado de sempre: técnica explicada passo a passo, para aplicares com segurança.\n\nQuando abrir, vais saber antes de toda a gente e tens 48 horas de acesso exclusivo antes do público.\n\nPatrícia\nDreams Academy® — Formamos talento. Construímos referências.\n\nNão queres receber mais emails? [Anular subscrição]({{anular_subscricao}})","sendNow":true}'::jsonb, null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F11 — Lista de espera: Formação técnica completa'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 1);

-- DA F12a — Reembolso Hotmart
insert into automations (brand_id, name, trigger_type, trigger_config, status)
select (select id from brands where name ilike 'dream%academy%' order by created_at limit 1), 'DA F12a — Reembolso Hotmart', 'contact_tagged', jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(name) = lower('evento:reembolso')), 'stopTagIds', jsonb_build_array((select id from tags where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(name) = lower('rgpd:opt-out')))) || '{"singleRun":true,"sendWindow":{"days":[1,2,3,4,5,6,7],"start":"09:00","end":"21:00","tz":"Europe/Lisbon"}}'::jsonb, 'draft'
where (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) is not null
  and not exists (select 1 from automations where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and name = 'DA F12a — Reembolso Hotmart');
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 1, 'action', 'add_tag', '{}'::jsonb || jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(name) = lower('pausa:ofertas'))), null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F12a — Reembolso Hotmart'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 1);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 2, 'wait', null, '{}'::jsonb, 1440
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F12a — Reembolso Hotmart'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 2);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 3, 'action', 'send_email', '{"subject":"O que não funcionou para ti?","preheader":"Uma pergunta para aprendermos, sem venda.","body":"{{primeiro_nome|Olá}},\n\nVimos que pediste o reembolso do {{ultimo_reembolso_nome|produto}}. Está tudo tratado pela Hotmart.\n\nSó uma pergunta, para aprendermos: o que não funcionou para ti? Uma linha em resposta a este email ajuda-nos muito.\n\nNão há venda nenhuma aqui.\n\nPatrícia e Beatriz\nDreams Academy® — Formamos talento. Construímos referências.\n\nNão queres receber mais emails? [Anular subscrição]({{anular_subscricao}})"}'::jsonb, null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F12a — Reembolso Hotmart'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 3);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 4, 'wait', null, '{}'::jsonb, 84960
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F12a — Reembolso Hotmart'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 4);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 5, 'action', 'remove_tag', '{}'::jsonb || jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(name) = lower('pausa:ofertas'))), null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F12a — Reembolso Hotmart'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 5);

-- DA F12b — Resgate de perdidas no Programa
insert into automations (brand_id, name, trigger_type, trigger_config, status)
select (select id from brands where name ilike 'dream%academy%' order by created_at limit 1), 'DA F12b — Resgate de perdidas no Programa', 'deal_stage_changed', jsonb_build_object('stageId', (select id from pipeline_stages where pipeline_id = (select id from pipelines where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and name = 'Programa Dreams Academy' limit 1) and name = 'Perdida' limit 1), 'stopTagIds', jsonb_build_array((select id from tags where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(name) = lower('rgpd:opt-out')), (select id from tags where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(name) = lower('estado:inativa')), (select id from tags where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(name) = lower('programa:inscrita')))) || '{"singleRun":true,"sendWindow":{"days":[1,2,3,4,5,6,7],"start":"09:00","end":"21:00","tz":"Europe/Lisbon"}}'::jsonb, 'draft'
where (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) is not null
  and not exists (select 1 from automations where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and name = 'DA F12b — Resgate de perdidas no Programa');
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 1, 'wait', null, '{}'::jsonb, 43200
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F12b — Resgate de perdidas no Programa'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 1);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 2, 'action', 'send_email', '{"subject":"Um primeiro passo mais leve","preheader":"Para começares já, ao teu ritmo.","body":"{{primeiro_nome|Olá}},\n\nPercebemos que o Programa não era o passo certo agora, e está tudo bem.\n\nSe quiseres começar por um passo mais leve, ao teu ritmo, este é o ponto de partida que recomendamos para ti:\n\n[Guia Anti-Erros (27€)]({{clique:int:clicou-anti-erros|link_anti_erros}})\n\nPatrícia e Beatriz\nDreams Academy® — Formamos talento. Construímos referências.\n\nNão queres receber mais emails? [Anular subscrição]({{anular_subscricao}})","requireConsent":true,"button":{"bg":"#B89A57","ink":"#05204C"},"onlyIf":[{"field":"motivo_perda","equals":"Preço"},{"field":"trilho","equals":"Técnica"}]}'::jsonb, null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F12b — Resgate de perdidas no Programa'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 2);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 3, 'action', 'send_email', '{"subject":"Um primeiro passo mais leve","preheader":"Para começares já, ao teu ritmo.","body":"{{primeiro_nome|Olá}},\n\nPercebemos que o Programa não era o passo certo agora, e está tudo bem.\n\nSe quiseres começar por um passo mais leve, ao teu ritmo, este é o ponto de partida que recomendamos para ti:\n\n[Do Invisível ao Inesquecível (27€)]({{clique:int:clicou-invisivel|link_invisivel}})\n\nPatrícia e Beatriz\nDreams Academy® — Formamos talento. Construímos referências.\n\nNão queres receber mais emails? [Anular subscrição]({{anular_subscricao}})","requireConsent":true,"button":{"bg":"#B89A57","ink":"#05204C"},"onlyIf":[{"field":"motivo_perda","equals":"Preço"},{"field":"trilho","notEquals":"Técnica"}]}'::jsonb, null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F12b — Resgate de perdidas no Programa'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 3);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 4, 'action', 'send_email', '{"subject":"Guardámos o teu lugar na fila","preheader":"Vais saber da próxima entrada antes de todas.","body":"{{primeiro_nome|Olá}},\n\nDisseste-nos que agora não era o momento. Faz sentido.\n\nFicaste na nossa lista prioritária: quando abrirmos a próxima entrada do Programa, sabes antes de toda a gente e podes candidatar-te 48 horas antes.\n\nAté lá, continuamos a escrever-te todas as semanas.\n\nPatrícia e Beatriz\nDreams Academy® — Formamos talento. Construímos referências.\n\nNão queres receber mais emails? [Anular subscrição]({{anular_subscricao}})","requireConsent":true,"button":{"bg":"#B89A57","ink":"#05204C"},"onlyIf":{"field":"motivo_perda","notEquals":"Preço"}}'::jsonb, null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F12b — Resgate de perdidas no Programa'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 4);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 5, 'action', 'add_tag', '{"onlyIf":{"field":"motivo_perda","notEquals":"Preço"}}'::jsonb || jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(name) = lower('programa:lista-espera'))), null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F12b — Resgate de perdidas no Programa'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 5);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 6, 'wait', null, '{}'::jsonb, 43200
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F12b — Resgate de perdidas no Programa'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 6);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 7, 'action', 'send_email', '{"subject":"Como estão as coisas?","preheader":"Uma pergunta, dois meses depois.","body":"{{primeiro_nome|Olá}},\n\nJá passaram dois meses desde a nossa conversa. Como estão as coisas?\n\nResponde a este email com uma linha. Se o momento mudou, conversamos outra vez.\n\nBeatriz\n\nNão queres receber mais emails? [Anular subscrição]({{anular_subscricao}})","requireConsent":true}'::jsonb, null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F12b — Resgate de perdidas no Programa'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 7);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 8, 'wait', null, '{}'::jsonb, 43200
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F12b — Resgate de perdidas no Programa'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 8);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 9, 'action', 'add_tag', '{}'::jsonb || jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(name) = lower('programa:lista-espera'))), null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F12b — Resgate de perdidas no Programa'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 9);

-- DA F12c — Reativação de frias (60 dias)
insert into automations (brand_id, name, trigger_type, trigger_config, status)
select (select id from brands where name ilike 'dream%academy%' order by created_at limit 1), 'DA F12c — Reativação de frias (60 dias)', 'contact_tagged', jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(name) = lower('estado:fria')), 'stopTagIds', jsonb_build_array((select id from tags where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(name) = lower('rgpd:opt-out'))), 'stopIfTaggedAfterStartIds', jsonb_build_array((select id from tags where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(name) = lower('int:quero-continuar')), (select id from tags where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(name) = lower('cenario:a')), (select id from tags where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(name) = lower('cenario:b')), (select id from tags where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(name) = lower('cenario:ambos')), (select id from tags where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(name) = lower('evento:compra')))) || '{"singleRun":true,"sendWindow":{"days":[1,2,3,4,5,6,7],"start":"09:00","end":"21:00","tz":"Europe/Lisbon"}}'::jsonb, 'draft'
where (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) is not null
  and not exists (select 1 from automations where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and name = 'DA F12c — Reativação de frias (60 dias)');
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 1, 'action', 'send_email', '{"subject":"Ainda estás aí?","preheader":"Há algum tempo que não sabemos de ti.","body":"{{primeiro_nome|Olá}},\n\nHá algum tempo que não abres os nossos emails. Está tudo bem?\n\nSe ainda queres receber as nossas ideias sobre técnica e negócio, basta um clique:\n\n[Sim, quero continuar]({{clique:int:quero-continuar}})\n\nPatrícia e Beatriz\nDreams Academy® — Formamos talento. Construímos referências.\n\nNão queres receber mais emails? [Anular subscrição]({{anular_subscricao}})","requireConsent":true,"button":{"bg":"#B89A57","ink":"#05204C"}}'::jsonb, null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F12c — Reativação de frias (60 dias)'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 1);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 2, 'wait', null, '{}'::jsonb, 7200
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F12c — Reativação de frias (60 dias)'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 2);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 3, 'action', 'send_email', '{"subject":"Mudaste de fase?","preheader":"Diz-nos o que te falta agora.","body":"{{primeiro_nome|Olá}},\n\nTalvez tenhas mudado de fase e o que te escrevemos já não te sirva. Diz-nos o que te falta agora:\n\n[Segurança técnica]({{clique:cenario:a}})\n\n[Marca, clientes e vendas]({{clique:cenario:b}})\n\n[As duas coisas]({{clique:cenario:ambos}})\n\nPatrícia e Beatriz\nDreams Academy® — Formamos talento. Construímos referências.\n\nNão queres receber mais emails? [Anular subscrição]({{anular_subscricao}})","requireConsent":true}'::jsonb, null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F12c — Reativação de frias (60 dias)'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 3);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 4, 'wait', null, '{}'::jsonb, 14400
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F12c — Reativação de frias (60 dias)'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 4);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 5, 'action', 'send_email', '{"subject":"Posso deixar de te escrever?","preheader":"Sem ressentimentos. Só não queremos encher-te o email.","body":"{{primeiro_nome|Olá}},\n\nNão queremos encher-te o email com coisas que não lês.\n\nSe ainda queres receber notícias da Dreams Academy, [clica aqui]({{clique:int:quero-continuar}}).\n\nSe não clicares, deixamos de te escrever daqui a umas semanas. Sem ressentimentos.\n\nPatrícia e Beatriz\n\nNão queres receber mais emails? [Anular subscrição]({{anular_subscricao}})","requireConsent":true}'::jsonb, null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F12c — Reativação de frias (60 dias)'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 5);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 6, 'wait', null, '{}'::jsonb, 64800
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F12c — Reativação de frias (60 dias)'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 6);
insert into automation_steps (brand_id, automation_id, position, type, action_type, config, wait_minutes)
select a.brand_id, a.id, 7, 'action', 'add_tag', '{}'::jsonb || jsonb_build_object('tagId', (select id from tags where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and lower(name) = lower('estado:inativa'))), null
from automations a
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name = 'DA F12c — Reativação de frias (60 dias)'
  and not exists (select 1 from automation_steps s where s.automation_id = a.id and s.position = 7);

-- 6. Campanhas em rascunho (Email → Campanhas).
insert into email_campaigns (brand_id, name, subject, body_html, status)
select (select id from brands where name ilike 'dream%academy%' order by created_at limit 1), 'Referência #1 (newsletter)', 'O erro que estraga 1 em cada 3 colorações', '<div style="background:#ffffff;padding:32px 16px"><div style="max-width:600px;margin:0 auto;font-family:Inter,Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#1F2430"><p style="margin:0 0 18px">{{primeiro_nome|Olá}},</p><h1 style="margin:0 0 20px;font-family:''Playfair Display'',Georgia,serif;font-size:26px;line-height:1.25;color:#05204C;font-weight:700">O diagnóstico vem antes da cor</h1><p style="margin:0 0 18px">[AJUSTAR: ideia central da semana, até 300 palavras. Pilar 1, autoridade técnica: uma técnica explicada e o erro comum.]</p><p style="margin:0 0 18px"><strong>A dica para amanhã:</strong> antes da próxima coloração, pergunta à cliente o que fez ao cabelo nos últimos 12 meses e anota na ficha dela.</p><p style="margin:0 0 18px"><strong>Agenda Dreams:</strong> [AJUSTAR: lote aberto, produto em destaque do trilho da semana ou próxima entrada no Programa]</p><p style="margin:28px 0"><a href="https://www.instagram.com/dreamsacademy.pt/" style="display:inline-block;background:#B89A57;color:#05204C;text-decoration:none;font-family:Inter,Arial,sans-serif;font-weight:600;font-size:15px;padding:13px 24px;border-radius:3px">AJUSTAR: texto do botão</a></p><p style="margin:0 0 18px">Patrícia e Beatriz</p><p style="margin:36px 0 0;padding-top:16px;border-top:1px solid #E6E2DA;font-size:12.5px;color:#7A7468">Dreams Academy® — Formamos talento. Construímos referências.<br>Recebes este email porque te inscreveste na Dreams Academy. <a href="{{anular_subscricao}}" style="color:#7A7468">Anular subscrição</a></p></div></div>', 'draft'
where (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) is not null
  and not exists (select 1 from email_campaigns where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and name = 'Referência #1 (newsletter)');
insert into email_campaigns (brand_id, name, subject, body_html, status)
select (select id from brands where name ilike 'dream%academy%' order by created_at limit 1), 'C1.1 Ondas — aquecer (-7 dias)', 'Porque é que o brushing não dura', '<div style="background:#ffffff;padding:32px 16px"><div style="max-width:600px;margin:0 auto;font-family:Inter,Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#1F2430"><p style="margin:0 0 18px">{{primeiro_nome|Olá}},</p><h1 style="margin:0 0 20px;font-family:''Playfair Display'',Georgia,serif;font-size:26px;line-height:1.25;color:#05204C;font-weight:700">Porque é que o brushing da tua cliente não dura</h1><p style="margin:0 0 18px">Ela sai do salão perfeita. Dois dias depois, liga a dizer que o cabelo "caiu".</p><p style="margin:0 0 18px">Não é falta de produto nem de jeito. É biomecânica: a forma como o fio é aquecido, arrefecido e fixado decide quanto tempo a onda aguenta.</p><p style="margin:0 0 18px">[AJUSTAR: explicação curta da Patrícia, em linguagem simples]</p><p style="margin:0 0 18px">Daqui a uma semana abrimos a Ondas que Fidelizam, a masterclass onde te mostro isto passo a passo.</p><p style="margin:0 0 18px">Patrícia</p><p style="margin:36px 0 0;padding-top:16px;border-top:1px solid #E6E2DA;font-size:12.5px;color:#7A7468">Dreams Academy® — Formamos talento. Construímos referências.<br>Recebes este email porque te inscreveste na Dreams Academy. <a href="{{anular_subscricao}}" style="color:#7A7468">Anular subscrição</a></p></div></div>', 'draft'
where (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) is not null
  and not exists (select 1 from email_campaigns where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and name = 'C1.1 Ondas — aquecer (-7 dias)');
insert into email_campaigns (brand_id, name, subject, body_html, status)
select (select id from brands where name ilike 'dream%academy%' order by created_at limit 1), 'C1.2 Ondas — lista VIP (-3 dias)', 'Abre dia [AJUSTAR]: 20 vagas a 57€', '<div style="background:#ffffff;padding:32px 16px"><div style="max-width:600px;margin:0 auto;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#1F2430"><p style="margin:0 0 18px">{{primeiro_nome|Olá}},</p><p style="margin:0 0 18px">A Ondas que Fidelizam abre dia [AJUSTAR: data], com 20 vagas a 57€ no lote Early Bird.</p><p style="margin:0 0 18px">Queres ser avisada 1 hora antes de toda a gente? Responde a este email com a palavra QUERO.</p><p style="margin:0 0 18px">Patrícia</p><p style="margin:36px 0 0;padding-top:16px;border-top:1px solid #E6E2DA;font-size:12.5px;color:#7A7468">Dreams Academy® — Formamos talento. Construímos referências.<br>Recebes este email porque te inscreveste na Dreams Academy. <a href="{{anular_subscricao}}" style="color:#7A7468">Anular subscrição</a></p></div></div>', 'draft'
where (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) is not null
  and not exists (select 1 from email_campaigns where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and name = 'C1.2 Ondas — lista VIP (-3 dias)');
insert into email_campaigns (brand_id, name, subject, body_html, status)
select (select id from brands where name ilike 'dream%academy%' order by created_at limit 1), 'C1.3 Ondas — Early Bird aberto (dia 0)', 'Early Bird aberto: Ondas que Fidelizam', '<div style="background:#ffffff;padding:32px 16px"><div style="max-width:600px;margin:0 auto;font-family:Inter,Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#1F2430"><p style="margin:0 0 18px">{{primeiro_nome|Olá}},</p><h1 style="margin:0 0 20px;font-family:''Playfair Display'',Georgia,serif;font-size:26px;line-height:1.25;color:#05204C;font-weight:700">O Early Bird está aberto</h1><p style="margin:0 0 18px">A Ondas que Fidelizam está aberta, com 20 vagas a 57€.</p><p style="margin:0 0 18px">1 hora de masterclass, 12 meses de acesso, e os bónus: guia em PDF, checklist "7 Alertas" e uma aula extra para cabelo fino e grosso.</p><p style="margin:0 0 18px">Tens 15 dias de garantia pela Hotmart.</p><p style="margin:28px 0"><a href="{{clique:int:clicou-ondas|link_ondas}}" style="display:inline-block;background:#B89A57;color:#05204C;text-decoration:none;font-family:Inter,Arial,sans-serif;font-weight:600;font-size:15px;padding:13px 24px;border-radius:3px">Garantir o Early Bird</a></p><p style="margin:0 0 18px">Patrícia</p><p style="margin:36px 0 0;padding-top:16px;border-top:1px solid #E6E2DA;font-size:12.5px;color:#7A7468">Dreams Academy® — Formamos talento. Construímos referências.<br>Recebes este email porque te inscreveste na Dreams Academy. <a href="{{anular_subscricao}}" style="color:#7A7468">Anular subscrição</a></p></div></div>', 'draft'
where (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) is not null
  and not exists (select 1 from email_campaigns where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and name = 'C1.3 Ondas — Early Bird aberto (dia 0)');
insert into email_campaigns (brand_id, name, subject, body_html, status)
select (select id from brands where name ilike 'dream%academy%' order by created_at limit 1), 'C1.4 Ondas — prova (+2 dias)', 'Ondas que duram até 72 horas', '<div style="background:#ffffff;padding:32px 16px"><div style="max-width:600px;margin:0 auto;font-family:Inter,Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#1F2430"><p style="margin:0 0 18px">{{primeiro_nome|Olá}},</p><h1 style="margin:0 0 20px;font-family:''Playfair Display'',Georgia,serif;font-size:26px;line-height:1.25;color:#05204C;font-weight:700">Ondas que duram até 72 horas</h1><p style="margin:0 0 18px">É a promessa da masterclass, e não é exagero: é técnica.</p><p style="margin:0 0 18px">[AJUSTAR: link ou descrição do vídeo curto de demonstração]</p><p style="margin:28px 0"><a href="{{clique:int:clicou-ondas|link_ondas}}" style="display:inline-block;background:#B89A57;color:#05204C;text-decoration:none;font-family:Inter,Arial,sans-serif;font-weight:600;font-size:15px;padding:13px 24px;border-radius:3px">Ver a Ondas que Fidelizam</a></p><p style="margin:0 0 18px">Patrícia</p><p style="margin:36px 0 0;padding-top:16px;border-top:1px solid #E6E2DA;font-size:12.5px;color:#7A7468">Dreams Academy® — Formamos talento. Construímos referências.<br>Recebes este email porque te inscreveste na Dreams Academy. <a href="{{anular_subscricao}}" style="color:#7A7468">Anular subscrição</a></p></div></div>', 'draft'
where (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) is not null
  and not exists (select 1 from email_campaigns where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and name = 'C1.4 Ondas — prova (+2 dias)');
insert into email_campaigns (brand_id, name, subject, body_html, status)
select (select id from brands where name ilike 'dream%academy%' order by created_at limit 1), 'C1.5 Ondas — restam 5 vagas', 'Restam 5 vagas a 57€', '<div style="background:#ffffff;padding:32px 16px"><div style="max-width:600px;margin:0 auto;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#1F2430"><p style="margin:0 0 18px">{{primeiro_nome|Olá}},</p><p style="margin:0 0 18px">Restam 5 vagas no lote Early Bird da Ondas que Fidelizam, a 57€. Depois passa para 95€.</p><p style="margin:0 0 18px"><a href="{{clique:int:clicou-ondas|link_ondas}}" style="color:#05204C">Garantir uma das 5 vagas</a></p><p style="margin:0 0 18px">Patrícia</p><p style="margin:36px 0 0;padding-top:16px;border-top:1px solid #E6E2DA;font-size:12.5px;color:#7A7468">Dreams Academy® — Formamos talento. Construímos referências.<br>Recebes este email porque te inscreveste na Dreams Academy. <a href="{{anular_subscricao}}" style="color:#7A7468">Anular subscrição</a></p></div></div>', 'draft'
where (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) is not null
  and not exists (select 1 from email_campaigns where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and name = 'C1.5 Ondas — restam 5 vagas');
insert into email_campaigns (brand_id, name, subject, body_html, status)
select (select id from brands where name ilike 'dream%academy%' order by created_at limit 1), 'C1.6 Ondas — lote 2', 'O Early Bird esgotou', '<div style="background:#ffffff;padding:32px 16px"><div style="max-width:600px;margin:0 auto;font-family:Inter,Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#1F2430"><p style="margin:0 0 18px">{{primeiro_nome|Olá}},</p><h1 style="margin:0 0 20px;font-family:''Playfair Display'',Georgia,serif;font-size:26px;line-height:1.25;color:#05204C;font-weight:700">O Early Bird esgotou</h1><p style="margin:0 0 18px">20 profissionais já estão dentro da Ondas que Fidelizam.</p><p style="margin:0 0 18px">O lote 2 está aberto, com 20 vagas a 95€. Os bónus mantêm-se, e a garantia de 15 dias também.</p><p style="margin:28px 0"><a href="{{clique:int:clicou-ondas|link_ondas}}" style="display:inline-block;background:#B89A57;color:#05204C;text-decoration:none;font-family:Inter,Arial,sans-serif;font-weight:600;font-size:15px;padding:13px 24px;border-radius:3px">Entrar no lote 2</a></p><p style="margin:0 0 18px">Patrícia</p><p style="margin:36px 0 0;padding-top:16px;border-top:1px solid #E6E2DA;font-size:12.5px;color:#7A7468">Dreams Academy® — Formamos talento. Construímos referências.<br>Recebes este email porque te inscreveste na Dreams Academy. <a href="{{anular_subscricao}}" style="color:#7A7468">Anular subscrição</a></p></div></div>', 'draft'
where (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) is not null
  and not exists (select 1 from email_campaigns where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and name = 'C1.6 Ondas — lote 2');
insert into email_campaigns (brand_id, name, subject, body_html, status)
select (select id from brands where name ilike 'dream%academy%' order by created_at limit 1), 'C1.7 Ondas — objeção (+2 do lote 2)', '"E se não resultar comigo?"', '<div style="background:#ffffff;padding:32px 16px"><div style="max-width:600px;margin:0 auto;font-family:Inter,Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#1F2430"><p style="margin:0 0 18px">{{primeiro_nome|Olá}},</p><h1 style="margin:0 0 20px;font-family:''Playfair Display'',Georgia,serif;font-size:26px;line-height:1.25;color:#05204C;font-weight:700">"E se não resultar comigo?"</h1><p style="margin:0 0 18px">Se aplicares o método e não resultar, tens duas coisas: o reembolso nos 15 dias de garantia e uma sessão de diagnóstico personalizada comigo para percebermos porquê.</p><p style="margin:0 0 18px">O risco é nosso.</p><p style="margin:28px 0"><a href="{{clique:int:clicou-ondas|link_ondas}}" style="display:inline-block;background:#B89A57;color:#05204C;text-decoration:none;font-family:Inter,Arial,sans-serif;font-weight:600;font-size:15px;padding:13px 24px;border-radius:3px">Ver a Ondas que Fidelizam</a></p><p style="margin:0 0 18px">Patrícia</p><p style="margin:36px 0 0;padding-top:16px;border-top:1px solid #E6E2DA;font-size:12.5px;color:#7A7468">Dreams Academy® — Formamos talento. Construímos referências.<br>Recebes este email porque te inscreveste na Dreams Academy. <a href="{{anular_subscricao}}" style="color:#7A7468">Anular subscrição</a></p></div></div>', 'draft'
where (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) is not null
  and not exists (select 1 from email_campaigns where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and name = 'C1.7 Ondas — objeção (+2 do lote 2)');
insert into email_campaigns (brand_id, name, subject, body_html, status)
select (select id from brands where name ilike 'dream%academy%' order by created_at limit 1), 'C1.8 Ondas — último lote', 'Últimas 10 vagas', '<div style="background:#ffffff;padding:32px 16px"><div style="max-width:600px;margin:0 auto;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#1F2430"><p style="margin:0 0 18px">{{primeiro_nome|Olá}},</p><p style="margin:0 0 18px">Abri o último lote da Ondas que Fidelizam: 10 vagas, a 190€. Depois disto, fecha.</p><p style="margin:0 0 18px">Se querias entrar e foste adiando, <a href="{{clique:int:clicou-ondas|link_ondas}}" style="color:#05204C">é agora</a>.</p><p style="margin:0 0 18px">Patrícia</p><p style="margin:36px 0 0;padding-top:16px;border-top:1px solid #E6E2DA;font-size:12.5px;color:#7A7468">Dreams Academy® — Formamos talento. Construímos referências.<br>Recebes este email porque te inscreveste na Dreams Academy. <a href="{{anular_subscricao}}" style="color:#7A7468">Anular subscrição</a></p></div></div>', 'draft'
where (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) is not null
  and not exists (select 1 from email_campaigns where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and name = 'C1.8 Ondas — último lote');
insert into email_campaigns (brand_id, name, subject, body_html, status)
select (select id from brands where name ilike 'dream%academy%' order by created_at limit 1), 'C2.1 Programa — aquecer (-14 dias)', 'O que ninguém te ensinou no curso', '<div style="background:#ffffff;padding:32px 16px"><div style="max-width:600px;margin:0 auto;font-family:Inter,Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#1F2430"><p style="margin:0 0 18px">{{primeiro_nome|Olá}},</p><h1 style="margin:0 0 20px;font-family:''Playfair Display'',Georgia,serif;font-size:26px;line-height:1.25;color:#05204C;font-weight:700">O que ninguém te ensinou no curso de cabeleireira</h1><p style="margin:0 0 18px">Ensinaram-te a cortar, a pintar, a fazer brushing. Não te ensinaram a cobrar pelo que sabes.</p><p style="margin:0 0 18px">O erro de posicionamento mais caro é este: [AJUSTAR: o erro, explicado em 3 parágrafos curtos]</p><p style="margin:0 0 18px">Daqui a duas semanas temos novidades.</p><p style="margin:0 0 18px">Patrícia e Beatriz</p><p style="margin:36px 0 0;padding-top:16px;border-top:1px solid #E6E2DA;font-size:12.5px;color:#7A7468">Dreams Academy® — Formamos talento. Construímos referências.<br>Recebes este email porque te inscreveste na Dreams Academy. <a href="{{anular_subscricao}}" style="color:#7A7468">Anular subscrição</a></p></div></div>', 'draft'
where (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) is not null
  and not exists (select 1 from email_campaigns where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and name = 'C2.1 Programa — aquecer (-14 dias)');
insert into email_campaigns (brand_id, name, subject, body_html, status)
select (select id from brands where name ilike 'dream%academy%' order by created_at limit 1), 'C2.2 Programa — cenário A ou B (-10 dias)', 'Cenário A ou cenário B?', '<div style="background:#ffffff;padding:32px 16px"><div style="max-width:600px;margin:0 auto;font-family:Inter,Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#1F2430"><p style="margin:0 0 18px">{{primeiro_nome|Olá}},</p><h1 style="margin:0 0 20px;font-family:''Playfair Display'',Georgia,serif;font-size:26px;line-height:1.25;color:#05204C;font-weight:700">Cenário A ou cenário B?</h1><p style="margin:0 0 18px">Quase todas as profissionais que nos procuram estão num de dois cenários.</p><p style="margin:0 0 18px">Cenário A: falta-te base técnica. Cada cliente nova é um risco.<br>Cenário B: a técnica está lá, falta-te negócio. Clientes certas, preço certo, agenda cheia.</p><p style="margin:0 0 18px">Qual é o teu? Um clique chega:</p><p style="margin:28px 0"><a href="{{clique:cenario:a}}" style="display:inline-block;background:#B89A57;color:#05204C;text-decoration:none;font-family:Inter,Arial,sans-serif;font-weight:600;font-size:15px;padding:13px 24px;border-radius:3px">Cenário A</a></p><p style="margin:28px 0"><a href="{{clique:cenario:b}}" style="display:inline-block;background:#B89A57;color:#05204C;text-decoration:none;font-family:Inter,Arial,sans-serif;font-weight:600;font-size:15px;padding:13px 24px;border-radius:3px">Cenário B</a></p><p style="margin:0 0 18px">Patrícia e Beatriz</p><p style="margin:36px 0 0;padding-top:16px;border-top:1px solid #E6E2DA;font-size:12.5px;color:#7A7468">Dreams Academy® — Formamos talento. Construímos referências.<br>Recebes este email porque te inscreveste na Dreams Academy. <a href="{{anular_subscricao}}" style="color:#7A7468">Anular subscrição</a></p></div></div>', 'draft'
where (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) is not null
  and not exists (select 1 from email_campaigns where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and name = 'C2.2 Programa — cenário A ou B (-10 dias)');
insert into email_campaigns (brand_id, name, subject, body_html, status)
select (select id from brands where name ilike 'dream%academy%' order by created_at limit 1), 'C2.3 Programa — lista prioritária (-7 dias)', 'Vagas abrem dia [AJUSTAR]', '<div style="background:#ffffff;padding:32px 16px"><div style="max-width:600px;margin:0 auto;font-family:Inter,Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#1F2430"><p style="margin:0 0 18px">{{primeiro_nome|Olá}},</p><h1 style="margin:0 0 20px;font-family:''Playfair Display'',Georgia,serif;font-size:26px;line-height:1.25;color:#05204C;font-weight:700">As vagas do Programa abrem dia [AJUSTAR: data]</h1><p style="margin:0 0 18px">Compradoras e lista de espera podem candidatar-se 48 horas antes de toda a gente.</p><p style="margin:0 0 18px">Fica atenta ao email nesse dia.</p><p style="margin:0 0 18px">Patrícia e Beatriz</p><p style="margin:36px 0 0;padding-top:16px;border-top:1px solid #E6E2DA;font-size:12.5px;color:#7A7468">Dreams Academy® — Formamos talento. Construímos referências.<br>Recebes este email porque te inscreveste na Dreams Academy. <a href="{{anular_subscricao}}" style="color:#7A7468">Anular subscrição</a></p></div></div>', 'draft'
where (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) is not null
  and not exists (select 1 from email_campaigns where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and name = 'C2.3 Programa — lista prioritária (-7 dias)');
insert into email_campaigns (brand_id, name, subject, body_html, status)
select (select id from brands where name ilike 'dream%academy%' order by created_at limit 1), 'C2.4 Programa — abertura prioritária (dia 0)', 'Candidaturas abertas, só para ti', '<div style="background:#ffffff;padding:32px 16px"><div style="max-width:600px;margin:0 auto;font-family:Inter,Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#1F2430"><p style="margin:0 0 18px">{{primeiro_nome|Olá}},</p><h1 style="margin:0 0 20px;font-family:''Playfair Display'',Georgia,serif;font-size:26px;line-height:1.25;color:#05204C;font-weight:700">As candidaturas abriram, 48 horas antes para ti</h1><p style="margin:0 0 18px">O Programa Dreams Academy são 90 dias de acompanhamento, nos 5 pilares: técnica, mentalidade, marca, conteúdo e vendas.</p><p style="margin:0 0 18px">O processo: candidatura, conversa de 20 minutos e proposta. As vagas são limitadas.</p><p style="margin:28px 0"><a href="{{clique:int:abriu-candidatura|link_candidatura}}" style="display:inline-block;background:#B89A57;color:#05204C;text-decoration:none;font-family:Inter,Arial,sans-serif;font-weight:600;font-size:15px;padding:13px 24px;border-radius:3px">Candidatar-me</a></p><p style="margin:0 0 18px">Patrícia e Beatriz</p><p style="margin:36px 0 0;padding-top:16px;border-top:1px solid #E6E2DA;font-size:12.5px;color:#7A7468">Dreams Academy® — Formamos talento. Construímos referências.<br>Recebes este email porque te inscreveste na Dreams Academy. <a href="{{anular_subscricao}}" style="color:#7A7468">Anular subscrição</a></p></div></div>', 'draft'
where (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) is not null
  and not exists (select 1 from email_campaigns where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and name = 'C2.4 Programa — abertura prioritária (dia 0)');
insert into email_campaigns (brand_id, name, subject, body_html, status)
select (select id from brands where name ilike 'dream%academy%' order by created_at limit 1), 'C2.5 Programa — abertura geral (+2 dias)', 'Candidaturas abertas: Programa Dreams', '<div style="background:#ffffff;padding:32px 16px"><div style="max-width:600px;margin:0 auto;font-family:Inter,Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#1F2430"><p style="margin:0 0 18px">{{primeiro_nome|Olá}},</p><h1 style="margin:0 0 20px;font-family:''Playfair Display'',Georgia,serif;font-size:26px;line-height:1.25;color:#05204C;font-weight:700">As candidaturas para o Programa Dreams Academy estão abertas</h1><p style="margin:0 0 18px">90 dias de acompanhamento com a Patrícia e a Beatriz, nos 5 pilares: técnica, mentalidade, marca, conteúdo e vendas.</p><p style="margin:0 0 18px">Candidatura, conversa de 20 minutos e proposta. Vagas limitadas.</p><p style="margin:28px 0"><a href="{{clique:int:viu-programa|link_programa}}" style="display:inline-block;background:#B89A57;color:#05204C;text-decoration:none;font-family:Inter,Arial,sans-serif;font-weight:600;font-size:15px;padding:13px 24px;border-radius:3px">Ver o Programa</a></p><p style="margin:0 0 18px">Patrícia e Beatriz</p><p style="margin:36px 0 0;padding-top:16px;border-top:1px solid #E6E2DA;font-size:12.5px;color:#7A7468">Dreams Academy® — Formamos talento. Construímos referências.<br>Recebes este email porque te inscreveste na Dreams Academy. <a href="{{anular_subscricao}}" style="color:#7A7468">Anular subscrição</a></p></div></div>', 'draft'
where (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) is not null
  and not exists (select 1 from email_campaigns where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and name = 'C2.5 Programa — abertura geral (+2 dias)');
insert into email_campaigns (brand_id, name, subject, body_html, status)
select (select id from brands where name ilike 'dream%academy%' order by created_at limit 1), 'C2.6 Programa — prova (+5 dias)', 'Do e-book ao Programa', '<div style="background:#ffffff;padding:32px 16px"><div style="max-width:600px;margin:0 auto;font-family:Inter,Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#1F2430"><p style="margin:0 0 18px">{{primeiro_nome|Olá}},</p><h1 style="margin:0 0 20px;font-family:''Playfair Display'',Georgia,serif;font-size:26px;line-height:1.25;color:#05204C;font-weight:700">Do e-book ao Programa</h1><p style="margin:0 0 18px">[AJUSTAR: história de quem subiu a escada, ou o percurso das fundadoras]</p><p style="margin:28px 0"><a href="{{clique:int:abriu-candidatura|link_candidatura}}" style="display:inline-block;background:#B89A57;color:#05204C;text-decoration:none;font-family:Inter,Arial,sans-serif;font-weight:600;font-size:15px;padding:13px 24px;border-radius:3px">Candidatar-me</a></p><p style="margin:0 0 18px">Patrícia e Beatriz</p><p style="margin:36px 0 0;padding-top:16px;border-top:1px solid #E6E2DA;font-size:12.5px;color:#7A7468">Dreams Academy® — Formamos talento. Construímos referências.<br>Recebes este email porque te inscreveste na Dreams Academy. <a href="{{anular_subscricao}}" style="color:#7A7468">Anular subscrição</a></p></div></div>', 'draft'
where (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) is not null
  and not exists (select 1 from email_campaigns where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and name = 'C2.6 Programa — prova (+5 dias)');
insert into email_campaigns (brand_id, name, subject, body_html, status)
select (select id from brands where name ilike 'dream%academy%' order by created_at limit 1), 'C2.7 Programa — objeções (+8 dias)', '"É caro" e "não tenho tempo"', '<div style="background:#ffffff;padding:32px 16px"><div style="max-width:600px;margin:0 auto;font-family:Inter,Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#1F2430"><p style="margin:0 0 18px">{{primeiro_nome|Olá}},</p><h1 style="margin:0 0 20px;font-family:''Playfair Display'',Georgia,serif;font-size:26px;line-height:1.25;color:#05204C;font-weight:700">"É caro" e "não tenho tempo"</h1><p style="margin:0 0 18px">É caro? Faz a conta: se daqui a 90 dias cobrares mais 10€ por serviço, com 40 clientes por mês são 400€ a mais por mês.</p><p style="margin:0 0 18px">Não tens tempo? O Programa pede algumas horas por semana, ajustadas à tua agenda.</p><p style="margin:28px 0"><a href="{{clique:int:abriu-candidatura|link_candidatura}}" style="display:inline-block;background:#B89A57;color:#05204C;text-decoration:none;font-family:Inter,Arial,sans-serif;font-weight:600;font-size:15px;padding:13px 24px;border-radius:3px">Candidatar-me</a></p><p style="margin:0 0 18px">Patrícia e Beatriz</p><p style="margin:36px 0 0;padding-top:16px;border-top:1px solid #E6E2DA;font-size:12.5px;color:#7A7468">Dreams Academy® — Formamos talento. Construímos referências.<br>Recebes este email porque te inscreveste na Dreams Academy. <a href="{{anular_subscricao}}" style="color:#7A7468">Anular subscrição</a></p></div></div>', 'draft'
where (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) is not null
  and not exists (select 1 from email_campaigns where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and name = 'C2.7 Programa — objeções (+8 dias)');
insert into email_campaigns (brand_id, name, subject, body_html, status)
select (select id from brands where name ilike 'dream%academy%' order by created_at limit 1), 'C2.8 Programa — restam vagas (+11 dias)', 'Restam [AJUSTAR] vagas', '<div style="background:#ffffff;padding:32px 16px"><div style="max-width:600px;margin:0 auto;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#1F2430"><p style="margin:0 0 18px">{{primeiro_nome|Olá}},</p><p style="margin:0 0 18px">Restam [AJUSTAR: número] vagas nesta entrada do Programa Dreams Academy.</p><p style="margin:0 0 18px"><a href="{{clique:int:abriu-candidatura|link_candidatura}}" style="color:#05204C">Candidatar-me</a></p><p style="margin:0 0 18px">Beatriz</p><p style="margin:36px 0 0;padding-top:16px;border-top:1px solid #E6E2DA;font-size:12.5px;color:#7A7468">Dreams Academy® — Formamos talento. Construímos referências.<br>Recebes este email porque te inscreveste na Dreams Academy. <a href="{{anular_subscricao}}" style="color:#7A7468">Anular subscrição</a></p></div></div>', 'draft'
where (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) is not null
  and not exists (select 1 from email_campaigns where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and name = 'C2.8 Programa — restam vagas (+11 dias)');
insert into email_campaigns (brand_id, name, subject, body_html, status)
select (select id from brands where name ilike 'dream%academy%' order by created_at limit 1), 'C2.9 Programa — último dia (+13 dias)', 'Último dia de candidaturas', '<div style="background:#ffffff;padding:32px 16px"><div style="max-width:600px;margin:0 auto;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#1F2430"><p style="margin:0 0 18px">{{primeiro_nome|Olá}},</p><p style="margin:0 0 18px">Hoje é o último dia de candidaturas para esta entrada do Programa.</p><p style="margin:0 0 18px">Se estiveste a adiar, este é o momento. Se não for agora, está tudo bem: a próxima entrada também vai existir.</p><p style="margin:0 0 18px"><a href="{{clique:int:abriu-candidatura|link_candidatura}}" style="color:#05204C">Candidatar-me</a></p><p style="margin:0 0 18px">Patrícia e Beatriz</p><p style="margin:36px 0 0;padding-top:16px;border-top:1px solid #E6E2DA;font-size:12.5px;color:#7A7468">Dreams Academy® — Formamos talento. Construímos referências.<br>Recebes este email porque te inscreveste na Dreams Academy. <a href="{{anular_subscricao}}" style="color:#7A7468">Anular subscrição</a></p></div></div>', 'draft'
where (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) is not null
  and not exists (select 1 from email_campaigns where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and name = 'C2.9 Programa — último dia (+13 dias)');

-- 7. Verificação: automações da Dreams Academy, estado e número de passos.
select a.name, a.status, count(s.id) as passos
from automations a
left join automation_steps s on s.automation_id = a.id
where a.brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1) and a.name like 'DA %'
group by a.name, a.status
order by a.name;

-- Formulários da marca: põe a tag certa em cada um (Formulários → editar → tags):
--   checklist → lm:checklist-7-erros   newsletter → lm:newsletter
--   candidatura → lm:candidatura-programa   listas de espera → lm:espera-…
select name, slug, status, on_submit_tags from forms where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1);

-- QUANDO QUISERES LIGAR OS FLUXOS COM EMAILS (depois de os reveres):
--   update automations set status = 'active'
--   where brand_id = (select id from brands where name ilike 'dream%academy%' order by created_at limit 1)
--     and name like 'DA F%' and status = 'draft';

