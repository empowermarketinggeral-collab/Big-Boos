-- =========================================================
-- BIG BOSS — DADOS DE EXEMPLO
-- =========================================================
-- Corre isto depois do 03_public_access.sql.
-- Cria a Biamelo, uma agência-cliente de exemplo, e as 3 marcas
-- que já usámos no protótipo visual — para testares já com dados
-- reais em vez de começares do zero.
-- =========================================================

-- 1. A tua organização
insert into organizations (id, name, primary_color)
values ('00000000-0000-0000-0000-000000000001', 'Biamelo', '#7C4DE0');

-- 2. A tua agência (root) + uma agência-cliente de exemplo
insert into agencies (id, organization_id, name, primary_color, is_root, status) values
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'Biamelo', '#7C4DE0', true, 'active'),
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', 'Agência Parceira Exemplo', '#3B5FC2', false, 'active');

-- 3. As 3 marcas do protótipo, associadas à Biamelo (agência root)
insert into brands (id, agency_id, name, category, status, goal) values
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000010',
   'Harmoniae Aesthetics', 'estetica', 'green',
   'Tornar-se a referência em estética avançada na região, atingindo 60% de ocupação até ao fim do ano.'),
  ('00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000010',
   'Luxe Atelier', 'varejo', 'yellow',
   'Lançar a coleção Verão com pré-vendas via Reels, chegando a 4.500€ em receita no primeiro mês.'),
  ('00000000-0000-0000-0000-000000000103', '00000000-0000-0000-0000-000000000010',
   'Astredik Studio', 'servicos', 'green',
   'Escalar a Academy para 200 alunos ativos através de conteúdo educativo semanal.');

-- 4. Categorias de precificação globais (predefinidas — visíveis a todas as agências)
insert into pricing_categories (name, owner_scope, parameters) values
  ('Serviço por Hora/Consulta', 'global', '[{"key":"hours","label":"Duração (h)","type":"number"},{"key":"hourly_rate","label":"Valor da hora (€)","type":"number"}]'),
  ('Produto Físico', 'global', '[{"key":"quantity","label":"Lote (unidades)","type":"number"}]'),
  ('Pacote / Projeto', 'global', '[{"key":"hourly_rate","label":"Taxa horária (€)","type":"number"}]'),
  ('Serviço Recorrente', 'global', '[{"key":"setup_cost","label":"Custo de arranque (€)","type":"number"},{"key":"amortize_months","label":"Meses para amortizar","type":"number"}]');

-- =========================================================
-- SOBRE OS UTILIZADORES (profiles)
-- =========================================================
-- Não dá para inserir aqui os teus utilizadores de teste, porque a
-- tabela "profiles" está ligada à tabela de autenticação do Supabase
-- (auth.users), que só existe depois de a pessoa se registar.
--
-- Segue os passos do README.md, secção "Criar os primeiros
-- utilizadores", para criares um utilizador por perfil (admin geral,
-- membro, aprovador, etc.) e ligares cada um à agência/marca certa.
