import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabaseClient.js";
import { c, sans, serif, Modal, inputStyle, btnPrimary, btnGhost } from "../../shared/theme.jsx";
import { Plus, Pencil, Trash2, ExternalLink, Check, X, FileText } from "lucide-react";

/* ---------------------------------------------------------
   DOCUMENTOS DE FATURA — a equipa cola o link de cada fatura e dá-lhe
   um nome ("Fatura de abril"); o cliente vê a lista e abre os links.
   Só a equipa escreve (RLS: supabase/71_invoice_links.sql).
--------------------------------------------------------- */

function useInvoiceLinks(brandId) {
  return useQuery({
    queryKey: ["invoice_links", brandId],
    enabled: !!brandId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoice_links")
        .select("id, name, url, document_date, created_at")
        .eq("brand_id", brandId)
        .order("document_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

function useInvoiceLinkMutations(brandId, userId) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["invoice_links", brandId] });
  const create = useMutation({
    mutationFn: async ({ name, url, documentDate }) => {
      const { error } = await supabase
        .from("invoice_links")
        .insert({ brand_id: brandId, name, url, document_date: documentDate || undefined, created_by: userId });
      if (error) throw error;
    },
    onSuccess: refresh,
  });
  const update = useMutation({
    mutationFn: async ({ id, name, url, documentDate }) => {
      const { error } = await supabase.from("invoice_links").update({ name, url, ...(documentDate ? { document_date: documentDate } : {}) }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from("invoice_links").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: refresh,
  });
  return { create, update, remove };
}

// "www.site.pt/fatura" → "https://www.site.pt/fatura"; só aceita http(s).
function normalizeInvoiceUrl(raw) {
  let value = String(raw || "").trim();
  if (!value) return { error: "Cola o link da fatura." };
  if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) value = `https://${value}`;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return { error: "O link tem de começar por http:// ou https://." };
    if (value.length > 2000) return { error: "O link é demasiado longo." };
    return { url: url.toString() };
  } catch {
    return { error: "Este link não parece válido." };
  }
}

const formatDate = (isoDate) => (isoDate ? new Date(`${isoDate}T00:00:00`).toLocaleDateString("pt-PT") : "");
const hostOf = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

function LinkForm({ initial, onSubmit, onCancel, pending, submitLabel }) {
  const [name, setName] = useState(initial?.name || "");
  const [url, setUrl] = useState(initial?.url || "");
  const [documentDate, setDocumentDate] = useState(initial?.document_date || "");
  const [error, setError] = useState("");

  const submit = async () => {
    setError("");
    if (!name.trim()) { setError("Dá um nome ao documento (ex: Fatura de abril)."); return; }
    const parsed = normalizeInvoiceUrl(url);
    if (parsed.error) { setError(parsed.error); return; }
    try {
      await onSubmit({ name: name.trim(), url: parsed.url, documentDate });
    } catch (err) {
      setError(err.message || "Não foi possível guardar.");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginBottom: 5 }}>Nome do documento</div>
        <input style={inputStyle} value={name} maxLength={160} onChange={(e) => setName(e.target.value)} placeholder="Ex: Fatura de abril" autoFocus />
      </div>
      <div>
        <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginBottom: 5 }}>Link</div>
        <input style={inputStyle} value={url} maxLength={2000} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" inputMode="url" />
      </div>
      <div>
        <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginBottom: 5 }}>Data da fatura (opcional — por omissão, hoje)</div>
        <input style={inputStyle} type="date" value={documentDate} onChange={(e) => setDocumentDate(e.target.value)} />
      </div>
      {error && <div style={{ ...sans, fontSize: 12, color: c.rose }}>{error}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={submit} disabled={pending} style={btnPrimary}><Check size={13} /> {pending ? "A guardar…" : submitLabel}</button>
        <button onClick={onCancel} style={btnGhost}><X size={13} /> Cancelar</button>
      </div>
    </div>
  );
}

