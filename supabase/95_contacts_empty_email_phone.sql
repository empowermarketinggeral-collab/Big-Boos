-- =========================================================
-- 95 — Contactos: email e telefone vazios passam a null
-- =========================================================
-- Corre depois da 94. Pode correr-se mais do que uma vez.
--
-- O email e o telefone são únicos por marca. Fichas gravadas com "" (em
-- vez de vazio a sério) contavam como repetidas, e a ficha seguinte sem
-- email dava erro ao guardar. O Big Boss já grava vazio como null; isto
-- limpa as que ficaram com "".
-- =========================================================

update contacts set email = null where email is not null and trim(email) = '';
update contacts set phone = null where phone is not null and trim(phone) = '';
