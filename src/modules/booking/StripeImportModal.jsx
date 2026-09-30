import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase, invokeFunction } from "../../lib/supabaseClient.js";
import { c, sans, Modal, inputStyle, btnPrimary, btnGhost } from "../../shared/theme.jsx";
import { money } from "./publicBooking.js";

/* ---------------------------------------------------------
   IMPORTAR SERVIÇOS DO STRIPE — Agendamento → Serviços.
   A função stripe-products lê os produtos e preços ativos do Stripe da
   marca; aqui escolhe-se o que cada produto é (serviço, upsell ou fica de
   fora), a categoria e a duração (o Stripe não tem duração), e grava-se.
   - Produto com vários preços → serviço com opções obrigatórias (um
     preço = uma opção; o mais barato é o preço base).
   - Duração: metadados duration/duracao/minutos, ou "60 min" / "1h" no
     nome; senão 60 min. Categoria: metadados category/categoria.
   - Serviço/upsell com o mesmo nome é atualizado (mantém profissionais,
     packs e ligações). Com "Tirar os que não estão no Stripe", os outros
     são apagados (os que têm marcações ficam arquivados, para o histórico).
--------------------------------------------------------- */

const hint = { ...sans, fontSize: 12.5, color: c.mist };
const small = { ...inputStyle, fontSize: 13.5, padding: "6px 8px", minHeight: 0 };
const uid = (p) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function minutesFrom(text) {
  const s = String(text || "").toLowerCase();
  const h = s.match(/(\d+(?:[.,]\d+)?)\s*h(?:oras?|rs?)?\b/);
  const m = s.match(/(\d+)\s*m(?:in(?:utos?)?)?\b/);
  let total = 0;
  if (h) total += Math.round(parseFloat(h[1].replace(",", ".")) * 60);
  if (m) total += parseInt(m[1], 10);
  return total || null;
}
const norm = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const meta = (obj, keys) => { for (const k of keys) if (obj?.[k] != null && obj[k] !== "") return String(obj[k]); return null; };

function initialRow(p) {
  const isAddon = /add.?on|extra|upsell|suplemento|complemento/i.test(`${p.name} ${meta(p.metadata, ["type", "tipo"]) || ""}`);
  const priceMinutes = p.prices.map((x) => minutesFrom(x.nickname)).filter(Boolean);
  const duration = parseInt(meta(p.metadata, ["duration", "duracao", "duração", "minutes", "minutos"]) || "", 10)
    || minutesFrom(p.name) || (priceMinutes.length ? Math.min(...priceMinutes) : null) || (isAddon ? 0 : 60);
  return {
    id: p.id,
    kind: p.prices.length === 0 ? "skip" : isAddon ? "upsell" : "service",
    name: p.name,
    description: p.description,
    category: meta(p.metadata, ["category", "categoria"]) || "",
    duration,
    prices: p.prices,
  };
}

