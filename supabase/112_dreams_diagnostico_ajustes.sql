-- Dreams Studio: ajustes ao "Diagnóstico antes do Sonho" (depois da 111).
-- 1) "Avaliação Capilar Gratuita" deixa de existir na marcação (fica arquivada,
--    para não estragar as marcações antigas que a usam).
-- 2) "Cronograma completo de Beleza": "diagnóstico profundo" passa a
--    "Diagnóstico antes do Sonho".
-- 3) Todas as madeixas (incluindo superficiais) e descolorações levam o texto
--    do diagnóstico, se ainda não o tiverem.
-- No fim mostra o relatório. Pode correr-se mais do que uma vez.

do $do$
declare
  v_brand uuid;
  v_text text := 'Inclui Diagnóstico antes do Sonho' || chr(10) || '20 minutos para avaliar o teu fio, a tua raiz e o teu rosto, antes de mudarmos alguma coisa.';
begin
  select id into v_brand from brands where name ilike 'dream%studio%' order by created_at limit 1;
  if v_brand is null then raise exception 'Marca Dreams Studio não encontrada.'; end if;

  update booking_services set status = 'archived'
   where brand_id = v_brand and lower(name) = lower('Avaliação Capilar Gratuita') and status = 'active';

  update booking_services
     set description = regexp_replace(description, 'diagn[óo]stico profundo', 'Diagnóstico antes do Sonho', 'gi')
   where brand_id = v_brand and lower(name) = lower('Cronograma completo de Beleza')
     and description ~* 'diagn[óo]stico profundo';

  update booking_services
     set description = v_text || case when coalesce(trim(description), '') <> '' then chr(10) || chr(10) || description else '' end
   where brand_id = v_brand and status = 'active'
     and (name ilike 'madeixa%' or name ilike 'descolora%')
     and coalesce(description, '') not like 'Inclui Diagnóstico antes do Sonho%';
end;
$do$;

-- Relatório.
select
  case
    when lower(s.name) = lower('Diagnóstico antes do Sonho') then '0. Serviço novo'
    when s.description like 'Inclui Diagnóstico antes do Sonho%' then '1. Com o texto do diagnóstico'
    when s.description ilike '%Diagnóstico antes do Sonho%' then '1. Menciona o diagnóstico'
    when s.status = 'archived' then '4. Arquivado'
    when s.category = 'Cabelo' and lower(s.name) similar to '(brushing|penteado)%' then '3. Fora (brushing/penteados)'
    when s.category = 'Cabelo' then '2. Por decidir'
    else '3. Fora (unhas, estética, massagem, epilação)'
  end as estado,
  s.category as categoria, s.name as servico, s.duration_minutes as minutos, s.price as preco
from booking_services s
join brands b on b.id = s.brand_id
where b.name ilike 'dream%studio%'
  and (s.status = 'active' or lower(s.name) = lower('Avaliação Capilar Gratuita'))
order by 1, s.category, s.sort_order, s.name;
