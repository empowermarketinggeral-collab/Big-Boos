import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabaseClient.js";
import { c, sans, Modal, inputStyle, btnPrimary, btnGhost } from "../../shared/theme.jsx";
import { Upload } from "lucide-react";
import { parseCsv, findColumn, normalizePhone } from "../../shared/csv.js";

/* ---------------------------------------------------------
   IMPORTAR AGENDA (CSV) — marcações passadas e futuras do sistema
   antigo. Cada linha: cliente + serviço + dia/hora.
   - A cliente é reconhecida pelo telefone (+351…) e depois pelo email;
     se não existir, é criada no CRM (origem "importacao").
   - Serviços e profissionais são reconhecidos pelo nome. Um serviço
     que não exista é criado ARQUIVADO (não aparece para marcar, só no
     histórico); o profissional em falta usa o escolhido por omissão.
   - Passadas ficam "concluída" (ou "cancelada"/"faltou", se a coluna de
     estado o disser) e com os lembretes dados como enviados. Futuras
     ficam "confirmada" e recebem os lembretes normais de 24h/1h.
   - Marcação igual (mesma cliente, mesmo início) já existente é saltada,
     por isso importar o mesmo ficheiro duas vezes não duplica.
--------------------------------------------------------- */

const FIELDS = [
  { key: "name", label: "Nome da cliente", required: true, synonyms: ["nome", "cliente", "name", "nome do cliente", "nome da cliente", "customer", "client"] },
  { key: "phone", label: "Telemóvel", synonyms: ["telefone", "telemovel", "phone", "mobile", "contacto", "whatsapp"] },
  { key: "email", label: "Email", synonyms: ["email", "e-mail"] },
  { key: "date", label: "Dia (ou dia e hora)", required: true, synonyms: ["data", "dia", "date", "inicio", "start", "data de inicio", "data/hora", "starts_at"] },
  { key: "time", label: "Hora", synonyms: ["hora", "time", "hora de inicio", "start time"] },
  { key: "duration", label: "Duração (min)", synonyms: ["duracao", "duration", "minutos", "duracao (min)"] },
  { key: "service", label: "Serviço", required: true, synonyms: ["servico", "service", "tratamento", "procedimento", "servicos"] },
  { key: "staff", label: "Profissional", synonyms: ["profissional", "staff", "funcionario", "funcionaria", "colaborador", "colaboradora", "tecnica"] },
  { key: "status", label: "Estado", synonyms: ["estado", "status", "situacao"] },
  { key: "price", label: "Preço", synonyms: ["preco", "price", "valor", "total"] },
];

const norm = (v) => String(v || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// "03/10/2026", "2026-10-03", "03-10-2026 14:30", "3/10/26" + hora "14:30" / "14h30"
function parseStart(dateRaw, timeRaw) {
  const d = String(dateRaw || "").trim();
  let y, m, day, rest = "";
  let match = d.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[T\s]*(.*)$/);
  if (match) [, y, m, day, rest] = match;
  else if ((match = d.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\s*(.*)$/))) [, day, m, y, rest] = match;
  else return null;
  if (String(y).length === 2) y = `20${y}`;
  const t = String(timeRaw || rest || "").trim().match(/^(\d{1,2})[:hH](\d{2})?/);
  const hh = t ? Number(t[1]) : 0;
  const mm = t && t[2] ? Number(t[2]) : 0;
  const date = new Date(Number(y), Number(m) - 1, Number(day), hh, mm);
  if (Number.isNaN(date.getTime()) || date.getMonth() !== Number(m) - 1) return null;
  return { date, hasTime: !!t };
}

function mapStatus(raw, isPast) {
  const s = norm(raw);
  if (/cancel|anulad|desmarc/.test(s)) return "cancelled";
  if (/falt|no.?show|nao compareceu|ausente/.test(s)) return "no_show";
  return isPast ? "completed" : "confirmed";
}

async function fetchAll(query) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await query().range(from, from + 999);
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) return out;
  }
}

