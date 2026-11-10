import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, invokeFunction } from "../../lib/supabaseClient.js";
import { c, sans, serif, inputStyle, btnGhost, btnPrimary } from "../../shared/theme.jsx";
import { Download, RefreshCw, MessageSquare } from "lucide-react";

/* ---------------------------------------------------------
   GASTOS DE MENSAGENS (SMS e WhatsApp) por mês — migração 110 e
   função messaging-costs. Valores da Twilio (relatório de uso de cada
   conta) com a margem da agência. A equipa vê custo, margem e valor a
   cobrar; o cliente vê só o valor da sua marca.
   - Numa marca: <MessagingCostsPanel brandIds={[id]} isClient />
   - Na agência: <MessagingCostsPanel agencyId={id} /> (todas as marcas + margem)
--------------------------------------------------------- */

const MONTH_NAMES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
function lastMonths(n = 12) {
  const out = [];
  const d = new Date();
  for (let i = 0; i < n; i++) {
    const y = d.getFullYear();
    const m = d.getMonth() - i;
    const date = new Date(y, m, 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    out.push({ key, label: `${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}` });
  }
  return out;
}
const money = (v, cur, digits = 2) => {
  if (v == null) return "";
  try {
    return new Intl.NumberFormat("pt-PT", { style: "currency", currency: cur || "USD", minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v);
  } catch {
    return `${Number(v).toFixed(digits)} ${cur || ""}`;
  }
};
const num = (v) => new Intl.NumberFormat("pt-PT").format(v || 0);

function useMargin(agencyId) {
  return useQuery({
    queryKey: ["messaging_cost_settings", agencyId],
    enabled: !!agencyId,
    queryFn: async () => {
      const { data, error } = await supabase.from("messaging_cost_settings").select("margin_percent").eq("agency_id", agencyId).maybeSingle();
      if (error) throw error;
      return data ? Number(data.margin_percent) : 5;
    },
  });
}

function MarginEditor({ agencyId, onSaved }) {
  const qc = useQueryClient();
  const marginQuery = useMargin(agencyId);
  const [value, setValue] = useState(null);
  const save = useMutation({
    mutationFn: async (margin) => {
      const { error } = await supabase.from("messaging_cost_settings").upsert({ agency_id: agencyId, margin_percent: margin, updated_at: new Date().toISOString() });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["messaging_cost_settings", agencyId] }); onSaved?.(); },
  });
  const current = value ?? (marginQuery.data != null ? String(marginQuery.data) : "");
  const parsed = Math.min(100, Math.max(0, parseFloat(String(current).replace(",", ".")) || 0));
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <span style={{ ...sans, fontSize: 13.5, color: c.mist }}>Margem sobre o custo da Twilio</span>
      <input value={current} onChange={(e) => setValue(e.target.value)} inputMode="decimal" style={{ ...inputStyle, width: 70, padding: "6px 8px", textAlign: "right" }} />
      <span style={{ ...sans, fontSize: 13.5, color: c.mist }}>%</span>
      <button onClick={() => save.mutate(parsed)} disabled={save.isPending || value == null} style={{ ...btnGhost, padding: "6px 12px", fontSize: 13 }}>
        {save.isPending ? "A guardar…" : "Guardar"}
      </button>
      {save.error && <span style={{ ...sans, fontSize: 13, color: c.rose }}>{save.error.message}</span>}
    </div>
  );
}

