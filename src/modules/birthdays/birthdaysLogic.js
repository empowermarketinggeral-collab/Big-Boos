import { normalizeHeader, parseCsv } from "../../shared/csv.js";

/* ---------------------------------------------------------
   Lógica pura dos Aniversários (sem React): ler datas em vários
   formatos, perceber as colunas de uma folha exportada do Drive,
   e calcular as próximas datas. Testável em Node.
--------------------------------------------------------- */

export const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

const MONTH_WORDS = {
  janeiro: 1, jan: 1, january: 1, fevereiro: 2, fev: 2, feb: 2, february: 2, marco: 3, mar: 3, march: 3,
  abril: 4, abr: 4, apr: 4, april: 4, maio: 5, mai: 5, may: 5, junho: 6, jun: 6, june: 6,
  julho: 7, jul: 7, july: 7, agosto: 8, ago: 8, aug: 8, august: 8, setembro: 9, set: 9, sep: 9, sept: 9, september: 9,
  outubro: 10, out: 10, oct: 10, october: 10, novembro: 11, nov: 11, november: 11, dezembro: 12, dez: 12, dec: 12, december: 12,
};

export const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
export const daysInMonth = (month, year = 2000) => [31, isLeap(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];

const validDM = (day, month) => Number.isInteger(day) && Number.isInteger(month) && month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(month, 2000);

const fullYear = (yy, nowYear) => {
  if (yy >= 100) return yy;
  return yy <= nowYear % 100 ? 2000 + yy : 1900 + yy;
};

const plainWord = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Devolve { day, month, year|null } ou null se não perceber.
export function parseBirthday(raw, nowYear = new Date().getFullYear()) {
  let s = String(raw ?? "").trim();
  if (!s) return null;

  // Número de série do Excel/Sheets (ex: 22000 = 1960)
  if (/^\d{5}$/.test(s) && Number(s) >= 1 && Number(s) < 80000) {
    const d = new Date(Date.UTC(1899, 11, 30) + Number(s) * 86400000);
    return { day: d.getUTCDate(), month: d.getUTCMonth() + 1, year: d.getUTCFullYear() };
  }

  s = s.replace(/[T ]\d{1,2}:\d{2}(:\d{2})?(\.\d+)?Z?$/, "").trim(); // tira a hora

  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/); // 1960-03-15
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return validDM(d, mo) ? { day: d, month: mo, year: y } : null;
  }

  m = s.match(/^(\d{1,2})[-/.](\d{1,2})(?:[-/.](\d{2}|\d{4}))?$/); // 15/03/1960, 15-3, 15.03.60
  if (m) {
    let d = Number(m[1]), mo = Number(m[2]);
    if (!validDM(d, mo) && validDM(mo, d)) [d, mo] = [mo, d]; // 03/15/1960 (só quando não há dúvida)
    if (!validDM(d, mo)) return null;
    return { day: d, month: mo, year: m[3] ? fullYear(Number(m[3]), nowYear) : null };
  }

  // 15 de março (de 1960), 15 mar 1960, 15-mar-60, março 15
  const t = plainWord(s).replace(/\bde\b/g, " ").replace(/[,.\-/]/g, " ").replace(/\s+/g, " ").trim();
  m = t.match(/^(\d{1,2}) ([a-z]+)(?: (\d{2}|\d{4}))?$/);
  if (m && MONTH_WORDS[m[2]]) {
    const d = Number(m[1]), mo = MONTH_WORDS[m[2]];
    return validDM(d, mo) ? { day: d, month: mo, year: m[3] ? fullYear(Number(m[3]), nowYear) : null } : null;
  }
  m = t.match(/^([a-z]+) (\d{1,2})(?: (\d{4}))?$/);
  if (m && MONTH_WORDS[m[1]]) {
    const d = Number(m[2]), mo = MONTH_WORDS[m[1]];
    return validDM(d, mo) ? { day: d, month: mo, year: m[3] ? Number(m[3]) : null } : null;
  }
  return null;
}

/* ---------- Colunas ---------- */

const norm = (h) => normalizeHeader(h).replace(/[ºª°.]/g, "").replace(/\s+/g, " ").trim();

// O que cada coluna parece ser, pelo cabeçalho. Quem importa pode corrigir.
export function detectColumns(header) {
  const h = header.map(norm);
  const find = (...tests) => h.findIndex((x) => tests.some((t) => (t instanceof RegExp ? t.test(x) : x === t)));
  const idx = {};
  idx.name = find(/^nome( completo)?$/, "name", /^nome d[oa]s? (socio|associado)/, "associado", "socio nome");
  if (idx.name < 0) idx.name = find(/^nome/);
  idx.date = find(/data( de)? (nascimento|aniversario)/, /^nascimento$/, /^aniversario$/, /^data$/, /^dn$/, "birthday", "birth date", "birth_date", "dia de anos");
  idx.day = find("dia", "dia nascimento", "dia de nascimento");
  idx.month = find("mes", "mes nascimento", "mes de nascimento");
  idx.year = find("ano", "ano nascimento", "ano de nascimento");
  idx.member = find(/^n (de )?(socio|associado)$/, /^(numero|num) (de )?(socio|associado)$/, /^(socio|associado)( n)?$/, /^n socio$/, /^no socio$/, /^numero$/, /^n$/);
  if (idx.member < 0) idx.member = h.findIndex((x, i) => i !== idx.name && /(socio|associado)/.test(x));
  idx.profile = find(/facebook/, /instagram/, /perfil/, /rede/, /^link/, /^url/, /social/);
  idx.notes = find(/^obs/, /^nota/, /coment/, /^info/);
  return idx;
}

