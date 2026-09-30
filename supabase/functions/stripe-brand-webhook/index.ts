// EMPOWER OS — webhook do Stripe PRÓPRIO de cada marca
// (brand_stripe_accounts). O URL leva a marca: .../stripe-brand-webhook?brand=<id>
// e é criado sozinho pela stripe-brand-connect — não é preciso registá-lo à mão.
//
// Trata:
//   - checkout.session.completed, type=booking_deposit → marcação confirmada
//     (sinal pago) + mensagem de confirmação;
//   - checkout.session.completed, type=pack_purchase → pack ativo (validade
//     conta a partir do pagamento);
//   - checkout.session.expired → liberta a marcação / anula o pack por pagar.
//
// A assinatura é verificada com o segredo do webhook DESSA marca (Vault),
// e só se mexe em linhas dessa marca.
//
// "Verify JWT" DESLIGADO (o Stripe não manda um JWT do Supabase).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const encoder = new TextEncoder();
const TZ = "Europe/Lisbon";

async function verifyStripeSignature(rawBody, signatureHeader, secret) {
  const parts = Object.fromEntries((signatureHeader || "").split(",").map((p) => p.split("=")));
  const timestamp = parts.t;
  const expectedSig = parts.v1;
  if (!timestamp || !expectedSig) return false;
  // Rejeita eventos com mais de 5 minutos (repetições de pedidos antigos).
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;

  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signed = await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${rawBody}`));
  const computedSig = Array.from(new Uint8Array(signed)).map((b) => b.toString(16).padStart(2, "0")).join("");

  if (computedSig.length !== expectedSig.length) return false;
  let diff = 0;
  for (let i = 0; i < computedSig.length; i++) diff |= computedSig.charCodeAt(i) ^ expectedSig.charCodeAt(i);
  return diff === 0;
}

function fillTemplate(template, vars) {
  return (template || "").replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "");
}

async function sendWhatsappText(admin, brandId, toPhone, body) {
  const { data: account } = await admin.from("whatsapp_accounts").select("provider, phone_number_id, twilio_account_sid, access_token_ref").eq("brand_id", brandId).maybeSingle();
  if (!account) return;
  const { data: token } = await admin.rpc("vault_read_secret", { p_id: account.access_token_ref });
  if (!token) return;

  let { data: conversation } = await admin.from("whatsapp_conversations").select("id").eq("brand_id", brandId).eq("wa_contact_phone", toPhone).maybeSingle();
  if (!conversation) {
    const { data: created } = await admin.from("whatsapp_conversations").insert({ brand_id: brandId, wa_contact_phone: toPhone }).select("id").single();
    conversation = created;
  }

  let ok, msgId;
  if (account.provider === "twilio") {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${account.twilio_account_sid}/Messages.json`, {
      method: "POST",
      headers: { Authorization: `Basic ${btoa(`${account.twilio_account_sid}:${token}`)}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ From: `whatsapp:${account.phone_number_id}`, To: `whatsapp:${toPhone}`, Body: body }),
    });
    const data = await res.json();
    ok = res.ok; msgId = data?.sid || null;
  } else {
    const res = await fetch(`https://graph.facebook.com/v20.0/${account.phone_number_id}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to: toPhone, type: "text", text: { body } }),
    });
    const data = await res.json();
    ok = res.ok; msgId = data?.messages?.[0]?.id || null;
  }

  await admin.from("whatsapp_messages").insert({
    brand_id: brandId, conversation_id: conversation.id, direction: "outbound",
    wa_message_id: msgId, type: "text", body, status: ok ? "sent" : "failed",
  });
}

