import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, invokeFunction } from "../lib/supabaseClient.js";
import { c, sans, serif, display, inputStyle, btnGhost, btnPrimary, CAN_MANAGE_ROLES } from "./theme.jsx";
import { AlertCircle, CreditCard, Wallet } from "lucide-react";

/* ---------------------------------------------------------
   SALDO DE MENSAGENS (SMS e WhatsApp) — migração 114.
   O cliente vê quanto já gastou este mês (custo real da Twilio, em euros,
   com a margem da agência), o saldo pré-pago e carrega pelo Stripe
   (função messaging-topup). A equipa define a data de início do saldo,
   o aviso de saldo baixo e faz acertos à mão.
--------------------------------------------------------- */

const eur = (v, digits = 2) => new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR", minimumFractionDigits: digits, maximumFractionDigits: digits }).format(Number(v) || 0);
const thisMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
const fmtDate = (d) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString("pt-PT") : "");

export function useMessagingSummary(brandId) {
  return useQuery({
    queryKey: ["messaging_summary", brandId],
    enabled: !!brandId,
    staleTime: 10 * 60000,
    queryFn: async () => {
      const r = await invokeFunction("messaging-costs", { month: thisMonth(), brandIds: [brandId], summary: true });
      return r?.summary || null;
    },
  });
}

function useCanManage() {
  return useQuery({
    queryKey: ["my_role"],
    staleTime: 30 * 60000,
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      const id = data?.user?.id;
      if (!id) return false;
      const { data: p } = await supabase.from("profiles").select("role").eq("id", id).maybeSingle();
      return CAN_MANAGE_ROLES.includes(p?.role);
    },
  });
}

