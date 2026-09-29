-- =========================================================
-- DREAMS STUDIO — serviços, link e visual da app
-- =========================================================
-- Corre isto depois do 73_client_app_care_categories.sql, e só depois
-- de a marca "Dreams Studio" existir no Big Boss. Pode correr-se mais de
-- uma vez: não duplica serviços (reconhece-os pelo nome).
--
-- - 53 serviços da página de marcações antiga (LeadConnector), com
--   categoria, duração, preço e descrição. Serviços com várias durações
--   (ex: massagens 45/60/90 min) ficam com a mais curta e o intervalo de
--   preço; a equipa ajusta ou cria extras no Agendamento.
-- - Link público /agendar/dreams-studio e app /app/dreams-studio (se a
--   marca ainda não tiver link). A app NÃO é ligada aqui: liga-se no
--   Agendamento, depois de importar contactos e agenda.
-- - Visual da identidade: fundo linho claro, texto Ink Studio, botões
--   Golden Bronze com texto escuro, títulos Bodoni Moda, texto Jost.
--   O logótipo sobe-se no Agendamento, em "Aparência".
-- =========================================================

-- Vem do 43_booking_style.sql; repete-se aqui para quem não o correu.
alter table brands add column if not exists booking_style jsonb default '{}'::jsonb;

do $$
declare
  v_brand uuid;
  v_count int;