export const FIELD_LABELS = {
  name: "Nome", date: "Data de aniversário", day: "Dia", month: "Mês", year: "Ano de nascimento",
  member: "N.º de sócio", profile: "Perfil (Facebook/Instagram)", notes: "Observações",
};

/* ---------- Folha → linhas ---------- */

// mapping: { name, date, day, month, year, member, profile, notes } → índice da coluna (-1 = ignorar)
export function rowsFromTable(table, mapping, nowYear = new Date().getFullYear()) {
  const cell = (r, i) => (i >= 0 && i < r.length ? String(r[i] ?? "").trim() : "");
  const out = [];
  for (let n = 1; n < table.length; n++) {
    const r = table[n];
    if (!r || r.every((v) => !String(v ?? "").trim())) continue;
    const name = cell(r, mapping.name).replace(/\s+/g, " ");
    let bd = null;
    let problem = "";
    if (mapping.date >= 0 && cell(r, mapping.date)) {
      bd = parseBirthday(cell(r, mapping.date), nowYear);
      if (!bd) problem = `data não reconhecida: «${cell(r, mapping.date)}»`;
    } else if (mapping.day >= 0 && mapping.month >= 0) {
      const day = Number(cell(r, mapping.day));
      const monthRaw = cell(r, mapping.month);
      const month = /^\d+$/.test(monthRaw) ? Number(monthRaw) : MONTH_WORDS[plainWord(monthRaw)];
      const yearRaw = mapping.year >= 0 ? cell(r, mapping.year) : "";
      if (validDM(day, month)) bd = { day, month, year: /^\d{4}$/.test(yearRaw) ? Number(yearRaw) : null };
      else problem = "dia ou mês inválido";
    } else {
      problem = "sem data";
    }
    if (!name) problem = problem || "sem nome";
    else if (!bd && !problem) problem = "sem data";
    out.push({
      line: n + 1,
      name,
      day: bd?.day ?? null,
      month: bd?.month ?? null,
      year: bd?.year ?? null,
      member: cell(r, mapping.member),
      profile: cell(r, mapping.profile),
      notes: cell(r, mapping.notes),
      problem: name ? problem : problem || "sem nome",
    });
  }
  return out;
}

export function tableFromText(text) {
  const rows = parseCsv(String(text || ""));
  return rows.filter((r) => r.some((v) => String(v ?? "").trim()));
}

// Une linhas repetidas do mesmo ficheiro (mesmo n.º de sócio, ou mesmo nome+dia+mês): a última ganha.
const keyOf = (r) => (r.member ? `m:${r.member.toLowerCase()}` : `n:${r.name.toLowerCase()}|${r.day}|${r.month}`);

// existing: linhas já guardadas { id, name, birth_day, birth_month, member_number }
export function planImport(rows, existing) {
  const byMember = new Map(existing.filter((e) => e.member_number).map((e) => [String(e.member_number).toLowerCase(), e]));
  const byName = new Map(existing.map((e) => [`${e.name.toLowerCase()}|${e.birth_day}|${e.birth_month}`, e]));
  const good = new Map();
  const problems = [];
  for (const r of rows) {
    if (r.problem) { problems.push(r); continue; }
    good.set(keyOf(r), r);
  }
  const creates = [];
  const updates = [];
  for (const r of good.values()) {
    const match = (r.member && byMember.get(r.member.toLowerCase())) || byName.get(`${r.name.toLowerCase()}|${r.day}|${r.month}`);
    if (match) updates.push({ id: match.id, row: r });
    else creates.push(r);
  }
  return { creates, updates, problems, duplicatesInFile: rows.filter((r) => !r.problem).length - good.size };
}

/* ---------- Datas ---------- */

export const todayLocal = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
};

// Dia em que se festeja num ano (29/02 festeja-se a 28/02 nos anos não bissextos).
export function occurrenceIn(year, month, day) {
  const d = month === 2 && day === 29 && !isLeap(year) ? 28 : day;
  return new Date(year, month - 1, d);
}

export function nextOccurrence(month, day, from = todayLocal()) {
  let d = occurrenceIn(from.getFullYear(), month, day);
  if (d < from) d = occurrenceIn(from.getFullYear() + 1, month, day);
  return d;
}

export const daysBetween = (a, b) => Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 86400000);

export const ageOn = (birthYear, date) => (birthYear ? date.getFullYear() - birthYear : null);

export function whenLabel(days) {
  if (days === 0) return "Hoje";
  if (days === 1) return "Amanhã";
  if (days === -1) return "Ontem";
  if (days < 0) return `Há ${-days} dias`;
  return `Em ${days} dias`;
}

export const pad2 = (n) => String(n).padStart(2, "0");
export const dmLabel = (day, month) => `${pad2(day)}/${pad2(month)}`;

// "facebook.com/maria" → https://facebook.com/maria ; um nome simples (sem link) fica como texto.
export function profileLink(value) {
  const s = String(value || "").trim();
  if (!s) return { href: null, text: "" };
  if (/^https?:\/\//i.test(s)) {
    try { const u = new URL(s); return { href: u.protocol === "http:" || u.protocol === "https:" ? u.href : null, text: s.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "") }; } catch { return { href: null, text: s }; }
  }
  if (/^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(s) && !/\s/.test(s)) return { href: `https://${s}`, text: s.replace(/^www\./i, "") };
  return { href: null, text: s };
}
