import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabaseClient.js";
import { c, sans, serif, Modal, inputStyle, btnPrimary, btnGhost } from "../../shared/theme.jsx";
import { Plus, Pencil, Trash2, ChevronUp, ChevronDown } from "lucide-react";
import { money } from "./publicBooking.js";

/* ---------------------------------------------------------
   PEÇAS DOS SERVIÇOS — painéis da equipa no Agendamento.
   - Preços com vírgula ("12,50") em todos os campos de dinheiro.
   - Lista de upsells da marca (booking_upsells), ligada a cada serviço
     por booking_service_upsell_links: cria-se uma vez, usa-se em vários.
   - Opções obrigatórias do serviço (booking_services.option_groups):
     grupos em que a cliente tem de escolher uma opção (ex: Duração 30 ou
     60 min; Brushing sem, curto ou longo). Preço e minutos de cada opção
     somam-se ao serviço.
--------------------------------------------------------- */

// "12,50" / "12.5" / "12" → 12.5; vazio → null; inválido → NaN
export function parseMoney(v) {
  if (v === "" || v == null) return null;
  const n = Number(String(v).trim().replace(/\s|€/g, "").replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
}
// 12.5 → "12,5" para voltar a pôr no campo
export const moneyInputValue = (v) => (v == null || v === "" ? "" : String(v).replace(".", ","));

export function MoneyInput({ value, onChange, style, placeholder }) {
  return (
    <input
      type="text"
      inputMode="decimal"
      style={{ ...inputStyle, ...style }}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/[^\d,.\s€-]/g, ""))}
      placeholder={placeholder}
    />
  );
}

const hint = { ...sans, fontSize: 12.5, color: c.mist };
const iconBtn = { background: "none", border: "none", cursor: "pointer", color: c.mist, padding: 4 };
const uid = (p) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/* ---------------------------------------------------------
   DATA — lista de upsells
--------------------------------------------------------- */
export function useUpsellLibrary(brandId) {
  return useQuery({
    queryKey: ["booking_upsells", brandId],
    enabled: !!brandId,
    queryFn: async () => {
      const { data, error } = await supabase.from("booking_upsells").select("*").eq("brand_id", brandId).eq("status", "active").order("name");
      if (error) throw error;
      return data;
    },
  });
}
export function useUpsellLinks(brandId) {
  return useQuery({
    queryKey: ["booking_service_upsell_links", brandId],
    enabled: !!brandId,
    queryFn: async () => {
      const { data, error } = await supabase.from("booking_service_upsell_links").select("service_id, upsell_id").eq("brand_id", brandId);
      if (error) throw error;
      return data;
    },
  });
}
// Substitui os upsells ligados a um serviço.
export function useSetServiceUpsells(brandId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ serviceId, upsellIds }) => {
      const { error: delError } = await supabase.from("booking_service_upsell_links").delete().eq("service_id", serviceId);
      if (delError) throw delError;
      if (upsellIds.length) {
        const { error } = await supabase.from("booking_service_upsell_links").insert(upsellIds.map((upsell_id) => ({ service_id: serviceId, upsell_id, brand_id: brandId })));
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["booking_service_upsell_links", brandId] }),
  });
}
function useSaveUpsell(brandId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name, description, price, extraMinutes }) => {
      const payload = { name, description: description?.trim() || null, price, extra_duration_minutes: extraMinutes };
      if (id) {
        const { error } = await supabase.from("booking_upsells").update(payload).eq("id", id);
        if (error) throw error;
        return id;
      }
      const { data, error } = await supabase.from("booking_upsells").insert({ brand_id: brandId, ...payload }).select("id").single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["booking_upsells", brandId] }),
  });
}

