-- =========================================================
-- DREAMS STUDIO — MENSAGENS DOS LEMBRETES AUTOMÁTICOS
-- =========================================================
-- Corre isto depois do 82_booking_upsells_options_packs_ghl.sql. Pode
-- correr-se mais do que uma vez (volta a pôr estes textos).
--
-- Confirmação, 24h antes, 1h antes e pós-visita por SMS. O pós-visita só
-- sai na 1.ª, 10.ª e 30.ª visita, com um texto para cada uma. Variáveis:
-- {{primeiro_nome}}, {{nome}}, {{servico}}, {{data}}, {{hora}},
-- {{avaliacao}} (link de avaliação do pós-visita).
-- Depois ajusta os textos em Agendamento → Lembretes, se quiseres.
-- Sem marca com nome parecido com "Dreams Studio", não faz nada.
-- =========================================================

insert into booking_reminder_settings (brand_id, type, enabled, channel, message_template, visit_numbers, visit_messages)
select b.id, v.type, true, 'sms', v.message, v.visit_numbers, v.visit_messages
from brands b
cross join (values
  ('confirmation',
   'Olá {{primeiro_nome}}, a sua marcação no Dreams Studio está confirmada: {{servico}}, {{data}} às {{hora}}. Até breve!',
   null::int[], '{}'::jsonb),
  ('reminder_24h',
   'Olá {{primeiro_nome}}, lembramos a sua marcação amanhã às {{hora}} no Dreams Studio ({{servico}}). Precisa de alterar? Fale connosco.',
   null::int[], '{}'::jsonb),
  ('reminder_1h',
   '{{primeiro_nome}}, esperamos por si daqui a 1 hora, às {{hora}}, no Dreams Studio. Até já!',
   null::int[], '{}'::jsonb),
  ('post_visit',
   'Obrigada pela sua visita ao Dreams Studio, {{primeiro_nome}}!',
   array[1, 10, 30],
   jsonb_build_object(
     '1', 'Obrigada pela sua primeira visita ao Dreams Studio, {{primeiro_nome}}! Foi um prazer receber a sua visita. Se gostou, deixe-nos a sua opinião: {{avaliacao}}',
     '10', '{{primeiro_nome}}, já são 10 visitas ao Dreams Studio! Obrigada pela confiança. É um prazer cuidar de si.',
     '30', '30 visitas, {{primeiro_nome}}! Obrigada por fazer parte da família Dreams Studio. Até à próxima!'
   ))
) as v(type, message, visit_numbers, visit_messages)
where b.name ilike 'dream%studio%'
on conflict (brand_id, type) do update
  set enabled = true,
      channel = excluded.channel,
      message_template = excluded.message_template,
      visit_numbers = excluded.visit_numbers,
      visit_messages = excluded.visit_messages;
