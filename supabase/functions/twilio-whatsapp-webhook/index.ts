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
//
// - A marca reconhece-se pelos dígitos do número ("+351 915…", "351915…"
//   e "whatsapp:+351915…" são o mesmo número).
// - A assinatura é calculada pelo Twilio sobre o endereço público
//   (https://<projeto>.supabase.co/functions/v1/…); dentro da função o
//   req.url pode chegar com http:// ou sem /functions/v1, por isso
//   experimenta as variantes do mesmo endereço.
// - Cada conversa fica ligada à ficha do CRM pelo telemóvel (cria o
//   contacto se não existir), para aparecer no Inbox Unificado e
//   arrancar as automações de "mensagem recebida".
// - Fotos, áudios e documentos ficam registados com o tipo certo.
// - Falhas ficam nos logs da função (Edge Functions → Logs).
//
// Precisa de "Verify JWT" DESLIGADO.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const encoder = new TextEncoder();
const TWIML_OK = "<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response></Response>";
const ok = () => new Response(TWIML_OK, { status: 200, headers: { "Content-Type": "text/xml" } });

async function hmacSha1Base64(key, data) {
  const cryptoKey = await crypto.subtle.importKey("raw", encoder.encode(key), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const signed = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(signed)));
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// O endereço que o Twilio assinou pode não ser exatamente o req.url.
function candidateUrls(req) {
  const out = new Set();
  const raw = new URL(req.url);
  const supa = new URL(Deno.env.get("SUPABASE_URL") || raw.origin);
  const path = raw.pathname.startsWith("/functions/v1/") ? raw.pathname : `/functions/v1${raw.pathname}`;
  for (const host of [raw.host, supa.host, req.headers.get("x-forwarded-host")].filter(Boolean)) {
    for (const p of [raw.pathname, path]) {
      out.add(`https://${host}${p}${raw.search}`);
      out.add(`http://${host}${p}${raw.search}`);
    }
  }
  out.add(req.url);
  return [...out];
}

async function verifyTwilioSignature(req, params, signatureHeader, authToken) {
  if (!signatureHeader) return false;
  const sorted = Object.keys(params).sort().map((k) => k + params[k]).join("");
  for (const url of candidateUrls(req)) {
    if (safeEqual(await hmacSha1Base64(authToken, url + sorted), signatureHeader)) return true;
  }
  return false;
}

const digitsOf = (v) => String(v || "").replace(/\D/g, "");

// Liga a conversa à ficha do CRM pelo telemóvel; cria o contacto se não existir.
async function contactFor(admin, brandId, phone, profileName) {
  const digits = digitsOf(phone);
  if (digits.length < 8) return null;
  const e164 = `+${digits}`;
  const { data: exact } = await admin.from("contacts").select("id").eq("brand_id", brandId).in("phone", [e164, digits]).limit(1);
  if (exact?.[0]) return exact[0].id;
  // Números guardados com espaços ou sem indicativo: compara os últimos 9 dígitos.
  const { data: similar } = await admin.from("contacts").select("id, phone").eq("brand_id", brandId).ilike("phone", `%${digits.slice(-3)}`).limit(200);
  const match = (similar || []).filter((c) => digitsOf(c.phone).slice(-9) === digits.slice(-9));
  if (match.length === 1) return match[0].id;
  const { data: created, error } = await admin.from("contacts")
    .insert({ brand_id: brandId, name: String(profileName || e164).slice(0, 120), phone: e164, source: "whatsapp", opted_in_whatsapp: true })
    .select("id").single();
  if (error) {
    console.error("twilio-whatsapp-webhook: não foi possível criar o contacto", error.message);
    return null;
  }
  return created.id;
}

