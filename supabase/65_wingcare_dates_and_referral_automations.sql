-- =========================================================
-- WINGCARE — automações de datas especiais e indicação (rascunho)
-- =========================================================
-- Corre isto depois do 64_date_triggers_configurable_hour.sql (e depois
-- do 61, que cria a marca WingCare e a tag "Indicada"), num único Run.
--
-- SEGURANÇA
--  - Todas ficam em status 'draft': NADA é enviado até alguém as ativar
--    no módulo Automações.
--  - Idempotente: o que já existe (mesmo nome) não duplica.
--  - Natal, Ano Novo e Aniversário usam o copy aprovado pelo cliente
--    (fluxo "datas especiais": sem oferta nem desconto). O copy do Dia
--    da Mulher e o dos fluxos de indicação são PROPOSTAS (o cliente não
--    os forneceu) — devem ser aprovados antes de ativar. Edita os passos
--    em Automações.
--  - Mensagens de texto livre por WhatsApp só chegam dentro da janela de
--    24h: fora dela é preciso template aprovado. O motor não verifica
--    consentimento nos envios: os gatilhos por data só apanham contactos
--    com consentimento; os de indicação NÃO (a pessoa indicada ainda não
--    consentiu) — por isso o fluxo "Boas-vindas — Indicada" começa por
--    uma tarefa para a equipa. Confirma o consentimento antes de ativar.
--
-- FLUXOS
--  1. Aniversário            gatilho: contact_birthday, às 10:00 (Lisboa)
--  2. Natal                  gatilho: annual_date 25/12, às 10:00
--  3. Ano Novo               gatilho: annual_date 31/12, às 18:00 — a 31 e
--                            não a 1 de janeiro porque {{ano_seguinte}} é
--                            "ano atual + 1" (a 1/jan diria o ano errado)
--  4. Dia da Mulher (8 mar)  gatilho: annual_date 08/03, às 10:00
--  5. Indicação — marcar como Indicada
--                            gatilho: contact_referred (para o indicado)
--                            → aplica a tag "Indicada"
--  6. Boas-vindas — Indicada gatilho: tag "Indicada" (aplicada pelo fluxo 5,
--                            pela entrada de leads ou à mão)
--  7. Indicação — agradecer a quem indicou
--                            gatilho: contact_referred (para quem indicou)
--
-- Os fluxos de data só apanham contactos com consentimento (requireConsent).
-- A hora (e os restantes parâmetros dos fluxos 1 a 4) muda-se em
-- Automações → abrir a automação → "Quando arranca".
-- =========================================================

create or replace function pg_temp.wd_tag_id(p_brand uuid, p_name text) returns uuid
language sql as $$
  select id from tags where brand_id = p_brand and lower(name) = lower(p_name)
$$;

create or replace function pg_temp.wd_auto(p_brand uuid, p_name text, p_trigger text, p_config jsonb) returns uuid
language plpgsql as $$
declare
  v_id uuid;
begin
  if exists (select 1 from automations where brand_id = p_brand and name = p_name) then
    return null;
  end if;
  insert into automations (brand_id, name, trigger_type, trigger_config, status)
  values (p_brand, p_name, p_trigger, p_config, 'draft')
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function pg_temp.wd_next_pos(p_auto uuid) returns int
language sql as $$
  select coalesce(max(position), 0) + 1 from automation_steps where automation_id = p_auto
$$;

create or replace function pg_temp.wd_wait(p_auto uuid, p_minutes int) returns void
language plpgsql as $$
begin
  if p_auto is null then return; end if;
  insert into automation_steps (brand_id, automation_id, position, type, wait_minutes, config)
  select brand_id, id, pg_temp.wd_next_pos(id), 'wait', p_minutes, '{}'::jsonb from automations where id = p_auto;
end;
$$;

create or replace function pg_temp.wd_wa(p_auto uuid, p_body text) returns void
language plpgsql as $$
begin
  if p_auto is null then return; end if;
  insert into automation_steps (brand_id, automation_id, position, type, action_type, config)
  select brand_id, id, pg_temp.wd_next_pos(id), 'action', 'send_whatsapp', jsonb_build_object('body', p_body)
  from automations where id = p_auto;
end;
$$;

create or replace function pg_temp.wd_tag(p_auto uuid, p_tag text) returns void
language plpgsql as $$
begin
  if p_auto is null then return; end if;
  insert into automation_steps (brand_id, automation_id, position, type, action_type, config)
  select brand_id, id, pg_temp.wd_next_pos(id), 'action', 'add_tag', jsonb_build_object('tagId', pg_temp.wd_tag_id(brand_id, p_tag))
  from automations where id = p_auto;
end;
$$;

create or replace function pg_temp.wd_task(p_auto uuid, p_title text, p_due_minutes int default 1440) returns void
language plpgsql as $$
begin
  if p_auto is null then return; end if;
  insert into automation_steps (brand_id, automation_id, position, type, action_type, config)
  select brand_id, id, pg_temp.wd_next_pos(id), 'action', 'create_task',
         jsonb_build_object('title', p_title, 'dueInMinutes', p_due_minutes)
  from automations where id = p_auto;
end;
$$;

do $wd$
declare
  b uuid := (select id from brands where name = 'WingCare' order by created_at limit 1);
  a uuid;