function downloadCsv(rows, isClient, monthLabel) {
  const head = isClient
    ? ["Marca", "Canal", "Enviadas", "Recebidas", "Preço por mensagem", "Total", "Moeda"]
    : ["Marca", "Canal", "Enviadas", "Recebidas", "Custo Twilio", "Margem %", "Preço por mensagem", "Total a cobrar", "Moeda"];
  const lines = rows.map((r) => (isClient
    ? [r.brandName, r.label, r.sent, r.received, r.unitPrice ?? "", r.price, r.currency]
    : [r.brandName, r.label, r.sent, r.received, r.cost, r.marginPercent, r.unitPrice ?? "", r.price, r.currency]));
  const csv = [head, ...lines].map((l) => l.map((v) => `"${(typeof v === "number" ? String(v).replace(".", ",") : String(v ?? "")).replace(/"/g, '""')}"`).join(";")).join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `gastos-mensagens-${monthLabel.replace(/\s+/g, "-")}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export default function MessagingCostsPanel({ brandIds, isClient = false, agencyId = null }) {
  const months = useMemo(() => lastMonths(12), []);
  const [month, setMonth] = useState(months[0].key);
  const monthLabel = months.find((m) => m.key === month)?.label || month;
  const query = useQuery({
    queryKey: ["messaging_costs", month, (brandIds || []).join(",")],
    staleTime: 10 * 60000,
    queryFn: () => invokeFunction("messaging-costs", { month, ...(brandIds?.length ? { brandIds } : {}) }),
  });
  const data = query.data;
  const rows = data?.rows || [];
  const clientView = isClient || data?.isClient;
  const byBrand = useMemo(() => {
    const map = new Map();
    for (const r of rows) {
      const cur = map.get(r.brandId) || { name: r.brandName, rows: [] };
      cur.rows.push(r);
      map.set(r.brandId, cur);
    }
    return [...map.entries()];
  }, [rows]);
  const totals = useMemo(() => {
    const t = {};
    for (const r of rows) {
      t[r.currency] ??= { price: 0, cost: 0 };
      t[r.currency].price += r.price || 0;
      t[r.currency].cost += r.cost || 0;
    }
    return Object.entries(t);
  }, [rows]);

  const th = { ...sans, fontSize: 12.5, color: c.mist, fontWeight: 600, textAlign: "right", padding: "6px 8px", whiteSpace: "nowrap" };
  const td = { ...sans, fontSize: 13.5, color: c.ink, textAlign: "right", padding: "8px", whiteSpace: "nowrap" };

  return (
    <div style={{ background: c.folha, border: `1px solid ${c.line}`, borderRadius: 3, padding: "18px 20px", marginTop: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ ...serif, fontSize: 18, color: c.ink, display: "flex", alignItems: "center", gap: 8 }}>
          <MessageSquare size={16} color={c.bossText} /> Gastos de mensagens
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <select value={month} onChange={(e) => setMonth(e.target.value)} style={{ ...inputStyle, width: "auto", padding: "6px 10px" }}>
            {months.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
          <button onClick={() => query.refetch()} disabled={query.isFetching} style={{ ...btnGhost, padding: "6px 10px", fontSize: 13, display: "inline-flex", alignItems: "center", gap: 5 }}>
            <RefreshCw size={12} /> {query.isFetching ? "A calcular…" : "Atualizar"}
          </button>
          {rows.length > 0 && (
            <button onClick={() => downloadCsv(rows, clientView, monthLabel)} style={{ ...btnPrimary, padding: "6px 12px", fontSize: 13, display: "inline-flex", alignItems: "center", gap: 5 }}>
              <Download size={13} /> Descarregar CSV
            </button>
          )}
        </div>
      </div>

      {!clientView && agencyId && (
        <div style={{ marginBottom: 12 }}>
          <MarginEditor agencyId={agencyId} onSaved={() => query.refetch()} />
        </div>
      )}

      <div style={{ ...sans, fontSize: 13, color: c.mist, marginBottom: 12, lineHeight: 1.5 }}>
        {clientView
          ? "Valores das mensagens de WhatsApp e SMS enviadas e recebidas neste mês, como aparecem na fatura."
          : "Custo real da Twilio no mês (relatório de uso de cada conta), com a margem da agência. O mês atual conta até hoje."}
      </div>

      {query.isLoading && <div style={{ ...sans, fontSize: 14, color: c.mist }}>A calcular com a Twilio…</div>}
      {query.error && <div style={{ ...sans, fontSize: 14, color: c.rose }}>{query.error.message}</div>}
      {!query.isLoading && !query.error && rows.length === 0 && (
        <div style={{ ...sans, fontSize: 14, color: c.mist }}>Sem gastos de mensagens em {monthLabel}.</div>
      )}

      {byBrand.map(([id, b]) => (
        <div key={id} style={{ marginBottom: 14 }}>
          {(byBrand.length > 1 || !brandIds?.length) && <div style={{ ...sans, fontSize: 14.5, fontWeight: 700, color: c.ink, margin: "6px 0" }}>{b.name}</div>}
          {b.rows[0]?.error && <div style={{ ...sans, fontSize: 13, color: c.rose, marginBottom: 6 }}>Não foi possível ler a Twilio: {b.rows[0].error}</div>}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${c.line}` }}>
                  <th style={{ ...th, textAlign: "left" }}>Canal</th>
                  <th style={th}>Enviadas</th>
                  <th style={th}>Recebidas</th>
                  {!clientView && <th style={th}>Custo Twilio</th>}
                  <th style={th}>Por mensagem</th>
                  <th style={th}>{clientView ? "Total" : "A cobrar"}</th>
                </tr>
              </thead>
              <tbody>
                {b.rows.map((r) => (
                  <tr key={r.channel} style={{ borderBottom: `1px solid ${c.line}` }}>
                    <td style={{ ...td, textAlign: "left" }}>{r.label}</td>
                    <td style={td}>{r.channel === "other" ? "" : num(r.sent)}</td>
                    <td style={td}>{r.channel === "other" ? "" : num(r.received)}</td>
                    {!clientView && <td style={td}>{money(r.cost, r.currency)}</td>}
                    <td style={td}>{r.unitPrice != null ? money(r.unitPrice, r.currency, 4) : ""}</td>
                    <td style={{ ...td, fontWeight: 700 }}>{money(r.price, r.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {totals.length > 0 && (
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 18, flexWrap: "wrap", borderTop: `1px solid ${c.lineStrong}`, paddingTop: 10 }}>
          {totals.map(([cur, t]) => (
            <div key={cur} style={{ ...sans, fontSize: 14.5, color: c.ink }}>
              {!clientView && <span style={{ color: c.mist, marginRight: 12 }}>Custo {money(t.cost, cur)}</span>}
              Total {clientView ? "" : "a cobrar "}<strong>{money(t.price, cur)}</strong>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
