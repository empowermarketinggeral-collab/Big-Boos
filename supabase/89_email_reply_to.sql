-- =========================================================
-- EMAIL — "Responder para" por marca
-- =========================================================
-- Corre isto depois do 88. Pode correr-se mais do que uma vez.
-- Os emails saem do endereço de envio (domínio verificado no Resend) e
-- as respostas vão para reply_to (ex.: a caixa de correio da marca).
-- Usado pelas funções automations-run e email-send.
-- =========================================================

alter table email_domains add column if not exists reply_to text;
alter table email_domains drop constraint if exists email_domains_reply_to_check;
alter table email_domains add constraint email_domains_reply_to_check
  check (reply_to is null or reply_to ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$');