// Aviso no topo do WhatsApp e do SMS: quanto já gastou e se o saldo está a acabar.
export function MessagingCreditBanner({ brandId, onOpenCosts }) {
  const q = useMessagingSummary(brandId);
  const s = q.data;
  if (!s || (!s.monthSpent && s.balance == null)) return null;
  const low = s.low;
  const color = low ? c.amber : c.mist;
  return (
    <div style={{ border: `1px solid ${low ? c.amber : c.line}`, background: low ? `color-mix(in srgb, ${c.amber} 8%, transparent)` : c.folha, borderRadius: 3, padding: "10px 14px", marginBottom: 14, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <Wallet size={16} color={low ? c.amber : c.bossText} style={{ flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 200, ...sans, fontSize: 13.5, color: c.ink, lineHeight: 1.45 }}>
        Este mês já gastou <strong>{eur(s.monthSpent)}</strong> em mensagens{s.monthMessages ? ` (${s.monthMessages.toLocaleString("pt-PT")} mensagens)` : ""}.
        {s.balance != null && <> Saldo: <strong style={{ color: s.balance < 0 ? c.rose : c.ink }}>{eur(s.balance)}</strong>.</>}
        {low && <span style={{ display: "block", color, fontWeight: 600 }}>{s.balance == null ? "Carregue saldo para as mensagens continuarem a sair todos os meses." : "O saldo está a acabar: carregue para as mensagens não pararem."}</span>}
      </div>
      <button type="button" onClick={onOpenCosts} style={{ ...(low ? btnPrimary : btnGhost), padding: "7px 14px", fontSize: 13.5 }}>
        {low ? "Carregar saldo" : "Ver custos"}
      </button>
    </div>
  );
}

function TeamSettings({ brandId, summary, onSaved }) {
  const qc = useQueryClient();
  const settingsQuery = useQuery({
    queryKey: ["messaging_credit_settings", brandId],
    queryFn: async () => {
      const { data, error } = await supabase.from("messaging_credit_settings").select("start_date, low_balance_eur").eq("brand_id", brandId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const [start, setStart] = useState("");
  const [low, setLow] = useState("");
  const [adj, setAdj] = useState({ amount: "", note: "" });
  useEffect(() => {
    if (settingsQuery.data) {
      setStart(settingsQuery.data.start_date || "");
      setLow(String(settingsQuery.data.low_balance_eur ?? 10));
    } else if (settingsQuery.isSuccess) setLow("10");
  }, [settingsQuery.data, settingsQuery.isSuccess]);
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("messaging_credit_settings").upsert({ brand_id: brandId, start_date: start || null, low_balance_eur: Math.max(0, parseFloat(String(low).replace(",", ".")) || 0), updated_at: new Date().toISOString() });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["messaging_credit_settings", brandId] }); onSaved(); },
  });
  const adjust = useMutation({
    mutationFn: async () => {
      const amount = parseFloat(String(adj.amount).replace(",", "."));
      if (!Number.isFinite(amount) || !amount) throw new Error("Escreva um valor (negativo para tirar).");
      const { error } = await supabase.from("messaging_credits").insert({ brand_id: brandId, kind: "adjust", amount_eur: amount, note: adj.note || "Acerto da equipa" });
      if (error) throw error;
    },
    onSuccess: () => { setAdj({ amount: "", note: "" }); onSaved(); },
  });
  return (
    <div style={{ borderTop: `1px solid ${c.line}`, marginTop: 16, paddingTop: 14, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ ...sans, fontSize: 13, fontWeight: 700, color: c.ink }}>Só para a equipa</div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label style={{ ...sans, fontSize: 12.5, color: c.mist }}>
          O saldo conta a partir de
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} style={{ ...inputStyle, display: "block", marginTop: 4, width: 170 }} />
        </label>
        <label style={{ ...sans, fontSize: 12.5, color: c.mist }}>
          Avisar abaixo de (€)
          <input value={low} onChange={(e) => setLow(e.target.value)} inputMode="decimal" style={{ ...inputStyle, display: "block", marginTop: 4, width: 110 }} />
        </label>
        <button type="button" onClick={() => save.mutate()} disabled={save.isPending} style={{ ...btnGhost, padding: "8px 14px", fontSize: 13.5 }}>{save.isPending ? "A guardar…" : "Guardar"}</button>
      </div>
      <div style={{ ...sans, fontSize: 12.5, color: c.mist, lineHeight: 1.5 }}>
        Sem data, conta desde o primeiro carregamento{summary?.startDate ? ` (agora: ${fmtDate(summary.startDate)})` : ""}. O gasto antes desta data não entra no saldo.
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label style={{ ...sans, fontSize: 12.5, color: c.mist }}>
          Acerto à mão (€)
          <input value={adj.amount} onChange={(e) => setAdj((a) => ({ ...a, amount: e.target.value }))} placeholder="ex.: 50 ou -10" inputMode="decimal" style={{ ...inputStyle, display: "block", marginTop: 4, width: 130 }} />
        </label>
        <label style={{ ...sans, fontSize: 12.5, color: c.mist, flex: "1 1 180px" }}>
          Motivo
          <input value={adj.note} onChange={(e) => setAdj((a) => ({ ...a, note: e.target.value }))} placeholder="ex.: pago por transferência" style={{ ...inputStyle, display: "block", marginTop: 4 }} />
        </label>
        <button type="button" onClick={() => adjust.mutate()} disabled={adjust.isPending} style={{ ...btnGhost, padding: "8px 14px", fontSize: 13.5 }}>{adjust.isPending ? "A registar…" : "Registar"}</button>
      </div>
      {(save.error || adjust.error) && <div style={{ ...sans, fontSize: 13, color: c.rose }}>{(save.error || adjust.error).message}</div>}
    </div>
  );
}

