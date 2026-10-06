// EMPOWER OS — sincroniza o Google Agenda de cada profissional ligada.
// Chamada de 5 em 5 minutos pelo pg_cron (supabase/84_google_calendar.sql)
// e uma vez logo a seguir a alguém ligar a conta ({ staffId }).
//
// Para cada profissional com o Google Agenda ligado:
//   1. Big Boss -> Google (se "escrever marcações" estiver ligado): cria no
//      Google Agenda um evento por cada marcação confirmada, move-o se a
//      hora mudar e apaga-o se a marcação for cancelada/faltou/apagada. O id
//      do evento é derivado do id da marcação, por isso repetir não duplica.
//   2. Google -> Big Boss: lê os períodos OCUPADOS (freebusy — só ocupado/
//      livre, nunca o conteúdo dos eventos) dos próximos 60 dias e guarda-os
//      em booking_external_busy; a disponibilidade exclui esses horários.
//
// Se a Google recusar o acesso (a profissional revogou, ou a app ficou em
// modo de teste >7 dias), marca a ligação como "precisa de voltar a ligar" e
// cria UMA notificação interna.
//
// Só aceita pedidos com a chave service role (o cron envia-a). "Verify JWT"
// DESLIGADO. Segredos: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TZ = "Europe/Lisbon";
const GOOGLE_API = "https://www.googleapis.com/calendar/v3";
const PULL_DAYS = 60;            // quantos dias à frente lê do Google Agenda
const PUSH_PAST_DAYS = 1;        // marcações de ontem em diante
const PUSH_FUTURE_DAYS = 120;
const MAX_WRITES_PER_STAFF = 40; // escritas por profissional e ciclo (o resto fica para o seguinte)
const CONCURRENCY = 3;
const TIME_BUDGET_MS = 100_000;
const DAY_MS = 86400000;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Chamada à API do Google Agenda com tempo-limite; nunca lança.
async function gfetch(accessToken, url, init = {}) {
  try {
    const res = await fetch(url, {
      ...init,
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", ...(init.headers || {}) },
      signal: AbortSignal.timeout(10000),
    });
    let data = null;
    if (res.status !== 204) data = await res.json().catch(() => null);
    return { status: res.status, ok: res.ok, data };
  } catch (err) {
    return { status: 0, ok: false, data: { error: { message: String(err?.message || err) } } };
  }
}

const gerror = (r) => r.data?.error?.message || r.data?.error || `HTTP ${r.status}`;

