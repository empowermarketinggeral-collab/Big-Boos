// EMPOWER OS — importa marcações do GoHighLevel (LeadConnector API v2)
// para o Agendamento de uma marca: passadas e futuras, sem duplicar.
//
// Chamado pelo painel da equipa (Agendamento → Lista e importação →
// "GoHighLevel"). Ações:
//   connect    { brandId, locationId, token }  guarda o Private Integration
//              token no Vault (nunca em claro) e testa-o.
//   calendars  { brandId }                     lista os calendários da conta.
//   import     { brandId, calendarId, from, to }  importa as marcações desse
//              calendário entre from e to (ISO). O browser chama por blocos
//              de ~1 mês para cada chamada caber no tempo da função.
//   disconnect { brandId }
//
// Mapeamento:
//   - Contacto: pelo telemóvel (E.164, +351 por omissão), depois email;
//     sem ficha, cria uma (origem "importacao"). ghl_contact_map guarda a
//     ligação para não voltar a pedir o mesmo contacto à API.
//   - Serviço: título da marcação (ou o nome do calendário) com o nome de
//     um serviço ativo; sem igual, cria um serviço arquivado com o nome do
//     calendário (como a importação por CSV).
//   - Profissional: nome do utilizador do GoHighLevel igual (ou o primeiro
//     nome igual) ao de uma profissional; sem igual, fica sem profissional.
//   - Estado: cancelled → cancelada, noshow → faltou, showed → concluída;
//     o resto → concluída se já passou, confirmada se é futura.
//   - Passadas entram com os lembretes já dados (não recebem mensagens).
//     Futuras recebem os lembretes 24h/1h do Big Boss: desliga os do
//     GoHighLevel para não irem em duplicado.
//   - Já importada (external_id) = atualiza estado, hora e profissional; se
//     ainda não tinha ficha de cliente (ex: o token não tinha acesso aos
//     contactos) ou tinha o serviço arquivado genérico, completa-os agora.
//
// "Verify JWT" LIGADO. Só quem gere a marca (can_manage_brand).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const GHL = "https://services.leadconnectorhq.com";
const TZ = "Europe/Lisbon";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ghl(token, path, params = {}) {
  const url = new URL(GHL + path);
  for (const [k, v] of Object.entries(params)) if (v != null && v !== "") url.searchParams.set(k, String(v));
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Version: "2021-04-15", Accept: "application/json" } });
    if (res.status === 429) { await sleep(1500 * (attempt + 1)); continue; }
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    if (!res.ok) {
      const msg = data?.message || data?.error || text || `HTTP ${res.status}`;
      const err = new Error(Array.isArray(msg) ? msg.join(", ") : String(msg));
      err.status = res.status;
      throw err;
    }
    return data;
  }
  throw new Error("O GoHighLevel está a limitar pedidos. Tenta outra vez daqui a um minuto.");
}

const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

function normalizePhone(raw, countryCode = "351") {
  let p = String(raw || "").trim().replace(/[^\d+]/g, "");
  if (!p) return "";
  if (p.startsWith("00")) p = "+" + p.slice(2);
  if (!p.startsWith("+")) {
    if (p.length === 9) p = `+${countryCode}${p}`;
    else if (p.length >= 10) p = `+${p}`;
    else return "";
  }
  return /^\+\d{8,15}$/.test(p) ? p : "";
}

// Diferença (ms) entre a hora de Lisboa e UTC nesse instante.
function tzOffsetMs(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(date);
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")) - date.getTime();
}

// "2025-03-10T15:00:00+00:00" → instante; "2025-03-10 15:00:00" (sem fuso) = hora de Lisboa.
function parseGhlTime(v) {
  if (v == null) return null;
  if (typeof v === "number") return new Date(v);
  const s = String(v).trim();
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(s)) return new Date(s);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) { const d = new Date(s); return Number.isNaN(d.getTime()) ? null : d; }
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
  return new Date(guess - tzOffsetMs(new Date(guess)));
}

function mapStatus(raw, isPast) {
  const s = norm(raw);
  if (s.includes("cancel")) return "cancelled";
  if (s.includes("noshow") || s.includes("no show")) return "no_show";
  if (s.includes("showed")) return "completed";
  if (s.includes("invalid")) return null;
  return isPast ? "completed" : "confirmed";
}

