import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, invokeFunction } from "../../lib/supabaseClient.js";
import { c, sans, serif, Eyebrow, Modal, inputStyle, btnPrimary, btnGhost } from "../../shared/theme.jsx";
import { ArrowLeft, CreditCard, Check, Plus, Trash2, ExternalLink } from "lucide-react";

/* ---------------------------------------------------------
   BILLING — subscrição da plataforma (Stripe Checkout/Portal) +
   faturas de serviços de agência (registo manual, sem Stripe).
   Módulo do EMPOWER OS. Ver supabase/28_billing.sql e
   supabase/54_billing_plans_and_invoices.sql.

   A subscrição nunca é escrita diretamente pelo frontend — só a
   Edge Function stripe-webhook (service role) escreve em
   "subscriptions", a partir de eventos reais do Stripe. O frontend
   só lê e redireciona para o Checkout/Portal.
--------------------------------------------------------- */

const SUB_STATUS_LABEL = { trialing: "Em teste", active: "Ativa", past_due: "Pagamento em atraso", canceled: "Cancelada" };
const SUB_STATUS_COLOR = { trialing: c.amber, active: c.sage, past_due: c.rose, canceled: c.mist };

function money(cents, currency = "EUR") {
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency }).format((cents || 0) / 100);
}

/* ---------------------------------------------------------
   DATA — subscrição / planos
--------------------------------------------------------- */
function usePlans() {
  return useQuery({
    queryKey: ["plans", "brand"],
    queryFn: async () => {
      const { data, error } = await supabase.from("plans").select("*").eq("status", "active").eq("scope", "brand").is("agency_id", null).order("price_cents");
      if (error) throw error;
      return data;
    },
  });
}

function useSubscription(brandId) {
  return useQuery({
    queryKey: ["subscription", brandId],
    enabled: !!brandId,
    queryFn: async () => {
      const { data, error } = await supabase.from("subscriptions").select("*, plans(name, price_cents, currency, limits, features)").eq("brand_id", brandId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

function useCheckout(brandId) {
  return useMutation({
    mutationFn: async (planId) => {
      // Este link vai para o cliente, não para quem o está a gerar —
      // por isso aponta para a raiz pública da app (login), nunca para
      // o URL interno de onde foi gerado.
      const origin = window.location.origin;
      return invokeFunction("stripe-checkout", { brandId, planId, successUrl: `${origin}/?pagamento=sucesso`, cancelUrl: origin });
    },
  });
}

function usePortal(brandId) {
  return useMutation({
    mutationFn: async () => invokeFunction("stripe-portal", { brandId, returnUrl: window.location.href }),
  });
}

/* ---------------------------------------------------------
   DATA — faturas de serviços
--------------------------------------------------------- */
function useInvoices(brandId) {
  return useQuery({
    queryKey: ["service_invoices", brandId],
    enabled: !!brandId,
    queryFn: async () => {
      const { data, error } = await supabase.from("service_invoices").select("*, service_invoice_items(id, description, quantity, unit_price_cents)").eq("brand_id", brandId).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

function useCreateInvoice(brandId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (title) => {
      const { data, error } = await supabase.from("service_invoices").insert({ brand_id: brandId, title, status: "draft" }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["service_invoices", brandId] }),
  });
}

function useUpdateInvoice(brandId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }) => {
      const { error } = await supabase.from("service_invoices").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["service_invoices", brandId] }),
  });
}

function useDeleteInvoice(brandId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from("service_invoices").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["service_invoices", brandId] }),
  });
}

function useAddItem(brandId, invoiceId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ description, quantity, unitPriceCents }) => {
      const { error } = await supabase.from("service_invoice_items").insert({ invoice_id: invoiceId, description, quantity, unit_price_cents: unitPriceCents });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["service_invoices", brandId] }),
  });
}

function useDeleteItem(brandId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from("service_invoice_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["service_invoices", brandId] }),
  });
}

