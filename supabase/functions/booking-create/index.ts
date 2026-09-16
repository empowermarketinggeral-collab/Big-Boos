// EMPOWER OS — confirma uma marcação (serviço + profissional + upsells).
// Chamado publicamente (sem login) pela página de marcação.
// Revalida a disponibilidade no momento da escrita (não confia só no
// que o browser calculou antes) para evitar duas pessoas a marcarem
// o mesmo horário do mesmo profissional em simultâneo. Cria/reconhece
// o contacto pelo telefone, depois pelo email — mesma lógica do
// formulário. Envia a mensagem de confirmação (se ativada) na hora;
// os lembretes de 24h/1h/pós-visita ficam a cargo da booking-reminders,
// agendada à parte.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function fillTemplate(template, vars) {
  return (template || "").replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "");
}

async function sendWhatsappText(admin, brandId, toPhone, body) {
  const { data: account } = await admin.from("whatsapp_accounts").select("phone_number_id, access_token_ref").eq("brand_id", brandId).maybeSingle();
  if (!account) return;
  const { data: token } = await admin.rpc("vault_read_secret", { p_id: account.access_token_ref });
  if (!token) return;

  let { data: conversation } = await admin.from("whatsapp_conversations").select("id").eq("brand_id", brandId).eq("wa_contact_phone", toPhone).maybeSingle();
  if (!conversation) {
    const { data: created } = await admin.from("whatsapp_conversations").insert({ brand_id: brandId, wa_contact_phone: toPhone }).select("id").single();
    conversation = created;
  }
  const res = await fetch(`https://graph.facebook.com/v20.0/${account.phone_number_id}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: toPhone, type: "text", text: { body } }),
  });
  const data = await res.json();
  await admin.from("whatsapp_messages").insert({
    brand_id: brandId, conversation_id: conversation.id, direction: "outbound",
    wa_message_id: data?.messages?.[0]?.id || null, type: "text", body, status: res.ok ? "sent" : "failed",
  });
}

async function sendEmail(admin, brandId, toEmail, subject, html) {
  const { data: domain } = await admin.from("email_domains").select("from_name, from_email, api_key_ref").eq("brand_id", brandId).maybeSingle();
  if (!domain) return;
  const { data: apiKey } = await admin.rpc("vault_read_secret", { p_id: domain.api_key_ref });
  if (!apiKey) return;
  const from = domain.from_name ? `${domain.from_name} <${domain.from_email}>` : domain.from_email;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: toEmail, subject, html }),
  });
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
  const { brandId, serviceId, staffId, startsAt, upsellIds, name, phone, email } = body;
  if (!brandId || !serviceId || !staffId || !startsAt || !name) {
    return json({ error: "Faltam campos obrigatórios." }, 400);
  }

  const { data: service } = await admin.from("booking_services").select("name, duration_minutes, price, status").eq("id", serviceId).eq("brand_id", brandId).maybeSingle();
  if (!service || service.status !== "active") {
    return json({ error: "Serviço não encontrado." }, 404);
  }

  let selectedUpsells = [];
  if (Array.isArray(upsellIds) && upsellIds.length > 0) {
    const { data: upsells } = await admin.from("booking_service_upsells").select("id, name, price, extra_duration_minutes").in("id", upsellIds).eq("service_id", serviceId);
    selectedUpsells = upsells || [];
  }
  const extraMinutes = selectedUpsells.reduce((sum, u) => sum + (u.extra_duration_minutes || 0), 0);
  const totalPrice = (service.price || 0) + selectedUpsells.reduce((sum, u) => sum + (u.price || 0), 0);

  const start = new Date(startsAt);
  const end = new Date(start.getTime() + (service.duration_minutes + extraMinutes) * 60000);
  if (start.getTime() <= Date.now()) {
    return json({ error: "Esse horário já passou." }, 400);
  }

  const { data: clash } = await admin
    .from("booking_appointments")
    .select("id")
    .eq("brand_id", brandId)
    .eq("staff_id", staffId)
    .eq("status", "confirmed")
    .lt("starts_at", end.toISOString())
    .gt("ends_at", start.toISOString())
    .limit(1);
  if (clash && clash.length > 0) {
    return json({ error: "Esse horário acabou de ficar indisponível. Escolhe outro." }, 409);
  }

  const { data: timeOffClash } = await admin
    .from("booking_time_off")
    .select("id")
    .eq("staff_id", staffId)
    .lt("starts_at", end.toISOString())
    .gt("ends_at", start.toISOString())
    .limit(1);
  if (timeOffClash && timeOffClash.length > 0) {
    return json({ error: "Este profissional não está disponível nesse período." }, 409);
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
    brand_id: brandId, service_id: serviceId, staff_id: staffId, contact_id: contactId,
    customer_name: name, customer_phone: phone || null, customer_email: email || null,
    starts_at: start.toISOString(), ends_at: end.toISOString(), status: "confirmed",
    selected_upsells: selectedUpsells, total_price: totalPrice,
  });
  if (apptError) return json({ error: apptError.message }, 500);

  const { data: confirmationSetting } = await admin
    .from("booking_reminder_settings")
    .select("enabled, channel, message_template")
    .eq("brand_id", brandId).eq("type", "confirmation").maybeSingle();
  if (confirmationSetting?.enabled) {
    const vars = { nome: name, servico: service.name, data: start.toLocaleDateString("pt-PT"), hora: start.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" }) };
    const text = fillTemplate(confirmationSetting.message_template, vars) || `A tua marcação de ${service.name} ficou confirmada para ${vars.data} às ${vars.hora}.`;
    if (confirmationSetting.channel === "whatsapp" && phone) await sendWhatsappText(admin, brandId, phone, text);
    if (confirmationSetting.channel === "email" && email) await sendEmail(admin, brandId, email, "Marcação confirmada", text);
  }

  return json({ ok: true });
});
