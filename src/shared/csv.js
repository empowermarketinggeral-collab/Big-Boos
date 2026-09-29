/* ---------------------------------------------------------
   CSV partilhado (CRM e Agendamento).
   O Excel em português exporta com ";" em vez de "," — o separador é
   detetado pela primeira linha.
--------------------------------------------------------- */

function detectDelimiter(text) {
  const firstLine = text.split(/\r?\n/, 1)[0] || "";
  const count = (ch) => firstLine.split(ch).length - 1;
  const candidates = [",", ";", "\t"].map((d) => [d, count(d)]).sort((a, b) => b[1] - a[1]);
  return candidates[0][1] > 0 ? candidates[0][0] : ",";
}

export function parseCsv(input) {
  const text = input.replace(/^﻿/, "");
  const delimiter = detectDelimiter(text);
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field); field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// Cabeçalho normalizado: minúsculas, sem acentos nem espaços a mais.
export const normalizeHeader = (h) =>
  String(h || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");

// Índice da primeira coluna cujo cabeçalho está na lista de sinónimos.
export function findColumn(header, synonyms) {
  const wanted = synonyms.map(normalizeHeader);
  return header.findIndex((h) => wanted.includes(normalizeHeader(h)));
}

// Telefone em E.164 (+351…), igual ao lead-intake e à booking-create.
export function normalizePhone(raw, countryCode = "351") {
  let p = String(raw || "").trim().replace(/[^\d+]/g, "");
  if (!p) return "";
  if (p.startsWith("00")) p = "+" + p.slice(2);
  if (!p.startsWith("+")) {
    if (p.length === 9) p = `+${countryCode}${p}`;
    else if (p.length >= 10) p = `+${p}`;
    else return "";
  }
  const digits = p.slice(1);
  if (!/^\d{8,15}$/.test(digits)) return "";
  return "+" + digits;
}