begin
  select count(*) into v_count from brands where name ilike 'dream%studio%';
  if v_count = 0 then raise exception 'Cria primeiro a marca "Dreams Studio" no Big Boss.'; end if;
  if v_count > 1 then raise exception 'Há % marcas com nome parecido com "Dreams Studio". Deixa só uma.', v_count; end if;
  select id into v_brand from brands where name ilike 'dream%studio%';

  update brands
     set booking_slug = coalesce(booking_slug, 'dreams-studio'),
         booking_style = coalesce(booking_style, '{}'::jsonb) || jsonb_build_object(
           'accentColor', '#C2A431',
           'accentInk', '#1A0D0E',
           'background', '#F6F1EA',
           'surface', '#FFFDFA',
           'ink', '#1A0D0E',
           'titleFont', 'Bodoni Moda',
           'font', 'Jost',
           'tagline', 'Cuidado com continuidade',
           'contactPhone', '+351911730793'
         )
   where id = v_brand;

  insert into booking_services (brand_id, category, sort_order, name, description, duration_minutes, price, price_max, status)
  select v_brand, s.category, s.sort_order, s.name, s.description, s.duration_minutes, s.price, s.price_max, 'active'
  from (values
    ('Rosto', 10, 'Brow Lamination', null, 45, 25, null),
    ('Rosto', 11, 'Make Social', 'Maquilhagem profissional para eventos e ocasiões especiais.', 60, 30, null),
    ('Rosto', 12, 'Sobrancelha', 'Limpeza e definição das sobrancelhas com pinça.', 20, 7, null),
    ('Rosto', 13, 'Lifting de Pestanas', 'Curvatura e definição natural das pestanas.', 60, 25, null),

    ('Cabelo', 20, 'Avaliação Capilar Gratuita', null, 30, 0, null),
    ('Cabelo', 21, 'Hidratação Profunda', 'Tratamento de hidratação e reparação profunda.', 30, 16.5, null),
    ('Cabelo', 22, 'Brushing', 'Secagem e modelação simples.', 30, 10, null),
    ('Cabelo', 23, 'Brushing Longo', 'Lavagem e secagem modelada para cabelos longos.', 45, 12, null),
    ('Cabelo', 24, 'Brushing com extensões', 'Lavagem e secagem com modelação em cabelo com extensões.', 60, 19, null),
    ('Cabelo', 25, 'Tratamento do couro cabeludo', 'Tratamento específico para o couro cabeludo.', 30, 25, null),
    ('Cabelo', 26, 'Penteados', 'Lavagem e penteado.', 60, 18, null),
    ('Cabelo', 27, 'Corte', 'Corte de cabelo.', 30, 15, null),
    ('Cabelo', 28, 'Ondulação', null, 120, 37, null),
    ('Cabelo', 29, 'Balayage Protegida', 'Serviço completo de balayage com diagnóstico prévio, proteção da fibra capilar, matização adequada, tratamento no ato e brushing final. Inclui orientação personalizada para manutenção da cor. Indicado para quem quer iluminar o cabelo com segurança e resultado duradouro. O valor pode variar conforme o comprimento, a densidade e o histórico químico.', 180, 145, 165),
    ('Cabelo', 30, 'Coloração', 'Coloração total ou do crescimento do cabelo.', 90, 25, 44),
    ('Cabelo', 31, 'Cronograma completo de Beleza', 'Inclui diagnóstico profundo, cronograma casa e salão integrados, 3 meses de acompanhamento (3 tratamentos) e ajustes conforme a resposta do cabelo. Indicado para cabelos com histórico químico, fragilizados ou para quem quer máxima longevidade da cor.', 30, 90, null),
    ('Cabelo', 32, 'Coloração sem Amoníaco', 'Coloração que substitui este composto químico agressivo por outros agentes, como óleos naturais ou agentes alcalinos mais suaves.', 90, 36, 55),
    ('Cabelo', 33, 'Descoloração', 'Clareamento do cabelo.', 90, 45, null),
    ('Cabelo', 34, 'Tom sobre Tom', 'Realce da cor existente.', 60, 25, null),
    ('Cabelo', 35, 'Matização', 'Correção de tons indesejados.', 60, 16, null),
    ('Cabelo', 36, 'Madeixas', null, 90, 70, null),
    ('Cabelo', 37, 'Madeixas Parciais', null, 90, 50, null),

    ('Pés', 40, 'Pedicure com verniz gel', 'Pedicure completa com verniz gel.', 60, 25, null),
    ('Pés', 41, 'Pedicure', 'Cuidado básico dos pés e unhas.', 60, 20, null),
    ('Pés', 42, 'Plástica Podal', 'Tratamento para remover calosidades, pele seca e rachaduras. Utiliza um produto específico que amolece a pele morta, facilitando a remoção e deixando os pés mais suaves e confortáveis.', 45, 16, null),
    ('Pés', 43, 'Remoção de verniz gel (pés)', 'Remoção de verniz gel das unhas dos pés.', 30, 9, null),
    ('Pés', 44, 'Spa de Pés', 'Tratamento relaxante e hidratante para os pés.', 45, 15, null),

    ('Massagem', 50, 'Massagem Ayurvédica', 'Terapia milenar originária da Índia, integrada na medicina Ayurveda. Combina toques vigorosos e deslizamentos musculares com alongamentos e trações inspiradas no Yoga. Utiliza óleos aquecidos para estimular a circulação, libertar toxinas, aliviar tensões físicas e reequilibrar a energia vital.', 30, 30, 50),
    ('Massagem', 51, 'Massagem Relaxante de Aromas', 'Massagem com óleos essenciais selecionados. 45, 60 ou 90 minutos.', 45, 37.5, 70),
    ('Massagem', 52, 'Drenagem Linfática', 'Estímulo do sistema linfático para eliminar toxinas e reduzir a retenção.', 45, 37.5, 70),
    ('Massagem', 53, 'Reflexologia', 'Ativação de pontos reflexos nos pés. Relaxamento profundo. 45 a 90 minutos.', 45, 37.5, 70),

    ('Mãos', 60, 'Manicure', 'Cuidado básico das unhas e cutículas com opção de aplicação de verniz normal.', 30, 11, null),
    ('Mãos', 61, 'Remoção de verniz gel', 'Remoção segura de verniz gel e manicure simples.', 30, 15, null),
    ('Mãos', 62, 'Verniz Gel', 'Manicure com aplicação de verniz gel.', 60, 19, null),
    ('Mãos', 63, 'Reforço de unhas naturais', 'Fortalecimento de unhas naturais quebradiças com gel.', 60, 26, null),
    ('Mãos', 64, 'Remoção de unhas de gel', 'Remoção segura e total do gel e manicure simples.', 60, 22, null),
    ('Mãos', 65, 'Manutenção de gel', 'Manutenção de unhas de gel.', 90, 26, null),
    ('Mãos', 66, 'Aplicação de unhas de gel', 'Construção completa de unhas de gel.', 120, 35, null),

    ('Epilação a cera', 70, 'Axila', 'Remoção dos pelos das axilas.', 15, 8, null),
    ('Epilação a cera', 71, 'Perna Inteira', 'Epilação completa das pernas.', 30, 21, null),
    ('Epilação a cera', 72, 'Meia Perna', 'Epilação do joelho para baixo.', 20, 13, null),
    ('Epilação a cera', 73, 'Virilha Total', 'Remoção completa dos pelos da virilha.', 30, 16, null),
    ('Epilação a cera', 74, 'Braços', 'Epilação dos braços completos.', 20, 15, null),
    ('Epilação a cera', 75, 'Peito', 'Remoção dos pelos do peito.', 20, 18, null),
    ('Epilação a cera', 76, 'Virilha normal', 'Remoção básica dos pelos da virilha.', 20, 12, null),
    ('Epilação a cera', 77, 'Costas', 'Remoção dos pelos das costas.', 30, 20, null),
    ('Epilação a cera', 78, 'Rosto (cera)', 'Epilação das zonas do rosto com cera.', 15, 10, null),
    ('Epilação a cera', 79, 'Mento', 'Remoção dos pelos do queixo.', 10, 4, null),
    ('Epilação a cera', 80, 'Buço', 'Remoção dos pelos do buço com cera.', 10, 4, null)
  ) as s(category, sort_order, name, description, duration_minutes, price, price_max)
  where not exists (
    select 1 from booking_services bs where bs.brand_id = v_brand and lower(bs.name) = lower(s.name)
  );
end $$;
