import { lazy, Suspense, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabaseClient.js";
import { c, sans, serif, Eyebrow, Modal, inputStyle, btnPrimary, btnGhost, display } from "../../shared/theme.jsx";
import { Plus, ArrowLeft, Save, Send, Download, Trash2, FileSignature } from "lucide-react";
import ContractViewer, { StatusPill } from "./ContractViewer.jsx";
import SendContractModal from "./SendContractModal.jsx";
import { downloadContractPdf, formatDateTime, renderContractHtml } from "./contractDoc.js";
import { invalidateContracts, useAgencyId, useAgencyName, useContracts } from "./contractsData.js";

// O editor (TipTap) só é descarregado quando se abre um rascunho.
const ContractEditor = lazy(() => import("./ContractEditor.jsx"));

/* ---------------------------------------------------------
   CONTRATOS DA AGÊNCIA — criar e editar (texto rico), assinar,
   enviar por email para o outro lado assinar, guardar e descarregar
   em PDF. Ver supabase/70_contracts.sql e as funções contract-send /
   contract-sign. O botão "Assinar e enviar" congela o texto.
--------------------------------------------------------- */

const STARTER_HTML = `<h1>Contrato de Prestação de Serviços</h1>
<p>Entre <strong>[Nome da agência]</strong>, com sede em [morada], NIF [NIF], adiante designada por <strong>Prestador</strong>, e <strong>[Nome do cliente]</strong>, com sede em [morada], NIF [NIF], adiante designado por <strong>Cliente</strong>, é celebrado o presente contrato, que se rege pelas cláusulas seguintes.</p>
<h2>Cláusula 1.ª — Objeto</h2>
<p>[Descrição dos serviços a prestar.]</p>
<h2>Cláusula 2.ª — Preço e pagamento</h2>
<p>[Valor, periodicidade e condições de pagamento.]</p>
<h2>Cláusula 3.ª — Duração e rescisão</h2>
<p>[Data de início, duração e condições de rescisão.]</p>
<h2>Cláusula 4.ª — Disposições finais</h2>
<p>[Confidencialidade, lei aplicável e foro.]</p>
<p></p>
<p>{{assinatura_agencia}}</p>
<p>{{assinatura_cliente}}</p>`;

const FILTERS = [
  { key: "all", label: "Todos" },
  { key: "draft", label: "Rascunhos" },
  { key: "sent", label: "Aguardam assinatura" },
  { key: "signed", label: "Assinados" },
  { key: "cancelled", label: "Cancelados" },
];

function useBrandOptions() {
  return useQuery({
    queryKey: ["contract_brand_options"],
    queryFn: async () => {
      const { data, error } = await supabase.from("brands").select("id, name, agency_id").order("name");
      if (error) throw error;
      return data;
    },
  });
}

function useSaveContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, fields }) => {
      if (id) {
        const { error } = await supabase.from("contracts").update(fields).eq("id", id);
        if (error) throw error;
        return id;
      }
      const { data, error } = await supabase.from("contracts").insert(fields).select("id").single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: () => invalidateContracts(qc),
  });
}

function useDeleteContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from("contracts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidateContracts(qc),
  });
}

