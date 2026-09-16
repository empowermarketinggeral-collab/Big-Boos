// EMPOWER OS — calcula os horários livres de um serviço, num dia.
// Chamado publicamente (sem login) pela página de marcação.
// Nunca devolve dados de outras marcações (nome/telefone/email) —
// só os intervalos de tempo já ocupados, para não expor clientes.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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
  const { brandId, serviceId, date } = body; // date: "YYYY-MM-DD" no fuso do browser
  if (!brandId || !serviceId || !date) {
    return json({ error: "Faltam campos obrigatórios." }, 400);
  }

  const { data: service } = await admin.from("booking_services").select("duration_minutes, status").eq("id", serviceId).eq("brand_id", brandId).maybeSingle();
  if (!service || service.status !== "active") {
    return json({ error: "Serviço não encontrado." }, 404);
  }
  const durationMs = service.duration_minutes * 60000;

  const dayStart = new Date(`${date}T00:00:00`);
  const weekday = dayStart.getDay();

  const { data: rules } = await admin.from("booking_availability").select("start_time, end_time").eq("brand_id", brandId).eq("weekday", weekday);
  if (!rules || rules.length === 0) {
    return json({ slots: [] });
  }

  const dayEnd = new Date(`${date}T23:59:59`);
  const { data: existing } = await admin
    .from("booking_appointments")
    .select("starts_at, ends_at")
    .eq("brand_id", brandId)
    .eq("status", "confirmed")
    .gte("starts_at", dayStart.toISOString())
    .lte("starts_at", dayEnd.toISOString());

  const busy = (existing || []).map((a) => ({ start: new Date(a.starts_at).getTime(), end: new Date(a.ends_at).getTime() }));

  const slots = [];
  for (const rule of rules) {
    const [sh, sm] = rule.start_time.split(":").map(Number);
    const [eh, em] = rule.end_time.split(":").map(Number);
    let cursor = new Date(date + "T00:00:00");
    cursor.setHours(sh, sm, 0, 0);
    const windowEnd = new Date(date + "T00:00:00");
    windowEnd.setHours(eh, em, 0, 0);

    while (cursor.getTime() + durationMs <= windowEnd.getTime()) {
      const slotStart = cursor.getTime();
      const slotEnd = slotStart + durationMs;
      const overlaps = busy.some((b) => slotStart < b.end && slotEnd > b.start);
      const inFuture = slotStart > Date.now();
      if (!overlaps && inFuture) {
        slots.push(new Date(slotStart).toISOString());
      }
      cursor = new Date(cursor.getTime() + durationMs);
    }
  }

  return json({ slots });
});
