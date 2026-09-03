// EMPOWER OS — recebe mensagens e eventos da Meta WhatsApp Cloud API.
// Regista este URL (depois de fazeres deploy) no painel da app Meta,
// em WhatsApp > Configuration > Webhook, junto com o WHATSAPP_VERIFY_TOKEN
// definido nos "Secrets" desta função no Supabase.
//
// GET  — handshake de verificação exigido pela Meta ao registares o webhook.
// POST — eventos reais (mensagens recebidas, estados de entrega, etc.).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN") || "";

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

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  let payload;
  try {
    payload = await req.json();
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

        if (!conversation) {
          const { data: created } = await adminClient
            .from("whatsapp_conversations")
            .insert({ brand_id: account.brand_id, wa_contact_phone: from })
            .select("id")
            .single();
          conversation = created;
        }

        const windowExpires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        await adminClient
          .from("whatsapp_conversations")
          .update({ last_message_at: new Date().toISOString(), window_expires_at: windowExpires, status: "open" })
          .eq("id", conversation.id);

        await adminClient.from("whatsapp_messages").insert({
          brand_id: account.brand_id,
          conversation_id: conversation.id,
          direction: "inbound",
          wa_message_id: message.id,
          type: message.type || "text",
          body: message.text?.body || null,
          status: "delivered",
        });
      }
    }
  }

  return new Response("EVENT_RECEIVED", { status: 200 });
});