export default function StripeImportModal({ brand, onClose }) {
  const qc = useQueryClient();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [replace, setReplace] = useState(true);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(null);

  useEffect(() => {
    invokeFunction("stripe-products", { brandId: brand.id })
      .then((data) => setRows((data.products || []).map(initialRow)))
      .catch((err) => setError(err.message));
  }, [brand.id]);

  const set = (id, patch) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const run = async () => {
    setError(""); setSaving(true);
    try {
      const services = rows.filter((r) => r.kind === "service");
      const upsells = rows.filter((r) => r.kind === "upsell");
      const report = { created: 0, updated: 0, removed: 0, archived: 0, upsells: 0 };

      // Serviço com o mesmo nome = atualiza (mantém profissionais, packs e histórico).
      const { data: current, error: curErr } = await supabase.from("booking_services").select("id, name").eq("brand_id", brand.id).eq("status", "active");
      if (curErr) throw curErr;
      const byName = new Map((current || []).map((s) => [norm(s.name), s.id]));
      const kept = new Set();

      for (const [i, r] of services.entries()) {
        const base = r.prices[0];
        const baseMinutes = Math.max(5, parseInt(r.duration, 10) || 60);
        const groups = r.prices.length > 1 ? [{
          id: uid("g"),
          name: "Opções",
          choices: r.prices.map((p) => {
            const mins = minutesFrom(p.nickname);
            return {
              id: uid("o"),
              name: p.nickname || money(p.amount),
              description: null,
              price: Math.round((p.amount - base.amount) * 100) / 100,
              extra_minutes: mins ? Math.max(0, mins - baseMinutes) : 0,
            };
          }),
        }] : [];
        const payload = {
          name: r.name.trim(), description: r.description?.trim() || null,
          category: r.category.trim() || null, price: base.amount, duration_minutes: baseMinutes,
          option_groups: groups, sort_order: i,
        };
        const existingId = byName.get(norm(r.name));
        if (existingId) {
          const { error: err } = await supabase.from("booking_services").update(payload).eq("id", existingId);
          if (err) throw err;
          kept.add(existingId);
          report.updated++;
        } else {
          const { error: err } = await supabase.from("booking_services").insert({ brand_id: brand.id, status: "active", ...payload });
          if (err) throw err;
          report.created++;
        }
      }

      if (replace) {
        for (const s of current || []) {
          if (kept.has(s.id)) continue;
          const { error: delError } = await supabase.from("booking_services").delete().eq("id", s.id);
          if (delError?.code === "23503") {
            await supabase.from("booking_services").update({ status: "archived" }).eq("id", s.id);
            report.archived++;
          } else if (delError) throw delError;
          else report.removed++;
        }
      }

      // Upsells: mesmo nome = atualiza (mantém as ligações aos serviços).
      const { data: currentUps, error: upErr } = await supabase.from("booking_upsells").select("id, name").eq("brand_id", brand.id).eq("status", "active");
      if (upErr) throw upErr;
      const upByName = new Map((currentUps || []).map((u) => [norm(u.name), u.id]));
      const keptUps = new Set();
      for (const r of upsells) {
        for (const p of r.prices.length ? r.prices : [{ amount: null, nickname: "" }]) {
          const name = r.prices.length > 1 && p.nickname ? `${r.name.trim()} (${p.nickname})` : r.name.trim();
          const payload = { name, description: r.description?.trim() || null, price: p.amount, extra_duration_minutes: Math.max(0, parseInt(r.duration, 10) || 0) };
          const existingId = upByName.get(norm(name));
          const { error: err } = existingId
            ? await supabase.from("booking_upsells").update(payload).eq("id", existingId)
            : await supabase.from("booking_upsells").insert({ brand_id: brand.id, ...payload });
          if (err) throw err;
          if (existingId) keptUps.add(existingId);
          report.upsells++;
        }
      }
      if (replace) {
        const stale = (currentUps || []).filter((u) => !keptUps.has(u.id)).map((u) => u.id);
        if (stale.length) {
          const { error: err } = await supabase.from("booking_upsells").update({ status: "archived" }).in("id", stale);
          if (err) throw err;
        }
      }

      setDone(report);
      qc.invalidateQueries({ queryKey: ["booking_services", brand.id] });
      qc.invalidateQueries({ queryKey: ["booking_upsells", brand.id] });
      qc.invalidateQueries({ queryKey: ["booking_service_upsell_links", brand.id] });
    } catch (err) {
      setError(err.message || "Não foi possível importar.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Importar do Stripe" onClose={onClose} width={640}>
      {done ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ ...sans, fontSize: 14.5, color: c.ink, lineHeight: 1.6 }}>
            {done.created} serviços novos, {done.updated} atualizados (mesmo nome) e {done.upsells} upsells.
            {done.removed ? ` ${done.removed} serviços antigos apagados.` : ""}
            {done.archived ? ` ${done.archived} serviços antigos com marcações ficaram arquivados (só histórico).` : ""}
          </div>
          <div style={hint}>Agora abre cada serviço para confirmar a duração, escolher quem o faz e ligar os upsells.</div>
          <button onClick={onClose} style={{ ...btnPrimary, width: "fit-content" }}>Fechar</button>
        </div>
      ) : !rows ? (
        <div style={{ ...sans, fontSize: 14, color: error ? c.rose : c.mist }}>{error || "A ler os produtos do Stripe…"}</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={hint}>
            Escolhe o que cada produto é. O Stripe não guarda a duração: confirma os minutos. Produtos com vários preços ficam como um serviço com opções (ex: 30 min e 60 min).
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: "55vh", overflowY: "auto" }}>
            {rows.map((r) => (
              <div key={r.id} style={{ background: c.paper, borderRadius: 6, padding: 10, opacity: r.kind === "skip" ? 0.55 : 1, display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                  <select value={r.kind} onChange={(e) => set(r.id, { kind: e.target.value })} style={{ ...small, width: "auto" }}>
                    <option value="service">Serviço</option>
                    <option value="upsell">Upsell</option>
                    <option value="skip">Não importar</option>
                  </select>
                  <input style={{ ...small, flex: "1 1 180px" }} value={r.name} onChange={(e) => set(r.id, { name: e.target.value })} />
                </div>
                {r.kind !== "skip" && (
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                    {r.kind === "service" && <input style={{ ...small, flex: "1 1 140px" }} value={r.category} onChange={(e) => set(r.id, { category: e.target.value })} placeholder="Categoria" />}
                    <label style={{ ...hint, display: "flex", alignItems: "center", gap: 6 }}>
                      {r.kind === "service" ? "Duração" : "Tempo extra"}
                      <input type="number" min="0" style={{ ...small, width: 72 }} value={r.duration} onChange={(e) => set(r.id, { duration: e.target.value })} /> min
                    </label>
                  </div>
                )}
                <div style={hint}>
                  {r.prices.length ? r.prices.map((p) => `${p.nickname ? `${p.nickname}: ` : ""}${money(p.amount)}`).join(", ") : "Sem preço de pagamento único"}
                  {r.description ? `. ${r.description.slice(0, 140)}${r.description.length > 140 ? "…" : ""}` : ""}
                </div>
              </div>
            ))}
            {!rows.length && <div style={hint}>Não há produtos ativos no Stripe.</div>}
          </div>
          <label style={{ ...sans, fontSize: 13.5, color: c.ink, display: "flex", alignItems: "flex-start", gap: 8 }}>
            <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} style={{ marginTop: 3 }} />
            <span>Tirar os serviços e upsells que não estão no Stripe. Os que têm o mesmo nome são atualizados (mantêm profissionais e packs); os antigos com marcações ficam arquivados para o histórico.</span>
          </label>
          {error && <div style={{ ...sans, fontSize: 14, color: c.rose }}>{error}</div>}
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={run} disabled={saving || !rows.some((r) => r.kind !== "skip")} style={btnPrimary}>
              {saving ? "A importar…" : `Importar ${rows.filter((r) => r.kind !== "skip").length} produtos`}
            </button>
            <button onClick={onClose} style={btnGhost}>Cancelar</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
