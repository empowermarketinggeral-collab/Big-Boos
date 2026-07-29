-- =========================================================
-- BIG BOSS — ACESSO PÚBLICO (sem login)
-- =========================================================
-- Corre isto depois do 02_rls_policies.sql.
-- Propostas, apresentações (portfólio) e páginas de Link na Bio
-- têm um URL público (/proposta/:slug, /link/:slug) pensado para
-- serem vistos por quem NÃO tem conta na plataforma — um prospect
-- a ver uma proposta, ou um cliente final a ver a Link na Bio.
--
-- Isto cria uma exceção controlada: qualquer pessoa (mesmo sem
-- login) pode LER uma proposta/apresentação/link page através do
-- seu slug exato — nunca listar todas, nunca editar.
-- =========================================================

create policy proposals_public_read on proposals for select
  to anon
  using (status = 'sent' or status = 'accepted');

create policy presentations_public_read on presentations for select
  to anon
  using (true);

create policy link_pages_public_read on link_pages for select
  to anon
  using (true);

-- Nota: a leitura pública funciona sempre por slug exato pedido pelo
-- frontend (ex: .eq('slug', 'harmoniae')) — nunca deves construir um
-- ecrã que liste todas as linhas desta tabela sem login, porque a
-- policy acima permite ler qualquer uma se souberes o slug, mas o
-- Supabase não impede um "select *" sem filtro. Isso é uma regra a
-- respeitar no código do frontend/Claude Code, não algo que o RLS
-- resolva sozinho.