// Troca o refresh token por um access token. "invalid_grant" = a Google já não aceita esta ligação.
async function refreshAccessToken(refreshToken) {
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: Deno.env.get("GOOGLE_CLIENT_ID") || "",
        client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET") || "",
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.access_token) return { ok: true, accessToken: data.access_token };
    return { ok: false, revoked: data.error === "invalid_grant", detail: data.error_description || data.error || `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, revoked: false, detail: String(err?.message || err) };
  }
}

// O id do evento sai do id da marcação (32 caracteres hexadecimais, válidos para a Google).
const eventIdFor = (appointmentId) => String(appointmentId).replace(/-/g, "");

function eventBody(appt) {
  const lines = [];
  if (appt.customer_phone) lines.push(`Telemóvel: ${appt.customer_phone}`);
  if (appt.customer_email) lines.push(`Email: ${appt.customer_email}`);
  lines.push("", "Marcação feita na Big Boss. Para alterar ou cancelar, usa a Big Boss: mudanças feitas aqui não alteram a marcação.");
  return {
    id: eventIdFor(appt.id),
    summary: `${appt.booking_services?.name || "Marcação"}, ${appt.customer_name || "cliente"}`,
    description: lines.join("\n"),
    start: { dateTime: new Date(appt.starts_at).toISOString(), timeZone: TZ },
    end: { dateTime: new Date(appt.ends_at).toISOString(), timeZone: TZ },
    transparency: "opaque",
    status: "confirmed",
    extendedProperties: { private: { bigbossAppointmentId: appt.id } },
  };
}

// Cria o evento; se já existir (409: repetição, ou evento apagado com o mesmo id), atualiza-o.
async function writeEvent(accessToken, calendarId, body) {
  const base = `${GOOGLE_API}/calendars/${encodeURIComponent(calendarId)}/events`;
  let r = await gfetch(accessToken, `${base}?sendUpdates=none`, { method: "POST", body: JSON.stringify(body) });
  if (r.status === 409) {
    const { id, ...rest } = body;
    r = await gfetch(accessToken, `${base}/${encodeURIComponent(id)}?sendUpdates=none`, { method: "PATCH", body: JSON.stringify({ ...rest, status: "confirmed" }) });
  }
  return r;
}

async function deleteEvent(accessToken, calendarId, eventId) {
  const r = await gfetch(accessToken, `${GOOGLE_API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=none`, { method: "DELETE" });
  return r.ok || r.status === 404 || r.status === 410; // já não existe = o objetivo está cumprido
}

// Erros que não valem a pena repetir neste ciclo (acesso, limite de pedidos, Google em baixo).
const isHardStop = (status) => status === 0 || status === 401 || status === 403 || status === 429 || status >= 500;

async function pushStaff(admin, accessToken, connection, errors) {
  const staffId = connection.staff_id;
  const calendarId = connection.calendar_id || "primary";
  const now = Date.now();

  const { data: mapped } = await admin.from("booking_google_events").select("*").eq("staff_id", staffId);
  const mappedList = mapped || [];

  // Modo "não escrever no Google": limpa o que a app lá tinha criado.
  if (!connection.push_enabled) {
    let removed = 0;
    for (const m of mappedList) {
      if (removed >= MAX_WRITES_PER_STAFF) break;
      if (await deleteEvent(accessToken, m.calendar_id || calendarId, m.google_event_id)) {
        await admin.from("booking_google_events").delete().eq("appointment_id", m.appointment_id);
        removed++;
      } else {
        errors.push("não foi possível apagar eventos do Google Agenda");
        break;
      }
    }
    return;
  }

  const from = new Date(now - PUSH_PAST_DAYS * DAY_MS).toISOString();
  const to = new Date(now + PUSH_FUTURE_DAYS * DAY_MS).toISOString();
  const { data: appts } = await admin
    .from("booking_appointments")
    .select("id, starts_at, ends_at, customer_name, customer_phone, customer_email, status, booking_services(name)")
    .eq("staff_id", staffId).eq("status", "confirmed")
    .gte("ends_at", from).lte("starts_at", to)
    .order("starts_at", { ascending: true }).limit(500);

  const mappedById = new Map(mappedList.map((m) => [m.appointment_id, m]));
  let writes = 0;

  // Criar / mover
  for (const appt of appts || []) {
    const m = mappedById.get(appt.id);
    const unchanged = m
      && new Date(m.synced_starts_at).getTime() === new Date(appt.starts_at).getTime()
      && new Date(m.synced_ends_at).getTime() === new Date(appt.ends_at).getTime();
    if (unchanged) continue;
    if (writes >= MAX_WRITES_PER_STAFF) break;
    writes++;
    const body = eventBody(appt);
    const r = await writeEvent(accessToken, calendarId, body);
    if (!r.ok) {
      errors.push(`evento não escrito (${gerror(r)})`);
      if (isHardStop(r.status)) return;
      continue;
    }
    await admin.from("booking_google_events").upsert({
      appointment_id: appt.id, staff_id: staffId, google_event_id: body.id, calendar_id: calendarId,
      synced_starts_at: new Date(appt.starts_at).toISOString(), synced_ends_at: new Date(appt.ends_at).toISOString(),
      synced_at: new Date().toISOString(),
    }, { onConflict: "appointment_id" });
  }

  // Apagar: a marcação foi cancelada, faltou, voltou a pendente ou deixou de existir.
  // (Concluída/confirmada fica no Google como histórico, mesmo fora da janela acima.)
  const inWindow = new Set((appts || []).map((a) => a.id));
  const toCheck = mappedList.filter((m) => !inWindow.has(m.appointment_id)).map((m) => m.appointment_id);
  if (toCheck.length > 0) {
    const { data: rows } = await admin.from("booking_appointments").select("id, status").in("id", toCheck);
    const statusById = new Map((rows || []).map((r) => [r.id, r.status]));
    for (const m of mappedList) {
      if (!toCheck.includes(m.appointment_id)) continue;
      const status = statusById.get(m.appointment_id);
      const gone = status === undefined || status === "cancelled" || status === "no_show" || status === "pending_payment";
      if (!gone) continue;
      if (writes >= MAX_WRITES_PER_STAFF) break;
      writes++;
      if (await deleteEvent(accessToken, m.calendar_id || calendarId, m.google_event_id)) {
        await admin.from("booking_google_events").delete().eq("appointment_id", m.appointment_id);
      } else {
        errors.push("não foi possível apagar um evento do Google Agenda");
        return;
      }
    }
  }
}

// Lê os períodos ocupados e substitui os guardados (numa só transação, na base de dados).
async function pullBusy(admin, accessToken, connection, errors) {
  const calendarId = connection.calendar_id || "primary";
  const timeMin = new Date().toISOString();
  const timeMax = new Date(Date.now() + PULL_DAYS * DAY_MS).toISOString();
  const r = await gfetch(accessToken, `${GOOGLE_API}/freeBusy`, {
    method: "POST",
    body: JSON.stringify({ timeMin, timeMax, timeZone: TZ, items: [{ id: calendarId }] }),
  });
  if (!r.ok) {
    errors.push(`não foi possível ler o Google Agenda (${gerror(r)})`);
    return;
  }
  const entry = r.data?.calendars?.[calendarId] || Object.values(r.data?.calendars || {})[0];
  if (!entry || (entry.errors && entry.errors.length > 0)) {
    errors.push(`o Google Agenda não respondeu (${entry?.errors?.[0]?.reason || "sem dados"})`);
    return; // não apaga os períodos que já tínhamos
  }
  const blocks = (entry.busy || []).map((b) => ({ start: b.start, end: b.end }));
  const { error } = await admin.rpc("replace_external_busy", { p_staff: connection.staff_id, p_from: timeMin, p_to: timeMax, p_blocks: blocks });
  if (error) errors.push(`não foi possível guardar o ocupado (${error.message})`);
}

// A Google recusou o acesso: marca e avisa a equipa uma única vez.
async function markNeedsReauth(admin, connection, staffName, detail) {
  if (connection.status !== "needs_reauth") {
    const { data: agencyId } = await admin.rpc("brand_agency", { target_brand: connection.brand_id });
    if (agencyId) {
      await admin.from("notifications").insert({
        agency_id: agencyId,
        brand_id: connection.brand_id,
        area: "agendamento",
        message: `O Google Agenda de ${staffName || "uma profissional"} desligou-se (a Google deixou de aceitar o acesso). Em Agendamento → Equipa, gera um novo link para ela voltar a ligar. Até lá, o Google Agenda dela não bloqueia horários.`,
      });
    }
  }
  await admin.from("booking_staff_google").update({ status: "needs_reauth", last_error: String(detail).slice(0, 300) }).eq("staff_id", connection.staff_id);
}

async function processStaff(admin, connection, staffName) {
  const { data: refreshToken } = await admin.rpc("vault_read_secret", { p_id: connection.refresh_token_ref });
  if (!refreshToken) {
    await markNeedsReauth(admin, connection, staffName, "token em falta");
    return { staffId: connection.staff_id, ok: false };
  }
  const refreshed = await refreshAccessToken(refreshToken);
  if (!refreshed.ok) {
    if (refreshed.revoked) {
      await markNeedsReauth(admin, connection, staffName, refreshed.detail);
    } else {
      // Falha passageira (rede, Google em baixo): tenta outra vez no próximo ciclo.
      await admin.from("booking_staff_google").update({ last_error: String(refreshed.detail).slice(0, 300) }).eq("staff_id", connection.staff_id);
    }
    return { staffId: connection.staff_id, ok: false };
  }

  const errors = [];
  await pushStaff(admin, refreshed.accessToken, connection, errors);
  await pullBusy(admin, refreshed.accessToken, connection, errors);

  await admin.from("booking_staff_google").update({
    last_sync_at: new Date().toISOString(),
    last_error: errors.length ? errors.join("; ").slice(0, 300) : null,
  }).eq("staff_id", connection.staff_id);
  return { staffId: connection.staff_id, ok: errors.length === 0 };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!serviceRoleKey || !safeEqual(bearer, serviceRoleKey)) return json({ error: "Sem permissão." }, 401);
  if (!Deno.env.get("GOOGLE_CLIENT_ID") || !Deno.env.get("GOOGLE_CLIENT_SECRET")) return json({ error: "Faltam GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET." }, 500);

  const admin = createClient(Deno.env.get("SUPABASE_URL"), serviceRoleKey);
  let body = {};
  try {
    body = await req.json();
  } catch {
    // o cron envia {}
  }

  let query = admin.from("booking_staff_google").select("*, booking_staff(name, status)").eq("status", "connected");
  if (typeof body.staffId === "string") query = query.eq("staff_id", body.staffId);
  const { data: rows, error } = await query.order("last_sync_at", { ascending: true, nullsFirst: true });
  if (error) return json({ error: error.message }, 500);

  const queue = (rows || []).filter((r) => r.booking_staff?.status !== "archived");
  const startedAt = Date.now();
  const results = [];
  const worker = async () => {
    while (queue.length > 0 && Date.now() - startedAt < TIME_BUDGET_MS) {
      const row = queue.shift();
      try {
        results.push(await processStaff(admin, row, row.booking_staff?.name));
      } catch (err) {
        console.error("google-calendar-sync: falha numa profissional", row.staff_id, String(err?.message || err));
        results.push({ staffId: row.staff_id, ok: false });
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  // Limpeza: períodos ocupados antigos e ligações de eventos já passados há mais de 30 dias.
  await admin.from("booking_external_busy").delete().lt("ends_at", new Date(Date.now() - DAY_MS).toISOString());
  await admin.from("booking_google_events").delete().lt("synced_ends_at", new Date(Date.now() - 30 * DAY_MS).toISOString());

  return json({ processed: results.length, failed: results.filter((r) => !r.ok).length, pending: queue.length });
});
