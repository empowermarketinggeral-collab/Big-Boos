-- =========================================================
-- EMPOWER OS — PERMITIR ELIMINAR PIPELINES E FASES
-- =========================================================
-- Corre isto depois do 29_analytics_events.sql.
--
-- deals.pipeline_id e deals.stage_id (21_crm_core.sql) foram criados
-- sem "on delete cascade" — o que impedia eliminar um pipeline ou
-- uma fase que já tivesse negócios associados (o Postgres recusava
-- com um erro de chave estrangeira). Corrige para o mesmo padrão
-- usado em todo o resto do schema: eliminar o "pai" elimina o que
-- depende dele. A app avisa antes de eliminar uma fase com negócios
-- lá dentro, precisamente porque isto agora apaga os negócios também.
-- =========================================================

alter table deals drop constraint deals_pipeline_id_fkey;
alter table deals add constraint deals_pipeline_id_fkey
  foreign key (pipeline_id) references pipelines(id) on delete cascade;

alter table deals drop constraint deals_stage_id_fkey;
alter table deals add constraint deals_stage_id_fkey
  foreign key (stage_id) references pipeline_stages(id) on delete cascade;
