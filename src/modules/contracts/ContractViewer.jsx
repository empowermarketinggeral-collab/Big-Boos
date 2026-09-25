import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase, invokeFunction } from "../../lib/supabaseClient.js";
import { c, sans, serif, Modal, btnPrimary, btnGhost } from "../../shared/theme.jsx";
import { ArrowLeft, Download, Send, Ban, Eye } from "lucide-react";
import ContractDocument from "./ContractDocument.jsx";
import { CONTRACT_STATUS, downloadContractPdf, formatDateTime, renderContractHtml } from "./contractDoc.js";
import { useAgencyName, useContractSigners, invalidateContracts } from "./contractsData.js";

export function StatusPill({ status }) {
  const s = CONTRACT_STATUS[status] || CONTRACT_STATUS.draft;
  return (
    <span style={{ ...sans, fontSize: 11, fontWeight: 700, color: s.color, background: `${s.color}1A`, borderRadius: 999, padding: "3px 10px", whiteSpace: "nowrap" }}>
      {s.label}
    </span>
  );
}

function InfoRow({ label, value }) {
  if (!value) return null;
  return (
    <div style={{ display: "flex", gap: 8, ...sans, fontSize: 12.5, color: c.ink, flexWrap: "wrap" }}>
      <span style={{ color: c.mist, minWidth: 150 }}>{label}</span>
      <span>{value}</span>
    </div>
  );
}

/* ---------------------------------------------------------
   Contrato já enviado/assinado (ou pré-visualização de leitura).
   A equipa pode reenviar o email e cancelar; toda a gente com acesso
   descarrega o PDF (gerado no browser a partir do texto guardado).
--------------------------------------------------------- */
export default function ContractViewer({ contract, canManage, onBack, onChanged }) {
  const qc = useQueryClient();
  const agencyNameQuery = useAgencyName(contract.agency_id);
  const signersQuery = useContractSigners(contract.id, contract.status !== "draft");
  const signers = signersQuery.data || [];
  const agencyName = agencyNameQuery.data || "";
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState({ text: "", ok: true });
  const [confirmCancel, setConfirmCancel] = useState(false);

  const counterparty = signers.find((s) => s.role === "counterparty");
  const agencySigner = signers.find((s) => s.role === "agency");

  const downloadPdf = async () => {
    setBusy("pdf");
    setNotice({ text: "", ok: true });
    try {
      await downloadContractPdf(renderContractHtml({ contract, signers, agencyName }), contract.title);
    } catch (err) {
      setNotice({ text: err.message || "Não foi possível gerar o PDF.", ok: false });
    } finally {
      setBusy("");
    }
  };

  const resend = async () => {
    setBusy("resend");
    setNotice({ text: "", ok: true });
    try {
      await invokeFunction("contract-send", { contractId: contract.id, resend: true, appUrl: window.location.origin });
      setNotice({ text: `Email reenviado para ${contract.counterparty_email}.`, ok: true });
    } catch (err) {
      setNotice({ text: err.message || "Não foi possível reenviar o email.", ok: false });
    } finally {
      setBusy("");
    }
  };

  const cancel = async () => {
    setBusy("cancel");
    try {
      const { error } = await supabase.from("contracts").update({ status: "cancelled" }).eq("id", contract.id);
      if (error) throw error;
      invalidateContracts(qc);
      setConfirmCancel(false);
      onChanged?.();
    } catch (err) {
      setNotice({ text: err.message || "Não foi possível cancelar.", ok: false });
      setConfirmCancel(false);
    } finally {
      setBusy("");
    }
  };

  return (
    <div>
      {onBack && (
        <button onClick={onBack} style={{ ...sans, display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: c.mist, background: "none", border: "none", cursor: "pointer", marginBottom: 16 }}>
          <ArrowLeft size={14} /> Contratos
        </button>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <h1 style={{ ...serif, fontSize: 24, fontWeight: 500, color: c.ink, margin: 0 }}>{contract.title}</h1>
        <StatusPill status={contract.status} />
      </div>

      <div style={{ background: "#fff", border: `1px solid ${c.line}`, borderRadius: 12, padding: 16, display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
        <InfoRow label="Marca" value={contract.brands?.name} />
        <InfoRow label="Outra parte" value={[contract.counterparty_name, contract.counterparty_email].filter(Boolean).join(" · ")} />
        <InfoRow label="Assinado pela agência" value={contract.agency_signed_at && `${agencySigner?.name ? `${agencySigner.name} · ` : ""}${formatDateTime(contract.agency_signed_at)}`} />
        <InfoRow label="Enviado por email" value={formatDateTime(contract.sent_at)} />
        {contract.status === "sent" && canManage && (
          <InfoRow label="Aberto pelo destinatário" value={counterparty?.first_viewed_at ? `Sim — ${formatDateTime(counterparty.last_viewed_at)}` : "Ainda não"} />
        )}
        <InfoRow label="Assinado pela outra parte" value={contract.counterparty_signed_at && `${counterparty?.name ? `${counterparty.name} · ` : ""}${formatDateTime(contract.counterparty_signed_at)}`} />
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        <button onClick={downloadPdf} disabled={busy === "pdf"} style={btnPrimary}>
          <Download size={14} /> {busy === "pdf" ? "A gerar PDF…" : "Descarregar PDF"}
        </button>
        {canManage && contract.status === "sent" && (
          <>
            <button onClick={resend} disabled={busy === "resend"} style={btnGhost}>
              <Send size={13} /> {busy === "resend" ? "A enviar…" : "Reenviar email"}
            </button>
            <button onClick={() => setConfirmCancel(true)} style={{ ...btnGhost, color: c.rose }}>
              <Ban size={13} /> Cancelar contrato
            </button>
          </>
        )}
      </div>

      {notice.text && <div style={{ ...sans, fontSize: 12.5, color: notice.ok ? c.sage : c.rose, marginBottom: 12 }}>{notice.text}</div>}
      {contract.status === "cancelled" && (
        <div style={{ ...sans, fontSize: 12.5, color: c.rose, marginBottom: 12 }}>
          <Eye size={12} style={{ verticalAlign: -1 }} /> Contrato cancelado — a ligação enviada ao destinatário deixou de funcionar.
        </div>
      )}

      <ContractDocument contract={contract} signers={signers} agencyName={agencyName} />

      {confirmCancel && (
        <Modal title="Cancelar contrato" onClose={() => setConfirmCancel(false)} width={380}>
          <div style={{ ...sans, fontSize: 13, color: c.ink, lineHeight: 1.6, marginBottom: 16 }}>
            A ligação enviada a {contract.counterparty_name || "o destinatário"} deixa de funcionar e o contrato não poderá ser assinado. Esta ação não pode ser desfeita.
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={cancel} disabled={busy === "cancel"} style={{ ...btnPrimary, background: c.rose }}>
              {busy === "cancel" ? "A cancelar…" : "Cancelar contrato"}
            </button>
            <button onClick={() => setConfirmCancel(false)} style={btnGhost}>Voltar</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
