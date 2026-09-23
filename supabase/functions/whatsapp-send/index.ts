// EMPOWER OS — envia uma mensagem de texto WhatsApp para o contacto de
// uma conversa existente, usando o token guardado no Vault da marca.
// Suporta os dois fornecedores ligados em whatsapp-connect: 'meta'
// (Cloud API direta) e 'twilio' (alternativa — ver docs/GUIA_TWILIO.md).
// Chamado pelo frontend via supabase.functions.invoke("whatsapp-send", { body }).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function sendViaMeta(phoneNumberId, token, toPhone, body) {
  const res = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: toPhone, type: "text", text: { body } }),
  });
  const data = await res.json();
  return { ok: res.ok, id: data?.messages?.[0]?.id || null, error: data?.error?.message };
}

async function sendViaTwilio(accountSid, authToken, fromNumber, toPhone, body) {
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ From: `whatsapp:${fromNumber}`, To: `whatsapp:${toPhone}`, Body: body }),
  });
  const data = await res.json();
  return { ok: res.ok, id: data?.sid || null, error: data?.message };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization") || "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

  let payload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Corpo do pedido inválido." }, 400);
  }
  const { conversationId, body } = payload;
  if (!conversationId || !body) {
    return json({ error: "Faltam campos obrigatórios." }, 400);
  }

  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: conversation, error: convError } = await userClient
    .from("whatsapp_conversations")
    .select("id, brand_id, wa_contact_phone")
    .eq("id", conversationId)
    .maybeSingle();
  if (convError || !conversation) {
    return json({ error: "Sem acesso a esta conversa." }, 403);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const { data: account, error: accountError } = await adminClient
    .from("whatsapp_accounts")
    .select("provider, phone_number_id, twilio_account_sid, access_token_ref")
    .eq("brand_id", conversation.brand_id)
    .maybeSingle();
  if (accountError || !account) {
    return json({ error: "Esta marca não tem WhatsApp ligado." }, 400);
  }

  const { data: token, error: tokenError } = await adminClient.rpc("vault_read_secret", { p_id: account.access_token_ref });
  if (tokenError || !token) {
    return json({ error: "Não foi possível obter o token de acesso." }, 500);
  }

  const result = account.provider === "twilio"
    ? await sendViaTwilio(account.twilio_account_sid, token, account.phone_number_id, conversation.wa_contact_phone, body)
    : await sendViaMeta(account.phone_number_id, token, conversation.wa_contact_phone, body);

  await adminClient.from("whatsapp_messages").insert({
    brand_id: conversation.brand_id,
    conversation_id: conversationId,
    direction: "outbound",
    wa_message_id: result.id,
    type: "text",
    body,
    status: result.ok ? "sent" : "failed",
  });

  if (!result.ok) {
    return json({ error: result.error || "Falha ao enviar a mensagem." }, 502);
  }

  await adminClient.from("whatsapp_conversations").update({ last_message_at: new Date().toISOString() }).eq("id", conversationId);

  return json({ ok: true });
});