// Corre fn sobre os itens com no máximo `limit` pedidos em simultâneo.
async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]); }
  });
  await Promise.all(workers);
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization") || "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

  let body;
  try { body = await req.json(); } catch { return json({ error: "Corpo do pedido inválido." }, 400); }
  const { action, brandId } = body;
  if (!action || !brandId) return json({ error: "Faltam campos obrigatórios." }, 400);

  // 1) Acesso, com a sessão de quem pede.
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: brand } = await userClient.from("brands").select("id").eq("id", brandId).maybeSingle();
  if (!brand) return json({ error: "Sem acesso a esta marca." }, 403);
  const { data: canManage } = await userClient.rpc("can_manage_brand", { target_brand: brandId });
  if (canManage !== true) return json({ error: "Só a equipa da marca pode importar marcações." }, 403);

  const admin = createClient(supabaseUrl, serviceRoleKey);

  if (action === "connect") {
    const locationId = String(body.locationId || "").trim();
    const token = String(body.token || "").trim();
    if (!locationId || !token) return json({ error: "Indica o ID da conta (location) e o token." }, 400);
    try {
      await ghl(token, "/calendars/", { locationId });
    } catch (err) {
      return json({ error: `O GoHighLevel recusou o token: ${err.message}. Confirma o token e as permissões (calendars, calendars/events, contacts, users) da Private Integration.` }, 400);
    }
    const { data: secretId, error: vaultError } = await admin.rpc("vault_upsert_secret", { p_name: `ghl_token_${brandId}`, p_secret: token });
    if (vaultError) return json({ error: `Não foi possível guardar o token: ${vaultError.message}` }, 500);
    const { error } = await admin.from("brand_ghl_accounts").upsert({ brand_id: brandId, location_id: locationId, token_ref: secretId, connected_at: new Date().toISOString() });
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  if (action === "disconnect") {
    await admin.from("brand_ghl_accounts").delete().eq("brand_id", brandId);
    return json({ ok: true });
  }

  const { data: account } = await admin.from("brand_ghl_accounts").select("location_id, token_ref").eq("brand_id", brandId).maybeSingle();
  if (!account?.token_ref) return json({ error: "Liga primeiro a conta do GoHighLevel." }, 400);
  const { data: token } = await admin.rpc("vault_read_secret", { p_id: account.token_ref });
  if (!token) return json({ error: "Não foi possível ler o token guardado. Liga a conta outra vez." }, 500);
  const locationId = account.location_id;

  if (action === "calendars") {
    try {
      const data = await ghl(token, "/calendars/", { locationId });
      const calendars = (data?.calendars || []).map((c) => ({ id: c.id, name: c.name || "Sem nome", active: c.isActive !== false }));
      return json({ calendars });
    } catch (err) {
      return json({ error: `GoHighLevel: ${err.message}` }, 502);
    }
  }

  if (action !== "import") return json({ error: "Ação desconhecida." }, 400);

  const { calendarId } = body;
  const from = new Date(body.from);
  const to = new Date(body.to);
  if (!calendarId || Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) return json({ error: "Intervalo inválido." }, 400);
  if (to.getTime() - from.getTime() > 62 * 86400000) return json({ error: "Importa no máximo 2 meses de cada vez." }, 400);

  let calendarName = "";
  let events = [];
  try {
    const cal = await ghl(token, `/calendars/${calendarId}`).catch(() => null);
    calendarName = cal?.calendar?.name || "";
    const data = await ghl(token, "/calendars/events", { locationId, calendarId, startTime: from.getTime(), endTime: to.getTime() });
    events = (data?.events || []).filter((e) => !e.deleted);
  } catch (err) {
    return json({ error: `GoHighLevel: ${err.message}` }, 502);
  }

  const report = { found: events.length, created: 0, updated: 0, skipped: 0, contactsCreated: 0, servicesCreated: [], errors: [] };
  if (!events.length) return json(report);

  // Serviços, profissionais e contactos já existentes nesta marca.
  const { data: services } = await admin.from("booking_services").select("id, name, duration_minutes, status").eq("brand_id", brandId);
  const serviceByName = new Map((services || []).map((s) => [norm(s.name), s]));
  const activeServices = [...serviceByName.entries()].filter(([, s]) => s.status === "active").sort((a, b) => b[0].length - a[0].length);
  const serviceStatus = new Map((services || []).map((s) => [s.id, s.status]));
  const { data: staff } = await admin.from("booking_staff").select("id, name").eq("brand_id", brandId);
  const staffList = (staff || []).map((s) => ({ id: s.id, full: norm(s.name), first: norm(s.name).split(" ")[0] }));

  // Utilizadores do GoHighLevel (para a profissional). Sem permissão, segue sem.
  const userName = new Map();
  try {
    const data = await ghl(token, "/users/", { locationId });
    for (const u of data?.users || []) userName.set(u.id, u.name || [u.firstName, u.lastName].filter(Boolean).join(" "));
  } catch { /* sem users.readonly */ }
  const staffFor = (userId) => {
    const n = norm(userName.get(userId));
    if (!n) return null;
    return (staffList.find((s) => s.full === n) || staffList.find((s) => s.first && s.first === n.split(" ")[0]))?.id || null;
  };

  // Serviço ativo reconhecido pelo título ou pelo nome do calendário (ou null).
  function matchService(ev) {
    const title = norm(ev.title);
    const byTitle = activeServices.find(([k]) => k && title.includes(k));
    if (byTitle) return byTitle[1].id;
    const cal = norm(calendarName);
    const byCal = activeServices.find(([k]) => k && (cal === k || cal.includes(k)));
    return byCal ? byCal[1].id : null;
  }

  // Serviço: reconhecido; senão um arquivado com o nome do calendário.
  async function serviceFor(ev, minutes) {
    const matched = matchService(ev);
    if (matched) return matched;
    const name = calendarName || String(ev.title || "Serviço importado").slice(0, 120);
    const existing = serviceByName.get(norm(name));
    if (existing) return existing.id;
    const { data: created, error } = await admin.from("booking_services")
      .insert({ brand_id: brandId, name, duration_minutes: minutes > 0 ? minutes : 60, status: "archived" })
      .select("id, name, duration_minutes").single();
    if (error) throw new Error(`Não foi possível criar o serviço ${name}.`);
    serviceByName.set(norm(name), created);
    report.servicesCreated.push(name);
    return created.id;
  }

  // Contactos: mapa guardado, depois API do GoHighLevel.
  const ghlIds = [...new Set(events.map((e) => e.contactId).filter(Boolean))];
  const contactMap = new Map();
  for (let i = 0; i < ghlIds.length; i += 200) {
    const { data } = await admin.from("ghl_contact_map").select("ghl_contact_id, contact_id").eq("brand_id", brandId).in("ghl_contact_id", ghlIds.slice(i, i + 200));
    for (const r of data || []) contactMap.set(r.ghl_contact_id, r.contact_id);
  }
  const contactInfo = new Map();
  let contactScopeMissing = false;
  const missing = ghlIds.filter((id) => !contactMap.has(id));
  await pool(missing, 4, async (id) => {
    try {
      const data = await ghl(token, `/contacts/${id}`);
      const c = data?.contact || {};
      const name = c.name || c.contactName || [c.firstName, c.lastName].filter(Boolean).join(" ") || "";
      contactInfo.set(id, { name: name.trim(), email: String(c.email || "").trim().toLowerCase(), phone: normalizePhone(c.phone) });
    } catch (err) {
      if (/scope/i.test(err.message)) contactScopeMissing = true;
      else report.errors.push(`Contacto ${id}: ${err.message}`);
    }
  });
  if (contactScopeMissing) {
    report.errors.unshift("O token não tem acesso aos contactos: na Private Integration do GoHighLevel acrescenta a permissão \"View Contacts\" (contacts.readonly) e importa outra vez. As marcações ficam sem ficha de cliente até lá.");
  }
  for (const id of missing) {
    const info = contactInfo.get(id);
    if (!info) continue;
    let contactId = null;
    if (info.phone) {
      const { data } = await admin.from("contacts").select("id").eq("brand_id", brandId).eq("phone", info.phone).limit(1).maybeSingle();
      contactId = data?.id || null;
    }
    if (!contactId && info.email) {
      const escaped = info.email.replace(/[\\%_]/g, (ch) => "\\" + ch);
      const { data } = await admin.from("contacts").select("id").eq("brand_id", brandId).ilike("email", escaped).limit(1).maybeSingle();
      contactId = data?.id || null;
    }
    if (!contactId) {
      const { data: created, error } = await admin.from("contacts")
        .insert({ brand_id: brandId, name: info.name || info.email || info.phone || "Sem nome", email: info.email || null, phone: info.phone || null, source: "importacao" })
        .select("id").single();
      if (error) { report.errors.push(`Não foi possível criar a ficha de ${info.name || id}.`); continue; }
      contactId = created.id;
      report.contactsCreated++;
    }
    contactMap.set(id, contactId);
    await admin.from("ghl_contact_map").upsert({ brand_id: brandId, ghl_contact_id: id, contact_id: contactId });
  }

  // Já importadas antes.
  const eventIds = events.map((e) => String(e.id));
  const existingByExt = new Map();
  for (let i = 0; i < eventIds.length; i += 200) {
    const { data } = await admin.from("booking_appointments").select("id, external_id, status, contact_id, service_id").eq("brand_id", brandId).eq("external_source", "ghl").in("external_id", eventIds.slice(i, i + 200));
    for (const r of data || []) existingByExt.set(r.external_id, r);
  }

  const contactById = new Map();
  const contactIds = [...new Set([...contactMap.values()])];
  for (let i = 0; i < contactIds.length; i += 200) {
    const { data } = await admin.from("contacts").select("id, name, email, phone").in("id", contactIds.slice(i, i + 200));
    for (const c of data || []) contactById.set(c.id, c);
  }

  const now = Date.now();
  const inserts = [];
  for (const ev of events) {
    try {
      const start = parseGhlTime(ev.startTime);
      const end = parseGhlTime(ev.endTime) || (start ? new Date(start.getTime() + 60 * 60000) : null);
      if (!start || Number.isNaN(start.getTime())) { report.skipped++; continue; }
      const isPast = end.getTime() < now;
      const status = mapStatus(ev.appointmentStatus || ev.status, isPast);
      if (!status) { report.skipped++; continue; }
      const staffId = staffFor(ev.assignedUserId);
      const prev = existingByExt.get(String(ev.id));
      if (prev) {
        const patch = { starts_at: start.toISOString(), ends_at: end.toISOString(), status };
        if (staffId) patch.staff_id = staffId;
        const prevContact = ev.contactId ? contactMap.get(ev.contactId) : null;
        if (!prev.contact_id && prevContact) {
          const c = contactById.get(prevContact);
          Object.assign(patch, { contact_id: prevContact, customer_name: c?.name || undefined, customer_phone: c?.phone || null, customer_email: c?.email || null });
          if (!c?.name) delete patch.customer_name;
        }
        if (serviceStatus.get(prev.service_id) !== "active") {
          const matched = matchService(ev);
          if (matched) patch.service_id = matched;
        }
        await admin.from("booking_appointments").update(patch).eq("id", prev.id);
        report.updated++;
        continue;
      }
      const contactId = ev.contactId ? contactMap.get(ev.contactId) || null : null;
      const contact = contactId ? contactById.get(contactId) : null;
      const minutes = Math.round((end.getTime() - start.getTime()) / 60000);
      const serviceId = await serviceFor(ev, minutes);
      inserts.push({
        brand_id: brandId, service_id: serviceId, staff_id: staffId, contact_id: contactId,
        customer_name: contact?.name || String(ev.title || "Sem nome").slice(0, 120),
        customer_phone: contact?.phone || null, customer_email: contact?.email || null,
        starts_at: start.toISOString(), ends_at: end.toISOString(), status,
        deposit_status: "not_required", source: "import",
        external_source: "ghl", external_id: String(ev.id),
        reminder_24h_sent: isPast, reminder_1h_sent: isPast, post_visit_sent: isPast,
      });
    } catch (err) {
      report.errors.push(String(err?.message || err));
    }
  }
  for (let i = 0; i < inserts.length; i += 200) {
    const batch = inserts.slice(i, i + 200);
    const { error } = await admin.from("booking_appointments").insert(batch);
    if (error) report.errors.push(`Falha a gravar ${batch.length} marcações: ${error.message}`);
    else report.created += batch.length;
  }

  await admin.from("brand_ghl_accounts").update({ last_import_at: new Date().toISOString() }).eq("brand_id", brandId);
  return json(report);
});