/* ---------------------------------------------------------
   SUBSCRIÇÃO
--------------------------------------------------------- */
function SubscriptionCard({ brandId, isClient }) {
  const subQuery = useSubscription(brandId);
  const plansQuery = usePlans();
  const checkout = useCheckout(brandId);
  const portal = usePortal(brandId);
  const [error, setError] = useState("");
  const [checkoutLink, setCheckoutLink] = useState(null);
  const [copied, setCopied] = useState(false);

  const sub = subQuery.data;
  const isActive = sub && (sub.status === "active" || sub.status === "trialing");

  // A marca nunca se subscreve a si própria — é a equipa da agência
  // que gera o link de pagamento aqui e o envia ao cliente por fora
  // (WhatsApp/email). Só depois de confirmado o pagamento é que faz
  // sentido dar acesso à marca — por isso isto nunca abre o Checkout
  // diretamente no browser de quem está a gerar o link.
  const generateLink = async (planId) => {
    setError("");
    setCheckoutLink(null);
    try {
      const result = await checkout.mutateAsync(planId);
      setCheckoutLink(result.url);
    } catch (err) {
      setError(err.message || "Não foi possível gerar o link.");
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(checkoutLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Não foi possível copiar — copia manualmente.");
    }
  };

  const goPortal = async () => {
    setError("");
    try {
      const result = await portal.mutateAsync();
      window.location.href = result.url;
    } catch (err) {
      setError(err.message || "Não foi possível abrir o portal.");
    }
  };

  const waShareLink = checkoutLink
    ? `https://wa.me/?text=${encodeURIComponent(`Olá! Aqui está o link para ativares o acesso à plataforma: ${checkoutLink}`)}`
    : null;

  return (
    <div style={{ background: "#fff", border: `1px solid ${c.line}`, borderRadius: 14, padding: 20, marginBottom: 24 }}>
      <div style={{ ...serif, fontSize: 15.5, color: c.ink, marginBottom: 14 }}>Subscrição da plataforma</div>

      {isActive ? (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <div style={{ ...sans, fontSize: 15, fontWeight: 700, color: c.ink }}>{sub.plans?.name}</div>
            <span style={{ ...sans, fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", borderRadius: 999, padding: "3px 9px", color: SUB_STATUS_COLOR[sub.status], background: c.paper }}>
              {SUB_STATUS_LABEL[sub.status] || sub.status}
            </span>
          </div>
          <div style={{ ...sans, fontSize: 12.5, color: c.mist, marginBottom: 14 }}>
            {money(sub.plans?.price_cents, sub.plans?.currency)}/mês
            {sub.current_period_end && ` · renova a ${new Date(sub.current_period_end).toLocaleDateString("pt-PT")}`}
          </div>
          <button onClick={goPortal} disabled={portal.isPending} style={{ ...btnGhost, display: "flex", alignItems: "center", gap: 6 }}>
            <ExternalLink size={13} /> {portal.isPending ? "A abrir…" : "Gerir subscrição"}
          </button>
        </div>
      ) : isClient ? (
        <div style={{ ...sans, fontSize: 12.5, color: c.mist }}>
          A tua subscrição ainda não está ativa — fala com a tua agência.
        </div>
      ) : (
        <>
          {sub?.status === "canceled" && (
            <div style={{ ...sans, fontSize: 12.5, color: c.rose, marginBottom: 14 }}>A subscrição anterior foi cancelada. Gera um novo link para reativar.</div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: checkoutLink ? 16 : 0 }}>
            {(plansQuery.data || []).map((plan) => (
              <div key={plan.id} style={{ border: `1px solid ${c.line}`, borderRadius: 12, padding: 16 }}>
                <div style={{ ...serif, fontSize: 16, color: c.ink, marginBottom: 4 }}>{plan.name}</div>
                <div style={{ ...sans, fontSize: 18, fontWeight: 700, color: c.ink, marginBottom: 10 }}>
                  {money(plan.price_cents, plan.currency)}<span style={{ fontSize: 11, fontWeight: 400, color: c.mist }}>/mês</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 14 }}>
                  {(plan.features || []).map((f) => (
                    <div key={f} style={{ ...sans, fontSize: 11.5, color: c.mist, display: "flex", alignItems: "center", gap: 6 }}>
                      <Check size={12} color={c.sage} /> {f}
                    </div>
                  ))}
                </div>
                <button onClick={() => generateLink(plan.id)} disabled={checkout.isPending} style={{ ...btnPrimary, width: "100%", justifyContent: "center" }}>
                  {checkout.isPending ? "A gerar…" : "Gerar link de pagamento"}
                </button>
              </div>
            ))}
          </div>
          {checkoutLink && (
            <div style={{ background: c.paper, borderRadius: 12, padding: 16 }}>
              <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginBottom: 8 }}>Envia este link ao cliente para ele ativar o acesso:</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <input readOnly value={checkoutLink} onFocus={(e) => e.target.select()} style={{ ...inputStyle, flex: 1, minWidth: 200 }} />
                <button onClick={copyLink} style={btnGhost}>{copied ? "Copiado ✓" : "Copiar"}</button>
                <a href={waShareLink} target="_blank" rel="noreferrer" style={{ ...btnPrimary, textDecoration: "none" }}>Enviar por WhatsApp</a>
              </div>
              <div style={{ ...sans, fontSize: 11, color: c.mistLight, marginTop: 8 }}>Este link expira ao fim de algum tempo se não for usado — gera um novo se precisares.</div>
            </div>
          )}
        </>
      )}
      {error && <div style={{ ...sans, fontSize: 12.5, color: c.rose, marginTop: 12 }}>{error}</div>}
    </div>
  );
}

