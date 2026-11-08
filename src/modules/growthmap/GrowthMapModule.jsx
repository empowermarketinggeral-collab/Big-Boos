import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabaseClient.js";
import { c, sans, serif, display, inputStyle, btnPrimary, btnGhost } from "../../shared/theme.jsx";
import { ArrowLeft, Upload, Plus, Trash2, CheckCircle2, Layers } from "lucide-react";
import { useUrlState } from "../../shared/urlState.js";

/* ---------------------------------------------------------
   MAPA DE CRESCIMENTO — substitui o "Plano Estratégico".
   O mapa feito com a skill "mapa-de-crescimento" exporta um ficheiro
   mapa.json (formato "big-boss-mapa", versão 1) que se importa aqui.
   O mapa guarda-se em brand_growth_maps.data tal como veio; cada prioridade
   passa a uma fase (action_plans) com as tarefas "O que fazer" como
   metas, e a equipa acrescenta fases e tarefas. Migração 100.
   Separadores: Prioridades e tarefas, Pesquisa, Posição, O que trava.
--------------------------------------------------------- */

const card = { background: c.folha, border: `1px solid ${c.line}`, borderRadius: 3, padding: 20 };
const grid = (min = 18) => ({ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${min}rem), 1fr))`, gap: 12 });
const h2 = { ...serif, fontSize: 18, color: c.ink, margin: "28px 0 6px" };
const note = { ...sans, fontSize: 13.5, color: c.mist, lineHeight: 1.55, margin: "0 0 14px" };
const label = { ...sans, fontSize: 12.5, color: c.mist };
const arr = (v) => (Array.isArray(v) ? v : []);
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

const TABS = [
  ["fases", "Prioridades e tarefas"],
  ["pesquisa", "Pesquisa"],
  ["posicao", "Posição"],
  ["trava", "O que trava"],
];

function useLatestMap(brandId) {
  return useQuery({
    queryKey: ["growth_map", brandId],
    queryFn: async () => {
      const { data, error } = await supabase.from("brand_growth_maps").select("id, title, data, created_at").eq("brand_id", brandId).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

function usePhases(brandId) {
  return useQuery({
    queryKey: ["growth_phases", brandId],
    queryFn: async () => {
      const { data, error } = await supabase.from("action_plans").select("id, title, description, status, goals, details, sort_order, created_at").eq("brand_id", brandId)
        .order("sort_order", { ascending: true, nullsFirst: false }).order("created_at");
      if (error) throw error;
      return (data || []).map((p) => ({ ...p, goals: arr(p.goals), details: p.details || {} }));
    },
  });
}

// Lê e confirma o ficheiro do mapa (aceita o formato da skill, versão 1).
function parseMapFile(text) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error("O ficheiro não é um JSON válido."); }
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("O ficheiro não tem um mapa.");
  if (data.format && data.format !== "big-boss-mapa") throw new Error("Este ficheiro não é um mapa do Big Boss (formato big-boss-mapa).");
  if (data.version && Number(data.version) > 1) throw new Error("Este mapa foi feito numa versão mais recente. Atualize o Big Boss.");
  const prioridades = arr(data.prioridades?.items || data.prioridades);
  if (!data.title && !prioridades.length && !data.score) throw new Error("O ficheiro não tem título, score nem prioridades.");
  return data;
}

function useImportMap(brandId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data) => {
      const title = String(data.title || "Mapa de Crescimento").slice(0, 200);
      const { data: map, error } = await supabase.from("brand_growth_maps").insert({ brand_id: brandId, title, data }).select("id").single();
      if (error) throw error;

      // Prioridades → fases. A mesma prioridade (mesmo título) atualiza a fase e mantém as tarefas feitas.
      const { data: existing } = await supabase.from("action_plans").select("id, title, goals").eq("brand_id", brandId);
      const byTitle = new Map((existing || []).map((p) => [String(p.title).trim().toLowerCase(), p]));
      const items = arr(data.prioridades?.items || data.prioridades);
      for (const [i, p] of items.entries()) {
        const ordem = num(p.ordem) || i + 1;
        const phaseTitle = String(p.prioridade || p.titulo || `Prioridade ${ordem}`).slice(0, 200);
        const details = { ordem, resolve: p.resolve || "", inicio: p.inicio || "", fim: p.fim || "", periodo: p.periodo || "", indicador: p.indicador || "", meta: p.meta || "" };
        const found = byTitle.get(phaseTitle.trim().toLowerCase());
        if (found) {
          const known = new Set(arr(found.goals).map((g) => String(g.description || "").trim().toLowerCase()));
          const added = arr(p.tarefas).filter((t) => !known.has(String(t).trim().toLowerCase())).map((t) => ({ description: String(t), completed: false }));
          const { error: upErr } = await supabase.from("action_plans").update({ details, growth_map_id: map.id, sort_order: ordem, description: p.resolve || null, goals: [...arr(found.goals), ...added] }).eq("id", found.id);
          if (upErr) throw upErr;
        } else {
          const { error: insErr } = await supabase.from("action_plans").insert({
            brand_id: brandId, title: phaseTitle, type: "strategic", status: "active", description: p.resolve || null,
            goals: arr(p.tarefas).map((t) => ({ description: String(t), completed: false })),
            details, growth_map_id: map.id, sort_order: ordem,
          });
          if (insErr) throw insErr;
        }
      }
      return { phases: items.length };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["growth_map", brandId] });
      qc.invalidateQueries({ queryKey: ["growth_phases", brandId] });
      qc.invalidateQueries({ queryKey: ["action_plans", brandId] });
    },
  });
}

function usePhaseWrite(brandId) {
  const qc = useQueryClient();
  const refresh = () => { qc.invalidateQueries({ queryKey: ["growth_phases", brandId] }); qc.invalidateQueries({ queryKey: ["action_plans", brandId] }); };
  return {
    saveGoals: useMutation({
      mutationFn: async ({ id, goals }) => { const { error } = await supabase.from("action_plans").update({ goals }).eq("id", id); if (error) throw error; },
      onSuccess: refresh,
    }),
    add: useMutation({
      mutationFn: async ({ title, periodo, indicador, meta }) => {
        const { error } = await supabase.from("action_plans").insert({ brand_id: brandId, title, type: "strategic", status: "active", goals: [], details: { periodo, indicador, meta } });
        if (error) throw error;
      },
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: async (id) => { const { error } = await supabase.from("action_plans").delete().eq("id", id); if (error) throw error; },
      onSuccess: refresh,
    }),
  };
}

/* ---------- Pedaços visuais ---------- */
function Chip({ children, tone }) {
  const color = tone === "ok" ? c.sage : tone === "warn" ? c.amber : tone === "bad" ? c.rose : c.mist;
  return <span style={{ ...sans, fontSize: 12.5, fontWeight: 600, color, border: `1px solid ${color}`, borderRadius: 999, padding: "2px 10px", whiteSpace: "nowrap" }}>{children}</span>;
}

function Bar({ value, max, color = c.boss, height = 8 }) {
  const pct = Math.max(0, Math.min(100, (num(value) / (max || 1)) * 100));
  return (
    <div style={{ height, background: c.paper, borderRadius: 999, overflow: "hidden" }}>
      <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 999 }} />
    </div>
  );
}

function ScoreBlock({ score }) {
  const rows = arr(score?.criterios);
  if (!rows.length) return null;
  const total = rows.reduce((s, r) => s + num(r.validado), 0);
  const proposta = rows.reduce((s, r) => s + num(r.proposta), 0);
  const max = rows.length * 10;
  return (
    <div>
      <h2 style={h2}>{score.nome || "Score"}</h2>
      {score.nota && <p style={note}>{score.nota}</p>}
      <div style={{ display: "grid", gridTemplateColumns: "var(--bb-split, minmax(0, 14rem) minmax(0, 1fr))", gap: 20, alignItems: "start" }}>
        <div style={card}>
          <div style={{ ...display, fontSize: 44, color: c.ink, lineHeight: 1 }}>{total}</div>
          <div style={{ ...label, marginTop: 6 }}>validado em {max}, proposta da pesquisa {proposta}</div>
          {score.faixa && <div style={{ marginTop: 10 }}><Chip tone="warn">{score.faixa}</Chip></div>}
          {score.confirmar && <div style={{ ...sans, fontSize: 13.5, color: c.mist, marginTop: 12, lineHeight: 1.5 }}>{score.confirmar}</div>}
        </div>
        <div style={{ ...card, display: "flex", flexDirection: "column", gap: 12 }}>
          {rows.map((r) => (
            <div key={r.criterio}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, ...sans, fontSize: 14, color: c.ink, marginBottom: 4 }}>
                <span>{r.criterio}</span><span style={{ color: c.mist }}>{num(r.validado)} <span style={{ fontSize: 12.5 }}>(proposta {num(r.proposta)})</span></span>
              </div>
              <Bar value={r.proposta} max={10} color={c.lineStrong} height={5} />
              <div style={{ height: 3 }} />
              <Bar value={r.validado} max={10} />
            </div>
          ))}
          <div style={{ display: "flex", gap: 16, ...label }}>
            <span><i style={{ display: "inline-block", width: 10, height: 10, background: c.lineStrong, borderRadius: 2, marginRight: 6 }} />Proposta</span>
            <span><i style={{ display: "inline-block", width: 10, height: 10, background: c.boss, borderRadius: 2, marginRight: 6 }} />Validado</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ResearchTab({ map }) {
  const [bloco, setBloco] = useState("todos");
  const achados = arr(map.achados);
  const blocos = [...new Map(achados.map((a) => [String(a.bloco), a.bloco_nome || `Bloco ${a.bloco}`])).entries()];
  const shown = bloco === "todos" ? achados : achados.filter((a) => String(a.bloco) === bloco);
  const numeros = arr(map.numeros?.items || map.numeros);
  const pessoas = arr(map.cubo?.pessoas || map.cubo);
  const historias = arr(map.historias?.items || map.historias);
  return (
    <div>
      {arr(map.blocos).length > 0 && (
        <div style={{ ...grid(10), marginBottom: 8 }}>
          {map.blocos.map((b) => (
            <div key={b.nome} style={{ ...card, padding: "10px 14px" }}>
              <div style={{ ...sans, fontSize: 14, fontWeight: 600, color: c.ink }}>{b.nome}</div>
              <div style={{ ...label, color: c.sage }}>{b.estado}{b.data ? `, ${b.data}` : ""}</div>
            </div>
          ))}
        </div>
      )}

      {numeros.length > 0 && (
        <>
          <h2 style={h2}>Números de hoje</h2>
          {map.numeros?.nota && <p style={note}>{map.numeros.nota}</p>}
          <div style={grid(9)}>
            {numeros.map((n) => (
              <div key={n.metrica} style={{ ...card, padding: 16 }}>
                <div style={label}>{n.label || n.metrica}</div>
                <div style={{ ...display, fontSize: 28, color: c.ink, marginTop: 4 }}>{new Intl.NumberFormat("pt-PT").format(num(n.valor))}</div>
              </div>
            ))}
          </div>
        </>
      )}

      <ScoreBlock score={map.score} />

      {pessoas.length > 0 && (
        <>
          <h2 style={h2}>Cliente ao Cubo</h2>
          {map.cubo?.nota && <p style={note}>{map.cubo.nota}</p>}
          {map.cubo?.decisora && (
            <div style={{ textAlign: "center", marginBottom: 12 }}>
              <div style={{ ...card, display: "inline-block", padding: "12px 22px" }}>
                <div style={{ ...serif, fontSize: 18, color: c.ink }}>{map.cubo.decisora.nome}</div>
                <div style={label}>{map.cubo.decisora.descricao}</div>
              </div>
            </div>
          )}
          <div style={grid(18)}>
            {pessoas.map((p) => (
              <div key={p.pessoa} style={card}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
                  <span style={{ ...serif, fontSize: 16, color: c.ink }}>{p.pessoa}</span>
                  <span style={label}>{p.papel}</span>
                </div>
                {[["Dor", p.dor], ["Desejo", p.desejo], ["Objeção", p.objecao]].filter(([, v]) => v).map(([k, v]) => (
                  <div key={k} style={{ display: "grid", gridTemplateColumns: "5rem 1fr", gap: 8, marginTop: 8, ...sans, fontSize: 14, color: c.ink, lineHeight: 1.5 }}>
                    <span style={label}>{k}</span><span>{v}</span>
                  </div>
                ))}
                {p.justificacao && <div style={{ marginTop: 10, paddingLeft: 12, borderLeft: `2px solid ${c.ink}`, ...serif, fontSize: 14.5, color: c.ink, lineHeight: 1.5 }}>{p.justificacao}</div>}
              </div>
            ))}
          </div>
        </>
      )}

      {historias.length > 0 && (
        <>
          <h2 style={h2}>Histórias-tipo</h2>
          {map.historias?.nota && <p style={note}>{map.historias.nota}</p>}
          <div style={grid(18)}>
            {historias.map((h) => (
              <div key={h.id || h.pessoa} style={card}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><span style={{ ...sans, fontSize: 14, fontWeight: 600, color: c.ink }}>{h.pessoa}</span><span style={label}>{h.id}</span></div>
                {h.objecao && <div style={{ ...serif, fontSize: 15, color: c.ink, margin: "8px 0" }}>{h.objecao}</div>}
                <div style={{ ...sans, fontSize: 14, color: c.mist, lineHeight: 1.55 }}>{h.historia}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {achados.length > 0 && (
        <>
          <h2 style={h2}>Achados validados</h2>
          <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "4px 0 14px" }}>
            <span style={label}>Bloco</span>
            <select value={bloco} onChange={(e) => setBloco(e.target.value)} style={{ ...inputStyle, width: "auto", maxWidth: 280 }}>
              <option value="todos">Todos ({achados.length})</option>
              {blocos.map(([k, n]) => <option key={k} value={k}>{k}. {n}</option>)}
            </select>
          </div>
          <div style={grid(18)}>
            {shown.map((a) => (
              <div key={a.id} style={card}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, ...label }}><span>{a.id} {a.bloco_nome}</span>{a.confianca && <span>Confiança {String(a.confianca).toLowerCase()}</span>}</div>
                <div style={{ ...sans, fontSize: 15, fontWeight: 600, color: c.ink, margin: "6px 0" }}>{a.titulo}</div>
                {a.dado && <div style={{ ...serif, fontSize: 16, color: c.ink, marginBottom: 6 }}>{a.dado}</div>}
                {a.leitura && <div style={{ ...sans, fontSize: 14, color: c.ink, lineHeight: 1.5 }}>{a.leitura}</div>}
                {a.fonte && <div style={{ ...label, marginTop: 8 }}>{a.fonte}</div>}
              </div>
            ))}
          </div>
        </>
      )}
      {map.fonte && <p style={{ ...note, marginTop: 24 }}>{map.fonte}</p>}
    </div>
  );
}

function PositionTab({ map }) {
  const pos = map.posicao || {};
  const dims = arr(pos.dimensoes);
  const hoje = dims.reduce((s, d) => s + num(d.hoje), 0);
  const alvo = dims.reduce((s, d) => s + num(d.alvo), 0);
  return (
    <div>
      {pos.declaracao && (
        <>
          <h2 style={{ ...h2, marginTop: 0 }}>Declaração de posição</h2>
          <div style={{ ...card, ...serif, fontSize: 17, color: c.ink, lineHeight: 1.55 }}>{pos.declaracao}</div>
        </>
      )}
      {dims.length > 0 && (
        <>
          <h2 style={h2}>A distância a percorrer</h2>
          {pos.nota && <p style={note}>{pos.nota}</p>}
          <div style={{ ...grid(9), marginBottom: 12 }}>
            {[["Hoje", hoje], ["Alvo", alvo], ["Distância", alvo - hoje]].map(([k, v]) => (
              <div key={k} style={{ ...card, padding: 16 }}><div style={label}>{k}</div><div style={{ ...display, fontSize: 28, color: c.ink }}>{v}</div></div>
            ))}
          </div>
          <div style={{ ...card, display: "flex", flexDirection: "column", gap: 14 }}>
            {dims.map((d) => (
              <div key={d.dimensao}>
                <div style={{ display: "flex", justifyContent: "space-between", ...sans, fontSize: 14, color: c.ink, marginBottom: 4 }}>
                  <span>{d.dimensao}</span><span style={{ color: c.mist }}>{num(d.hoje)} para {num(d.alvo)}</span>
                </div>
                <div style={{ position: "relative" }}>
                  <Bar value={d.hoje} max={5} height={10} />
                  <div title="Alvo" style={{ position: "absolute", top: -3, bottom: -3, width: 2, background: c.ink, left: `calc(${(Math.min(5, num(d.alvo)) / 5) * 100}% - 1px)` }} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      {(pos.declarada || pos.percebida) && (
        <div style={{ ...grid(16), marginTop: 16 }}>
          {pos.declarada && <div style={card}><div style={label}>Declarada</div><div style={{ ...sans, fontSize: 14.5, color: c.ink, marginTop: 6, lineHeight: 1.55 }}>{pos.declarada}</div></div>}
          {pos.percebida && <div style={card}><div style={label}>Percebida hoje</div><div style={{ ...sans, fontSize: 14.5, color: c.ink, marginTop: 6, lineHeight: 1.55 }}>{pos.percebida}</div></div>}
        </div>
      )}
      {pos.espaco_livre && (
        <>
          <h2 style={h2}>O espaço livre</h2>
          <div style={{ ...card, ...sans, fontSize: 15, color: c.ink, lineHeight: 1.6 }}>{pos.espaco_livre}</div>
        </>
      )}
      {arr(map.decisoes).length > 0 && (
        <>
          <h2 style={h2}>Decisões tomadas</h2>
          <div style={grid(16)}>
            {map.decisoes.map((d) => (
              <div key={d.tema} style={card}>
                <div style={label}>{d.tema}</div>
                <div style={{ ...serif, fontSize: 16, color: c.ink, margin: "4px 0 6px" }}>{d.decisao}</div>
                <div style={{ ...sans, fontSize: 14, color: c.mist, lineHeight: 1.5 }}>{d.porque}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function BlockersTab({ map }) {
  const t = map.travoes || {};
  const items = arr(t.items || map.travoes);
  if (!items.length) return <div style={note}>Este mapa não tem a parte "O que trava".</div>;
  return (
    <div>
      {t.nota && <p style={note}>{t.nota}</p>}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {items.map((b, i) => (
          <div key={b.titulo || i} style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
              <span style={{ ...serif, fontSize: 16.5, color: c.ink }}>{b.ordem || i + 1}. {b.titulo}</span>
              {b.peso && <Chip tone={/alto/i.test(b.peso) ? "bad" : /m[ée]dio/i.test(b.peso) ? "warn" : undefined}>Peso {String(b.peso).toLowerCase()}</Chip>}
            </div>
            {[["Sintoma", b.sintoma], ["Causa", b.causa]].filter(([, v]) => v).map(([k, v]) => (
              <div key={k} style={{ display: "grid", gridTemplateColumns: "5rem 1fr", gap: 8, marginTop: 8, ...sans, fontSize: 14, color: c.ink, lineHeight: 1.5 }}>
                <span style={label}>{k}</span><span>{v}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
      {t.fora && <p style={{ ...note, marginTop: 14 }}>{t.fora}</p>}
    </div>
  );
}

function PhaseCard({ phase, canManage, write }) {
  const [newGoal, setNewGoal] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const goals = phase.goals;
  const done = goals.filter((g) => g.completed).length;
  const d = phase.details || {};
  const save = (next) => write.saveGoals.mutate({ id: phase.id, goals: next });
  const toggle = (i) => save(goals.map((g, idx) => (idx === i ? { ...g, completed: !g.completed } : g)));
  const add = () => {
    if (!newGoal.trim()) return;
    save([...goals, { description: newGoal.trim(), completed: false }]);
    setNewGoal("");
  };
  const removeGoal = (i) => save(goals.filter((_, idx) => idx !== i));

  return (
    <div style={{ ...card, padding: "20px 22px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <div style={{ ...serif, fontSize: 17, color: c.ink }}>{d.ordem ? `${d.ordem}. ` : ""}{phase.title}</div>
        {(d.periodo || d.inicio) && <Chip>{d.periodo || `${d.inicio} a ${d.fim}`}</Chip>}
      </div>
      {d.resolve && <div style={{ ...sans, fontSize: 13.5, color: c.mist, marginTop: 4 }}>Resolve: {d.resolve}</div>}
      {(d.indicador || d.meta) && (
        <div style={{ ...grid(12), marginTop: 12 }}>
          {d.indicador && <div><div style={label}>Indicador</div><div style={{ ...sans, fontSize: 14, color: c.ink }}>{d.indicador}</div></div>}
          {d.meta && <div><div style={label}>Meta</div><div style={{ ...sans, fontSize: 14, color: c.ink }}>{d.meta}</div></div>}
        </div>
      )}
      <div style={{ ...label, margin: "14px 0 6px" }}>Tarefas {done}/{goals.length}</div>
      <Bar value={done} max={goals.length || 1} height={6} />
      <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 10 }}>
        {goals.map((g, i) => (
          <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <button type="button" disabled={!canManage} onClick={() => toggle(i)} style={{ display: "flex", alignItems: "flex-start", gap: 10, background: "none", border: "none", cursor: canManage ? "pointer" : "default", padding: "5px 4px", textAlign: "left", flex: 1 }}>
              {g.completed ? <CheckCircle2 size={16} color={c.sage} strokeWidth={2} style={{ flexShrink: 0, marginTop: 2 }} /> : <span style={{ width: 16, height: 16, borderRadius: 999, border: `1.5px solid ${c.lineStrong}`, flexShrink: 0, marginTop: 2 }} />}
              <span style={{ ...sans, fontSize: 14.5, color: g.completed ? c.mist : c.ink, textDecoration: g.completed ? "line-through" : "none", lineHeight: 1.45 }}>{g.description}</span>
            </button>
            {canManage && <button type="button" onClick={() => removeGoal(i)} title="Apagar tarefa" style={{ background: "none", border: "none", cursor: "pointer", color: c.mist, padding: 5 }}><Trash2 size={13} /></button>}
          </div>
        ))}
      </div>
      {canManage && (
        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          <input value={newGoal} onChange={(e) => setNewGoal(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="Nova tarefa" style={{ ...inputStyle, flex: 1, minWidth: 180 }} />
          <button type="button" onClick={add} style={btnGhost}><Plus size={14} /> Tarefa</button>
          {confirmDelete ? (
            <>
              <button type="button" onClick={() => write.remove.mutate(phase.id)} style={{ ...btnGhost, color: c.rose, borderColor: c.rose }}>Apagar fase</button>
              <button type="button" onClick={() => setConfirmDelete(false)} style={btnGhost}>Cancelar</button>
            </>
          ) : (
            <button type="button" onClick={() => setConfirmDelete(true)} title="Apagar fase" style={{ background: "none", border: "none", cursor: "pointer", color: c.mist, padding: 6 }}><Trash2 size={15} /></button>
          )}
        </div>
      )}
    </div>
  );
}

function NewPhaseForm({ write, onDone }) {
  const [f, setF] = useState({ title: "", periodo: "", indicador: "", meta: "" });
  const [error, setError] = useState("");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async () => {
    if (!f.title.trim()) return setError("Dê um nome à fase.");
    try { await write.add.mutateAsync({ title: f.title.trim(), periodo: f.periodo.trim(), indicador: f.indicador.trim(), meta: f.meta.trim() }); onDone(); }
    catch (err) { setError(err.message || "Não foi possível criar a fase."); }
  };
  return (
    <div style={{ ...card, display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
      <div style={{ ...serif, fontSize: 16, color: c.ink }}>Nova fase</div>
      <input style={inputStyle} value={f.title} onChange={set("title")} placeholder="Nome da fase (ex: Lançar o programa de indicação)" />
      <div style={grid(12)}>
        <input style={inputStyle} value={f.periodo} onChange={set("periodo")} placeholder="Período (ex: março a maio)" />
        <input style={inputStyle} value={f.indicador} onChange={set("indicador")} placeholder="Indicador" />
        <input style={inputStyle} value={f.meta} onChange={set("meta")} placeholder="Meta" />
      </div>
      {error && <div style={{ ...sans, fontSize: 13.5, color: c.rose }}>{error}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" onClick={submit} disabled={write.add.isPending} style={btnPrimary}>{write.add.isPending ? "A criar…" : "Criar fase"}</button>
        <button type="button" onClick={onDone} style={btnGhost}>Cancelar</button>
      </div>
    </div>
  );
}

function PhasesTab({ map, phases, canManage, write }) {
  const [showForm, setShowForm] = useState(false);
  const pr = map?.prioridades || {};
  return (
    <div>
      {(pr.periodo || pr.nota) && (
        <div style={{ marginBottom: 14 }}>
          {pr.periodo && <div style={{ ...sans, fontSize: 14.5, color: c.ink }}>{pr.periodo}</div>}
          {pr.nota && <div style={note}>{pr.nota}</div>}
        </div>
      )}
      {canManage && !showForm && (
        <button type="button" onClick={() => setShowForm(true)} style={{ ...btnGhost, display: "flex", alignItems: "center", gap: 6, marginBottom: 14 }}><Plus size={14} /> Nova fase</button>
      )}
      {showForm && <NewPhaseForm write={write} onDone={() => setShowForm(false)} />}
      {!phases.length && <div style={note}>Ainda não há fases. Importe um mapa ou crie a primeira fase.</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {phases.map((p) => <PhaseCard key={p.id} phase={p} canManage={canManage} write={write} />)}
      </div>
    </div>
  );
}

export default function GrowthMapModule({ brand, onBack, canManage }) {
  const mapQuery = useLatestMap(brand.id);
  const phasesQuery = usePhases(brand.id);
  const importMap = useImportMap(brand.id);
  const write = usePhaseWrite(brand.id);
  const [tab, setTab] = useUrlState("aba", "fases");
  const [msg, setMsg] = useState({ text: "", error: false });
  const fileRef = useRef(null);
  const map = mapQuery.data?.data || null;

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setMsg({ text: "", error: false });
    try {
      const data = parseMapFile(await file.text());
      const res = await importMap.mutateAsync(data);
      setMsg({ text: `Mapa importado. ${res.phases} prioridade(s) passaram a fases.`, error: false });
    } catch (err) {
      setMsg({ text: err.message || "Não foi possível importar o mapa.", error: true });
    }
  };

  const score = arr(map?.score?.criterios);
  const total = score.reduce((s, r) => s + num(r.validado), 0);

  return (
    <div className="bb-page" style={{ padding: "8px 40px 60px", maxWidth: 1040 }}>
      <button onClick={onBack} style={{ ...sans, display: "flex", alignItems: "center", gap: 6, fontSize: 14, color: c.mist, background: "none", border: "none", cursor: "pointer", marginBottom: 20 }}>
        <ArrowLeft size={14} /> {brand.name}
      </button>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h1 style={{ ...display, fontSize: 27, color: c.ink, margin: 0 }}>{mapQuery.data?.title || "Mapa de Crescimento"}</h1>
          {map?.headline && <div style={{ ...serif, fontSize: 18, color: c.ink, marginTop: 8 }}>{map.headline}</div>}
        </div>
        {canManage && (
          <>
            <input ref={fileRef} type="file" accept=".json,application/json" onChange={onFile} style={{ display: "none" }} />
            <button type="button" onClick={() => fileRef.current?.click()} disabled={importMap.isPending} style={{ ...btnGhost, display: "flex", alignItems: "center", gap: 6 }}>
              <Upload size={14} /> {importMap.isPending ? "A importar…" : map ? "Importar novo mapa" : "Importar mapa"}
            </button>
          </>
        )}
      </div>
      {msg.text && <div style={{ ...sans, fontSize: 14, color: msg.error ? c.rose : c.sage, marginTop: 10 }}>{msg.text}</div>}

      {map && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginTop: 14 }}>
          {score.length > 0 && <span style={{ ...sans, fontSize: 14.5, color: c.ink }}>Score <strong>{total}</strong> em {score.length * 10}</span>}
          {map.score?.faixa && <Chip tone="warn">{map.score.faixa}</Chip>}
          {arr(map.partes).map((p) => <Chip key={p.n} tone={/valid/i.test(p.estado || "") ? "ok" : undefined}>{p.n}. {p.nome}</Chip>)}
        </div>
      )}
      {map?.score?.resumo && <p style={{ ...note, marginTop: 10, maxWidth: 720 }}>{map.score.resumo}</p>}

      {!map && !mapQuery.isLoading && (
        <div style={{ ...card, display: "flex", gap: 14, alignItems: "flex-start", marginTop: 18 }}>
          <Layers size={20} color={c.bossText} style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ ...sans, fontSize: 14.5, color: c.ink, lineHeight: 1.6 }}>
            Ainda não há mapa nesta marca. Faça o Mapa de Crescimento com a skill e, no fim, peça o ficheiro <strong>mapa.json</strong>. Depois carregue em "Importar mapa": as prioridades passam a fases com as tarefas, e pode acrescentar mais.
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "22px 0 18px", borderBottom: `1px solid ${c.line}` }}>
        {TABS.filter(([k]) => k === "fases" || map).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setTab(k)} style={{ ...sans, fontSize: 14.5, fontWeight: tab === k ? 700 : 500, color: tab === k ? c.ink : c.mist, background: "none", border: "none", borderBottom: `2px solid ${tab === k ? c.ink : "transparent"}`, padding: "8px 12px", cursor: "pointer" }}>{l}</button>
        ))}
      </div>

      {tab === "pesquisa" && map && <ResearchTab map={map} />}
      {tab === "posicao" && map && <PositionTab map={map} />}
      {tab === "trava" && map && <BlockersTab map={map} />}
      {(tab === "fases" || !map) && <PhasesTab map={map} phases={phasesQuery.data || []} canManage={canManage} write={write} />}
    </div>
  );
}
