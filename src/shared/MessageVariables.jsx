import { useRef, useState } from "react";
import { Plus, Clock } from "lucide-react";
import { c, sans, Modal, inputStyle, btnPrimary, btnGhost } from "./theme.jsx";
import { supabase, invokeFunction } from "../lib/supabaseClient.js";

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

// Envia em lotes (500 por omissão; email 100) e soma os resultados e os motivos de falha.
export async function sendInBatches(contactIds, sendBatch, size = 500) {
  const total = { sent: 0, skipped: 0, failed: 0, errors: [] };
  const batches = [];
  for (let i = 0; i < contactIds.length; i += size) batches.push(contactIds.slice(i, i + size));
  for (let i = 0; i < batches.length; i++) {
    const r = await sendBatch(batches[i], { batchIndex: i, lastBatch: i === batches.length - 1 });
    total.sent += r?.sent || 0; total.skipped += r?.skipped || 0; total.failed += r?.failed || 0;
    for (const e of r?.errors || []) if (!total.errors.includes(e)) total.errors.push(e);
  }
  return total;
}

// Resultado de um envio: quantos foram, quantos ficaram de fora e porquê falharam.
export function SendResultSummary({ result, contactLabel = "contacto" }) {
  return (
    <div style={{ ...sans, fontSize: 14.5, color: c.ink, lineHeight: 1.8 }}>
      <div>{result.sent} enviados</div>
      <div>{result.skipped} ignorados (sem {contactLabel} válido, com a tag "Não contactar", sem consentimento ou sem dados para as variáveis)</div>
      {result.failed > 0 && <div style={{ color: c.rose }}>{result.failed} falharam</div>}
      {(result.errors || []).length > 0 && (
        <div style={{ fontSize: 13.5, color: c.rose, marginTop: 6, lineHeight: 1.5 }}>
          Motivo indicado pelo serviço de envio:
          {result.errors.map((e) => <div key={e}>{e}</div>)}
        </div>
      )}
      {result.sent === 0 && <div style={{ fontSize: 13.5, color: c.mist, marginTop: 6 }}>Como ninguém recebeu, a campanha voltou a rascunho para poder corrigir e enviar de novo.</div>}
    </div>
  );
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

/* ---------------------------------------------------------
   AGENDAR CAMPANHAS
   Guarda a hora e os destinatários escolhidos agora; à hora marcada a
   função campaigns-scheduled-run envia (um lote por minuto).
--------------------------------------------------------- */
const pad2 = (n) => String(n).padStart(2, "0");
const toLocalInput = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

export const formatScheduled = (iso) =>
  iso ? new Date(iso).toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";

// pace = { dailyLimit, windowStart, windowEnd } (opcional): máximo por dia e horário, hora de Lisboa.
export async function scheduleCampaign(table, campaignId, { at, contactIds, includeWithoutConsent, variableValues, pace }) {
  const { error } = await supabase.from(table).update({
    status: "scheduled",
    scheduled_at: at,
    scheduled_batch: 0,
    scheduled_offset: 0,
    sent_today: 0,
    sent_day: null,
    scheduled_payload: { contactIds, includeWithoutConsent: !!includeWithoutConsent, ...(variableValues ? { variableValues } : {}), ...(pace || {}) },
    last_error: null,
  }).eq("id", campaignId);
  if (error) throw error;
}

// Agendada e ainda não começou: volta a rascunho. Já a enviar aos poucos: para
// os envios que faltam (quem já recebeu fica registado) e fica como enviada.
export async function unscheduleCampaign(table, campaignId) {
  const { error } = await supabase.from(table)
    .update({ status: "draft", scheduled_at: null, scheduled_batch: 0, scheduled_offset: 0, scheduled_payload: null })
    .eq("id", campaignId).eq("status", "scheduled");
  if (error) throw error;
  const { error: stopError } = await supabase.from(table)
    .update({ status: "sent", scheduled_at: null })
    .eq("id", campaignId).eq("status", "sending").not("scheduled_at", "is", null);
  if (stopError) throw stopError;
}

// Janela para escolher dia e hora (hora de Portugal, a do telemóvel/computador).
export function ScheduleCampaignModal({ campaignName, recipientCount, onClose, onConfirm, defaultDailyLimit = "" }) {
  const soon = new Date(Date.now() + 60 * 60000);
  soon.setMinutes(0, 0, 0);
  const [value, setValue] = useState(toLocalInput(soon));
  const [dailyLimit, setDailyLimit] = useState(String(defaultDailyLimit || ""));
  const [windowStart, setWindowStart] = useState(defaultDailyLimit ? "10:00" : "");
  const [windowEnd, setWindowEnd] = useState(defaultDailyLimit ? "19:00" : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const limit = Math.max(0, parseInt(dailyLimit, 10) || 0);
  const days = limit && recipientCount > limit ? Math.ceil(recipientCount / limit) : 0;

  const confirm = async () => {
    setError("");
    const at = new Date(value);
    if (!value || Number.isNaN(at.getTime())) return setError("Escolha o dia e a hora.");
    if (at.getTime() < Date.now() + 60000) return setError("Escolha uma hora no futuro.");
    if ((windowStart || windowEnd) && !(windowStart && windowEnd && windowEnd > windowStart)) return setError("O horário tem de ter início e fim (ex: 10:00 a 19:00).");
    setBusy(true);
    try {
      await onConfirm(at.toISOString(), { ...(limit ? { dailyLimit: limit } : {}), ...(windowStart && windowEnd ? { windowStart, windowEnd } : {}) });
    } catch (err) {
      setError(err.message || "Não foi possível agendar.");
      setBusy(false);
    }
  };

  return (
    <Modal title="Agendar campanha" onClose={onClose} width={380}>
      <div style={{ ...sans, fontSize: 14.5, color: c.ink, marginBottom: 14, lineHeight: 1.6 }}>
        <strong>{campaignName}</strong> vai para <strong>{recipientCount}</strong> contacto(s), os que estão escolhidos agora.
      </div>
      <div style={{ ...sans, fontSize: 12.5, color: c.mist, marginBottom: 5 }}>Dia e hora do envio</div>
      <input type="datetime-local" value={value} min={toLocalInput(new Date())} onChange={(e) => setValue(e.target.value)} style={inputStyle} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(7rem, 1fr))", gap: 8, marginTop: 12 }}>
        <label style={{ ...sans, fontSize: 12.5, color: c.mist }}>Máximo por dia
          <input type="number" min="1" value={dailyLimit} onChange={(e) => setDailyLimit(e.target.value)} placeholder="Sem limite" style={{ ...inputStyle, marginTop: 5 }} />
        </label>
        <label style={{ ...sans, fontSize: 12.5, color: c.mist }}>Das
          <input type="time" value={windowStart} onChange={(e) => setWindowStart(e.target.value)} style={{ ...inputStyle, marginTop: 5 }} />
        </label>
        <label style={{ ...sans, fontSize: 12.5, color: c.mist }}>Até às
          <input type="time" value={windowEnd} onChange={(e) => setWindowEnd(e.target.value)} style={{ ...inputStyle, marginTop: 5 }} />
        </label>
      </div>
      {days > 0 && (
        <div style={{ ...sans, fontSize: 13.5, color: c.ink, marginTop: 8, lineHeight: 1.5 }}>
          Com {limit} por dia, os {recipientCount} contactos recebem ao longo de <strong>{days} dias</strong>.
        </div>
      )}
      <div style={{ ...sans, fontSize: 12.5, color: c.mist, marginTop: 8, lineHeight: 1.5 }}>
        O texto fica guardado como está agora. Para o mudar, cancele o agendamento e volte a agendar.
      </div>
      {error && <div style={{ ...sans, fontSize: 14, color: c.rose, marginTop: 10 }}>{error}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <button onClick={confirm} disabled={busy || recipientCount === 0} style={btnPrimary}>{busy ? "A agendar…" : "Agendar"}</button>
        <button onClick={onClose} style={btnGhost}>Cancelar</button>
      </div>
    </Modal>
  );
}

// Aviso no editor: agendada para X (com botão para cancelar) e último erro.
export function ScheduledNotice({ campaign, onCancel }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const total = (campaign.scheduled_payload?.contactIds || []).length;
  const pacing = campaign.status === "sending" && campaign.scheduled_at && total > 0;
  const scheduled = campaign.status === "scheduled" || pacing;
  if (!scheduled && !campaign.last_error) return null;
  const cancel = async () => {
    setBusy(true); setError("");
    try { await onCancel(); } catch (err) { setError(err.message || "Não foi possível cancelar."); setBusy(false); }
  };
  return (
    <div style={{ background: c.folha, border: `1px solid ${scheduled ? c.lineStrong : c.rose}`, borderRadius: 3, padding: "14px 18px", marginBottom: 20, maxWidth: 640 }}>
      {scheduled && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <Clock size={16} color={c.bossText} />
          <span style={{ ...sans, fontSize: 14.5, color: c.ink, flex: 1, minWidth: 180 }}>
            {pacing ? (
              <>A enviar aos poucos: <strong>{Math.min(total, campaign.scheduled_offset || 0)} de {total}</strong> já saíram. Próximos envios a partir de <strong>{formatScheduled(campaign.scheduled_at)}</strong>.</>
            ) : (
              <>Agendada para <strong>{formatScheduled(campaign.scheduled_at)}</strong> ({total} contacto(s))</>
            )}
            {campaign.scheduled_payload?.dailyLimit ? <span style={{ display: "block", fontSize: 13, color: c.mist }}>Máximo {campaign.scheduled_payload.dailyLimit} por dia{campaign.scheduled_payload.windowStart ? `, das ${campaign.scheduled_payload.windowStart} às ${campaign.scheduled_payload.windowEnd}` : ""}.</span> : null}
          </span>
          <button onClick={cancel} disabled={busy} style={{ ...btnGhost, padding: "6px 12px", fontSize: 13.5 }}>{busy ? "A parar…" : pacing ? "Parar os envios que faltam" : "Cancelar agendamento"}</button>
        </div>
      )}
      {campaign.last_error && (
        <div style={{ ...sans, fontSize: 13.5, color: c.rose, marginTop: scheduled ? 8 : 0, lineHeight: 1.5 }}>Último envio agendado: {campaign.last_error}</div>
      )}
      {error && <div style={{ ...sans, fontSize: 13.5, color: c.rose, marginTop: 8 }}>{error}</div>}
    </div>
  );
}

export const campaignStatusLabel = (cp) =>
  cp.status === "sent" ? "Enviada" : cp.status === "sending" ? (cp.scheduled_at && cp.scheduled_payload?.contactIds ? `A enviar (${Math.min(cp.scheduled_payload.contactIds.length, cp.scheduled_offset || 0)} de ${cp.scheduled_payload.contactIds.length})` : "A enviar") : cp.status === "scheduled" ? `Agendada ${formatScheduled(cp.scheduled_at)}` : "Rascunho";

/* ---------------------------------------------------------
   RESULTADOS DE UMA CAMPANHA (WhatsApp e SMS)
   Estado de cada envio: "sent" = aceite pela Twilio; "delivered"/"read"
   chegam depois pela Twilio (callback na twilio-whatsapp-webhook);
   "failed" traz o motivo. Agrupa as falhas por motivo.
--------------------------------------------------------- */
export function CampaignResults({ rows = [], channel = "whatsapp", loading, campaignId, onRefreshed }) {
  const [openReason, setOpenReason] = useState(null);
  const [refresh, setRefresh] = useState({ busy: false, note: "" });
  // Pergunta à Twilio o estado das mensagens ainda sem confirmação (campaign-status-refresh).
  const runRefresh = async () => {
    setRefresh({ busy: true, note: "" });
    let afterId = null, updated = 0;
    try {
      for (let i = 0; i < 40; i++) {
        const r = await invokeFunction("campaign-status-refresh", { channel, campaignId, afterId });
        updated += r.updated || 0;
        if (!r.remaining || !r.lastId) break;
        afterId = r.lastId;
      }
      setRefresh({ busy: false, note: updated ? `${updated} mensagem(ns) atualizada(s).` : "Sem novidades da Twilio por agora." });
      onRefreshed?.();
    } catch (err) {
      setRefresh({ busy: false, note: err.message || "Não foi possível atualizar." });
    }
  };
  const count = (s) => rows.filter((r) => r.status === s).length;
  const delivered = count("delivered") + count("read");
  const failed = rows.filter((r) => r.status === "failed");
  const waiting = count("sent") + count("queued");
  const byReason = new Map();
  for (const r of failed) {
    const reason = r.error || "Motivo não indicado";
    if (!byReason.has(reason)) byReason.set(reason, []);
    byReason.get(reason).push(r);
  }
  const tile = (label, value, tone) => (
    <div style={{ background: c.folha, border: `1px solid ${c.line}`, borderRadius: 3, padding: "12px 14px" }}>
      <div style={{ ...sans, fontSize: 12.5, color: c.mist }}>{label}</div>
      <div style={{ ...sans, fontSize: 22, fontWeight: 700, color: tone || c.ink, marginTop: 2 }}>{value}</div>
    </div>
  );
  if (loading) return <div style={{ ...sans, fontSize: 14, color: c.mist, marginBottom: 20 }}>A carregar os resultados…</div>;
  return (
    <div style={{ marginBottom: 20, maxWidth: 720 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(8rem, 1fr))", gap: 8 }}>
        {tile("Enviadas", rows.length)}
        {tile("Entregues", delivered, c.sage)}
        {channel === "whatsapp" && tile("Lidas", count("read"), c.sage)}
        {tile("Sem confirmação", waiting)}
        {tile("Falharam", failed.length, failed.length ? c.rose : undefined)}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 8 }}>
        <div style={{ ...sans, fontSize: 12.5, color: c.mist, lineHeight: 1.5, flex: 1, minWidth: 220 }}>
          "Sem confirmação" = a Twilio aceitou e ainda não disse se chegou (atualiza sozinho nos minutos seguintes).
        </div>
        {campaignId && waiting > 0 && (
          <button type="button" onClick={runRefresh} disabled={refresh.busy} style={{ ...btnGhost, padding: "6px 12px", fontSize: 13.5 }}>
            {refresh.busy ? "A perguntar à Twilio…" : "Atualizar estados"}
          </button>
        )}
      </div>
      {refresh.note && <div style={{ ...sans, fontSize: 13, color: c.mist, marginTop: 4 }}>{refresh.note}</div>}
      {byReason.size > 0 && (
        <div style={{ background: c.folha, border: `1px solid ${c.rose}`, borderRadius: 3, padding: "12px 16px", marginTop: 12 }}>
          <div style={{ ...sans, fontSize: 14, fontWeight: 700, color: c.rose, marginBottom: 6 }}>Porque falharam</div>
          {[...byReason.entries()].sort((a, b) => b[1].length - a[1].length).map(([reason, list]) => (
            <div key={reason} style={{ borderTop: `1px solid ${c.line}`, padding: "8px 0" }}>
              <button type="button" onClick={() => setOpenReason(openReason === reason ? null : reason)} style={{ ...sans, background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left", width: "100%", display: "flex", gap: 10, alignItems: "baseline" }}>
                <strong style={{ fontSize: 14, color: c.ink, minWidth: 28 }}>{list.length}</strong>
                <span style={{ fontSize: 14, color: c.ink, flex: 1, lineHeight: 1.45 }}>{reason}</span>
                <span style={{ fontSize: 12.5, color: c.mist, whiteSpace: "nowrap" }}>{openReason === reason ? "Esconder" : "Ver quem"}</span>
              </button>
              {openReason === reason && (
                <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 6, paddingLeft: 38 }}>
                  {list.slice(0, 300).map((r, i) => (
                    <div key={i} style={{ ...sans, fontSize: 13.5, color: c.mist }}>{r.contacts?.name || "Contacto"}{r.contacts?.phone ? `, ${r.contacts.phone}` : ""}</div>
                  ))}
                  {list.length > 300 && <div style={{ ...sans, fontSize: 13, color: c.mist }}>e mais {list.length - 300}.</div>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
