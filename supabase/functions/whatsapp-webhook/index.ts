// EMPOWER OS — recebe mensagens e eventos da Meta WhatsApp Cloud API.
// Regista este URL (depois de fazeres deploy) no painel da app Meta,
// em WhatsApp > Configuration > Webhook, junto com o WHATSAPP_VERIFY_TOKEN
// definido nos "Secrets" desta função no Supabase.
//
// GET  — handshake de verificação exigido pela Meta ao registares o webhook.
// POST — eventos reais (mensagens recebidas, estados de entrega, etc.).
//
// A assinatura X-Hub-Signature-256 é verificada com o App Secret da
// Meta (META_APP_SECRET nos Secrets do projeto — o mesmo para todas
// as marcas, porque todas passam pela mesma App da Meta). Sem isto,
// qualquer pedido a fingir-se de mensagem de um phone_number_id
// conhecido seria aceite como se viesse mesmo da Meta.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN") || "";
const encoder = new TextEncoder();

async function verifyMetaSignature(rawBody, signatureHeader, appSecret) {
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const expectedHex = signatureHeader.slice("sha256=".length);
  const key = await crypto.subtle.importKey("raw", encoder.encode(appSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signed = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
  const computedHex = Array.from(new Uint8Array(signed)).map((b) => b.toString(16).padStart(2, "0")).join("");
  if (computedHex.length !== expectedHex.length) return false;
  let diff = 0;
  for (let i = 0; i < computedHex.length; i++) diff |= computedHex.charCodeAt(i) ^ expectedHex.charCodeAt(i);
  return diff === 0;
}

const digitsOf = (v) => String(v || "").replace(/\D/g, "");

// Liga a conversa à ficha do CRM pelo telemóvel; cria o contacto se não existir.
async function contactFor(admin, brandId, phone, profileName) {
  const digits = digitsOf(phone);
  if (digits.length < 8) return null;
  const e164 = `+${digits}`;
  const { data: exact } = await admin.from("contacts").select("id").eq("brand_id", brandId).in("phone", [e164, digits]).limit(1);
  if (exact?.[0]) return exact[0].id;
  const { data: similar } = await admin.from("contacts").select("id, phone").eq("brand_id", brandId).ilike("phone", `%${digits.slice(-3)}`).limit(200);
  const match = (similar || []).filter((c) => digitsOf(c.phone).slice(-9) === digits.slice(-9));
  if (match.length === 1) return match[0].id;
  const { data: created } = await admin.from("contacts")
    .insert({ brand_id: brandId, name: String(profileName || e164).slice(0, 120), phone: e164, source: "whatsapp", opted_in_whatsapp: true })
    .select("id").single();
  return created?.id || null;
}

// Tipos da Meta → tipos aceites pela tabela (áudio, autocolantes, etc. ficam como documento/texto).
function messageRow(message) {
  const t = message.type || "text";
  if (t === "text") return { type: "text", body: message.text?.body || "" };
  if (t === "image") return { type: "image", body: message.image?.caption ? `[Imagem] ${message.image.caption}` : "[Imagem]" };
  if (t === "video") return { type: "video", body: message.video?.caption ? `[Vídeo] ${message.video.caption}` : "[Vídeo]" };
  if (t === "document") return { type: "document", body: `[Documento] ${message.document?.filename || ""}`.trim() };
  if (t === "audio") return { type: "document", body: "[Áudio]" };
  if (t === "button") return { type: "text", body: message.button?.text || "[Botão]" };
  if (t === "interactive") return { type: "text", body: message.interactive?.button_reply?.title || message.interactive?.list_reply?.title || "[Resposta]" };
  return { type: "text", body: `[${t}]` };
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      return new Response(challenge, { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const appSecret = Deno.env.get("META_APP_SECRET");
  const rawBody = await req.text();
  const signatureHeader = req.headers.get("x-hub-signature-256");

  if (!appSecret || !(await verifyMetaSignature(rawBody, signatureHeader, appSecret))) {
    return new Response("Assinatura inválida.", { status: 403 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  const entries = payload.entry || [];
  for (const entry of entries) {
    for (const change of entry.changes || []) {
      const value = change.value || {};
      const phoneNumberId = value.metadata?.phone_number_id;
      if (!phoneNumberId) continue;

      const { data: account } = await adminClient
        .from("whatsapp_accounts")
        .select("brand_id")
        .eq("phone_number_id", phoneNumberId)
        .maybeSingle();
      if (!account) continue;

      for (const message of value.messages || []) {
        const from = message.from;

        let conversation = (
          await adminClient
            .from("whatsapp_conversations")
            .select("id")
            .eq("brand_id", account.brand_id)
            .eq("wa_contact_phone", from)
            .maybeSingle()
        ).data;

        const profileName = (value.contacts || []).find((c) => c.wa_id === from)?.profile?.name;
        const contactId = await contactFor(adminClient, account.brand_id, from, profileName);

        if (!conversation) {
          const { data: created } = await adminClient
            .from("whatsapp_conversations")
            .insert({ brand_id: account.brand_id, wa_contact_phone: from, contact_id: contactId })
            .select("id")
            .single();
          conversation = created;
        }
        if (!conversation) continue;

        const windowExpires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        await adminClient
          .from("whatsapp_conversations")
          .update({ last_message_at: new Date().toISOString(), window_expires_at: windowExpires, status: "open" })
          .eq("id", conversation.id);
        if (contactId) {
          await adminClient.from("whatsapp_conversations").update({ contact_id: contactId }).eq("id", conversation.id).is("contact_id", null);
        }

        const row = messageRow(message);
        const { error: insertError } = await adminClient.from("whatsapp_messages").insert({
          brand_id: account.brand_id,
          conversation_id: conversation.id,
          direction: "inbound",
          wa_message_id: message.id,
          type: row.type,
          body: row.body,
          status: "delivered",
        });
        if (insertError) console.error("whatsapp-webhook: não foi possível guardar a mensagem", insertError.message);
      }
    }
  }

  return new Response("EVENT_RECEIVED", { status: 200 });
});