export default function InvoiceLinksPanel({ brandId, isClient, userId }) {
  const linksQuery = useInvoiceLinks(brandId);
  const { create, update, remove } = useInvoiceLinkMutations(brandId, userId);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleteError, setDeleteError] = useState("");

  const links = linksQuery.data || [];

  const doDelete = async () => {
    setDeleteError("");
    try {
      await remove.mutateAsync(confirmDelete.id);
      setConfirmDelete(null);
    } catch (err) {
      setDeleteError(err.message || "Não foi possível apagar.");
    }
  };

  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <div style={{ ...serif, fontSize: 17, color: c.ink }}>Documentos de faturas</div>
        {!isClient && (
          <button onClick={() => setAdding(true)} style={btnPrimary}>
            <Plus size={14} /> Adicionar link
          </button>
        )}
      </div>

      {linksQuery.isError && <div style={{ ...sans, fontSize: 12.5, color: c.rose, marginBottom: 10 }}>Não foi possível carregar os documentos.</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {links.map((link) => (
          <div key={link.id} style={{ display: "flex", alignItems: "center", gap: 14, background: "#fff", border: `1px solid ${c.line}`, borderRadius: 12, padding: "14px 18px", flexWrap: "wrap" }}>
            <FileText size={18} color={c.boss} style={{ flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 180 }}>
              <a href={link.url} target="_blank" rel="noopener noreferrer" style={{ ...serif, fontSize: 15, color: c.ink, textDecoration: "none", wordBreak: "break-word" }}>
                {link.name}
              </a>
              <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginTop: 2 }}>
                {[formatDate(link.document_date), hostOf(link.url)].filter(Boolean).join(" · ")}
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <a href={link.url} target="_blank" rel="noopener noreferrer" style={{ ...btnGhost, textDecoration: "none" }}>
                <ExternalLink size={13} /> Abrir
              </a>
              {!isClient && (
                <>
                  <button onClick={() => setEditing(link)} aria-label={`Editar ${link.name}`} style={{ background: "none", border: "none", cursor: "pointer", color: c.mist, padding: 6 }}>
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => { setDeleteError(""); setConfirmDelete(link); }} aria-label={`Apagar ${link.name}`} style={{ background: "none", border: "none", cursor: "pointer", color: c.mist, padding: 6 }}>
                    <Trash2 size={14} />
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
        {!linksQuery.isLoading && links.length === 0 && (
          <div style={{ ...sans, fontSize: 13, color: c.mistLight, textAlign: "center", padding: "28px 0" }}>
            {isClient ? "Ainda não há faturas disponíveis." : "Ainda não há documentos. Usa “Adicionar link” para pôr aqui o link de cada fatura."}
          </div>
        )}
      </div>

      {!isClient && adding && (
        <Modal title="Adicionar fatura" onClose={() => setAdding(false)} width={440}>
          <LinkForm
            submitLabel="Adicionar"
            pending={create.isPending}
            onCancel={() => setAdding(false)}
            onSubmit={async (values) => { await create.mutateAsync(values); setAdding(false); }}
          />
        </Modal>
      )}

      {!isClient && editing && (
        <Modal title="Editar documento" onClose={() => setEditing(null)} width={440}>
          <LinkForm
            initial={editing}
            submitLabel="Guardar"
            pending={update.isPending}
            onCancel={() => setEditing(null)}
            onSubmit={async (values) => { await update.mutateAsync({ id: editing.id, ...values }); setEditing(null); }}
          />
        </Modal>
      )}

      {confirmDelete && (
        <Modal title="Apagar documento" onClose={() => setConfirmDelete(null)} width={380}>
          <div style={{ ...sans, fontSize: 13, color: c.ink, lineHeight: 1.6, marginBottom: 14, wordBreak: "break-word" }}>
            Apagar <b>{confirmDelete.name}</b>? O cliente deixa de ver este link (a fatura em si não é apagada).
          </div>
          {deleteError && <div style={{ ...sans, fontSize: 12, color: c.rose, marginBottom: 10 }}>{deleteError}</div>}
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={doDelete} disabled={remove.isPending} style={{ ...btnPrimary, background: c.rose }}>
              {remove.isPending ? "A apagar…" : "Apagar"}
            </button>
            <button onClick={() => setConfirmDelete(null)} style={btnGhost}>Cancelar</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
