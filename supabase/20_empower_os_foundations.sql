-- =========================================================
-- EMPOWER OS — FUNDAÇÕES MULTI-TENANT PARTILHADAS
-- =========================================================
-- Corre isto depois do 19_link_pages_display_name.sql.
--
-- RASCUNHO PARA REVISÃO — Fase 1 (modelo de dados). Não corras
-- ainda em produção; isto acompanha o documento
-- docs/EMPOWER_OS_ARCHITECTURE_STRATEGY.md e só deve ser aplicado
-- depois de validado.
--
-- Todas as tabelas do EMPOWER OS (CRM, WhatsApp, Automações,
-- Email, Funis, Formulários, Social, Billing, Analytics) usam
-- este único ponto de verdade para "quem pode mexer nesta marca".
--
-- Diferença importante face aos módulos operacionais da Big Boss:
-- lá, aprovador_marca/agencia_aprovador só vê e aprova o trabalho
-- da agência (is_approver_of → só SELECT/aprovação). No EMPOWER OS
-- o cliente é o próprio operador das suas ferramentas de marketing
-- (CRM, WhatsApp, automações, funis) — por isso is_brand_member()
-- dá acesso total (CRUD), não só leitura, a quem gere a marca
-- (equipa) OU está associado a ela como cliente.
-- =========================================================

create or replace function is_brand_member(target_brand uuid) returns boolean
language sql stable security definer as $$
  select can_manage_brand(target_brand) or is_approver_of(target_brand)
$$;
