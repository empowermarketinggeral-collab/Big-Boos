-- =========================================================
-- BIG BOSS — MAPA DE CRESCIMENTO: RESTRINGIR A QUEM CRIOU
-- =========================================================
-- Corre isto depois do 13_growth_maps.sql (se já o corrESTE antes
-- do campo "created_by" e da regra "só para mim" terem sido
-- adicionados ao ficheiro original).
-- =========================================================

alter table growth_maps add column if not exists created_by uuid references profiles(id);

drop policy if exists growth_maps_team on growth_maps;
drop policy if exists growth_maps_owner on growth_maps;

create policy growth_maps_owner on growth_maps for all using (
  created_by = auth.uid() and my_role() = 'admin_geral'
) with check (
  created_by = auth.uid() and my_role() = 'admin_geral'
);
