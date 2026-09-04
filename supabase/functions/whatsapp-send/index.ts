// EMPOWER OS — envia uma mensagem de texto WhatsApp para o contacto de
// uma conversa existente, usando o token guardado no Vault da marca.
// Chamado pelo frontend via supabase.functions.invoke("whatsapp-send", { body }).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

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

  // Confirma, via RLS, que o utilizador pode ver esta conversa (e
  // portanto a marca a que pertence) antes de fazermos nada como admin.
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
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
    .select("phone_number_id, access_token_ref")
    .eq("brand_id", conversation.brand_id)
    .maybeSingle();
  if (accountError || !account) {
    return json({ error: "Esta marca não tem WhatsApp ligado." }, 400);
  }

  const { data: token, error: tokenError } = await adminClient.rpc("vault_read_secret", {
    p_id: account.access_token_ref,
  });
  if (tokenError || !token) {
    return json({ error: "Não foi possível obter o token de acesso." }, 500);
  }

  const metaRes = await fetch(`https://graph.facebook.com/v20.0/${account.phone_number_id}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: conversation.wa_contact_phone,
      type: "text",
      text: { body },
    }),
  });
  const metaData = await metaRes.json();

  if (!metaRes.ok) {
    await adminClient.from("whatsapp_messages").insert({
      brand_id: conversation.brand_id,
      conversation_id: conversationId,
      direction: "outbound",
      type: "text",
      body,
      status: "failed",
    });
    return json({ error: metaData?.error?.message || "Falha ao enviar a mensagem." }, 502);
  }

  const waMessageId = metaData?.messages?.[0]?.id || null;
  await adminClient.from("whatsapp_messages").insert({
    brand_id: conversation.brand_id,
    conversation_id: conversationId,
    direction: "outbound",
    wa_message_id: waMessageId,
    type: "text",
    body,
    status: "sent",
  });
  await adminClient
    .from("whatsapp_conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", conversationId);

  return json({ ok: true });
});