/* ---------------------------------------------------------
   Formulário de um upsell da lista
--------------------------------------------------------- */
export function UpsellFormModal({ brandId, upsell, onClose, onSaved }) {
  const [name, setName] = useState(upsell?.name || "");
  const [description, setDescription] = useState(upsell?.description || "");
  const [price, setPrice] = useState(moneyInputValue(upsell?.price));
  const [minutes, setMinutes] = useState(upsell?.extra_duration_minutes ?? 0);
  const [error, setError] = useState("");
  const save = useSaveUpsell(brandId);

  const submit = async () => {
    const p = parseMoney(price);
    if (!name.trim()) return setError("O nome é obrigatório.");
    if (Number.isNaN(p)) return setError("O preço não parece válido (ex: 12,50).");
    try {
      const id = await save.mutateAsync({ id: upsell?.id, name: name.trim(), description, price: p, extraMinutes: Math.max(0, parseInt(minutes, 10) || 0) });
      onSaved?.(id);
      onClose();
    } catch (err) {
      setError(err.message || "Não foi possível guardar.");
    }
  };

  return (
    <Modal title={upsell ? "Editar upsell" : "Novo upsell"} onClose={onClose} width={420}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome (ex: Máscara hidratante)" />
        <textarea rows={2} style={{ ...inputStyle, resize: "vertical" }} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Breve explicação (opcional, a cliente vê)" />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10 }}>
          <label style={hint}>Preço (€)<MoneyInput style={{ marginTop: 4 }} value={price} onChange={setPrice} placeholder="0,00" /></label>
          <label style={hint}>Tempo extra (min)<input type="number" min="0" style={{ ...inputStyle, marginTop: 4 }} value={minutes} onChange={(e) => setMinutes(e.target.value)} /></label>
        </div>
        {error && <div style={{ ...sans, fontSize: 14, color: c.rose }}>{error}</div>}
        <button onClick={submit} disabled={save.isPending} style={{ ...btnPrimary, width: "fit-content" }}>{save.isPending ? "A guardar…" : "Guardar"}</button>
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------
   Painel "Upsells" (lista da marca)
--------------------------------------------------------- */
export function UpsellLibrarySection({ brand, services }) {
  const qc = useQueryClient();
  const libraryQuery = useUpsellLibrary(brand.id);
  const linksQuery = useUpsellLinks(brand.id);
  const [editing, setEditing] = useState(undefined);
  const archive = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from("booking_upsells").update({ status: "archived" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["booking_upsells", brand.id] }),
  });
  const upsells = libraryQuery.data || [];
  const links = linksQuery.data || [];
  const usedIn = (id) => links.filter((l) => l.upsell_id === id).map((l) => services.find((s) => s.id === l.service_id)?.name).filter(Boolean);

  return (
    <div style={{ background: c.folha, border: `1px solid ${c.line}`, borderRadius: 3, padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <div style={{ ...serif, fontSize: 15.5, color: c.ink }}>Upsells</div>
        <button onClick={() => setEditing(null)} style={{ ...btnGhost, padding: "6px 12px" }}><Plus size={12} /> Upsell</button>
      </div>
      <div style={{ ...hint, marginBottom: 14 }}>Extras opcionais. Cria-os aqui uma vez e escolhe em cada serviço quais aparecem.</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {upsells.map((u) => (
          <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 10, background: c.paper, borderRadius: 6, padding: "10px 14px" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ ...sans, fontSize: 14.5, fontWeight: 600, color: c.ink }}>{u.name}</div>
              <div style={{ ...hint, marginTop: 2 }}>
                {money(u.price) || "Sem preço"}{u.extra_duration_minutes ? `, +${u.extra_duration_minutes} min` : ""}
                {usedIn(u.id).length ? `. Em: ${usedIn(u.id).join(", ")}` : ". Ainda em nenhum serviço"}
              </div>
              {u.description && <div style={{ ...hint, marginTop: 2 }}>{u.description}</div>}
            </div>
            <button onClick={() => setEditing(u)} style={iconBtn} aria-label="Editar"><Pencil size={13} /></button>
            <button onClick={() => archive.mutate(u.id)} style={iconBtn} aria-label="Remover"><Trash2 size={13} /></button>
          </div>
        ))}
        {!libraryQuery.isLoading && !upsells.length && <div style={{ ...hint, textAlign: "center", padding: "12px 0" }}>Ainda sem upsells.</div>}
      </div>
      {editing !== undefined && <UpsellFormModal brandId={brand.id} upsell={editing} onClose={() => setEditing(undefined)} />}
    </div>
  );
}