/* ---------------------------------------------------------
   FATURAS DE SERVIÇOS
--------------------------------------------------------- */
const INVOICE_STATUS_LABEL = { draft: "Rascunho", sent: "Enviada", paid: "Paga", overdue: "Em atraso", cancelled: "Cancelada" };
const INVOICE_STATUS_COLOR = { draft: c.mist, sent: c.amber, paid: c.sage, overdue: c.rose, cancelled: c.mistLight };

function invoiceTotal(invoice) {
  return (invoice.service_invoice_items || []).reduce((sum, it) => sum + it.quantity * it.unit_price_cents, 0);
}

function InvoiceEditor({ brandId, invoice, onBack, isClient }) {
  const updateInvoice = useUpdateInvoice(brandId);
  const deleteInvoiceItem = useDeleteItem(brandId);
  const addItem = useAddItem(brandId, invoice.id);
  const [title, setTitle] = useState(invoice.title);
  const [dueDate, setDueDate] = useState(invoice.due_date || "");
  const [notes, setNotes] = useState(invoice.notes || "");
  const [desc, setDesc] = useState("");
  const [qty, setQty] = useState("1");
  const [unitPrice, setUnitPrice] = useState("");
  const [saved, setSaved] = useState(false);

  const total = invoiceTotal(invoice);
  // O cliente só lê — o backend (RLS) já bloqueia escrita dele nesta
  // tabela, isto é só para a UI não mostrar controlos que iam falhar.
  const locked = isClient || invoice.status === "paid" || invoice.status === "cancelled";

  const save = async () => {
    await updateInvoice.mutateAsync({ id: invoice.id, patch: { title, due_date: dueDate || null, notes } });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const addLine = async () => {
    if (!desc.trim() || !unitPrice) return;
    await addItem.mutateAsync({ description: desc.trim(), quantity: Number(qty) || 1, unitPriceCents: Math.round(Number(unitPrice) * 100) });
    setDesc(""); setQty("1"); setUnitPrice("");
  };

  const setStatus = (status) => updateInvoice.mutate({ id: invoice.id, patch: { status, paid_at: status === "paid" ? new Date().toISOString() : invoice.paid_at } });

  return (
    <div>
      <button onClick={onBack} style={{ ...sans, display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: c.mist, background: "none", border: "none", cursor: "pointer", marginBottom: 16 }}>
        <ArrowLeft size={14} /> Faturas
      </button>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} disabled={locked} style={{ ...serif, fontSize: 24, color: c.ink, border: "none", outline: "none", background: "none" }} />
        <span style={{ ...sans, fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", borderRadius: 999, padding: "4px 10px", color: INVOICE_STATUS_COLOR[invoice.status], background: c.paper }}>
          {INVOICE_STATUS_LABEL[invoice.status]}
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 640 }}>
        <div style={{ background: "#fff", border: `1px solid ${c.line}`, borderRadius: 14, padding: 20 }}>
          <div style={{ ...serif, fontSize: 15.5, color: c.ink, marginBottom: 14 }}>Linhas</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
            {(invoice.service_invoice_items || []).map((it) => (
              <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12.5 }}>
                <div style={{ ...sans, flex: 1, color: c.ink }}>{it.description} {it.quantity > 1 && `× ${it.quantity}`}</div>
                <div style={{ ...sans, color: c.ink }}>{money(it.quantity * it.unit_price_cents, invoice.currency)}</div>
                {!locked && (
                  <button onClick={() => deleteInvoiceItem.mutate(it.id)} style={{ background: "none", border: "none", cursor: "pointer", color: c.mist, padding: 3 }}>
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            ))}
            {!(invoice.service_invoice_items || []).length && <div style={{ ...sans, fontSize: 12, color: c.mistLight }}>Sem linhas ainda.</div>}
          </div>
          {!locked && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
              <input style={{ ...inputStyle, flex: 2, minWidth: 140 }} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Descrição do serviço" />
              <input style={{ ...inputStyle, width: 70 }} type="number" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="Qtd" />
              <input style={{ ...inputStyle, width: 110 }} type="number" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} placeholder="Preço unit." />
              <button onClick={addLine} style={{ ...btnGhost, padding: "9px 12px" }}><Plus size={13} /></button>
            </div>
          )}
          <div style={{ ...sans, fontSize: 15, fontWeight: 700, color: c.ink, marginTop: 16, textAlign: "right" }}>
            Total: {money(total, invoice.currency)}
          </div>
        </div>

        <div style={{ background: "#fff", border: `1px solid ${c.line}`, borderRadius: 14, padding: 20 }}>
          <div style={{ ...serif, fontSize: 15.5, color: c.ink, marginBottom: 14 }}>Detalhes</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginBottom: 5 }}>Data de vencimento</div>
              <input type="date" style={inputStyle} value={dueDate} onChange={(e) => setDueDate(e.target.value)} disabled={locked} />
            </div>
            <div>
              <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginBottom: 5 }}>Notas (opcional)</div>
              <textarea rows={3} style={{ ...inputStyle, resize: "vertical" }} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={locked} />
            </div>
            {!locked && (
              <button onClick={save} disabled={updateInvoice.isPending} style={{ ...btnPrimary, width: "fit-content" }}>
                {updateInvoice.isPending ? "A guardar…" : saved ? "Guardado ✓" : "Guardar"}
              </button>
            )}
          </div>
        </div>

        {!isClient && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {invoice.status === "draft" && <button onClick={() => setStatus("sent")} style={btnPrimary}>Marcar como enviada</button>}
            {(invoice.status === "sent" || invoice.status === "overdue") && <button onClick={() => setStatus("paid")} style={{ ...btnPrimary, background: c.sage }}>Marcar como paga</button>}
            {invoice.status !== "cancelled" && invoice.status !== "paid" && <button onClick={() => setStatus("cancelled")} style={btnGhost}>Cancelar fatura</button>}
          </div>
        )}
      </div>
    </div>
  );
}

