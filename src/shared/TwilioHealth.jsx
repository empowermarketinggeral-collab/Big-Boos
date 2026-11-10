import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, RefreshCw } from "lucide-react";
import { supabase, invokeFunction } from "../lib/supabaseClient.js";
import { c, sans, btnGhost } from "./theme.jsx";

/* ---------------------------------------------------------
   SALDO E ESTADO DA CONTA TWILIO (migração 109, função twilio-health)
   Mostra o saldo da conta usada neste canal e avisa quando está baixo,
   a conta foi suspensa ou o Auth Token deixou de servir.
--------------------------------------------------------- */

const money = (v, cur) => {
  try {
    return new Intl.NumberFormat("pt-PT", { style: "currency", currency: cur || "USD" }).format(Number(v));
  } catch {
    return `${Number(v).toFixed(2)} ${cur || ""}`;
  }
};
const hhmm = (iso) => (iso ? new Date(iso).toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");

export default function TwilioHealth({ brandId, channel }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const query = useQuery({
    queryKey: ["twilio_account_health", brandId],
    enabled: !!brandId,
    refetchInterval: 5 * 60000,
    queryFn: async () => {
      const { data, error: e } = await supabase.from("twilio_account_health").select("*").eq("brand_id", brandId);
      if (e) throw e;
      return data || [];
    },
  });
  const row = (query.data || []).find((r) => (r.channels || []).includes(channel));

  const recheck = async () => {
    setBusy(true); setError("");
    try {
      await invokeFunction("twilio-health", { brandId });
      await qc.invalidateQueries({ queryKey: ["twilio_account_health", brandId] });
    } catch (e) {
      setError(e?.message || "Não foi possível verificar.");
    } finally {
      setBusy(false);
    }
  };

  const checkButton = (
    <button onClick={recheck} disabled={busy} style={{ ...btnGhost, padding: "5px 10px", fontSize: 13, display: "inline-flex", alignItems: "center", gap: 5 }}>
      <RefreshCw size={12} /> {busy ? "A verificar…" : "Verificar"}
    </button>
  );

  if (query.isLoading) return null;
  if (!row) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <span style={{ ...sans, fontSize: 13, color: c.mist }}>Saldo Twilio ainda não verificado.</span>
        {checkButton}
        {error && <span style={{ ...sans, fontSize: 13, color: c.rose }}>{error}</span>}
      </div>
    );
  }

  const bad = row.status === "suspended" || row.status === "auth_failed";
  const low = row.status === "low";
  if (!bad && !low) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <span style={{ ...sans, fontSize: 13, color: c.mist }}>
          Saldo Twilio: <strong style={{ color: c.ink }}>{row.balance != null ? money(row.balance, row.currency) : "sem informação"}</strong> (visto a {hhmm(row.checked_at)})
        </span>
        {checkButton}
        {error && <span style={{ ...sans, fontSize: 13, color: c.rose }}>{error}</span>}
      </div>
    );
  }

  const color = bad ? c.rose : c.amber;
  const title = row.status === "suspended"
    ? "A conta Twilio está suspensa: as mensagens não saem nem entram."
    : row.status === "auth_failed"
      ? "A Twilio recusou o Auth Token: as mensagens deixaram de funcionar."
      : `Saldo Twilio baixo: ${money(row.balance, row.currency)}.`;
  const help = row.status === "suspended"
    ? "Entre na Twilio desta marca: o motivo aparece no topo da Console ou no email da Twilio. Normalmente é saldo esgotado ou uma revisão da conta."
    : row.status === "auth_failed"
      ? "Volte a ligar a conta com o Auth Token atual (Twilio, Account Info)."
      : "Carregue saldo na Twilio (Billing) e ligue a recarga automática, para não parar a meio de uma campanha.";

  return (
    <div style={{ border: `1px solid ${color}`, background: `color-mix(in srgb, ${color} 8%, transparent)`, borderRadius: 3, padding: "12px 14px", marginBottom: 14, display: "flex", gap: 10, alignItems: "flex-start" }}>
      <AlertCircle size={16} color={color} style={{ flexShrink: 0, marginTop: 2 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ ...sans, fontSize: 14, fontWeight: 700, color }}>{title}</div>
        <div style={{ ...sans, fontSize: 13, color: c.ink, marginTop: 3, lineHeight: 1.5 }}>{help}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          {checkButton}
          <span style={{ ...sans, fontSize: 12.5, color: c.mist }}>Visto a {hhmm(row.checked_at)}</span>
          {error && <span style={{ ...sans, fontSize: 13, color: c.rose }}>{error}</span>}
        </div>
      </div>
    </div>
  );
}