/* ---------------------------------------------------------
   Dentro do formulário do serviço: que upsells da lista aparecem
--------------------------------------------------------- */
export function ServiceUpsellPicker({ brandId, selected, onChange }) {
  const libraryQuery = useUpsellLibrary(brandId);
  const [creating, setCreating] = useState(false);
  const upsells = libraryQuery.data || [];
  const toggle = (id) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  return (
    <div>
      <div style={{ ...sans, fontSize: 13.5, fontWeight: 700, color: c.ink, marginBottom: 4 }}>Upsells (extras opcionais)</div>
      <div style={{ ...hint, marginBottom: 8 }}>Escolhe da lista da marca os que aparecem neste serviço.</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {upsells.map((u) => (
          <label key={u.id} style={{ ...sans, fontSize: 13.5, color: c.ink, display: "flex", alignItems: "center", gap: 8, background: c.paper, borderRadius: 6, padding: "7px 10px", cursor: "pointer" }}>
            <input type="checkbox" checked={selected.includes(u.id)} onChange={() => toggle(u.id)} />
            <span style={{ flex: 1 }}>{u.name}</span>
            <span style={{ color: c.mist, fontSize: 12.5 }}>{money(u.price)}{u.extra_duration_minutes ? `, +${u.extra_duration_minutes} min` : ""}</span>
          </label>
        ))}
        {!libraryQuery.isLoading && !upsells.length && <div style={hint}>A lista de upsells está vazia.</div>}
      </div>
      <button type="button" onClick={() => setCreating(true)} style={{ ...sans, display: "flex", alignItems: "center", gap: 5, fontSize: 12.5, fontWeight: 600, color: c.bossText, background: "none", border: "none", cursor: "pointer", padding: "8px 0 0" }}>
        <Plus size={12} /> Criar upsell novo
      </button>
      {creating && <UpsellFormModal brandId={brandId} upsell={null} onClose={() => setCreating(false)} onSaved={(id) => onChange([...selected, id])} />}
    </div>
  );
}

/* ---------------------------------------------------------
   Opções obrigatórias do serviço
--------------------------------------------------------- */
// Converte o que está no formulário (textos) para o que se guarda.
export function normalizeOptionGroups(groups) {
  const out = [];
  for (const g of groups || []) {
    const choices = (g.choices || [])
      .filter((ch) => String(ch.name || "").trim())
      .map((ch) => ({
        id: ch.id, name: String(ch.name).trim(), description: String(ch.description || "").trim() || null,
        price: parseMoney(ch.price) ?? 0, extra_minutes: Math.max(0, parseInt(ch.extra_minutes, 10) || 0),
      }));
    if (!choices.length) continue;
    if (choices.some((ch) => Number.isNaN(ch.price))) throw new Error(`Há um preço inválido nas opções de "${g.name || "Opções"}" (ex: 12,50).`);
    out.push({ id: g.id, name: String(g.name || "").trim() || "Opções", choices });
  }
  return out;
}
// Do que está guardado para o formulário (preços com vírgula).
export const optionGroupsToForm = (groups) =>
  (groups || []).map((g) => ({ ...g, choices: (g.choices || []).map((ch) => ({ ...ch, price: moneyInputValue(ch.price), description: ch.description || "" })) }));

