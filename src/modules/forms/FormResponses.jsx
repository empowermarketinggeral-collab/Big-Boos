import { useMemo, useState } from "react";
import { c, sans, serif, inputStyle, btnGhost, btnPrimary } from "../../shared/theme.jsx";
import { Download, Printer, Search, ChevronDown, ChevronUp } from "lucide-react";

/* ---------------------------------------------------------
   RESPOSTAS DE UM FORMULÁRIO (separador "Respostas")
   Resumo por pergunta de escolha, pesquisa, lista ou tabela, e download
   (todas em CSV, ou uma pessoa em CSV / para imprimir em PDF).
--------------------------------------------------------- */

// Mesmo texto que a página pública mostra (id da opção → texto).
function answerText(field, value) {
  if (value == null || value === "") return "";
  if (field.type === "consent") return value === true ? "Sim" : "Não";
  if (field.type === "choice") {
    const ids = Array.isArray(value) ? value : [value];
    return ids.map((id) => (field.options || []).find((o) => o.id === id)?.label || id).join(", ");
  }
  return Array.isArray(value) ? value.join(", ") : String(value);
}

const when = (iso) => new Date(iso).toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const csvCell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
const slug = (s) => String(s || "formulario").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "formulario";

function saveCsv(filename, rows) {
  const csv = rows.map((r) => r.map(csvCell).join(";")).join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

const escapeHtml = (s) => String(s ?? "").replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));

// Abre uma página simples com as respostas de uma pessoa, pronta a imprimir ou guardar em PDF.
function printOne(formName, fields, s, isQuiz) {
  const w = window.open("", "_blank");
  if (!w) return;
  const rows = fields.map((f) => `<tr><th>${escapeHtml(f.label)}</th><td>${escapeHtml(answerText(f, s.answers?.[f.id])) || "<span class='vazio'>Sem resposta</span>"}</td></tr>`).join("");
  w.document.write(`<!doctype html><html lang="pt"><head><meta charset="utf-8"><title>${escapeHtml(formName)}</title>
<style>body{font-family:Arial,sans-serif;color:#1d1b22;margin:32px;font-size:14px}h1{font-size:20px;margin:0 0 4px}p{color:#666;margin:0 0 18px}
table{border-collapse:collapse;width:100%}th,td{border-bottom:1px solid #ddd;padding:8px 6px;text-align:left;vertical-align:top}th{width:38%;color:#555;font-weight:600}.vazio{color:#aaa}</style>
</head><body><h1>${escapeHtml(formName)}</h1><p>Resposta de ${escapeHtml(when(s.submitted_at))}${isQuiz && s.score != null ? `, ${s.score} pontos` : ""}</p><table>${rows}</table>
<script>window.onload=function(){window.print()}</script></body></html>`);
  w.document.close();
}

// Quem respondeu: nome, email ou telefone das próprias respostas.
function whoOf(fields, s) {
  const byType = (t) => fields.find((f) => f.type === t && s.answers?.[f.id]);
  const nameField = fields.find((f) => (f.mapsTo === "name" || /nome/i.test(f.label)) && s.answers?.[f.id]);
  const name = nameField ? answerText(nameField, s.answers[nameField.id]) : "";
  const email = byType("email") ? s.answers[byType("email").id] : "";
  const phone = byType("phone") ? s.answers[byType("phone").id] : "";
  return { title: name || email || phone || "Resposta", sub: [name ? email : "", phone && (name || email) ? phone : ""].filter(Boolean).join(", ") };
}

