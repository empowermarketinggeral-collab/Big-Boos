import { useRef } from "react";
import { Plus } from "lucide-react";
import { c, sans } from "./theme.jsx";

/* ---------------------------------------------------------
   VARIÁVEIS NAS MENSAGENS (campanhas de email, SMS e WhatsApp)
   Botões que põem no texto, onde está o cursor, um campo do contacto.
   O envio troca-o pelo valor de cada pessoa. A reserva vazia ("|")
   garante que a mensagem sai sempre: se a ficha não tiver o dado, fica
   em branco em vez de o contacto ser saltado.
--------------------------------------------------------- */

export const MESSAGE_VARIABLES = [
  { token: "{{primeiro_nome|}}", label: "Primeiro nome" },
  { token: "{{nome|}}", label: "Nome completo" },
  { token: "{{telefone|}}", label: "Telemóvel" },
  { token: "{{email|}}", label: "Email" },
];

// Liga um campo de texto aos botões: devolve o ref para o campo e insert(token).
export function useVariableInsert(value, setValue) {
  const ref = useRef(null);
  const insert = (token) => {
    const el = ref.current;
    const text = value || "";
    const start = el && typeof el.selectionStart === "number" ? el.selectionStart : text.length;
    const end = el && typeof el.selectionEnd === "number" ? el.selectionEnd : text.length;
    const next = text.slice(0, start) + token + text.slice(end);
    setValue(next);
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const caret = start + token.length;
      el.setSelectionRange?.(caret, caret);
    });
  };
  return { ref, insert };
}

export function VariableChips({ onInsert, disabled, hint = true }) {
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {MESSAGE_VARIABLES.map((v) => (
          <button
            key={v.token}
            type="button"
            disabled={disabled}
            onClick={() => onInsert(v.token)}
            style={{ ...sans, fontSize: 12.5, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 999, cursor: disabled ? "default" : "pointer", border: `1px solid ${c.lineStrong}`, background: c.folha, color: c.bossText }}
          >
            <Plus size={12} /> {v.label}
          </button>
        ))}
      </div>
      {hint && <div style={{ ...sans, fontSize: 12.5, color: c.mist, marginTop: 5 }}>Cada pessoa recebe os seus dados. Se faltar algum na ficha, esse espaço fica em branco.</div>}
    </div>
  );
}

// Resumo dos destinatários: quantos têm as tags e quantos podem mesmo receber.
export function RecipientSummary({ tagged, reachable, channelLabel }) {
  const blocked = Math.max(0, tagged - reachable);
  return (
    <div style={{ ...sans, fontSize: 13.5, color: c.mist, marginTop: 12, lineHeight: 1.6 }}>
      <div><b style={{ color: c.ink }}>{reachable}</b> contacto(s) vão receber.</div>
      {blocked > 0 && (
        <div style={{ color: c.amber }}>
          {blocked} {blocked === 1 ? "contacto tem" : "contactos têm"} estas tags mas não {blocked === 1 ? "recebe" : "recebem"}: sem consentimento de {channelLabel} ou sem {channelLabel === "email" ? "email" : "telemóvel"} na ficha.
        </div>
      )}
    </div>
  );
}

// Tags de quem nunca recebe campanhas, com ou sem consentimento marcado.
export const BLOCKED_TAG_NAMES = ["não contactar", "nao contactar", "rgpd:opt-out"];
export const blockedContactIds = (tags = [], tagMap = []) => {
  const blocked = new Set(tags.filter((t) => BLOCKED_TAG_NAMES.includes(String(t.name || "").trim().toLowerCase())).map((t) => t.id));
  return new Set(tagMap.filter((m) => blocked.has(m.tag_id)).map((m) => m.contact_id));
};

// Envia em lotes de 500 (o limite de cada envio) e soma os resultados.
export async function sendInBatches(contactIds, sendBatch) {
  const total = { sent: 0, skipped: 0, failed: 0 };
  const batches = [];
  for (let i = 0; i < contactIds.length; i += 500) batches.push(contactIds.slice(i, i + 500));
  for (let i = 0; i < batches.length; i++) {
    const r = await sendBatch(batches[i], { batchIndex: i, lastBatch: i === batches.length - 1 });
    total.sent += r?.sent || 0; total.skipped += r?.skipped || 0; total.failed += r?.failed || 0;
  }
  return total;
}

// Caixa "incluir quem não tem consentimento marcado".
export function IncludeWithoutConsent({ checked, onChange, channelLabel }) {
  return (
    <label style={{ ...sans, fontSize: 13.5, color: c.ink, display: "flex", alignItems: "flex-start", gap: 8, marginTop: 12, lineHeight: 1.5 }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} style={{ marginTop: 3 }} />
      <span>
        Enviar também a quem não tem o consentimento de {channelLabel} marcado
        <span style={{ display: "block", fontSize: 12.5, color: c.mist }}>Só para clientes que já tinham dado autorização antes. Quem tem a tag "Não contactar" ou pediu para sair nunca recebe.</span>
      </span>
    </label>
  );
}