export function OptionGroupsEditor({ groups, onChange, basePrice, baseMinutes }) {
  const setGroup = (id, patch) => onChange(groups.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  const removeGroup = (id) => onChange(groups.filter((g) => g.id !== id));
  const addGroup = () => onChange([...groups, { id: uid("g"), name: "", choices: [{ id: uid("o"), name: "", description: "", price: "", extra_minutes: 0 }] }]);
  const setChoice = (gid, cid, patch) => setGroup(gid, { choices: groups.find((g) => g.id === gid).choices.map((ch) => (ch.id === cid ? { ...ch, ...patch } : ch)) });
  const removeChoice = (gid, cid) => setGroup(gid, { choices: groups.find((g) => g.id === gid).choices.filter((ch) => ch.id !== cid) });
  const addChoice = (gid) => setGroup(gid, { choices: [...groups.find((g) => g.id === gid).choices, { id: uid("o"), name: "", description: "", price: "", extra_minutes: 0 }] });
  const moveChoice = (gid, index, dir) => {
    const list = [...groups.find((g) => g.id === gid).choices];
    const j = index + dir;
    if (j < 0 || j >= list.length) return;
    [list[index], list[j]] = [list[j], list[index]];
    setGroup(gid, { choices: list });
  };
  const small = { ...inputStyle, fontSize: 13.5, padding: "7px 9px", minHeight: 0 };

  return (
    <div>
      <div style={{ ...sans, fontSize: 13.5, fontWeight: 700, color: c.ink, marginBottom: 4 }}>Opções obrigatórias</div>
      <div style={{ ...hint, marginBottom: 8 }}>
        A cliente tem de escolher uma opção de cada grupo. Ex: grupo "Duração" com 30 min (+0) e 60 min (+25 €, +30 min); grupo "Brushing" com sem brushing, curto ou longo. Preço e minutos somam-se ao serviço.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {groups.map((g) => (
          <div key={g.id} style={{ background: c.paper, borderRadius: 6, padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input style={{ ...small, flex: 1 }} value={g.name} onChange={(e) => setGroup(g.id, { name: e.target.value })} placeholder="Nome do grupo (ex: Duração, Brushing)" />
              <button type="button" onClick={() => removeGroup(g.id)} style={{ ...iconBtn, color: c.rose }} aria-label="Remover grupo"><Trash2 size={13} /></button>
            </div>
            {g.choices.map((ch, i) => {
              const p = parseMoney(ch.price);
              const total = (Number(basePrice) || 0) + (Number.isFinite(p) ? p : 0);
              const minutes = (Number(baseMinutes) || 0) + (parseInt(ch.extra_minutes, 10) || 0);
              return (
                <div key={ch.id} style={{ background: c.folha, border: `1px solid ${c.line}`, borderRadius: 6, padding: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                    <input style={{ ...small, flex: "1 1 140px" }} value={ch.name} onChange={(e) => setChoice(g.id, ch.id, { name: e.target.value })} placeholder="Opção (ex: 60 minutos)" />
                    <MoneyInput style={{ ...small, width: 82 }} value={ch.price} onChange={(v) => setChoice(g.id, ch.id, { price: v })} placeholder="+€" />
                    <input type="number" min="0" style={{ ...small, width: 70 }} value={ch.extra_minutes} onChange={(e) => setChoice(g.id, ch.id, { extra_minutes: e.target.value })} title="Minutos a mais" placeholder="+min" />
                    <button type="button" onClick={() => moveChoice(g.id, i, -1)} disabled={i === 0} style={{ ...iconBtn, color: i === 0 ? c.line : c.mist }} aria-label="Subir"><ChevronUp size={13} /></button>
                    <button type="button" onClick={() => moveChoice(g.id, i, 1)} disabled={i === g.choices.length - 1} style={{ ...iconBtn, color: i === g.choices.length - 1 ? c.line : c.mist }} aria-label="Descer"><ChevronDown size={13} /></button>
                    <button type="button" onClick={() => removeChoice(g.id, ch.id)} style={iconBtn} aria-label="Remover opção"><Trash2 size={12} /></button>
                  </div>
                  <input style={small} value={ch.description} onChange={(e) => setChoice(g.id, ch.id, { description: e.target.value })} placeholder="Breve explicação (opcional)" />
                  <div style={{ ...hint }}>A cliente vê: {money(total) || "0 €"}, {minutes} min</div>
                </div>
              );
            })}
            <button type="button" onClick={() => addChoice(g.id)} style={{ ...sans, display: "flex", alignItems: "center", gap: 5, fontSize: 12.5, fontWeight: 600, color: c.bossText, background: "none", border: "none", cursor: "pointer", padding: "2px 0", alignSelf: "flex-start" }}>
              <Plus size={12} /> Opção
            </button>
          </div>
        ))}
      </div>
      <button type="button" onClick={addGroup} style={{ ...btnGhost, padding: "6px 12px", marginTop: 8 }}><Plus size={12} /> Grupo de opções</button>
    </div>
  );
}
