-- Dreams Studio: "Diagnóstico antes do Sonho".
-- 1) Nos serviços técnicos e cortes, acrescenta por cima da descrição:
--      Inclui Diagnóstico antes do Sonho
--      20 minutos para avaliar o teu fio, a tua raiz e o teu rosto, antes de mudarmos alguma coisa.
--    Nome, preço, duração e o resto da descrição ficam iguais.
-- 2) Cria o serviço "Diagnóstico antes do Sonho" (20 min, 20 €).
-- No fim mostra o relatório: alterados, deixados de fora e por decidir.
-- Pode correr-se mais do que uma vez (não repete o texto nem o serviço).

do $do$
declare
  v_brand uuid;
  v_text text := 'Inclui Diagnóstico antes do Sonho' || chr(10) || '20 minutos para avaliar o teu fio, a tua raiz e o teu rosto, antes de mudarmos alguma coisa.';
begin
  select id into v_brand from brands where name ilike 'dream%studio%' order by created_at limit 1;
  if v_brand is null then raise exception 'Marca Dreams Studio não encontrada.'; end if;

  update booking_services
     set description = v_text || case when coalesce(trim(description), '') <> '' then chr(10) || chr(10) || description else '' end
   where brand_id = v_brand
     and status = 'active'
     and lower(name) in (
       'corte',
       'coloração', 'coloração sem amoníaco', 'tom sobre tom', 'matização',
       'madeixas', 'madeixas parciais', 'balayage protegida', 'descoloração',
       'ondulação',
       'hidratação profunda', 'tratamento do couro cabeludo'
     )
     and coalesce(description, '') not like 'Inclui Diagnóstico antes do Sonho%';

  insert into booking_services (brand_id, category, sort_order, name, description, duration_minutes, price, status)
  select v_brand, 'Cabelo', 19, 'Diagnóstico antes do Sonho',
         '20 minutos para avaliar o teu fio, a tua raiz e o teu rosto, antes de qualquer corte ou química. Descontado se marcares o serviço.',
         20, 20, 'active'
  where not exists (select 1 from booking_services where brand_id = v_brand and lower(name) = lower('Diagnóstico antes do Sonho'));
end;
$do$;

-- Relatório (o resultado aparece no SQL Editor).
select
  case
    when s.description like 'Inclui Diagnóstico antes do Sonho%' then '1. Alterado'
    when lower(s.name) = lower('Diagnóstico antes do Sonho') then '0. Serviço novo'
    when s.category = 'Cabelo' and lower(s.name) similar to '(brushing|penteado)%' then '3. Fora (brushing/penteados)'
    when s.category = 'Cabelo' then '2. Por decidir'
    else '3. Fora (unhas, estética, massagem, epilação)'
  end as estado,
  s.category as categoria, s.name as servico, s.duration_minutes as minutos, s.price as preco
from booking_services s
join brands b on b.id = s.brand_id
where b.name ilike 'dream%studio%' and s.status = 'active'
order by 1, s.category, s.sort_order, s.name;
