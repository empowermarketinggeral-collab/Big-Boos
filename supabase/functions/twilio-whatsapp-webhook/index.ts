// EMPOWER OS — recebe mensagens de WhatsApp quando a marca está
// ligada via Twilio (em vez da Meta Cloud API direta). Regista este
// URL, depois de fazeres deploy, em Twilio → Messaging → WhatsApp
// senders → o teu número → "When a message comes in".
//
// Twilio envia application/x-www-form-urlencoded, não JSON — por
// isso este webhook lê req.formData(), ao contrário do whatsapp-webhook
// (Meta), que lê JSON.
//
// A assinatura X-Twilio-Signature é verificada com o Auth Token da
// PRÓPRIA MARCA (cada uma tem o seu, no Vault) — só dá para validar
// depois de identificar a marca pelo número de destino ("To"), por
// isso a leitura do form vem antes da verificação.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const encoder = new TextEncoder();

async function verifyTwilioSignature(url, params, signatureHeader, authToken) {
  if (!signatureHeader) return false;
  const sortedKeys = Object.keys(params).sort();
  let data = url;
  for (const key of sortedKeys) data += key + params[key];

  const key = await crypto.subtle.importKey("raw", encoder.encode(authToken), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const signed = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  const computed = btoa(String.fromCharCode(...new Uint8Array(signed)));

  if (computed.length !== signatureHeader.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i++) diff |= computed.charCodeAt(i) ^ signatureHeader.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const admin = createClient(supabaseUrl, serviceRoleKey);

  const form = await req.formData();
  const params = {};
  for (const [key, value] of form.entries()) params[key] = String(value);

  const from = (form.get("From") || "").toString().replace("whatsapp:", "");
  const to = (form.get("To") || "").toString().replace("whatsapp:", "");
  const bodyText = (form.get("Body") || "").toString();
  const messageSid = (form.get("MessageSid") || "").toString();

  if (!from || !to) {
    return new Response("Bad Request", { status: 400 });
  }

  const { data: account } = await admin
    .from("whatsapp_accounts")
    .select("brand_id, access_token_ref")
    .eq("provider", "twilio")
    .eq("phone_number_id", to)
    .maybeSingle();
  if (!account) {
    return new Response("EVENT_RECEIVED", { status: 200 });
  }

  const { data: authToken } = await admin.rpc("vault_read_secret", { p_id: account.access_token_ref });
  const signatureHeader = req.headers.get("x-twilio-signature");
  if (!authToken || !(await verifyTwilioSignature(req.url, params, signatureHeader, authToken))) {
    return new Response("Assinatura inválida.", { status: 403 });
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