function mediaType(contentType) {
  const t = String(contentType || "").toLowerCase();
  if (t.startsWith("image/")) return ["image", "[Imagem]"];
  if (t.startsWith("video/")) return ["video", "[Vídeo]"];
  if (t.startsWith("audio/")) return ["document", "[Áudio]"];
  return ["document", "[Documento]"];
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));

  const form = await req.formData();
  const params = {};
  for (const [key, value] of form.entries()) params[key] = String(value);

  const from = (params.From || "").replace("whatsapp:", "");
  const to = (params.To || "").replace("whatsapp:", "");
  if (!from || !to) return new Response("Bad Request", { status: 400 });

  // A marca do número de destino (compara só os dígitos).
  const { data: accounts } = await admin.from("whatsapp_accounts").select("brand_id, phone_number_id, access_token_ref").eq("provider", "twilio");
  const account = (accounts || []).find((a) => digitsOf(a.phone_number_id) === digitsOf(to));
  if (!account) {
    console.error("twilio-whatsapp-webhook: nenhuma marca com o número", to, "- confirma o número em WhatsApp → Ligar conta");
    return ok();
  }

  const { data: authToken } = await admin.rpc("vault_read_secret", { p_id: account.access_token_ref });
  if (!authToken) {
    console.error("twilio-whatsapp-webhook: Auth Token em falta para a marca", account.brand_id);
    return new Response("Sem configuração.", { status: 403 });
  }
  if (!(await verifyTwilioSignature(req, params, req.headers.get("x-twilio-signature"), authToken))) {
    console.error("twilio-whatsapp-webhook: assinatura inválida (Auth Token guardado diferente do da conta Twilio?)", { brand: account.brand_id, url: req.url });
    return new Response("Assinatura inválida.", { status: 403 });
  }

  // Repetição do mesmo envio pelo Twilio: não duplica.
  const messageSid = params.MessageSid || params.SmsMessageSid || "";
  if (messageSid) {
    const { data: dup } = await admin.from("whatsapp_messages").select("id").eq("brand_id", account.brand_id).eq("wa_message_id", messageSid).limit(1);
    if (dup?.length) return ok();
  }

  const contactId = await contactFor(admin, account.brand_id, from, params.ProfileName);

  let conversation = (
    await admin.from("whatsapp_conversations").select("id, contact_id").eq("brand_id", account.brand_id).eq("wa_contact_phone", from).maybeSingle()
  ).data;
  if (!conversation) {
    const { data: created, error } = await admin
      .from("whatsapp_conversations")
      .insert({ brand_id: account.brand_id, wa_contact_phone: from, contact_id: contactId })
      .select("id, contact_id")
      .single();
    if (error) {
      console.error("twilio-whatsapp-webhook: não foi possível criar a conversa", error.message);
      return new Response("Erro.", { status: 500 });
    }
    conversation = created;
  }

  const windowExpires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  await admin
    .from("whatsapp_conversations")
    .update({
      last_message_at: new Date().toISOString(), window_expires_at: windowExpires, status: "open",
      ...(conversation.contact_id ? {} : { contact_id: contactId }),
    })
    .eq("id", conversation.id);

  const rows = [];
  const text = params.Body || "";
  const numMedia = parseInt(params.NumMedia || "0", 10) || 0;
  for (let i = 0; i < numMedia; i++) {
    const [type, label] = mediaType(params[`MediaContentType${i}`]);
    rows.push({ type, body: i === 0 && text ? `${label} ${text}` : label, media_url: params[`MediaUrl${i}`] || null });
  }
  if (!rows.length) rows.push({ type: "text", body: text || "[Mensagem sem texto]", media_url: null });

  const { error: insertError } = await admin.from("whatsapp_messages").insert(rows.map((r, i) => ({
    brand_id: account.brand_id,
    conversation_id: conversation.id,
    direction: "inbound",
    wa_message_id: i === 0 ? messageSid || null : null,
    type: r.type,
    body: r.body,
    media_url: r.media_url,
    status: "delivered",
  })));
  if (insertError) {
    console.error("twilio-whatsapp-webhook: não foi possível guardar a mensagem", insertError.message);
    return new Response("Erro.", { status: 500 });
  }

  return ok();
});
