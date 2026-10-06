import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabaseClient.js";
import { c, sans, serif, display, inputStyle, btnPrimary, btnGhost, Modal, CAN_MANAGE_ROLES } from "../../shared/theme.jsx";
import { ArrowLeft, Plus, Upload, Pencil, Trash2, Check, ExternalLink, Bell, Cake, Search } from "lucide-react";
import ApprovalSeal from "../../design/ApprovalSeal.jsx";
import {
  MONTHS, FIELD_LABELS, ageOn, detectDateOrder, daysBetween, daysInMonth, detectColumns, dmLabel, nextOccurrence, occurrenceIn,
  planImport, profileLink, rowsFromTable, tableFromText, todayLocal, whenLabel,
} from "./birthdaysLogic.js";

/* ---------------------------------------------------------
   ANIVERSÁRIOS (módulo de cada marca)
   Lista anual (nome, dia/mês, n.º de sócio, perfil, observações), lembrete
   no sino no dia (função SQL notify_birthdays, de hora a hora) e um
   "publicado" por pessoa e por ano para ninguém ficar por publicar.
--------------------------------------------------------- */

const DEFAULT_SETTINGS = { enabled: true, days_before: [0], remind_hour: 8 };
const BEFORE_OPTIONS = [[0, "No próprio dia"], [1, "Na véspera"], [3, "3 dias antes"], [7, "1 semana antes"]];

function useBirthdays(brandId) {
  return useQuery({
    queryKey: ["brand_birthdays", brandId],
    enabled: !!brandId,
    queryFn: async () => {
      const { data, error } = await supabase.from("brand_birthdays").select("id, name, birth_day, birth_month, birth_year, member_number, profile, notes").eq("brand_id", brandId).order("name");
      if (error) throw error;
      return data;
    },
  });
}