async function sendSmsText(admin, brandId, toPhone, body, contactId) {
  const { data: account } = await admin.from("sms_accounts").select("account_sid, from_number, auth_token_ref").eq("brand_id", brandId).maybeSingle();
  if (!account) return;
  const { data: token } = await admin.rpc("vault_read_secret", { p_id: account.auth_token_ref });
  if (!token) return;
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${account.account_sid}/Messages.json`, {
    method: "POST",
    headers: { Authorization: `Basic ${btoa(`${account.account_sid}:${token}`)}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ From: account.from_number, To: toPhone, Body: body }),
  });
  const data = await res.json();
  await admin.from("sms_messages").insert({
    brand_id: brandId, contact_id: contactId || null, to_number: toPhone, body, direction: "outbound",
    provider_ref: data?.sid || null, status: res.ok ? "sent" : "failed",
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

async function confirmDeposit(admin, brandId, appointmentId) {
  const { data: appt } = await admin
    .from("booking_appointments")
    .select("id, brand_id, contact_id, customer_name, customer_phone, customer_email, starts_at, status, booking_services(name)")
    .eq("id", appointmentId).eq("brand_id", brandId)
    .maybeSingle();
  if (!appt || appt.status !== "pending_payment") return;

  await admin.from("booking_appointments").update({ status: "confirmed", deposit_status: "paid" }).eq("id", appt.id);

  const { data: setting } = await admin
    .from("booking_reminder_settings")
    .select("enabled, channel, message_template")
    .eq("brand_id", brandId).eq("type", "confirmation").maybeSingle();
  if (!setting?.enabled) return;
  const start = new Date(appt.starts_at);
  const serviceName = appt.booking_services?.name || "";
  const vars = {
    nome: appt.customer_name, primeiro_nome: String(appt.customer_name || "").trim().split(/\s+/)[0] || "", servico: serviceName,
    data: start.toLocaleDateString("pt-PT", { timeZone: TZ }),
    hora: start.toLocaleTimeString("pt-PT", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }),
  };
  const text = fillTemplate(setting.message_template, vars) || `A tua marcação de ${serviceName} ficou confirmada para ${vars.data} às ${vars.hora}.`;
  if (setting.channel === "whatsapp" && appt.customer_phone) await sendWhatsappText(admin, brandId, appt.customer_phone, text);
  if (setting.channel === "sms" && appt.customer_phone) await sendSmsText(admin, brandId, appt.customer_phone, text, appt.contact_id);
  if (setting.channel === "email" && appt.customer_email) await sendEmail(admin, brandId, appt.customer_email, "Marcação confirmada", text);
}

async function activatePack(admin, brandId, clientPackId, session) {
  const { data: pack } = await admin.from("client_packs").select("id, status").eq("id", clientPackId).eq("brand_id", brandId).maybeSingle();
  if (!pack || pack.status !== "pending_payment") return;
  const validityDays = Number(session.metadata?.validity_days) || 0;
  const now = new Date();
  await admin.from("client_packs").update({
    status: "active",
    purchased_at: now.toISOString(),
    expires_at: validityDays > 0 ? new Date(now.getTime() + validityDays * 86400000).toISOString() : null,
    price_paid: typeof session.amount_total === "number" ? session.amount_total / 100 : null,
  }).eq("id", pack.id);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const brandId = new URL(req.url).searchParams.get("brand") || "";
  if (!/^[0-9a-f-]{36}$/i.test(brandId)) return new Response("Marca inválida.", { status: 400 });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const admin = createClient(supabaseUrl, serviceRoleKey);

  const { data: account } = await admin.from("brand_stripe_accounts").select("webhook_secret_ref").eq("brand_id", brandId).maybeSingle();
  if (!account?.webhook_secret_ref) return new Response("Stripe não ligado.", { status: 400 });
  const { data: webhookSecret } = await admin.rpc("vault_read_secret", { p_id: account.webhook_secret_ref });

  const rawBody = await req.text();
  const signatureHeader = req.headers.get("stripe-signature");
  if (!webhookSecret || !signatureHeader || !(await verifyStripeSignature(rawBody, signatureHeader, webhookSecret))) {
    return new Response("Assinatura inválida.", { status: 400 });
  }

  const event = JSON.parse(rawBody);
  const session = event.data?.object || {};
  const meta = session.metadata || {};
  if (meta.brand_id && meta.brand_id !== brandId) {
    return new Response(JSON.stringify({ received: true, ignored: "outra marca" }), { status: 200, headers: { "Content-Type": "application/json" } });
  }

  if (event.type === "checkout.session.completed" && session.payment_status === "paid") {
    if (meta.type === "booking_deposit" && meta.appointment_id) await confirmDeposit(admin, brandId, meta.appointment_id);
    if (meta.type === "pack_purchase" && meta.client_pack_id) await activatePack(admin, brandId, meta.client_pack_id, session);
  }

  if (event.type === "checkout.session.expired") {
    if (meta.type === "booking_deposit" && meta.appointment_id) {
      await admin.from("booking_appointments").update({ status: "cancelled", deposit_status: "failed" })
        .eq("id", meta.appointment_id).eq("brand_id", brandId).eq("status", "pending_payment");
    }
    if (meta.type === "pack_purchase" && meta.client_pack_id) {
      await admin.from("client_packs").update({ status: "cancelled" })
        .eq("id", meta.client_pack_id).eq("brand_id", brandId).eq("status", "pending_payment");
    }
  }

  return new Response(JSON.stringify({ received: true }), { status: 200, headers: { "Content-Type": "application/json" } });
});
