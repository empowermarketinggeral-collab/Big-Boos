-- Mapa de Crescimento por marca (substitui o "Plano Estratégico").
-- O mapa feito com a skill "mapa-de-crescimento" é exportado num ficheiro
-- mapa.json (formato "big-boss-mapa", versão 1) e importado no módulo da
-- marca. O mapa fica em brand_growth_maps.data (jsonb, tal como veio); cada
-- prioridade passa a uma fase em action_plans (com as tarefas "O que fazer"
-- como metas), onde a equipa acrescenta fases e tarefas.
-- Pode correr-se mais do que uma vez.

create table if not exists brand_growth_maps (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  title text not null,
  data jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists brand_growth_maps_brand_idx on brand_growth_maps (brand_id, created_at desc);

alter table brand_growth_maps enable row level security;
drop policy if exists brand_growth_maps_select on brand_growth_maps;
drop policy if exists brand_growth_maps_write on brand_growth_maps;
-- Igual às fases (action_plans): equipa e aprovadores da marca leem; só a equipa escreve.
create policy brand_growth_maps_select on brand_growth_maps for select using (can_manage_brand(brand_id) or is_approver_of(brand_id));
create policy brand_growth_maps_write on brand_growth_maps for all using (can_manage_brand(brand_id)) with check (can_manage_brand(brand_id));

-- Fases vindas do mapa: período, indicador, meta e a causa que resolvem.
alter table action_plans add column if not exists details jsonb not null default '{}'::jsonb;
alter table action_plans add column if not exists growth_map_id uuid references brand_growth_maps(id) on delete set null;
alter table action_plans add column if not exists sort_order int;
