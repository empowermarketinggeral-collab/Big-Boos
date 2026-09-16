// EMPOWER OS — confirma uma marcação.
// Chamado publicamente (sem login) pela página de marcação.
// Revalida a disponibilidade no momento da escrita (não confia só no
// que o browser calculou antes) para evitar duas pessoas a marcarem
// o mesmo horário em simultâneo. Cria/reconhece o contacto pelo
// telefone, depois pelo email — mesma lógica do formulário.

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
  const { brandId, serviceId, startsAt, name, phone, email } = body;
  if (!brandId || !serviceId || !startsAt || !name) {
    return json({ error: "Faltam campos obrigatórios." }, 400);
  }

  const { data: service } = await admin.from("booking_services").select("duration_minutes, status").eq("id", serviceId).eq("brand_id", brandId).maybeSingle();
  if (!service || service.status !== "active") {
    return json({ error: "Serviço não encontrado." }, 404);
  }

  const start = new Date(startsAt);
  const end = new Date(start.getTime() + service.duration_minutes * 60000);
  if (start.getTime() <= Date.now()) {
    return json({ error: "Esse horário já passou." }, 400);
  }

  // Revalidação atómica: volta a verificar se ainda está livre.
  const { data: clash } = await admin
    .from("booking_appointments")
    .select("id")
    .eq("brand_id", brandId)
    .eq("status", "confirmed")
    .lt("starts_at", end.toISOString())
    .gt("ends_at", start.toISOString())
    .limit(1);
  if (clash && clash.length > 0) {
    return json({ error: "Esse horário acabou de ficar indisponível. Escolhe outro." }, 409);
  }

  let contactId = null;
  if (phone) {
    const { data } = await admin.from("contacts").select("id").eq("brand_id", brandId).eq("phone", phone).maybeSingle();
    contactId = data?.id || null;
  }
  if (!contactId && email) {
    const { data } = await admin.from("contacts").select("id").eq("brand_id", brandId).ilike("email", email).maybeSingle();
    contactId = data?.id || null;
  }
  if (!contactId) {
    const { data: created, error: contactError } = await admin
      .from("contacts")
      .insert({ brand_id: brandId, name, email: email || null, phone: phone || null, source: "agendamento" })
      .select("id")
      .single();
    if (contactError) return json({ error: "Não foi possível registar o contacto." }, 500);
    contactId = created.id;
  }

  const { error: apptError } = await admin.from("booking_appointments").insert({
    brand_id: brandId, service_id: serviceId, contact_id: contactId,
    customer_name: name, customer_phone: phone || null, customer_email: email || null,
    starts_at: start.toISOString(), ends_at: end.toISOString(), status: "confirmed",
  });
  if (apptError) return json({ error: apptError.message }, 500);

  return json({ ok: true });
});
