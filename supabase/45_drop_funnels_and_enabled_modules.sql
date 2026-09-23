-- =========================================================
-- EMPOWER OS — REMOVER FUNIS (passam a ser feitos na Wix) +
-- VISIBILIDADE DE MÓDULOS POR MARCA
-- =========================================================
-- Corre isto depois do 44_twilio_sms_and_whatsapp_alt.sql.
--
-- Ação permanente e confirmada: elimina as tabelas de funis e tudo
-- o que lá estivesse. O motor de blocos que ficava por trás (mesmo
-- padrão do Link na Bio) continua intacto — só esta aplicação
-- concreta é que sai, o Link na Bio não é afetado.
-- =========================================================

drop table if exists funnel_events;
drop table if exists funnel_pages;
drop table if exists funnels;

-- Lista de módulos visíveis para o CLIENTE desta marca (aprovador_marca/
-- agencia_aprovador). Vazio/nulo = todos visíveis (comportamento atual,
-- para não mudar nada nas marcas já criadas). A equipa (staff) continua
-- sempre a ver tudo, independentemente disto — isto só filtra o que o
-- cliente vê.
alter table brands add column if not exists enabled_modules text[] default '{}'::text[];
