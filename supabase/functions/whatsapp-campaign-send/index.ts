// EMPOWER OS — envia uma campanha de WhatsApp (por template aprovado)
// a uma lista de contactos. Chamado pelo frontend via
// supabase.functions.invoke("whatsapp-campaign-send", { body }).
//
// Mesmo limite de 500 destinatários por chamada que o email-send, e
// pela mesma razão (ver esse ficheiro). Só envia a contactos com
// opted_in_whatsapp = true e telefone preenchido.

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
      template: { name: template.name, language: { code: template.language || "pt_PT" }, components: parameters.length ? [{ type: "body", parameters }] : [] },
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
    body: new URLSearchParams({ From: `whatsapp:${fromNumber}`, To: `whatsapp:${toPhone}`, ContentSid: template.twilio_content_sid, ContentVariables: JSON.stringify(contentVariables) }),
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

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Corpo do pedido inválido." }, 400);
  }
  const { campaignId, contactIds, variableValues } = body;
  if (!campaignId) return json({ error: "Falta o campaignId." }, 400);
  if (!Array.isArray(contactIds) || contactIds.length === 0) return json({ error: "Sem destinatários." }, 400);
  if (contactIds.length > 500) return json({ error: "Máximo de 500 destinatários por envio, por agora." }, 400);

  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: campaign, error: campaignError } = await userClient
    .from("whatsapp_campaigns")
    .select("id, brand_id, template_id, status")
    .eq("id", campaignId)
    .maybeSingle();
  if (campaignError || !campaign) return json({ error: "Sem acesso a esta campanha." }, 403);
  if (campaign.status === "sent" || campaign.status === "sending") return json({ error: "Esta campanha já foi enviada." }, 400);

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const { data: account } = await adminClient
    .from("whatsapp_accounts")
    .select("provider, phone_number_id, twilio_account_sid, access_token_ref")
    .eq("brand_id", campaign.brand_id)
    .maybeSingle();
  if (!account) return json({ error: "Esta marca não tem WhatsApp ligado." }, 400);

  const { data: template } = await adminClient.from("whatsapp_templates").select("id, name, language, twilio_content_sid, status").eq("id", campaign.template_id).eq("brand_id", campaign.brand_id).maybeSingle();
  if (!template) return json({ error: "Template da campanha não encontrado." }, 400);
  if (template.status !== "approved") return json({ error: "O template desta campanha ainda não foi aprovado." }, 400);

  const { data: token } = await adminClient.rpc("vault_read_secret", { p_id: account.access_token_ref });
  if (!token) return json({ error: "Não foi possível obter o token de acesso." }, 500);

  const { data: contacts } = await adminClient
    .from("contacts")
    .select("id, phone, opted_in_whatsapp")
    .in("id", contactIds)
    .eq("brand_id", campaign.brand_id);

  await adminClient.from("whatsapp_campaigns").update({ status: "sending" }).eq("id", campaignId);

  let sent = 0, skipped = 0, failed = 0;
  for (const contact of contacts || []) {
    if (!contact.phone || !contact.opted_in_whatsapp) {
      skipped++;
      continue;
    }

    let conversation = (
      await adminClient.from("whatsapp_conversations").select("id").eq("brand_id", campaign.brand_id).eq("wa_contact_phone", contact.phone).maybeSingle()
    ).data;
    if (!conversation) {
      const { data: created } = await adminClient
        .from("whatsapp_conversations")
        .insert({ brand_id: campaign.brand_id, contact_id: contact.id, wa_contact_phone: contact.phone })
        .select("id")
        .single();
      conversation = created;
    }

    const result = account.provider === "twilio"
      ? await sendTemplateViaTwilio(account.twilio_account_sid, token, account.phone_number_id, contact.phone, template, variableValues)
      : await sendTemplateViaMeta(account.phone_number_id, token, contact.phone, template, variableValues);

    if (conversation) {
      await adminClient.from("whatsapp_messages").insert({
        brand_id: campaign.brand_id, conversation_id: conversation.id, direction: "outbound",
        wa_message_id: result.id, type: "template", template_name: template.name, status: result.ok ? "sent" : "failed",
      });
      await adminClient.from("whatsapp_conversations").update({
        last_message_at: new Date().toISOString(), window_expires_at: new Date(Date.now() + 24 * 3600000).toISOString(), status: "open",
      }).eq("id", conversation.id);
    }

    await adminClient.from("whatsapp_campaign_sends").insert({
      brand_id: campaign.brand_id, campaign_id: campaignId, contact_id: contact.id,
      wa_message_id: result.id, status: result.ok ? "sent" : "failed", error: result.ok ? null : result.error,
      sent_at: result.ok ? new Date().toISOString() : null,
    });

    if (result.ok) sent++;
    else failed++;
  }

  await adminClient.from("whatsapp_campaigns").update({ status: "sent" }).eq("id", campaignId);

  return json({ sent, skipped, failed });
});