function useSettings(brandId) {
  return useQuery({
    queryKey: ["birthday_settings", brandId],
    enabled: !!brandId,
    queryFn: async () => {
      const { data, error } = await supabase.from("birthday_settings").select("enabled, days_before, remind_hour").eq("brand_id", brandId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

function usePosts(brandId, years) {
  return useQuery({
    queryKey: ["birthday_posts", brandId, years.join(",")],
    enabled: !!brandId,
    queryFn: async () => {
      const { data, error } = await supabase.from("birthday_posts").select("birthday_id, year").eq("brand_id", brandId).in("year", years);
      if (error) throw error;
      return new Set((data || []).map((p) => `${p.birthday_id}:${p.year}`));
    },
  });
}

/* ---------- Cartão de uma pessoa (hoje / próximos / em atraso) ---------- */
function PersonCard({ person, date, days, posted, canManage, onToggle, busy, highlight }) {
  const link = profileLink(person.profile);
  const age = ageOn(person.birth_year, date);
  return (
    <div style={{ background: highlight ? c.bossSoft : c.folha, border: `1px solid ${highlight ? c.boss : c.line}`, borderRadius: 8, padding: "14px 16px", display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
      <div style={{ minWidth: 86, textAlign: "center" }}>
        <div style={{ ...display, fontSize: 24, color: c.ink, lineHeight: 1.1 }}>{dmLabel(date.getDate(), date.getMonth() + 1)}</div>
        <div style={{ ...sans, fontSize: 12.5, fontWeight: 700, color: days === 0 ? c.bossText : days < 0 ? c.rose : c.mist }}>{whenLabel(days)}</div>
      </div>
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ ...serif, fontSize: 18, color: c.ink }}>{person.name}{age != null && <span style={{ ...sans, fontSize: 14, color: c.mist }}> faz {age} anos</span>}</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 6 }}>
          {person.member_number && <span style={{ ...sans, fontSize: 12.5, fontWeight: 700, color: c.bossText, background: c.bossSoft, borderRadius: 999, padding: "2px 10px" }}>Sócio n.º {person.member_number}</span>}
          {link.href ? (
            <a href={link.href} target="_blank" rel="noopener noreferrer" style={{ ...sans, fontSize: 13.5, fontWeight: 700, color: c.bossText, display: "inline-flex", alignItems: "center", gap: 4, wordBreak: "break-all" }}>
              <ExternalLink size={13} /> Abrir perfil
            </a>
          ) : link.text ? <span style={{ ...sans, fontSize: 13.5, color: c.ink }}>Perfil: {link.text}</span> : null}
        </div>
        {person.notes && <div style={{ ...sans, fontSize: 14, color: c.mist, marginTop: 6, whiteSpace: "pre-wrap" }}>{person.notes}</div>}
      </div>
      {canManage && (
        <button type="button" onClick={onToggle} disabled={busy} aria-pressed={posted} style={{ ...(posted ? { ...btnGhost, borderColor: c.sage, color: c.sageSolid } : btnPrimary) }}>
          {posted ? <><ApprovalSeal size={14} /> Publicado</> : <><Check size={14} /> Marcar como publicado</>}
        </button>
      )}
    </div>
  );
}

/* ---------- Definições do lembrete ---------- */
function SettingsPanel({ brand, settings, canManage }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const current = settings || null;

  const save = async (patch) => {
    setBusy(true); setError(""); setMessage("");
    const next = { ...(current || DEFAULT_SETTINGS), ...patch };
    if (!next.days_before.length) next.days_before = [0];
    const { error: err } = await supabase.from("birthday_settings").upsert({ brand_id: brand.id, enabled: next.enabled, days_before: next.days_before, remind_hour: next.remind_hour, updated_at: new Date().toISOString() }, { onConflict: "brand_id" });
    setBusy(false);
    if (err) { setError("Não foi possível guardar."); return; }
    qc.invalidateQueries({ queryKey: ["birthday_settings", brand.id] });
  };
  const test = async () => {
    setBusy(true); setError(""); setMessage("");
    const { data, error: err } = await supabase.rpc("birthday_reminder_test", { p_brand: brand.id });
    setBusy(false);
    if (err) { setError("Não foi possível enviar o teste."); return; }
    qc.invalidateQueries({ queryKey: ["notifications"] });
    setMessage(data > 0 ? "Enviei um lembrete de teste: vê o sino no topo, com os próximos 7 dias." : "Enviei um lembrete de teste: vê o sino. Nos próximos 7 dias não há aniversários.");
  };

  const on = !!current?.enabled;
  const days = current?.days_before || [0];
  return (
    <section style={{ background: c.folha, border: `1px solid ${c.line}`, borderRadius: 8, padding: 16, marginBottom: 26 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <Bell size={18} color={c.bossText} />
        <h2 style={{ ...serif, fontSize: 17, fontWeight: 500, color: c.ink, margin: 0, flex: 1 }}>Lembrete no sino</h2>
        {canManage && (
          <button type="button" disabled={busy} onClick={() => save({ enabled: !on })} role="switch" aria-checked={on} style={on ? btnGhost : btnPrimary}>
            {on ? "Desligar lembretes" : "Ligar lembretes"}
          </button>
        )}
      </div>
      {!on && <div style={{ ...sans, fontSize: 14, color: c.mist, marginTop: 8 }}>Com os lembretes ligados, o Big Boss avisa-te no sino no dia de cada aniversário, com o perfil e as observações.</div>}
      {on && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            {BEFORE_OPTIONS.map(([d, label]) => (
              <label key={d} style={{ ...sans, fontSize: 14, color: c.ink, display: "flex", alignItems: "center", gap: 6 }}>
                <input type="checkbox" checked={days.includes(d)} disabled={!canManage || busy} onChange={(e) => save({ days_before: e.target.checked ? [...days, d].sort((a, b) => a - b) : days.filter((x) => x !== d) })} />
                {label}
              </label>
            ))}
          </div>
          <label style={{ ...sans, fontSize: 14, color: c.ink, display: "flex", alignItems: "center", gap: 8 }}>
            Hora do aviso (hora de Lisboa):
            <select value={current.remind_hour} disabled={!canManage || busy} onChange={(e) => save({ remind_hour: Number(e.target.value) })} style={{ ...inputStyle, width: "auto", minHeight: 36 }}>
              {[6, 7, 8, 9, 10, 11, 12, 14, 16, 18].map((h) => <option key={h} value={h}>{h}:00</option>)}
            </select>
          </label>
          {canManage && <div><button type="button" disabled={busy} onClick={test} style={btnGhost}><Bell size={14} /> Enviar um lembrete de teste</button></div>}
        </div>
      )}
      {message && <div role="status" style={{ ...sans, fontSize: 14, color: c.sageSolid, marginTop: 10 }}>{message}</div>}
      {error && <div role="alert" style={{ ...sans, fontSize: 14, color: c.rose, marginTop: 10 }}>{error}</div>}
    </section>
  );
}

/* ---------- Adicionar / editar ---------- */
function PersonModal({ brand, userId, person, onClose, onSaved }) {
  const [f, setF] = useState({
    name: person?.name || "", day: person?.birth_day || "", month: person?.birth_month || "", year: person?.birth_year || "",
    member: person?.member_number || "", profile: person?.profile || "", notes: person?.notes || "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const label = { ...sans, fontSize: 13, fontWeight: 700, color: c.mist, display: "block", marginBottom: 5 };

  const save = async () => {
    setError("");
    const day = Number(f.day), month = Number(f.month), year = f.year ? Number(f.year) : null;
    if (!f.name.trim()) return setError("Escreve o nome.");
    if (!month || !day || day < 1 || day > daysInMonth(month)) return setError("Escolhe um dia e um mês válidos.");
    if (year && (year < 1900 || year > new Date().getFullYear())) return setError("O ano de nascimento não parece certo.");
    setBusy(true);
    const row = { brand_id: brand.id, name: f.name.trim(), birth_day: day, birth_month: month, birth_year: year, member_number: f.member.trim() || null, profile: f.profile.trim() || null, notes: f.notes.trim() || null };
    const { error: err } = person
      ? await supabase.from("brand_birthdays").update(row).eq("id", person.id)
      : await supabase.from("brand_birthdays").insert({ ...row, created_by: userId || null });
    setBusy(false);
    if (err) return setError(err.code === "23505" ? "Já existe um sócio com esse número." : "Não foi possível guardar.");
    onSaved();
  };

  return (
    <Modal title={person ? "Editar aniversário" : "Novo aniversário"} onClose={onClose} width={500}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div><label style={label} htmlFor="b-nome">Nome</label><input id="b-nome" value={f.name} onChange={set("name")} maxLength={200} style={inputStyle} /></div>
        <div style={{ display: "grid", gridTemplateColumns: "90px 1fr 110px", gap: 10 }}>
          <div><label style={label} htmlFor="b-dia">Dia</label><input id="b-dia" type="number" min={1} max={31} value={f.day} onChange={set("day")} style={inputStyle} /></div>
          <div><label style={label} htmlFor="b-mes">Mês</label>
            <select id="b-mes" value={f.month} onChange={set("month")} style={inputStyle}><option value="">—</option>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></div>
          <div><label style={label} htmlFor="b-ano">Ano (opcional)</label><input id="b-ano" type="number" min={1900} value={f.year} onChange={set("year")} style={inputStyle} /></div>
        </div>
        <div><label style={label} htmlFor="b-socio">N.º de sócio</label><input id="b-socio" value={f.member} onChange={set("member")} maxLength={60} style={inputStyle} /></div>
        <div><label style={label} htmlFor="b-perfil">Perfil da rede social (link ou nome)</label><input id="b-perfil" value={f.profile} onChange={set("profile")} maxLength={500} placeholder="https://facebook.com/…" style={inputStyle} /></div>
        <div><label style={label} htmlFor="b-obs">Observações</label><textarea id="b-obs" value={f.notes} onChange={set("notes")} rows={3} maxLength={2000} style={{ ...inputStyle, resize: "vertical" }} /></div>
        {error && <div role="alert" style={{ ...sans, fontSize: 14, color: c.rose }}>{error}</div>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" onClick={onClose} style={btnGhost}>Cancelar</button>
          <button type="button" onClick={save} disabled={busy} style={btnPrimary}>{busy ? "A guardar…" : "Guardar"}</button>
        </div>
      </div>
    </Modal>
  );
}

/* ---------- Importar a folha ---------- */
async function readTextFile(file) {
  const buf = await file.arrayBuffer();
  let text = new TextDecoder("utf-8").decode(buf);
  if (text.includes("�")) text = new TextDecoder("windows-1252").decode(buf); // CSV do Excel antigo
  return text;
}

function ImportModal({ brand, userId, existing, hasSettings, onClose, onDone }) {
  const fileRef = useRef(null);
  const [text, setText] = useState("");
  const [table, setTable] = useState(null);
  const [mapping, setMapping] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [dateOrder, setDateOrder] = useState("auto");

  const load = (raw) => {
    setError("");
    const t = tableFromText(raw);
    if (t.length < 2) { setTable(null); setError("Não encontrei linhas de dados. A primeira linha tem de ser o cabeçalho (Nome, Data…)."); return; }
    setTable(t);
    setMapping(detectColumns(t[0]));
  };
  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (/\.(xlsx?|ods)$/i.test(file.name)) { setError("Este é um ficheiro Excel. Abre-o no Google Sheets e usa Ficheiro → Transferir → Valores separados por vírgulas (.csv)."); return; }
    try { const raw = await readTextFile(file); setText(raw); load(raw); } catch { setError("Não consegui ler o ficheiro."); }
  };

  const rows = useMemo(() => (table && mapping ? rowsFromTable(table, mapping, new Date().getFullYear(), dateOrder) : []), [table, mapping, dateOrder]);
  const detected = useMemo(() => (table && mapping && mapping.date >= 0 ? detectDateOrder(table.slice(1).map((r) => r[mapping.date])) : null), [table, mapping]);
  const effectiveOrder = dateOrder === "auto" ? detected?.order || "dmy" : dateOrder;
  const plan = useMemo(() => planImport(rows, existing), [rows, existing]);
  const canImport = mapping && mapping.name >= 0 && (mapping.date >= 0 || (mapping.day >= 0 && mapping.month >= 0)) && (plan.creates.length + plan.updates.length) > 0;

  const run = async () => {
    setBusy(true); setError("");
    try {
      const toRow = (r) => ({ brand_id: brand.id, name: r.name, birth_day: r.day, birth_month: r.month, birth_year: r.year, member_number: r.member || null, profile: r.profile || null, notes: r.notes || null });
      let created = 0, updated = 0, failed = 0;
      for (let i = 0; i < plan.creates.length; i += 200) {
        const chunk = plan.creates.slice(i, i + 200).map((r) => ({ ...toRow(r), created_by: userId || null }));
        const { error: err } = await supabase.from("brand_birthdays").insert(chunk);
        if (err) {
          // um repetido não deve deitar abaixo o lote: tenta um a um
          for (const row of chunk) { const { error: e1 } = await supabase.from("brand_birthdays").insert(row); if (e1) failed++; else created++; }
        } else created += chunk.length;
      }
      for (const u of plan.updates) {
        const patch = { name: u.row.name, birth_day: u.row.day, birth_month: u.row.month };
        if (u.row.year) patch.birth_year = u.row.year;
        if (u.row.member) patch.member_number = u.row.member;
        if (u.row.profile) patch.profile = u.row.profile;
        if (u.row.notes) patch.notes = u.row.notes;
        const { error: err } = await supabase.from("brand_birthdays").update(patch).eq("id", u.id);
        if (err) failed++; else updated++;
      }
      let remindersOn = false;
      if (!hasSettings && created + updated > 0) {
        const { error: err } = await supabase.from("birthday_settings").upsert({ brand_id: brand.id, ...DEFAULT_SETTINGS }, { onConflict: "brand_id" });
        remindersOn = !err;
      }
      setResult({ created, updated, failed, problems: plan.problems.length, remindersOn });
    } catch {
      setError("A importação falhou a meio. Volta a tentar: o que já entrou não se duplica.");
    } finally {
      setBusy(false);
    }
  };

  const fieldSelect = (key) => (
    <label key={key} style={{ ...sans, fontSize: 13, color: c.mist, display: "flex", flexDirection: "column", gap: 4 }}>
      {FIELD_LABELS[key]}
      <select value={mapping[key]} onChange={(e) => setMapping((m) => ({ ...m, [key]: Number(e.target.value) }))} style={{ ...inputStyle, minHeight: 36 }}>
        <option value={-1}>— ignorar —</option>
        {table[0].map((h, i) => <option key={i} value={i}>{h || `(coluna ${i + 1})`}</option>)}
      </select>
    </label>
  );

  if (result) {
    return (
      <Modal title="Importação concluída" onClose={() => { onDone(); }} width={480}>
        <div style={{ ...sans, fontSize: 14.5, color: c.ink, lineHeight: 1.7 }}>
          <div><b>{result.created}</b> aniversários novos{result.updated ? <>, <b>{result.updated}</b> atualizados</> : null}.</div>
          {result.problems > 0 && <div style={{ color: c.rose }}>{result.problems} linhas ficaram de fora (sem nome ou com data que não percebi).</div>}
          {result.failed > 0 && <div style={{ color: c.rose }}>{result.failed} não foram guardadas.</div>}
          {result.remindersOn && <div style={{ marginTop: 8 }}>Os lembretes ficaram <b>ligados</b>: vais receber o aviso no sino, às 8:00, no dia de cada aniversário. Podes mudar isto nas definições do lembrete.</div>}
        </div>
        <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}><button type="button" onClick={onDone} style={btnPrimary}>Fechar</button></div>
      </Modal>
    );
  }

  return (
    <Modal title="Importar a folha de aniversários" onClose={onClose} width={680}>
      {!table && (
        <>
          <div style={{ ...sans, fontSize: 14, color: c.mist, lineHeight: 1.6, marginBottom: 12 }}>
            No Google Drive abre a folha e escolhe <b>Ficheiro → Transferir → Valores separados por vírgulas (.csv)</b>. Depois carrega aqui o ficheiro, ou cola o conteúdo da folha (copiado do Sheets).
          </div>
          <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" style={{ display: "none" }} onChange={onFile} />
          <button type="button" onClick={() => fileRef.current?.click()} style={{ ...btnPrimary, marginBottom: 14 }}><Upload size={14} /> Escolher ficheiro CSV</button>
          <label style={{ ...sans, fontSize: 13, fontWeight: 700, color: c.mist, display: "block", marginBottom: 5 }} htmlFor="b-colar">Ou cola aqui as linhas da folha</label>
          <textarea id="b-colar" value={text} onChange={(e) => setText(e.target.value)} rows={6} placeholder={"Nome\tData de nascimento\tN.º de sócio\tFacebook\tObservações"} style={{ ...inputStyle, resize: "vertical", fontFamily: "monospace", fontSize: 13 }} />
          <div style={{ marginTop: 10 }}><button type="button" onClick={() => load(text)} disabled={!text.trim()} style={btnGhost}>Ler o que colei</button></div>
        </>
      )}

      {table && mapping && (
        <>
          <div style={{ ...sans, fontSize: 14, color: c.mist, marginBottom: 10 }}>Confirma quais colunas são quais. Percebi isto pelos cabeçalhos:</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10, marginBottom: 14 }}>
            {["name", "date", "member", "profile", "notes"].map(fieldSelect)}
          </div>
          {mapping.date >= 0 && (
            <div style={{ ...sans, fontSize: 13.5, color: c.mist, marginBottom: 14, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <label htmlFor="b-ordem" style={{ fontWeight: 700 }}>Formato das datas:</label>
              <select id="b-ordem" value={dateOrder} onChange={(e) => setDateOrder(e.target.value)} style={{ ...inputStyle, width: "auto", minHeight: 36 }}>
                <option value="auto">Automático ({effectiveOrder === "mdy" ? "mês/dia" : "dia/mês"}{detected && !detected.certain ? ", não tenho a certeza" : ""})</option>
                <option value="dmy">Dia/mês (ex.: 17/01 = 17 de janeiro)</option>
                <option value="mdy">Mês/dia (ex.: 01/17 = 17 de janeiro)</option>
              </select>
            </div>
          )}
          {mapping.date < 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 14 }}>
              {["day", "month", "year"].map(fieldSelect)}
            </div>
          )}

          <div style={{ ...sans, fontSize: 14.5, color: c.ink, background: c.folha2, border: `1px solid ${c.line}`, borderRadius: 6, padding: "10px 12px", marginBottom: 12, lineHeight: 1.7 }}>
            <b>{plan.creates.length}</b> novos · <b>{plan.updates.length}</b> a atualizar{plan.duplicatesInFile > 0 && <> · {plan.duplicatesInFile} repetidos no ficheiro (fica o último)</>}
            {plan.problems.length > 0 && <> · <span style={{ color: c.rose }}><b>{plan.problems.length}</b> com problema</span></>}
          </div>

          <div style={{ maxHeight: 220, overflow: "auto", border: `1px solid ${c.line}`, borderRadius: 6, marginBottom: 12 }}>
            <table style={{ ...sans, fontSize: 13, width: "100%", borderCollapse: "collapse" }}>
              <thead><tr style={{ textAlign: "left", color: c.mist }}><th style={{ padding: "6px 10px" }}>Linha</th><th>Nome</th><th>Data</th><th>Sócio</th><th>Estado</th></tr></thead>
              <tbody>
                {rows.slice(0, 60).map((r) => (
                  <tr key={r.line} style={{ borderTop: `1px solid ${c.line}`, color: r.problem ? c.rose : c.ink }}>
                    <td style={{ padding: "5px 10px" }}>{r.line}</td><td>{r.name || "—"}</td><td>{r.day ? `${dmLabel(r.day, r.month)}${r.year ? `/${r.year}` : ""}` : "—"}</td><td>{r.member || ""}</td><td>{r.problem || "ok"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > 60 && <div style={{ ...sans, fontSize: 12.5, color: c.mist, marginBottom: 8 }}>A mostrar as primeiras 60 de {rows.length} linhas.</div>}
        </>
      )}

      {error && <div role="alert" style={{ ...sans, fontSize: 14, color: c.rose, margin: "8px 0" }}>{error}</div>}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
        {table && <button type="button" onClick={() => { setTable(null); setMapping(null); setError(""); }} style={btnGhost}>Escolher outro ficheiro</button>}
        <button type="button" onClick={onClose} style={btnGhost}>Cancelar</button>
        {table && <button type="button" onClick={run} disabled={busy || !canImport} style={btnPrimary}>{busy ? "A importar…" : `Importar ${plan.creates.length + plan.updates.length}`}</button>}
      </div>
    </Modal>
  );
}

/* ---------- Módulo ---------- */
export default function BirthdaysModule({ brand, onBack, session }) {
  const canManage = CAN_MANAGE_ROLES.includes(session.role);
  const qc = useQueryClient();
  const birthdaysQ = useBirthdays(brand.id);
  const settingsQ = useSettings(brand.id);
  const today = todayLocal();
  const years = [today.getFullYear(), today.getFullYear() + 1];
  const postsQ = usePosts(brand.id, years);

  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null); // null | "new" | pessoa
  const [importing, setImporting] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  const people = useMemo(() => birthdaysQ.data || [], [birthdaysQ.data]);
  const posts = postsQ.data || new Set();

  const buckets = useMemo(() => {
    const upcoming = [], late = [];
    const lastWeek = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 7);
    for (const p of people) {
      const next = nextOccurrence(p.birth_month, p.birth_day, today);
      const d = daysBetween(today, next);
      if (d <= 14) upcoming.push({ person: p, date: next, days: d });
      const thisYear = occurrenceIn(today.getFullYear(), p.birth_month, p.birth_day);
      if (thisYear < today && thisYear >= lastWeek) late.push({ person: p, date: thisYear, days: daysBetween(today, thisYear) });
    }
    upcoming.sort((a, b) => a.days - b.days || a.person.name.localeCompare(b.person.name, "pt"));
    late.sort((a, b) => b.days - a.days);
    return { upcoming, late };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [people, today.getTime()]);

  const isPosted = (id, date) => posts.has(`${id}:${date.getFullYear()}`);
  const togglePosted = async (person, date) => {
    setBusyId(person.id); setError("");
    const year = date.getFullYear();
    const { error: err } = isPosted(person.id, date)
      ? await supabase.from("birthday_posts").delete().eq("birthday_id", person.id).eq("year", year)
      : await supabase.from("birthday_posts").upsert({ birthday_id: person.id, brand_id: brand.id, year, posted_by: session.id || null }, { onConflict: "birthday_id,year" });
    setBusyId("");
    if (err) { setError("Não foi possível guardar."); return; }
    qc.invalidateQueries({ queryKey: ["birthday_posts", brand.id] });
  };

  const refresh = () => qc.invalidateQueries({ queryKey: ["brand_birthdays", brand.id] });
  const remove = async () => {
    const { error: err } = await supabase.from("brand_birthdays").delete().eq("id", deleting.id);
    setDeleting(null);
    if (err) { setError("Não foi possível apagar."); return; }
    refresh();
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return people.filter((p) => !q || p.name.toLowerCase().includes(q) || String(p.member_number || "").toLowerCase().includes(q));
  }, [people, search]);
  const byMonth = useMemo(() => {
    const m = new Map();
    for (const p of filtered) { if (!m.has(p.birth_month)) m.set(p.birth_month, []); m.get(p.birth_month).push(p); }
    for (const list of m.values()) list.sort((a, b) => a.birth_day - b.birth_day || a.name.localeCompare(b.name, "pt"));
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [filtered]);

  const todayItems = buckets.upcoming.filter((u) => u.days === 0);
  const nextItems = buckets.upcoming.filter((u) => u.days > 0);

  const card = (u, highlight = false) => (
    <PersonCard key={`${u.person.id}-${u.date.getTime()}`} person={u.person} date={u.date} days={u.days} posted={isPosted(u.person.id, u.date)} canManage={canManage} busy={busyId === u.person.id} highlight={highlight} onToggle={() => togglePosted(u.person, u.date)} />
  );
  const h2 = { ...serif, fontSize: 18, fontWeight: 500, color: c.ink, margin: "0 0 12px" };

  return (
    <div className="bb-page" style={{ padding: "8px 40px 60px", maxWidth: 1000 }}>
      <button type="button" onClick={onBack} style={{ ...sans, display: "flex", alignItems: "center", gap: 6, fontSize: 14, color: c.mist, background: "none", border: "none", cursor: "pointer", marginBottom: 16 }}>
        <ArrowLeft size={14} /> {brand.name}
      </button>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        <h1 style={{ ...display, fontSize: 27, color: c.ink, margin: 0, flex: 1 }}>Aniversários</h1>
        {canManage && (
          <>
            <button type="button" onClick={() => setImporting(true)} style={btnGhost}><Upload size={14} /> Importar folha</button>
            <button type="button" onClick={() => setEditing("new")} style={btnPrimary}><Plus size={14} /> Novo aniversário</button>
          </>
        )}
      </div>

      {settingsQ.data !== undefined && <SettingsPanel brand={brand} settings={settingsQ.data} canManage={canManage} />}
      {error && <div role="alert" style={{ ...sans, fontSize: 14, color: c.rose, marginBottom: 12 }}>{error}</div>}
      {birthdaysQ.isLoading && <div style={{ ...sans, fontSize: 14.5, color: c.mist }}>A carregar…</div>}
      {birthdaysQ.isError && <div style={{ ...sans, fontSize: 14, color: c.rose }}>Não foi possível carregar os aniversários.</div>}

      {birthdaysQ.data && people.length === 0 && (
        <div style={{ ...sans, fontSize: 14.5, color: c.mist, background: c.folha, border: `1px dashed ${c.lineStrong}`, borderRadius: 8, padding: 20, display: "flex", gap: 12, alignItems: "flex-start" }}>
          <Cake size={22} color={c.bossText} />
          <div>Ainda não há aniversários.{canManage ? " Carrega em «Importar folha» para trazer a lista do Drive (com n.º de sócio, perfil e observações) ou adiciona um a um." : ""}</div>
        </div>
      )}

      {people.length > 0 && (
        <>
          <section style={{ marginBottom: 26 }}>
            <h2 style={h2}>Hoje</h2>
            {todayItems.length === 0 && <div style={{ ...sans, fontSize: 14.5, color: c.mist }}>Hoje ninguém faz anos.</div>}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{todayItems.map((u) => card(u, true))}</div>
          </section>

          {buckets.late.length > 0 && (
            <section style={{ marginBottom: 26 }}>
              <h2 style={h2}>Dos últimos 7 dias</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{buckets.late.map((u) => card(u))}</div>
            </section>
          )}

          <section style={{ marginBottom: 30 }}>
            <h2 style={h2}>Próximos 14 dias</h2>
            {nextItems.length === 0 && <div style={{ ...sans, fontSize: 14.5, color: c.mist }}>Nada nos próximos 14 dias.</div>}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{nextItems.map((u) => card(u))}</div>
          </section>

          <section>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
              <h2 style={{ ...h2, margin: 0, flex: 1 }}>Todos ({people.length})</h2>
              <div style={{ position: "relative", minWidth: 220 }}>
                <Search size={14} color={c.mist} style={{ position: "absolute", left: 10, top: 13 }} />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Procurar nome ou n.º de sócio" aria-label="Procurar" style={{ ...inputStyle, paddingLeft: 30 }} />
              </div>
            </div>
            {byMonth.length === 0 && <div style={{ ...sans, fontSize: 14.5, color: c.mist }}>Nenhum resultado.</div>}
            {byMonth.map(([month, list]) => (
              <div key={month} style={{ marginBottom: 18 }}>
                <div style={{ ...sans, fontSize: 13, fontWeight: 700, color: c.mist, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{MONTHS[month - 1]}</div>
                <div style={{ border: `1px solid ${c.line}`, borderRadius: 8, overflow: "hidden", background: c.folha }}>
                  {list.map((p, i) => {
                    const link = profileLink(p.profile);
                    return (
                      <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderTop: i ? `1px solid ${c.line}` : "none", flexWrap: "wrap" }}>
                        <span style={{ ...sans, fontWeight: 700, color: c.ink, minWidth: 48 }}>{dmLabel(p.birth_day, p.birth_month)}</span>
                        <span style={{ ...sans, color: c.ink, flex: 1, minWidth: 160 }}>{p.name}{p.birth_year ? <span style={{ color: c.mist }}> ({p.birth_year})</span> : null}</span>
                        {p.member_number && <span style={{ ...sans, fontSize: 12.5, color: c.mist }}>n.º {p.member_number}</span>}
                        {link.href && <a href={link.href} target="_blank" rel="noopener noreferrer" aria-label={`Abrir perfil de ${p.name}`} style={{ color: c.bossText }}><ExternalLink size={14} /></a>}
                        {canManage && (
                          <>
                            <button type="button" onClick={() => setEditing(p)} aria-label={`Editar ${p.name}`} style={{ background: "none", border: "none", color: c.mist, cursor: "pointer", padding: 4 }}><Pencil size={14} /></button>
                            <button type="button" onClick={() => setDeleting(p)} aria-label={`Apagar ${p.name}`} style={{ background: "none", border: "none", color: c.mist, cursor: "pointer", padding: 4 }}><Trash2 size={14} /></button>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </section>
        </>
      )}

      {editing && <PersonModal brand={brand} userId={session.id} person={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); }} />}
      {importing && <ImportModal brand={brand} userId={session.id} existing={people} hasSettings={!!settingsQ.data} onClose={() => setImporting(false)} onDone={() => { setImporting(false); refresh(); qc.invalidateQueries({ queryKey: ["birthday_settings", brand.id] }); }} />}
      {deleting && (
        <Modal title="Apagar aniversário" onClose={() => setDeleting(null)} width={400}>
          <div style={{ ...sans, fontSize: 14.5, color: c.ink, lineHeight: 1.6, marginBottom: 16 }}>Apagar <b>{deleting.name}</b> da lista? Esta ação não pode ser desfeita.</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={remove} style={{ ...btnPrimary, background: c.roseSolid }}>Apagar</button>
            <button type="button" onClick={() => setDeleting(null)} style={btnGhost}>Cancelar</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
