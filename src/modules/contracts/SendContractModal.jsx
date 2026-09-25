import { useState } from "react";
import { invokeFunction } from "../../lib/supabaseClient.js";
import { c, sans, Modal, inputStyle, btnPrimary, btnGhost } from "../../shared/theme.jsx";
import SignaturePad from "./SignaturePad.jsx";

/* ---------------------------------------------------------
   "Assinar e enviar": a agência desenha a assinatura, o texto fica
   congelado e o outro lado recebe o email com a ligação para assinar.
--------------------------------------------------------- */
export default function SendContractModal({ contract, onClose, onSent }) {
  const [signerName, setSignerName] = useState("");
  const [signature, setSignature] = useState(null);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const send = async () => {
    setError("");
    if (signerName.trim().length < 2) { setError("Escreve o nome de quem assina pela agência."); return; }
    if (!signature) { setError("Desenha a assinatura."); return; }
    if (!agree) { setError("Confirma que leste o contrato."); return; }
    setBusy(true);
    try {
      const data = await invokeFunction("contract-send", {
        contractId: contract.id,
        signerName: signerName.trim(),
        signatureImage: signature,
        appUrl: window.location.origin,
      });
      setResult(data);
    } catch (err) {
      setError(err.message || "Não foi possível enviar o contrato.");
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    return (
      <Modal title="Contrato enviado" onClose={() => onSent()} width={440}>
        <div style={{ ...sans, fontSize: 13, color: c.ink, lineHeight: 1.6, marginBottom: 16 }}>
          O contrato ficou assinado pela agência e bloqueado (já não se pode editar).
          {result.emailSent ? (
            <> Enviámos um email a <b>{contract.counterparty_email}</b> com a ligação para ler e assinar.</>
          ) : (
            <div style={{ color: c.rose, marginTop: 10 }}>
              Mas o email não seguiu: {result.emailError || "erro desconhecido"}. Abre o contrato e usa "Reenviar email" depois de corrigires a configuração.
            </div>
          )}
        </div>
        <button onClick={() => onSent()} style={btnPrimary}>Ver contrato</button>
      </Modal>
    );
  }

  return (
    <Modal title="Assinar e enviar" onClose={busy ? () => {} : onClose} width={500}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ ...sans, fontSize: 12.5, color: c.mist, lineHeight: 1.6 }}>
          Vais assinar <b style={{ color: c.ink }}>«{contract.title}»</b> em nome da agência e enviá-lo para <b style={{ color: c.ink }}>{contract.counterparty_name}</b> ({contract.counterparty_email}). Depois de enviado, o texto não pode ser alterado.
        </div>
        <div>
          <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginBottom: 5 }}>O teu nome (quem assina pela agência)</div>
          <input style={inputStyle} value={signerName} maxLength={120} onChange={(e) => setSignerName(e.target.value)} placeholder="Nome completo" />
        </div>
        <div>
          <div style={{ ...sans, fontSize: 11.5, color: c.mist, marginBottom: 5 }}>Assinatura</div>
          <SignaturePad onChange={setSignature} disabled={busy} />
        </div>
        <label style={{ ...sans, fontSize: 12.5, color: c.ink, display: "flex", alignItems: "flex-start", gap: 7 }}>
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} style={{ marginTop: 2 }} />
          Li o contrato e assino-o em nome da agência.
        </label>
        {error && <div style={{ ...sans, fontSize: 12.5, color: c.rose }}>{error}</div>}
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={send} disabled={busy} style={btnPrimary}>{busy ? "A enviar…" : "Assinar e enviar"}</button>
          <button onClick={onClose} disabled={busy} style={btnGhost}>Cancelar</button>
        </div>
      </div>
    </Modal>
  );
}
