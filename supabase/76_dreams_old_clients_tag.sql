-- =========================================================
-- DREAMS STUDIO — TAG "Cliente antiga" (sem sinal na 1.ª marcação)
-- =========================================================
-- Corre isto depois do 75_service_staff_returning_clients.sql e DEPOIS de
-- importar os contactos no CRM. Pode correr-se as vezes que quiser: volta
-- a marcar todos os contactos importados e não duplica nada.
--
-- - Cria a tag "Cliente antiga" no Dreams Studio (se não existir).
-- - Põe-na em todos os contactos importados (CRM ou agenda, origem
--   "importacao").
-- - Diz ao Agendamento que quem tem esta tag não paga o sinal de cliente
--   nova. Não liga nem desliga o sinal: isso faz-se no Agendamento.
-- =========================================================

do $$
declare
  v_brand uuid;
  v_tag uuid;
  v_tagged int;
begin
  select id into v_brand from brands where name ilike 'dream%studio%' limit 1;
  if v_brand is null then raise exception 'Marca "Dreams Studio" não encontrada.'; end if;

  select id into v_tag from tags where brand_id = v_brand and lower(name) = 'cliente antiga';
  if v_tag is null then
    insert into tags (brand_id, name, color) values (v_brand, 'Cliente antiga', '#C2A431') returning id into v_tag;
  end if;

  insert into contact_tags (brand_id, contact_id, tag_id)
  select v_brand, c.id, v_tag from contacts c
  where c.brand_id = v_brand and c.source = 'importacao'
  on conflict (contact_id, tag_id) do nothing;
  get diagnostics v_tagged = row_count;

  insert into booking_payment_settings (brand_id, enabled, percentage, scope, exempt_tag_id)
  values (v_brand, false, 50, 'new_customers', v_tag)
  on conflict (brand_id) do update set exempt_tag_id = excluded.exempt_tag_id;

  raise notice 'Tag "Cliente antiga" posta em % contactos novos.', v_tagged;
end $$;

-- Confirmação: quantos contactos do Dreams Studio têm a tag.
select count(*) as clientes_antigas
from contact_tags ct join tags t on t.id = ct.tag_id
where t.name = 'Cliente antiga' and t.brand_id = (select id from brands where name ilike 'dream%studio%' limit 1);