export default function ImportAgendaModal({ brand, staff, onClose }) {
  const qc = useQueryClient();
  const [rows, setRows] = useState(null);
  const [header, setHeader] = useState([]);
  const [mapping, setMapping] = useState({});
  const [defaultStaffId, setDefaultStaffId] = useState(staff[0]?.id || "");
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    try {
      const parsed = parseCsv(await file.text());
      if (parsed.length < 2) { setError("O ficheiro não tem linhas."); return; }
      const h = parsed[0].map((x) => String(x).trim());
      setHeader(h);
      setRows(parsed.slice(1).filter((r) => r.some((cell) => String(cell).trim())));
      const guess = {};
      for (const f of FIELDS) guess[f.key] = findColumn(h, f.synonyms);
      setMapping(guess);
    } catch (err) {
      setError(err.message || "Não foi possível ler o ficheiro.");
    }
  };

  const cell = (r, key) => (mapping[key] >= 0 ? String(r[mapping[key]] ?? "").trim() : "");

  const preview = (rows || []).slice(0, 5).map((r) => {
    const start = parseStart(cell(r, "date"), cell(r, "time"));
    return { name: cell(r, "name"), service: cell(r, "service"), when: start ? start.date.toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" }) : "data inválida", phone: normalizePhone(cell(r, "phone")) };
  });

  const missingRequired = FIELDS.filter((f) => f.required && !(mapping[f.key] >= 0));

  const runImport = async () => {
    setError("");
    if (!defaultStaffId) { setError("Cria primeiro um profissional."); return; }
    const report = { created: 0, duplicates: 0, contactsCreated: 0, servicesCreated: [], errors: [] };
    try {
      setProgress({ done: 0, total: rows.length, label: "A preparar…" });
      const contacts = await fetchAll(() => supabase.from("contacts").select("id, email, phone").eq("brand_id", brand.id).order("id"));
      const byPhone = new Map(contacts.filter((x) => x.phone).map((x) => [x.phone, x.id]));
      const byEmail = new Map(contacts.filter((x) => x.email).map((x) => [x.email.toLowerCase(), x.id]));
      const existing = await fetchAll(() => supabase.from("booking_appointments").select("contact_id, starts_at").eq("brand_id", brand.id).order("id"));
      const seen = new Set(existing.map((a) => `${a.contact_id}|${new Date(a.starts_at).getTime()}`));
      const { data: allServices } = await supabase.from("booking_services").select("id, name, duration_minutes").eq("brand_id", brand.id);
      const serviceByName = new Map((allServices || []).map((s) => [norm(s.name), s]));
      const staffByName = new Map(staff.map((s) => [norm(s.name), s.id]));

      const now = Date.now();
      let batch = [];
      const flush = async () => {
        if (!batch.length) return;
        const { error: err } = await supabase.from("booking_appointments").insert(batch);
        if (err) report.errors.push(`Lote de ${batch.length} marcações: ${err.message}`);
        else report.created += batch.length;
        batch = [];
      };

      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const line = i + 2;
        const name = cell(r, "name");
        const start = parseStart(cell(r, "date"), cell(r, "time"));
        const serviceName = cell(r, "service");
        if (!name || !start || !serviceName) { report.errors.push(`Linha ${line}: falta o nome, a data ou o serviço.`); continue; }

        // Cliente
        const phone = normalizePhone(cell(r, "phone"));
        const email = cell(r, "email").toLowerCase();
        let contactId = (phone && byPhone.get(phone)) || (email && byEmail.get(email)) || null;
        if (!contactId) {
          const { data: created, error: err } = await supabase
            .from("contacts")
            .insert({ brand_id: brand.id, name, phone: phone || null, email: email || null, source: "importacao" })
            .select("id").single();
          if (err) { report.errors.push(`Linha ${line}: não foi possível criar a cliente ${name} (${err.message}).`); continue; }
          contactId = created.id;
          report.contactsCreated++;
          if (phone) byPhone.set(phone, contactId);
          if (email) byEmail.set(email, contactId);
        }

        // Serviço
        const durationCell = parseInt(cell(r, "duration"), 10);
        let service = serviceByName.get(norm(serviceName));
        if (!service) {
          const { data: created, error: err } = await supabase
            .from("booking_services")
            .insert({ brand_id: brand.id, name: serviceName, duration_minutes: durationCell > 0 ? durationCell : 60, status: "archived" })
            .select("id, name, duration_minutes").single();
          if (err) { report.errors.push(`Linha ${line}: não foi possível criar o serviço ${serviceName}.`); continue; }
          service = created;
          serviceByName.set(norm(serviceName), service);
          report.servicesCreated.push(serviceName);
        }

        const startsAt = start.date;
        const key = `${contactId}|${startsAt.getTime()}`;
        if (seen.has(key)) { report.duplicates++; continue; }
        seen.add(key);

        const duration = durationCell > 0 ? durationCell : service.duration_minutes || 60;
        const isPast = startsAt.getTime() < now;
        const priceCell = parseFloat(cell(r, "price").replace(/[^\d,.-]/g, "").replace(",", "."));
        batch.push({
          brand_id: brand.id,
          service_id: service.id,
          staff_id: staffByName.get(norm(cell(r, "staff"))) || defaultStaffId,
          contact_id: contactId,
          customer_name: name,
          customer_phone: phone || null,
          customer_email: email || null,
          starts_at: startsAt.toISOString(),
          ends_at: new Date(startsAt.getTime() + duration * 60000).toISOString(),
          status: mapStatus(cell(r, "status"), isPast),
          total_price: Number.isFinite(priceCell) ? priceCell : null,
          deposit_status: "not_required",
          source: "import",
          reminder_24h_sent: isPast,
          reminder_1h_sent: isPast,
          post_visit_sent: isPast,
        });
        if (batch.length >= 200) await flush();
        if (i % 20 === 0) setProgress({ done: i, total: rows.length, label: "A importar…" });
      }
      await flush();
      setResult(report);
      qc.invalidateQueries({ queryKey: ["booking_appointments", brand.id] });
      qc.invalidateQueries({ queryKey: ["booking_services", brand.id] });
    } catch (err) {
      setError(err.message || "A importação parou a meio. Podes voltar a correr: o que já entrou não se duplica.");
    } finally {
      setProgress(null);
    }
  };

  const label = { ...sans, fontSize: 13, color: c.mist };

  if (result) {
    return (
      <Modal title="Agenda importada" onClose={onClose} width={460}>
        <div style={{ ...sans, fontSize: 14.5, color: c.ink, display: "flex", flexDirection: "column", gap: 6, lineHeight: 1.5 }}>
          <div>{result.created} marcações importadas</div>
          <div>{result.contactsCreated} clientes novas criadas no CRM</div>
          {result.duplicates > 0 && <div>{result.duplicates} já existiam (saltadas)</div>}
          {result.servicesCreated.length > 0 && (
            <div style={{ color: c.mist }}>Serviços criados arquivados (não aparecem para marcar): {result.servicesCreated.join(", ")}</div>
          )}
          {result.errors.length > 0 && (
            <div style={{ color: c.rose, maxHeight: 180, overflowY: "auto" }}>
              {result.errors.slice(0, 30).map((e) => <div key={e}>{e}</div>)}
              {result.errors.length > 30 && <div>… e mais {result.errors.length - 30}</div>}
            </div>
          )}
        </div>
        <button onClick={onClose} style={{ ...btnGhost, marginTop: 16 }}>Fechar</button>
      </Modal>
    );
  }

  return (
    <Modal title="Importar agenda" onClose={progress ? () => {} : onClose} width={560}>
      {!rows ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ ...sans, fontSize: 14, color: c.mist, lineHeight: 1.55 }}>
            Exporta a agenda do programa antigo em CSV (ou guarda o Excel como CSV). Precisa de ter, por linha, o nome da cliente, o serviço e o dia com a hora. Telemóvel e email ajudam a juntar à ficha certa do CRM.
          </div>
          <div style={{ ...sans, fontSize: 13.5, color: c.mist, lineHeight: 1.55 }}>
            Antes de importar: cria os serviços e os profissionais com os mesmos nomes do programa antigo, e pausa as automações de "novo contacto", para as clientes criadas agora não receberem mensagens de boas-vindas.
          </div>
          <label style={{ ...btnPrimary, width: "fit-content", cursor: "pointer" }}>
            <Upload size={14} /> Escolher ficheiro CSV
            <input type="file" accept=".csv,text/csv" onChange={onFile} style={{ display: "none" }} />
          </label>
          {error && <div style={{ ...sans, fontSize: 14, color: c.rose }}>{error}</div>}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ ...sans, fontSize: 14, color: c.ink }}>{rows.length} linhas. Confirma que coluna do ficheiro corresponde a cada campo:</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
            {FIELDS.map((f) => (
              <label key={f.key} style={label}>
                {f.label}{f.required ? " *" : ""}
                <select style={{ ...inputStyle, marginTop: 4 }} value={mapping[f.key] ?? -1} onChange={(e) => setMapping((m) => ({ ...m, [f.key]: Number(e.target.value) }))}>
                  <option value={-1}>(não tem)</option>
                  {header.map((h, i) => <option key={i} value={i}>{h || `Coluna ${i + 1}`}</option>)}
                </select>
              </label>
            ))}
            <label style={label}>
              Profissional por omissão
              <select style={{ ...inputStyle, marginTop: 4 }} value={defaultStaffId} onChange={(e) => setDefaultStaffId(e.target.value)}>
                {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
          </div>

          <div>
            <div style={{ ...label, marginBottom: 6 }}>Primeiras linhas, como vão entrar:</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {preview.map((p, i) => (
                <div key={i} style={{ ...sans, fontSize: 13.5, color: c.ink, background: c.paper, borderRadius: 6, padding: "7px 10px" }}>
                  {p.when}, {p.name || "(sem nome)"}, {p.service || "(sem serviço)"}{p.phone ? `, ${p.phone}` : ""}
                </div>
              ))}
            </div>
          </div>

          {missingRequired.length > 0 && <div style={{ ...sans, fontSize: 14, color: c.rose }}>Falta escolher: {missingRequired.map((f) => f.label).join(", ")}.</div>}
          {!staff.length && <div style={{ ...sans, fontSize: 14, color: c.rose }}>Cria primeiro pelo menos um profissional.</div>}
          {error && <div style={{ ...sans, fontSize: 14, color: c.rose }}>{error}</div>}
          {progress && <div style={{ ...sans, fontSize: 14, color: c.mist }}>{progress.label} {progress.done}/{progress.total}</div>}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={runImport} disabled={!!progress || missingRequired.length > 0 || !staff.length} style={btnPrimary}>
              {progress ? "A importar…" : `Importar ${rows.length} marcações`}
            </button>
            <button onClick={() => setRows(null)} disabled={!!progress} style={btnGhost}>Outro ficheiro</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