begin
  if b is null then raise exception 'Marca WingCare não encontrada — corre primeiro o 61_wingcare_brand_crm.sql.'; end if;

  -- A tag "Indicada" vem do 61; garante-a caso alguém a tenha apagado.
  insert into tags (brand_id, name, color) values (b, 'Indicada', '#F59E0B') on conflict do nothing;

  -- 1. ANIVERSÁRIO ---------------------------------------------
  a := pg_temp.wd_auto(b, 'Aniversário', 'contact_birthday',
    '{"daysBefore": 0, "hourLocal": 10, "requireConsent": true}'::jsonb);
  perform pg_temp.wd_wa(a, $${{primeiro_nome}}, hoje é o seu dia! Toda a equipa Wingcare deseja-lhe um feliz aniversário e um ano repleto de sucessos, pessoais e profissionais.$$);

  -- 2. NATAL ---------------------------------------------------
  a := pg_temp.wd_auto(b, 'Natal', 'annual_date',
    '{"month": 12, "day": 25, "daysBefore": 0, "hourLocal": 10, "requireConsent": true}'::jsonb);
  perform pg_temp.wd_wa(a, $${{primeiro_nome}}, a equipa Wingcare deseja-lhe um Feliz Natal! Obrigado por fazer parte da nossa comunidade este ano.$$);

  -- 3. ANO NOVO ------------------------------------------------
  -- Dispara a 31/12: {{ano_seguinte}} = ano atual + 1 (ver automations-run).
  a := pg_temp.wd_auto(b, 'Ano Novo', 'annual_date',
    '{"month": 12, "day": 31, "daysBefore": 0, "hourLocal": 18, "requireConsent": true}'::jsonb);
  perform pg_temp.wd_wa(a, $${{primeiro_nome}}, um novo ano começa! Desejamos-lhe um {{ano_seguinte}} cheio de crescimento profissional e boas conquistas. Obrigado por confiar na Wingcare.$$);

  -- 4. DIA DA MULHER -------------------------------------------
  a := pg_temp.wd_auto(b, 'Dia da Mulher (8 de março)', 'annual_date',
    '{"month": 3, "day": 8, "daysBefore": 0, "hourLocal": 10, "requireConsent": true}'::jsonb);
  perform pg_temp.wd_wa(a, $${{primeiro_nome}}, hoje é o Dia Internacional da Mulher. A Wingcare quer agradecer-lhe o trabalho, a dedicação e o cuidado que coloca todos os dias na sua profissão. Feliz Dia da Mulher!$$);

  -- 5. INDICAÇÃO — MARCAR COMO INDICADA ------------------------
  -- Corre para a pessoa indicada (target = referred). Só aplica a tag; a
  -- mensagem sai do fluxo 6, que também arranca se a tag for posta à mão.
  a := pg_temp.wd_auto(b, 'Indicação — marcar como Indicada', 'contact_referred', '{"target": "referred"}'::jsonb);
  perform pg_temp.wd_tag(a, 'Indicada');

  -- 6. BOAS-VINDAS — INDICADA ---------------------------------
  a := pg_temp.wd_auto(b, 'Boas-vindas — Indicada', 'contact_tagged',
    jsonb_build_object('tagId', pg_temp.wd_tag_id(b, 'Indicada'), 'stopOnReply', true));
  perform pg_temp.wd_task(a, 'Indicada: contactar e confirmar consentimento antes de continuar as mensagens', 1440);
  perform pg_temp.wd_wa(a, $$Olá {{primeiro_nome}}! Foi-nos recomendada a Wingcare por uma colega e ficámos muito contentes por isso. Somos um instituto de formação em estética, saúde e bem-estar e trabalhamos também com dermacosméticos profissionais. Podemos ajudá-la com informação sobre formação ou sobre produtos?$$);
  perform pg_temp.wd_wait(a, 2880);
  perform pg_temp.wd_wa(a, $${{primeiro_nome}}, ficou alguma dúvida sobre a Wingcare? Estamos por aqui sempre que precisar, sem qualquer compromisso.$$);

  -- 7. INDICAÇÃO — AGRADECER A QUEM INDICOU -------------------
  -- Corre para quem indicou (target = referrer). A recompensa não está
  -- definida: fica uma tarefa para a equipa em vez de prometer algo por
  -- mensagem.
  a := pg_temp.wd_auto(b, 'Indicação — agradecer a quem indicou', 'contact_referred', '{"target": "referrer"}'::jsonb);
  perform pg_temp.wd_wa(a, $${{primeiro_nome}}, obrigada por ter recomendado a Wingcare a uma colega! Ficamos muito agradecidos pela sua confiança.$$);
  perform pg_temp.wd_task(a, 'Indicação recebida: definir e entregar o agradecimento/recompensa (regra por definir com o cliente)', 2880);
end;
$wd$;

-- Verificação
select a.name, a.trigger_type, a.trigger_config, a.status, count(s.id) as passos
from automations a
left join automation_steps s on s.automation_id = a.id
where a.brand_id = (select id from brands where name = 'WingCare' order by created_at limit 1)
  and a.name in ('Aniversário', 'Natal', 'Ano Novo', 'Dia da Mulher (8 de março)', 'Indicação — marcar como Indicada',
                 'Boas-vindas — Indicada', 'Indicação — agradecer a quem indicou')
group by a.name, a.trigger_type, a.trigger_config, a.status
order by a.name;
