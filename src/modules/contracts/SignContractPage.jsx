import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { invokeFunction } from "../../lib/supabaseClient.js";
import { c, sans, serif, inputStyle, btnPrimary, display } from "../../shared/theme.jsx";
import { CheckCircle2, Download, FileSignature } from "lucide-react";
import ContractDocument from "./ContractDocument.jsx";
import SignaturePad from "./SignaturePad.jsx";
import { downloadContractPdf, formatDateTime, renderContractHtml } from "./contractDoc.js";

/* ---------------------------------------------------------
   PÁGINA PÚBLICA DE ASSINATURA — /assinar/:token
   Aberta a partir do email. O token é a única credencial; todas as
   leituras e a gravação da assinatura passam pela função contract-sign
   (sem login). Depois de assinado, a mesma ligação serve para ver e
   descarregar o PDF final.
--------------------------------------------------------- */
export default function SignContractPage() {
  const { token } = useParams();
  const [state, setState] = useState({ loading: true, error: "", data: null });
  const [name, setName] = useState("");
  const [signature, setSignature] = useState(null);
  const [agree, setAgree] = useState(false);
  const [signing, setSigning] = useState(false);
  const [formError, setFormError] = useState("");
  const [pdfBusy, setPdfBusy] = useState(false);

  useEffect(() => {
    document.title = "Assinar contrato";
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);

  const load = useCallback(async () => {
    try {
      const data = await invokeFunction("contract-sign", { action: "view", token });
      setState({ loading: false, error: "", data });
      setName((prev) => prev || data.contract.counterparty_name || "");
    } catch (err) {
      setState({ loading: false, error: err.message || "Não foi possível abrir o contrato.", data: null });
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const sign = async () => {
    setFormError("");
    if (name.trim().length < 2) { setFormError("Escreve o teu nome completo."); return; }
    if (!signature) { setFormError("Desenha a tua assinatura."); return; }
    if (!agree) { setFormError("Confirma que leste e aceitas o contrato."); return; }
    setSigning(true);
    try {
      await invokeFunction("contract-sign", { action: "sign", token, name: name.trim(), signatureImage: signature, agree: true });
      await load();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setFormError(err.message || "Não foi possível assinar.");
    } finally {
      setSigning(false);
    }
  };

  const downloadPdf = async () => {
    setPdfBusy(true);
    try {
      const { contract, signers } = state.data;
      await downloadContractPdf(renderContractHtml({ contract, signers, agencyName: contract.agency_name }), contract.title);
    } catch (err) {
      setFormError(err.message || "Não foi possível gerar o PDF.");
    } finally {
      setPdfBusy(false);
    }
  };

  const shell = (children) => (
    <div style={{ minHeight: "100vh", background: c.paper, ...sans }}>
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "28px 16px 64px" }}>{children}</div>
    </div>
  );

  if (state.loading) return shell(<div style={{ fontSize: 14.5, color: c.mist }}>A abrir o contrato…</div>);

  if (state.error) {
    return shell(
      <div style={{ background: c.folha, border: `1px solid ${c.line}`, borderRadius: 3, padding: 28, textAlign: "center" }}>
        <FileSignature size={28} color={c.mistLight} />
        <div style={{ ...serif, fontSize: 19, color: c.ink, margin: "12px 0 6px" }}>Não foi possível abrir o contrato</div>
        <div style={{ fontSize: 14.5, color: c.mist }}>{state.error}</div>
      </div>
    );
  }

  const { contract, signers, canSign } = state.data;
  const signed = contract.status === "signed";
  const mine = signers.find((s) => s.role === "counterparty");

  return shell(
    <>
      <div style={{ ...serif, fontSize: 14.5, color: c.bossText, marginBottom: 6 }}>{contract.agency_name}</div>
      <h1 style={{ ...display, fontSize: 26,  color: c.ink, margin: "0 0 16px" }}>{contract.title}</h1>

      {signed ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10, background: c.sageSoft, border: `1px solid ${c.sage}`, borderRadius: 3, padding: "12px 16px", marginBottom: 16, flexWrap: "wrap" }}>
          <CheckCircle2 size={18} color={c.sage} />
          <div style={{ fontSize: 14.5, color: c.ink, flex: 1, minWidth: 200 }}>
            Contrato assinado por ambas as partes{contract.completed_at ? ` em ${formatDateTime(contract.completed_at)}` : ""}.
          </div>
          <button onClick={downloadPdf} disabled={pdfBusy} style={btnPrimary}>
            <Download size={14} /> {pdfBusy ? "A gerar PDF…" : "Descarregar PDF"}
          </button>
        </div>
      ) : (
        <div style={{ fontSize: 14.5, color: c.mist, lineHeight: 1.6, marginBottom: 16 }}>
          Leia o contrato com atenção. No fim desta página pode assiná-lo. A agência já assinou.
        </div>
      )}

      <ContractDocument contract={contract} signers={signers} agencyName={contract.agency_name} />

      {canSign && (
        <div style={{ background: c.folha, border: `1px solid ${c.line}`, borderRadius: 3, padding: 22, marginTop: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ ...serif, fontSize: 18, color: c.ink }}>Assinar o contrato</div>
          <div>
            <div style={{ fontSize: 12.5, color: c.mist, marginBottom: 5 }}>O seu nome completo</div>
            <input style={inputStyle} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </div>
          <div>
            <div style={{ fontSize: 12.5, color: c.mist, marginBottom: 5 }}>A sua assinatura</div>
            <SignaturePad onChange={setSignature} disabled={signing} />
          </div>
          <label style={{ fontSize: 14, color: c.ink, display: "flex", alignItems: "flex-start", gap: 8, lineHeight: 1.5 }}>
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} style={{ marginTop: 3 }} />
            Li o contrato e aceito os seus termos. Sei que esta assinatura eletrónica fica registada com a data, hora e endereço IP.
          </label>
          {formError && <div style={{ fontSize: 14, color: c.rose }}>{formError}</div>}
          <div>
            <button onClick={sign} disabled={signing} style={btnPrimary}>{signing ? "A assinar…" : "Assinar contrato"}</button>
          </div>
        </div>
      )}

      {!canSign && !signed && mine?.signed_at && (
        <div style={{ fontSize: 14.5, color: c.mist, marginTop: 16 }}>A sua assinatura foi registada.</div>
      )}
      {formError && (signed || !canSign) && <div style={{ fontSize: 14, color: c.rose, marginTop: 12 }}>{formError}</div>}
    </>
  );
}