export default function FormResponses({ formName, fields: allFields, submissions = [], loading, isQuiz }) {
  const fields = (allFields || []).filter((f) => f.type !== "section");
  const [q, setQ] = useState("");
  const [view, setView] = useState("lista");
  const [order, setOrder] = useState("recentes");
  const [open, setOpen] = useState(null);
  const [optionFilter, setOptionFilter] = useState(null); // { fieldId, optionId }

  const choiceFields = fields.filter((f) => (f.type === "choice" || f.type === "select") && (f.options || []).length);
  // Botões guardam o id da opção; a lista guarda o próprio texto (opções em texto).
  const optionsOf = (f) => (f.options || []).map((o) => (typeof o === "string" ? { id: o, label: o } : o));
  const optionIdsOf = (_f, v) => (Array.isArray(v) ? v : v == null || v === "" ? [] : [v]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    let list = submissions.filter((s) => {
      if (optionFilter) {
        const f = fields.find((x) => x.id === optionFilter.fieldId);
        if (!f || !optionIdsOf(f, s.answers?.[f.id]).includes(optionFilter.optionId)) return false;
      }
      if (!term) return true;
      return fields.some((f) => answerText(f, s.answers?.[f.id]).toLowerCase().includes(term));
    });
    if (order === "antigas") list = [...list].reverse();
    if (order === "pontos") list = [...list].sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submissions, q, order, optionFilter, allFields]);

  const weekAgo = Date.now() - 7 * 86400000;
  const lastWeek = submissions.filter((s) => new Date(s.submitted_at).getTime() >= weekAgo).length;
  const scored = submissions.filter((s) => s.score != null);
  const avgScore = scored.length ? Math.round((scored.reduce((t, s) => t + s.score, 0) / scored.length) * 10) / 10 : null;

  const header = ["Data", ...(isQuiz ? ["Pontos"] : []), ...fields.map((f) => f.label)];
  const rowOf = (s) => [when(s.submitted_at), ...(isQuiz ? [s.score ?? ""] : []), ...fields.map((f) => answerText(f, s.answers?.[f.id]))];
  const downloadAll = () => saveCsv(`respostas-${slug(formName)}.csv`, [header, ...filtered.map(rowOf)]);
  const downloadOne = (s) => saveCsv(`resposta-${slug(formName)}-${slug(whoOf(fields, s).title)}.csv`, [["Pergunta", "Resposta"], ["Data", when(s.submitted_at)], ...(isQuiz ? [["Pontos", s.score ?? ""]] : []), ...fields.map((f) => [f.label, answerText(f, s.answers?.[f.id])])]);

  const tile = (label, value) => (
    <div style={{ background: c.folha, border: `1px solid ${c.line}`, borderRadius: 3, padding: "12px 14px" }}>
      <div style={{ ...sans, fontSize: 12.5, color: c.mist }}>{label}</div>
      <div style={{ ...sans, fontSize: 22, fontWeight: 700, color: c.ink, marginTop: 2 }}>{value}</div>
    </div>
  );
  const pill = (active) => ({ ...sans, fontSize: 13.5, fontWeight: 600, padding: "6px 12px", borderRadius: 6, border: "none", cursor: "pointer", color: active ? "#fff" : c.mist, background: active ? c.boss : "transparent" });

  if (loading) return <div style={{ ...sans, fontSize: 14, color: c.mist }}>A carregar as respostas…</div>;
  if (!submissions.length) return <div style={{ ...sans, fontSize: 14.5, color: c.mist, padding: "30px 0", textAlign: "center" }}>Ainda sem respostas. Quando alguém preencher o formulário, aparece aqui.</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(9rem, 1fr))", gap: 8 }}>
        {tile("Respostas", submissions.length)}
        {tile("Últimos 7 dias", lastWeek)}
        {isQuiz && avgScore != null && tile("Média de pontos", avgScore.toLocaleString("pt-PT"))}
        {tile("Última", when(submissions[0].submitted_at).split(",")[0])}
      </div>

      {choiceFields.length > 0 && (
        <div style={{ background: c.folha, border: `1px solid ${c.line}`, borderRadius: 3, padding: "16px 18px" }}>
          <div style={{ ...serif, fontSize: 15.5, color: c.ink, marginBottom: 4 }}>Resumo das escolhas</div>
          <div style={{ ...sans, fontSize: 12.5, color: c.mist, marginBottom: 12 }}>Toque numa opção para ver só quem a escolheu.</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {choiceFields.map((f) => {
              const total = submissions.filter((s) => optionIdsOf(f, s.answers?.[f.id]).length).length || 1;
              return (
                <div key={f.id}>
                  <div style={{ ...sans, fontSize: 14, fontWeight: 600, color: c.ink, marginBottom: 6 }}>{f.label}</div>
                  {optionsOf(f).map((o) => {
                    const n = submissions.filter((s) => optionIdsOf(f, s.answers?.[f.id]).includes(o.id)).length;
                    const pct = Math.round((n / total) * 100);
                    const active = optionFilter?.fieldId === f.id && optionFilter?.optionId === o.id;
                    return (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() => setOptionFilter(active ? null : { fieldId: f.id, optionId: o.id })}
                        style={{ display: "block", width: "100%", textAlign: "left", background: active ? c.bossSoft : "none", border: "none", padding: "4px 6px", borderRadius: 3, cursor: "pointer", marginBottom: 2 }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, ...sans, fontSize: 13.5, color: c.ink }}>
                          <span>{o.label}</span>
                          <span style={{ color: c.mist, whiteSpace: "nowrap" }}>{n} ({pct}%)</span>
                        </div>
                        <div style={{ height: 6, background: c.paper, borderRadius: 3, marginTop: 3, overflow: "hidden" }}>
                          <div style={{ width: `${pct}%`, height: "100%", background: c.boss }} />
                        </div>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "1 1 220px" }}>
          <Search size={14} color={c.mist} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Procurar nas respostas" style={{ ...inputStyle, paddingLeft: 32 }} />
        </div>
        <select value={order} onChange={(e) => setOrder(e.target.value)} style={{ ...inputStyle, width: "auto" }}>
          <option value="recentes">Mais recentes</option>
          <option value="antigas">Mais antigas</option>
          {isQuiz && <option value="pontos">Mais pontos</option>}
        </select>
        <div style={{ display: "flex", gap: 2, background: c.paper, borderRadius: 6, padding: 3 }}>
          <button type="button" onClick={() => setView("lista")} style={pill(view === "lista")}>Lista</button>
          <button type="button" onClick={() => setView("tabela")} style={pill(view === "tabela")}>Tabela</button>
        </div>
        <button type="button" onClick={downloadAll} style={{ ...btnPrimary, display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Download size={13} /> Descarregar {filtered.length === submissions.length ? "todas" : `estas ${filtered.length}`}
        </button>
      </div>
      {(optionFilter || q) && (
        <div style={{ ...sans, fontSize: 13, color: c.mist }}>
          A mostrar {filtered.length} de {submissions.length}.{" "}
          <button type="button" onClick={() => { setOptionFilter(null); setQ(""); }} style={{ ...sans, fontSize: 13, color: c.bossText, background: "none", border: "none", padding: 0, cursor: "pointer", textDecoration: "underline" }}>Ver todas</button>
        </div>
      )}

      {view === "tabela" ? (
        <div style={{ overflowX: "auto", background: c.folha, border: `1px solid ${c.line}`, borderRadius: 3 }}>
          <table style={{ borderCollapse: "collapse", minWidth: "100%" }}>
            <thead>
              <tr>
                {header.map((h) => <th key={h} style={{ ...sans, fontSize: 12.5, color: c.mist, fontWeight: 600, textAlign: "left", padding: "8px 10px", borderBottom: `1px solid ${c.lineStrong}`, whiteSpace: "nowrap" }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id}>
                  {rowOf(s).map((v, i) => <td key={i} style={{ ...sans, fontSize: 13.5, color: c.ink, padding: "8px 10px", borderBottom: `1px solid ${c.line}`, verticalAlign: "top", maxWidth: 280 }}>{v}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map((s) => {
            const who = whoOf(fields, s);
            const isOpen = open === s.id;
            return (
              <div key={s.id} style={{ background: c.folha, border: `1px solid ${isOpen ? c.lineStrong : c.line}`, borderRadius: 3 }}>
                <button type="button" onClick={() => setOpen(isOpen ? null : s.id)} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", background: "none", border: "none", padding: "12px 14px", cursor: "pointer" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ ...sans, fontSize: 14.5, fontWeight: 600, color: c.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{who.title}</div>
                    <div style={{ ...sans, fontSize: 12.5, color: c.mist }}>{[who.sub, when(s.submitted_at)].filter(Boolean).join(", ")}</div>
                  </div>
                  {isQuiz && s.score != null && <span style={{ ...sans, fontSize: 13, fontWeight: 700, color: c.bossText, whiteSpace: "nowrap" }}>{s.score} pontos</span>}
                  {isOpen ? <ChevronUp size={16} color={c.mist} /> : <ChevronDown size={16} color={c.mist} />}
                </button>
                {isOpen && (
                  <div style={{ padding: "0 14px 14px" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, borderTop: `1px solid ${c.line}`, paddingTop: 10 }}>
                      {fields.map((f) => {
                        const text = answerText(f, s.answers?.[f.id]);
                        return (
                          <div key={f.id}>
                            <div style={{ ...sans, fontSize: 12.5, color: c.mist }}>{f.label}</div>
                            <div style={{ ...sans, fontSize: 14, color: text ? c.ink : c.mistLight, whiteSpace: "pre-wrap" }}>{text || "Sem resposta"}</div>
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                      <button type="button" onClick={() => downloadOne(s)} style={{ ...btnGhost, display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", fontSize: 13.5 }}>
                        <Download size={13} /> Descarregar (CSV)
                      </button>
                      <button type="button" onClick={() => printOne(formName, fields, s, isQuiz)} style={{ ...btnGhost, display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", fontSize: 13.5 }}>
                        <Printer size={13} /> Imprimir ou guardar em PDF
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {filtered.length === 0 && <div style={{ ...sans, fontSize: 14, color: c.mist, textAlign: "center", padding: "16px 0" }}>Nenhuma resposta com este filtro.</div>}
        </div>
      )}
    </div>
  );
}