// Painel "Saldo de mensagens": gasto do mês, saldo, aviso sobre erros pagos e carregar pelo Stripe.
export function MessagingCreditPanel({ brandId }) {
  const qc = useQueryClient();
  const q = useMessagingSummary(brandId);
  const canManageQuery = useCanManage();
  const s = q.data;
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");
  const paidBack = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("saldo") === "ok";

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["messaging_summary", brandId] });
  };
  const pay = async (amount) => {
    setError(""); setBusy(amount);
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("saldo");
      const r = await invokeFunction("messaging-topup", { brandId, amountEur: amount, returnUrl: url.toString() });
      if (!r?.url) throw new Error("O Stripe não devolveu o pagamento.");
      window.location.href = r.url;
    } catch (e) {
      setError(e?.message || "Não foi possível abrir o pagamento.");
      setBusy(null);
    }
  };
  const customValue = parseFloat(String(custom).replace(",", "."));
  const suggested = s?.monthSpent ? Math.max(50, Math.ceil((s.monthSpent * 1.2) / 10) * 10) : 50;

  return (
    <div style={{ background: c.folha, border: `1px solid ${s?.low ? c.amber : c.line}`, borderRadius: 3, padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <Wallet size={16} color={c.bossText} />
        <div style={{ ...serif, fontSize: 15.5, color: c.ink }}>Saldo de mensagens</div>
      </div>
      <div style={{ ...sans, fontSize: 12.5, color: c.mist, marginBottom: 14, lineHeight: 1.5 }}>
        Valores reais da Twilio, em euros, das mensagens de WhatsApp e SMS deste mês (atualiza ao abrir).
      </div>

      {paidBack && <div style={{ ...sans, fontSize: 13.5, color: c.sage, marginBottom: 12 }}>Pagamento recebido. O saldo atualiza em poucos segundos.</div>}
      {q.isLoading && <div style={{ ...sans, fontSize: 13.5, color: c.mist }}>A calcular com a Twilio…</div>}
      {q.error && <div style={{ ...sans, fontSize: 13.5, color: c.rose }}>{q.error.message}</div>}
      {s?.error && <div style={{ ...sans, fontSize: 13.5, color: c.rose, marginBottom: 10 }}>Não foi possível ler a Twilio: {s.error}</div>}

      {s && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 14, marginBottom: 14 }}>
          <div>
            <div style={{ ...sans, fontSize: 12.5, color: c.mist, marginBottom: 3 }}>Gasto este mês</div>
            <div style={{ ...display, fontSize: 22, color: c.ink }}>{eur(s.monthSpent)}</div>
            <div style={{ ...sans, fontSize: 12.5, color: c.mistLight }}>{(s.monthMessages || 0).toLocaleString("pt-PT")} mensagens</div>
          </div>
          <div>
            <div style={{ ...sans, fontSize: 12.5, color: c.mist, marginBottom: 3 }}>Preço médio por mensagem</div>
            <div style={{ ...display, fontSize: 22, color: c.ink }}>{s.avgPrice != null ? eur(s.avgPrice, 3) : "sem dados"}</div>
          </div>
          <div>
            <div style={{ ...sans, fontSize: 12.5, color: c.mist, marginBottom: 3 }}>Saldo</div>
            <div style={{ ...display, fontSize: 22, color: s.balance == null ? c.mist : s.balance < 0 ? c.rose : s.low ? c.amber : c.sage }}>{s.balance == null ? "sem carregamentos" : eur(s.balance)}</div>
            {s.balance != null && <div style={{ ...sans, fontSize: 12.5, color: c.mistLight }}>{eur(s.credited)} carregados, {eur(s.spentSince)} gastos desde {fmtDate(s.startDate)}</div>}
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, alignItems: "flex-start", background: c.paper, borderRadius: 3, padding: "10px 12px", ...sans, fontSize: 12.5, color: c.ink, lineHeight: 1.5, marginBottom: 14 }}>
        <AlertCircle size={14} color={c.amber} style={{ flexShrink: 0, marginTop: 2 }} />
        <span>As mensagens que saem mas não chegam (por exemplo, um número sem WhatsApp ou desligado) também são cobradas pela Twilio. Por isso, o gasto pode ser maior do que o número de mensagens entregues.</span>
      </div>

      <div style={{ ...sans, fontSize: 14, fontWeight: 600, color: c.ink, marginBottom: 8 }}>Carregar saldo para as mensagens não pararem</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {[50, 100, 200].map((v) => (
          <button key={v} type="button" onClick={() => pay(v)} disabled={busy != null} style={{ ...(v === 100 ? btnPrimary : btnGhost), padding: "8px 16px", display: "inline-flex", alignItems: "center", gap: 6 }}>
            <CreditCard size={13} /> {busy === v ? "A abrir…" : eur(v, 0)}
          </button>
        ))}
        <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Outro valor" inputMode="decimal" style={{ ...inputStyle, width: 120 }} />
        <button type="button" onClick={() => pay(customValue)} disabled={busy != null || !(customValue >= 10)} style={{ ...btnGhost, padding: "8px 14px" }}>
          {busy === customValue ? "A abrir…" : "Pagar"}
        </button>
      </div>
      <div style={{ ...sans, fontSize: 12.5, color: c.mist, marginTop: 6 }}>
        Pagamento seguro pelo Stripe (cartão ou outros meios). Mínimo 10 €.{s?.monthSpent ? ` Pelo gasto deste mês, sugerimos ${eur(suggested, 0)} por mês.` : ""}
      </div>
      {error && <div style={{ ...sans, fontSize: 13, color: c.rose, marginTop: 6 }}>{error}</div>}

      {canManageQuery.data && <TeamSettings brandId={brandId} summary={s} onSaved={refresh} />}
    </div>
  );
}
