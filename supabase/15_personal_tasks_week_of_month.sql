-- =========================================================
-- BIG BOSS — TAREFAS RECORRENTES POR SEMANA DO MÊS
-- =========================================================
-- Corre isto depois do 14_growth_maps_owner_only.sql.
--
-- Acrescenta um 4º tipo de alocação a personal_tasks: tarefas que
-- se repetem todos os meses numa semana específica (1ª a 4ª semana
-- do mês), distinto de "sem_dia" (pendências avulsas) e
-- "dia_especifico" (recorrente por dia da semana).
-- =========================================================

alter table personal_tasks drop constraint if exists personal_tasks_allocation_type_check;
alter table personal_tasks add constraint personal_tasks_allocation_type_check
  check (allocation_type in ('dia_especifico', 'periodo', 'sem_dia', 'semana_mes'));
