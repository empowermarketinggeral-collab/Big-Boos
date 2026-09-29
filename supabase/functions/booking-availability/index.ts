// EMPOWER OS — calcula os horários livres de um serviço num dia.
// Chamado publicamente (sem login) pela página de marcação e pela app
// das clientes. Nunca devolve dados de outras marcações
// (nome/telefone/email) — só os intervalos já ocupados.
//
// staffId: um profissional, ou "any" (sem preferência) — junta as horas
// livres de todos os que fazem o serviço. Só entram profissionais
// atribuídos ao serviço (booking_service_staff); um serviço sem
// ninguém atribuído pode ser feito por qualquer um.
//
// As horas da disponibilidade (ex: 09:00–18:00) são hora de Lisboa. O
// servidor corre em UTC, por isso cada hora é convertida com o fuso
// certo (senão no verão os horários saíam uma hora mais tarde).
//
// "Verify JWT" DESLIGADO.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const TZ = "Europe/Lisbon";

// Diferença (ms) entre a hora de Lisboa e UTC nesse instante.
function tzOffsetMs(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(date);
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")) - date.getTime();
}

// "2026-10-03" + 09:30 em Lisboa → instante UTC (ms)
function lisbonToUtc(dateStr, hours, minutes) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, hours, minutes);
  return guess - tzOffsetMs(new Date(guess));
}

// Profissionais que podem fazer este serviço (ativos).
async function eligibleStaff(admin, brandId, serviceId) {
  const { data: staff } = await admin.from("booking_staff").select("id").eq("brand_id", brandId).eq("status", "active");
  const active = (staff || []).map((s) => s.id);
  const { data: assigned } = await admin.from("booking_service_staff").select("staff_id").eq("service_id", serviceId);
  const ids = (assigned || []).map((a) => a.staff_id);
  return ids.length ? active.filter((id) => ids.includes(id)) : active;
}

async function slotsForStaff(admin, brandId, staffId, date, weekday, durationMs) {
  const { data: rules } = await admin.from("booking_availability").select("start_time, end_time").eq("brand_id", brandId).eq("staff_id", staffId).eq("weekday", weekday);
  if (!rules || rules.length === 0) return [];

  const dayStart = new Date(lisbonToUtc(date, 0, 0));
  const dayEnd = new Date(lisbonToUtc(date, 23, 59) + 59999);

  const { data: existing } = await admin
    .from("booking_appointments")
    .select("starts_at, ends_at")
    .eq("brand_id", brandId)
    .eq("staff_id", staffId)
    .in("status", ["confirmed", "pending_payment"])
    .lt("starts_at", dayEnd.toISOString())
    .gt("ends_at", dayStart.toISOString());

  const { data: timeOff } = await admin
    .from("booking_time_off")
    .select("starts_at, ends_at")
    .eq("staff_id", staffId)
    .lt("starts_at", dayEnd.toISOString())
    .gt("ends_at", dayStart.toISOString());

  const busy = [
    ...(existing || []).map((a) => ({ start: new Date(a.starts_at).getTime(), end: new Date(a.ends_at).getTime() })),
    ...(timeOff || []).map((t) => ({ start: new Date(t.starts_at).getTime(), end: new Date(t.ends_at).getTime() })),
  ];

  const slots = [];
  for (const rule of rules) {
    const [sh, sm] = rule.start_time.split(":").map(Number);
    const [eh, em] = rule.end_time.split(":").map(Number);
    let cursor = lisbonToUtc(date, sh, sm);
    const windowEnd = lisbonToUtc(date, eh, em);
    while (cursor + durationMs <= windowEnd) {
      const slotStart = cursor;
      const slotEnd = slotStart + durationMs;
      const overlaps = busy.some((b) => slotStart < b.end && slotEnd > b.start);
      if (!overlaps && slotStart > Date.now()) slots.push(slotStart);
      cursor += durationMs;
    }
  }
  return slots;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const admin = createClient(supabaseUrl, serviceRoleKey);

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Corpo do pedido inválido." }, 400);
  }
  const { brandId, serviceId, staffId, date, upsellIds } = body; // date: "YYYY-MM-DD", dia em Lisboa
  if (!brandId || !serviceId || !staffId || !date) {
    return json({ error: "Faltam campos obrigatórios." }, 400);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return json({ error: "Data inválida." }, 400);
  }

  const { data: service } = await admin.from("booking_services").select("duration_minutes, status").eq("id", serviceId).eq("brand_id", brandId).maybeSingle();
  if (!service || service.status !== "active") {
    return json({ error: "Serviço não encontrado." }, 404);
  }

  let extraMinutes = 0;
  if (Array.isArray(upsellIds) && upsellIds.length > 0) {
    const { data: upsells } = await admin.from("booking_service_upsells").select("extra_duration_minutes").in("id", upsellIds).eq("service_id", serviceId);
    extraMinutes = (upsells || []).reduce((sum, u) => sum + (u.extra_duration_minutes || 0), 0);
  }
  const durationMs = (service.duration_minutes + extraMinutes) * 60000;

  const eligible = await eligibleStaff(admin, brandId, serviceId);
  const staffIds = staffId === "any" ? eligible : eligible.filter((id) => id === staffId);
  if (!staffIds.length) return json({ slots: [] });

  const [yy, mm, dd] = date.split("-").map(Number);
  const weekday = new Date(Date.UTC(yy, mm - 1, dd)).getUTCDay();

  const all = new Set();
  for (const id of staffIds) {
    for (const s of await slotsForStaff(admin, brandId, id, date, weekday, durationMs)) all.add(s);
  }
  const slots = [...all].sort((a, b) => a - b).map((ms) => new Date(ms).toISOString());

  return json({ slots });
});
