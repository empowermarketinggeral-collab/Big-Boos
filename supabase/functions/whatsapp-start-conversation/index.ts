// EMPOWER OS — inicia uma conversa nova de WhatsApp (ou reabre uma
// fechada há mais de 24h) enviando um template aprovado. Fora da
// janela de 24h desde a última mensagem do cliente, só um template
// aprovado consegue mandar a primeira mensagem — regra da própria
// WhatsApp/Meta. Chamado pelo frontend via
// supabase.functions.invoke("whatsapp-start-conversation", { body }).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function sendTemplateViaMeta(phoneNumberId, token, toPhone, template, variableValues) {
  const parameters = (variableValues || []).map((v) => ({ type: "text", text: String(v) }));
  const res = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: toPhone,
      type: "template",
      template: {
        name: template.name,
        language: { code: template.language || "pt_PT" },
        components: parameters.length ? [{ type: "body", parameters }] : [],
      },
    }),
  });
  const data = await res.json();
  return { ok: res.ok, id: data?.messages?.[0]?.id || null, error: data?.error?.message };
}

async function sendTemplateViaTwilio(accountSid, authToken, fromNumber, toPhone, template, variableValues) {
  const contentVariables = {};
  (variableValues || []).forEach((v, i) => { contentVariables[String(i + 1)] = String(v); });

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: "POST",
    headers: { Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      From: `whatsapp:${fromNumber}`,
      To: `whatsapp:${toPhone}`,
      ContentSid: template.twilio_content_sid,
      ContentVariables: JSON.stringify(contentVariables),
    }),
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
  const { brandId, phone, contactId, templateId, variableValues } = payload;
  if (!brandId || !phone || !templateId) return json({ error: "Faltam campos obrigatórios." }, 400);

  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: brand, error: brandError } = await userClient.from("brands").select("id").eq("id", brandId).maybeSingle();
  if (brandError || !brand) return json({ error: "Sem acesso a esta marca." }, 403);

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const { data: account } = await adminClient
    .from("whatsapp_accounts")
    .select("provider, phone_number_id, twilio_account_sid, access_token_ref")
    .eq("brand_id", brandId)
    .maybeSingle();
  if (!account) return json({ error: "Esta marca não tem WhatsApp ligado." }, 400);

  const { data: template } = await adminClient
    .from("whatsapp_templates")
    .select("id, name, language, twilio_content_sid, status")
    .eq("id", templateId)
    .eq("brand_id", brandId)
    .maybeSingle();
  if (!template) return json({ error: "Template não encontrado." }, 404);
  if (template.status !== "approved") return json({ error: "Este template ainda não foi aprovado." }, 400);

  const { data: token } = await adminClient.rpc("vault_read_secret", { p_id: account.access_token_ref });
  if (!token) return json({ error: "Não foi possível obter o token de acesso." }, 500);

  // contactId vem do pedido — confirma que pertence mesmo a esta
  // marca antes de o ligar à conversa.
  let verifiedContactId = null;
  if (contactId) {
    const { data: contact } = await adminClient.from("contacts").select("id").eq("id", contactId).eq("brand_id", brandId).maybeSingle();
    verifiedContactId = contact?.id || null;
  }

  let conversation = (
    await adminClient.from("whatsapp_conversations").select("id").eq("brand_id", brandId).eq("wa_contact_phone", phone).maybeSingle()
  ).data;
  if (!conversation) {
    const { data: created, error: createError } = await adminClient
      .from("whatsapp_conversations")
      .insert({ brand_id: brandId, contact_id: verifiedContactId, wa_contact_phone: phone })
      .select("id")
      .single();
    if (createError) return json({ error: createError.message }, 500);
    conversation = created;
  }

  const result = account.provider === "twilio"
    ? await sendTemplateViaTwilio(account.twilio_account_sid, token, account.phone_number_id, phone, template, variableValues)
    : await sendTemplateViaMeta(account.phone_number_id, token, phone, template, variableValues);

  await adminClient.from("whatsapp_messages").insert({
    brand_id: brandId,
    conversation_id: conversation.id,
    direction: "outbound",
    wa_message_id: result.id,
    type: "template",
    template_name: template.name,
    status: result.ok ? "sent" : "failed",
  });

  if (!result.ok) return json({ error: result.error || "Falha ao enviar o template." }, 502);

  await adminClient
    .from("whatsapp_conversations")
    .update({ last_message_at: new Date().toISOString(), window_expires_at: new Date(Date.now() + 24 * 3600000).toISOString(), status: "open" })
    .eq("id", conversation.id);

  return json({ ok: true, conversationId: conversation.id });
});
