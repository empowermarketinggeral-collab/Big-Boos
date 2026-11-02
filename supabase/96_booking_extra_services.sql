-- =========================================================
-- 96 — Agendamento: mais do que um serviço na mesma marcação
-- =========================================================
-- Corre depois da 95. Pode correr-se mais do que uma vez.
--
-- A marcação continua a ter o serviço principal (service_id). Os outros
-- serviços escolhidos (online ou pela equipa na agenda) ficam em
-- extra_services: [{ id, name, duration_minutes, price }]. A duração e o
-- preço da marcação já os incluem.
-- =========================================================

alter table booking_appointments add column if not exists extra_services jsonb not null default '[]'::jsonb;
