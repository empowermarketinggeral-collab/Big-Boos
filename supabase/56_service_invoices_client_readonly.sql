-- =========================================================
-- EMPOWER OS — FATURAS DE SERVIÇO: CLIENTE SÓ LÊ, NUNCA ESCREVE
-- =========================================================
-- Corre isto depois do 55_billing_enterprise_plan.sql.
--
-- service_invoices/service_invoice_items usavam is_brand_member nas
-- políticas "for all" (54_billing_plans_and_invoices.sql) — esse
-- helper dá CRUD completo tanto à equipa como ao cliente (ver
-- is_brand_member em 20_empower_os_foundations.sql), o que aqui é um
-- problema real: o cliente conseguia marcar a própria fatura como
-- paga, editar linhas ou apagá-la. Corrige para: leitura continua
-- aberta ao cliente (precisa de ver o que deve), escrita só para
-- quem gere a marca (equipa).
-- =========================================================

drop policy if exists service_invoices_all on service_invoices;
create policy service_invoices_select on service_invoices for select using (is_brand_member(brand_id));
create policy service_invoices_write on service_invoices for insert with check (can_manage_brand(brand_id));
create policy service_invoices_update on service_invoices for update using (can_manage_brand(brand_id)) with check (can_manage_brand(brand_id));
create policy service_invoices_delete on service_invoices for delete using (can_manage_brand(brand_id));

drop policy if exists service_invoice_items_all on service_invoice_items;
create policy service_invoice_items_select on service_invoice_items for select using (
  exists (select 1 from service_invoices si where si.id = invoice_id and is_brand_member(si.brand_id))
);
create policy service_invoice_items_write on service_invoice_items for all using (
  exists (select 1 from service_invoices si where si.id = invoice_id and can_manage_brand(si.brand_id))
) with check (
  exists (select 1 from service_invoices si where si.id = invoice_id and can_manage_brand(si.brand_id))
);
