-- =========================================================
-- EMPOWER OS — LINKS DE FATURAS (Faturação de cada marca)
-- =========================================================
-- Corre isto depois do 70. Pode correr-se mais do que uma vez.
--
-- A equipa cola um link (ex: fatura no Moloni/InvoiceXpress/Drive) e dá-lhe
-- um nome ("Fatura de abril"). O cliente da marca vê a lista e abre os
-- links, mas NUNCA escreve: leitura com is_brand_member, escrita só com
-- can_manage_brand (equipa) — mesma regra de service_invoices (56).
-- =========================================================

create table if not exists invoice_links (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 160),
  -- só http(s): nunca javascript:, data:, etc.
  url text not null check (char_length(url) <= 2000 and url ~* '^https?://[^[:space:]]+$'),
  document_date date not null default current_date,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);
create index if not exists idx_invoice_links_brand on invoice_links(brand_id, document_date desc, created_at desc);

alter table invoice_links enable row level security;
drop policy if exists invoice_links_select on invoice_links;
drop policy if exists invoice_links_insert on invoice_links;
drop policy if exists invoice_links_update on invoice_links;
drop policy if exists invoice_links_delete on invoice_links;
create policy invoice_links_select on invoice_links for select using (is_brand_member(brand_id));
create policy invoice_links_insert on invoice_links for insert with check (can_manage_brand(brand_id));
create policy invoice_links_update on invoice_links for update
  using (can_manage_brand(brand_id)) with check (can_manage_brand(brand_id));
create policy invoice_links_delete on invoice_links for delete using (can_manage_brand(brand_id));