/* ---------------------------------------------------------
   EDITAR RASCUNHO
--------------------------------------------------------- */
function ContractEditPage({ session, contract, onBack, onOpen }) {
  const agencyIdQuery = useAgencyId(session);
  const brandsQuery = useBrandOptions();
  const saveContract = useSaveContract();
  const deleteContract = useDeleteContract();

  const [savedId, setSavedId] = useState(contract?.id || null);
  const [title, setTitle] = useState(contract?.title || "");
  const [brandId, setBrandId] = useState(contract?.brand_id || "");
  const [counterpartyName, setCounterpartyName] = useState(contract?.counterparty_name || "");
  const [counterpartyEmail, setCounterpartyEmail] = useState(contract?.counterparty_email || "");
  const [body, setBody] = useState(contract?.body_html ?? STARTER_HTML);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [sendFor, setSendFor] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

  const brand = (brandsQuery.data || []).find((b) => b.id === brandId);
  const agencyId = brand?.agency_id || agencyIdQuery.data;
  const agencyNameQuery = useAgencyName(agencyId);

  const save = async () => {
    setError("");
    setNotice("");
    if (!title.trim()) { setError("Dá um título ao contrato."); return null; }
    if (!agencyId) { setError("Não foi possível determinar a agência."); return null; }
    try {
      const id = await saveContract.mutateAsync({
        id: savedId,
        fields: {
          title: title.trim(),
          body_html: body,
          brand_id: brandId || null,
          counterparty_name: counterpartyName.trim() || null,
          counterparty_email: counterpartyEmail.trim().toLowerCase() || null,
          ...(savedId ? {} : { agency_id: agencyId, created_by: session.id }),
        },
      });
      setSavedId(id);
      setNotice("Rascunho guardado.");
      return id;
    } catch (err) {
      setError(err.message || "Não foi possível guardar.");
      return null;
    }
  };

  const startSend = async () => {
    if (!counterpartyName.trim()) { setError("Indica o nome da outra parte."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(counterpartyEmail.trim())) { setError("Indica um email válido para a outra parte."); return; }
    const id = await save();
    if (id) setSendFor({ id, title: title.trim(), counterparty_name: counterpartyName.trim(), counterparty_email: counterpartyEmail.trim().toLowerCase() });
  };

  const downloadDraftPdf = async () => {
    setPdfBusy(true);
    try {
      const draft = { title: title || "Contrato", body_html: body, counterparty_name: counterpartyName, status: "draft" };
      await downloadContractPdf(renderContractHtml({ contract: draft, signers: [], agencyName: agencyNameQuery.data || "" }), title);
    } catch (err) {
      setError(err.message || "Não foi possível gerar o PDF.");
    } finally {
      setPdfBusy(false);
    }
  };

  const remove = async () => {
    try {
      await deleteContract.mutateAsync(savedId);
      onBack();
    } catch (err) {
      setError(err.message || "Não foi possível apagar.");
      setConfirmDelete(false);
    }
  };

  const label = { ...sans, fontSize: 12.5, color: c.mist, marginBottom: 5 };

  return (
    <div>
      <button onClick={onBack} style={{ ...sans, display: "flex", alignItems: "center", gap: 6, fontSize: 14, color: c.mist, background: "none", border: "none", cursor: "pointer", marginBottom: 16 }}>
        <ArrowLeft size={14} /> Contratos
      </button>
      <Eyebrow>Contratos</Eyebrow>
      <h1 style={{ ...display, fontSize: 27,  color: c.ink, margin: "0 0 20px" }}>{savedId ? "Editar contrato" : "Novo contrato"}</h1>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 12, marginBottom: 18 }}>
        <div style={{ gridColumn: "1 / -1" }}>
          <div style={label}>Título</div>
          <input style={inputStyle} value={title} maxLength={160} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Contrato de prestação de serviços — Marca X" />
        </div>
        <div>
          <div style={label}>Marca (opcional — aparece na aba Contratos dessa marca)</div>
          <select style={inputStyle} value={brandId} onChange={(e) => setBrandId(e.target.value)}>
            <option value="">Sem marca associada</option>
            {(brandsQuery.data || []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <div>
          <div style={label}>Nome da outra parte</div>
          <input style={inputStyle} value={counterpartyName} maxLength={120} onChange={(e) => setCounterpartyName(e.target.value)} placeholder="Quem vai assinar" />
        </div>
        <div>
          <div style={label}>Email da outra parte</div>
          <input style={inputStyle} type="email" value={counterpartyEmail} maxLength={200} onChange={(e) => setCounterpartyEmail(e.target.value)} placeholder="email@exemplo.com" />
        </div>
      </div>

      <Suspense fallback={<div style={{ ...sans, fontSize: 14.5, color: c.mist, padding: 24 }}>A carregar o editor…</div>}>
        <ContractEditor value={body} onChange={setBody} />
      </Suspense>

      {error && <div style={{ ...sans, fontSize: 14, color: c.rose, marginTop: 14 }}>{error}</div>}
      {notice && !error && <div style={{ ...sans, fontSize: 14, color: c.sage, marginTop: 14 }}>{notice}</div>}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16 }}>
        <button onClick={save} disabled={saveContract.isPending} style={btnGhost}>
          <Save size={13} /> {saveContract.isPending ? "A guardar…" : "Guardar rascunho"}
        </button>
        <button onClick={downloadDraftPdf} disabled={pdfBusy} style={btnGhost}>
          <Download size={13} /> {pdfBusy ? "A gerar PDF…" : "PDF do rascunho"}
        </button>
        <button onClick={startSend} disabled={saveContract.isPending} style={btnPrimary}>
          <Send size={13} /> Assinar e enviar
        </button>
        {savedId && (
          <button onClick={() => setConfirmDelete(true)} style={{ ...btnGhost, color: c.rose, marginLeft: "auto" }}>
            <Trash2 size={13} /> Apagar rascunho
          </button>
        )}
      </div>

      {sendFor && (
        <SendContractModal
          contract={sendFor}
          onClose={() => setSendFor(null)}
          onSent={() => { setSendFor(null); onOpen(sendFor.id); }}
        />
      )}

      {confirmDelete && (
        <Modal title="Apagar rascunho" onClose={() => setConfirmDelete(false)} width={360}>
          <div style={{ ...sans, fontSize: 14.5, color: c.ink, marginBottom: 16 }}>Apagar este rascunho? Esta ação não pode ser desfeita.</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={remove} disabled={deleteContract.isPending} style={{ ...btnPrimary, background: c.roseSolid }}>Apagar</button>
            <button onClick={() => setConfirmDelete(false)} style={btnGhost}>Cancelar</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ---------------------------------------------------------
   MÓDULO
--------------------------------------------------------- */
export default function ContractsModule({ session }) {
  const contractsQuery = useContracts();
  const [view, setView] = useState({ type: "list" }); // list | edit(id|null) | view(id)
  const [filter, setFilter] = useState("all");

  const contracts = contractsQuery.data || [];
  const current = view.id ? contracts.find((ct) => ct.id === view.id) : null;

  let body;
  if (view.type === "edit" && (view.id === null || current)) {
    body = (
      <ContractEditPage
        key={view.id || "new"}
        session={session}
        contract={current}
        onBack={() => setView({ type: "list" })}
        onOpen={(id) => setView({ type: "view", id })}
      />
    );
  } else if (view.type === "view" && current) {
    body = <ContractViewer contract={current} canManage onBack={() => setView({ type: "list" })} onChanged={() => setView({ type: "list" })} />;
  } else {
    const shown = contracts.filter((ct) => filter === "all" || ct.status === filter);
    body = (
      <div>
        <Eyebrow>Contratos</Eyebrow>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
          <h1 style={{ ...display, fontSize: 27,  color: c.ink, margin: 0 }}>Contratos</h1>
          <button onClick={() => setView({ type: "edit", id: null })} style={btnPrimary}>
            <Plus size={14} /> Novo contrato
          </button>
        </div>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              style={{
                ...sans, fontSize: 13.5, fontWeight: 600, padding: "6px 12px", borderRadius: 999, cursor: "pointer",
                border: `1px solid ${filter === f.key ? c.boss : c.line}`, color: filter === f.key ? "#fff" : c.mist, background: filter === f.key ? c.boss : c.folha,
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        {contractsQuery.isLoading && <div style={{ ...sans, fontSize: 14.5, color: c.mist }}>A carregar…</div>}
        {contractsQuery.isError && <div style={{ ...sans, fontSize: 14, color: c.rose }}>Não foi possível carregar os contratos.</div>}
        {contractsQuery.data && shown.length === 0 && (
          <div style={{ ...sans, fontSize: 14.5, color: c.mist }}>
            {contracts.length === 0 ? "Ainda não há contratos. Cria o primeiro com “Novo contrato”." : "Nenhum contrato neste filtro."}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {shown.map((ct) => (
            <button
              key={ct.id}
              onClick={() => setView({ type: ct.status === "draft" ? "edit" : "view", id: ct.id })}
              style={{ display: "flex", alignItems: "center", gap: 14, background: c.folha, border: `1px solid ${c.line}`, borderRadius: 3, padding: "12px 16px", cursor: "pointer", textAlign: "left", width: "100%", flexWrap: "wrap" }}
            >
              <FileSignature size={18} color={c.bossText} style={{ flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ ...serif, fontSize: 14.5, color: c.ink }}>{ct.title}</div>
                <div style={{ ...sans, fontSize: 12.5, color: c.mist, marginTop: 2 }}>
                  {[ct.brands?.name, ct.counterparty_name, formatDateTime(ct.updated_at || ct.created_at)].filter(Boolean).join(", ")}
                </div>
              </div>
              <StatusPill status={ct.status} />
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bb-page" style={{ padding: "8px 40px 60px", maxWidth: 1080 }}>
      {body}
    </div>
  );
}
