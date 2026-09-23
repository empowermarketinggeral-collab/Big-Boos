// EMPOWER OS — recebe eventos do Stripe: subscrições (marcas OU
// agências) e pagamentos de sinal de marcações (Agendamento). Regista
// este URL, depois do deploy, em Stripe → Developers → Webhooks →
// "Add endpoint": https://<project>.supabase.co/functions/v1/stripe-webhook
// Eventos a subscrever: customer.subscription.created,
// customer.subscription.updated, customer.subscription.deleted,
// checkout.session.completed.
//
// Precisa de "Verify JWT" DESLIGADO (o Stripe não manda um JWT do
// Supabase) — a segurança aqui vem da verificação da assinatura
// abaixo, com o segredo que o Stripe te dá ao criares o endpoint.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const encoder = new TextEncoder();

async function verifyStripeSignature(rawBody, signatureHeader, secret) {
  const parts = Object.fromEntries((signatureHeader || "").split(",").map((p) => p.split("=")));
  const timestamp = parts.t;
  const expectedSig = parts.v1;
  if (!timestamp || !expectedSig) return false;

  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signed = await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${rawBody}`));
  const computedSig = Array.from(new Uint8Array(signed)).map((b) => b.toString(16).padStart(2, "0")).join("");

  if (computedSig.length !== expectedSig.length) return false;
  let diff = 0;
  for (let i = 0; i < computedSig.length; i++) diff |= computedSig.charCodeAt(i) ^ expectedSig.charCodeAt(i);
  return diff === 0;
}

const STRIPE_STATUS_MAP = {
  trialing: "trialing", active: "active", past_due: "past_due", canceled: "canceled",
  unpaid: "past_due", incomplete: "trialing", incomplete_expired: "canceled", paused: "canceled",
};

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

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  const signatureHeader = req.headers.get("stripe-signature");
  const rawBody = await req.text();

  if (!webhookSecret || !signatureHeader || !(await verifyStripeSignature(rawBody, signatureHeader, webhookSecret))) {
    return new Response("Assinatura inválida.", { status: 400 });
  }

  const event = JSON.parse(rawBody);
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const admin = createClient(supabaseUrl, serviceRoleKey);

  if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated") {
    const sub = event.data.object;
    const brandId = sub.metadata?.brand_id || null;
    const agencyId = sub.metadata?.agency_id || null;

    if (brandId || agencyId) {
      const priceId = sub.items?.data?.[0]?.price?.id;
      let planId = sub.metadata?.plan_id || null;
      if (!planId && priceId) {
        const { data: plan } = await admin.from("plans").select("id").eq("stripe_price_id", priceId).maybeSingle();
        planId = plan?.id || null;
      }

      const newStatus = STRIPE_STATUS_MAP[sub.status] || "active";
      const ownerColumn = brandId ? "brand_id" : "agency_id";
      const ownerId = brandId || agencyId;

      // past_due_since só é marcado na primeira vez que entra em
      // atraso, e limpo assim que deixa de estar — é a partir dele
      // que o aviso no topo da app conta os 7+3 dias.
      const { data: existing } = await admin.from("subscriptions").select("status, past_due_since").eq(ownerColumn, ownerId).maybeSingle();
      let pastDueSince = existing?.past_due_since || null;
      if (newStatus === "past_due" && existing?.status !== "past_due") pastDueSince = new Date().toISOString();
      else if (newStatus !== "past_due") pastDueSince = null;

      await admin.from("subscriptions").upsert(
        {
          brand_id: brandId,
          agency_id: agencyId,
          plan_id: planId,
          stripe_customer_ref: sub.customer,
          stripe_subscription_ref: sub.id,
          status: newStatus,
          current_period_end: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
          past_due_since: pastDueSince,
        },
        { onConflict: ownerColumn }
      );
    }
  }

  if (event.type === "customer.subscription.deleted") {
    const sub = event.data.object;
    await admin.from("subscriptions").update({ status: "canceled" }).eq("stripe_subscription_ref", sub.id);
  }

  // Sinal/depósito de marcação (Agendamento) — pagamento único, não
  // subscrição. booking-create cria a marcação como "pending_payment"
  // e só aqui, com o pagamento confirmado, é que passa a "confirmed"
  // e sai a mensagem de confirmação ao cliente.
  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    if (session.mode === "payment" && session.metadata?.type === "booking_deposit") {
      const appointmentId = session.metadata?.appointment_id;
      if (appointmentId) {
        const { data: appt } = await admin
          .from("booking_appointments")
          .select("id, brand_id, contact_id, customer_name, customer_phone, customer_email, starts_at, status, booking_services(name)")
          .eq("id", appointmentId)
          .maybeSingle();

        if (appt && appt.status === "pending_payment") {
          await admin.from("booking_appointments").update({ status: "confirmed", deposit_status: "paid" }).eq("id", appointmentId);

          const { data: confirmationSetting } = await admin
            .from("booking_reminder_settings")
            .select("enabled, channel, message_template")
            .eq("brand_id", appt.brand_id).eq("type", "confirmation").maybeSingle();
          if (confirmationSetting?.enabled) {
            const start = new Date(appt.starts_at);
            const serviceName = appt.booking_services?.name || "";
            const vars = { nome: appt.customer_name, servico: serviceName, data: start.toLocaleDateString("pt-PT"), hora: start.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" }) };
            const text = fillTemplate(confirmationSetting.message_template, vars) || `A tua marcação de ${serviceName} ficou confirmada para ${vars.data} às ${vars.hora}.`;
            if (confirmationSetting.channel === "whatsapp" && appt.customer_phone) await sendWhatsappText(admin, appt.brand_id, appt.customer_phone, text);
            if (confirmationSetting.channel === "sms" && appt.customer_phone) await sendSmsText(admin, appt.brand_id, appt.customer_phone, text, appt.contact_id);
            if (confirmationSetting.channel === "email" && appt.customer_email) await sendEmail(admin, appt.brand_id, appt.customer_email, "Marcação confirmada", text);
          }
        }
      }
    }
  }

  return new Response(JSON.stringify({ received: true }), { status: 200, headers: { "Content-Type": "application/json" } });
});