function InvoicesPanel({ brandId, isClient }) {
  const invoicesQuery = useInvoices(brandId);
  const createInvoice = useCreateInvoice(brandId);
  const deleteInvoice = useDeleteInvoice(brandId);
  const [showNew, setShowNew] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [openId, setOpenId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const invoices = invoicesQuery.data || [];
  const open = openId ? invoices.find((iv) => iv.id === openId) : null;

  if (open) return <InvoiceEditor brandId={brandId} invoice={open} onBack={() => setOpenId(null)} isClient={isClient} />;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ ...serif, fontSize: 17, color: c.ink }}>Faturas de serviços</div>
        {!isClient && (
          <button onClick={() => setShowNew(true)} style={btnPrimary}>
            <Plus size={14} /> Nova fatura
          </button>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {invoices.map((iv) => (
          <div key={iv.id} style={{ display: "flex", alignItems: "center", gap: 14, background: "#fff", border: `1px solid ${c.line}`, borderRadius: 12, padding: "14px 18px", cursor: "pointer" }} onClick={() => setOpenId(iv.id)}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ ...serif, fontSize: 15, color: c.ink }}>{iv.title}</div>
              <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginTop: 2 }}>
                {money(invoiceTotal(iv), iv.currency)} {iv.due_date && `· vence ${new Date(iv.due_date).toLocaleDateString("pt-PT")}`}
              </div>
            </div>
            <span style={{ ...sans, fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", borderRadius: 999, padding: "4px 10px", color: INVOICE_STATUS_COLOR[iv.status], background: c.paper }}>
              {INVOICE_STATUS_LABEL[iv.status]}
            </span>
            {!isClient && iv.status === "draft" && (
              <button onClick={(e) => { e.stopPropagation(); setConfirmDelete(iv); }} style={{ background: "none", border: "none", cursor: "pointer", color: c.mist, padding: 6, flexShrink: 0 }}>
                <Trash2 size={14} />
              </button>
            )}
          </div>
        ))}
        {!invoicesQuery.isLoading && invoices.length === 0 && (
          <div style={{ ...sans, fontSize: 13, color: c.mistLight, textAlign: "center", padding: "40px 0" }}>Ainda não há faturas.</div>
        )}
      </div>

      {!isClient && showNew && (
        <Modal title="Nova fatura" onClose={() => setShowNew(false)} width={360}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <input style={inputStyle} value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Ex: Gestão de redes — outubro" autoFocus />
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => newTitle.trim() && createInvoice.mutate(newTitle.trim(), { onSuccess: (created) => { setShowNew(false); setNewTitle(""); setOpenId(created.id); } })}
                disabled={createInvoice.isPending}
                style={btnPrimary}
              >
                {createInvoice.isPending ? "A criar…" : "Criar"}
              </button>
              <button onClick={() => setShowNew(false)} style={btnGhost}>Cancelar</button>
            </div>
          </div>
        </Modal>
      )}

      {confirmDelete && (
        <Modal title="Eliminar fatura" onClose={() => setConfirmDelete(null)} width={360}>
          <div style={{ ...sans, fontSize: 13, color: c.ink, marginBottom: 16 }}>Tens a certeza? Esta ação não pode ser desfeita.</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => deleteInvoice.mutate(confirmDelete.id, { onSuccess: () => setConfirmDelete(null) })} style={{ ...btnPrimary, background: c.rose }}>Eliminar</button>
            <button onClick={() => setConfirmDelete(null)} style={btnGhost}>Cancelar</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ---------------------------------------------------------
   MÓDULO
--------------------------------------------------------- */
export default function BillingModule({ brand, onBack, session }) {
  const isClient = session?.role === "aprovador_marca" || session?.role === "agencia_aprovador";

  return (
    <div className="bb-page" style={{ padding: "8px 40px 60px", maxWidth: 1040 }}>
      <button onClick={onBack} style={{ ...sans, display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: c.mist, background: "none", border: "none", cursor: "pointer", marginBottom: 20 }}>
        <ArrowLeft size={14} /> Voltar à marca
      </button>

      <Eyebrow>Faturação</Eyebrow>
      <h1 style={{ ...serif, fontSize: 24, color: c.ink, margin: "0 0 16px", display: "flex", alignItems: "center", gap: 10 }}>
        <CreditCard size={20} color={c.boss} /> Faturação
      </h1>

      <SubscriptionCard brandId={brand.id} isClient={isClient} />
      <InvoicesPanel brandId={brand.id} isClient={isClient} />
    </div>
  );
}
