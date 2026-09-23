// EMPOWER OS — recebe mensagens de WhatsApp quando a marca está
// ligada via Twilio (em vez da Meta Cloud API direta). Regista este
// URL, depois de fazeres deploy, em Twilio → Messaging → WhatsApp
// senders → o teu número → "When a message comes in".
//
// Twilio envia application/x-www-form-urlencoded, não JSON — por
// isso este webhook lê req.formData(), ao contrário do whatsapp-webhook
// (Meta), que lê JSON.
//
// LIMITAÇÃO CONHECIDA: não valida a assinatura X-Twilio-Signature —
// qualquer pedido POST bem formado a este URL é aceite como se viesse
// mesmo da Twilio. Para produção a sério, isto devia validar a
// assinatura por conta (cada marca tem o seu próprio Auth Token no
// Vault) antes de gravar a mensagem.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const admin = createClient(supabaseUrl, serviceRoleKey);

  const form = await req.formData();
  const from = (form.get("From") || "").toString().replace("whatsapp:", "");
  const to = (form.get("To") || "").toString().replace("whatsapp:", "");
  const bodyText = (form.get("Body") || "").toString();
  const messageSid = (form.get("MessageSid") || "").toString();

  if (!from || !to) {
    return new Response("Bad Request", { status: 400 });
  }

  const { data: account } = await admin
    .from("whatsapp_accounts")
    .select("brand_id")
    .eq("provider", "twilio")
    .eq("phone_number_id", to)
    .maybeSingle();
  if (!account) {
    return new Response("EVENT_RECEIVED", { status: 200 });
  }

  let conversation = (
    await admin.from("whatsapp_conversations").select("id").eq("brand_id", account.brand_id).eq("wa_contact_phone", from).maybeSingle()
  ).data;
  if (!conversation) {
    const { data: created } = await admin
      .from("whatsapp_conversations")
      .insert({ brand_id: account.brand_id, wa_contact_phone: from })
      .select("id")
      .single();
    conversation = created;
  }

  const windowExpires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  await admin
    .from("whatsapp_conversations")
    .update({ last_message_at: new Date().toISOString(), window_expires_at: windowExpires, status: "open" })
    .eq("id", conversation.id);

  await admin.from("whatsapp_messages").insert({
    brand_id: account.brand_id,
    conversation_id: conversation.id,
    direction: "inbound",
    wa_message_id: messageSid || null,
    type: "text",
    body: bodyText,
    status: "delivered",
  });

  return new Response("EVENT_RECEIVED", { status: 200 });
});
