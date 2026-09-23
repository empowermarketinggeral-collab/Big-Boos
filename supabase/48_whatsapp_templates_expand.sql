-- =========================================================
-- EMPOWER OS — TEMPLATES DE WHATSAPP (submissão à Meta)
-- =========================================================
-- Corre isto depois do 47_content_approval_autoschedule.sql.
--
-- whatsapp_templates já existia (22_whatsapp.sql) mas nunca chegou a
-- ser usada. Esta migração acrescenta os campos que faltam para
-- submeter templates a sério à Graph API da Meta — nome, idioma,
-- categoria e o id do template do lado da Meta depois de aprovado.
-- twilio_content_sid fica reservado para quando a submissão via
-- Twilio (API de Conteúdo, diferente da Graph API) for construída —
-- não é feito nesta fase.
-- =========================================================

alter table whatsapp_templates rename column meta_status to status;
alter table whatsapp_templates add column if not exists language text default 'pt_PT';
alter table whatsapp_templates add column if not exists category text default 'MARKETING' check (category in ('MARKETING', 'UTILITY', 'AUTHENTICATION'));
alter table whatsapp_templates add column if not exists meta_template_id text;
alter table whatsapp_templates add column if not exists twilio_content_sid text;
