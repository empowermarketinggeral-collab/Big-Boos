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

// Variáveis por contacto: {{primeiro_nome}}, {{nome}}, {{telefone}}, {{email}}
// e campos personalizados; {{campo|reserva}} usa a reserva se faltar o dado
// (reserva vazia = fica em branco). Sem valor nem reserva → ok=false.
function renderForContact(text, contact) {
  if (!text) return { ok: true, value: text || "" };
  let ok = true;
  const value = String(text).replace(/\{\{\s*(\w+)\s*(?:\|([^{}]*))?\}\}/g, (_m, key, fallback) => {
    let v;
    if (key === "primeiro_nome") v = (contact.name || "").trim().split(/\s+/)[0];
    else if (key === "nome") v = contact.name;
    else if (key === "email") v = contact.email;
    else if (key === "telefone" || key === "telemovel") v = contact.phone;
    else v = contact.custom_fields?.[key];
    if (v === undefined || v === null || String(v).trim() === "") {
      if (fallback !== undefined) return fallback;
      ok = false;
      return "";
    }
    return String(v);
  });
  return { ok, value };
}

// Quem nunca recebe campanhas: tags "Não contactar" e "rgpd:opt-out".
async function blockedContacts(admin, brandId, contactIds) {
  const out = new Set();
  const { data: tags } = await admin.from("tags").select("id, name").eq("brand_id", brandId);
  const ids = (tags || []).filter((t) => ["não contactar", "nao contactar", "rgpd:opt-out"].includes(String(t.name || "").trim().toLowerCase())).map((t) => t.id);
  if (!ids.length) return out;
  const { data: rows } = await admin.from("contact_tags").select("contact_id").in("tag_id", ids).in("contact_id", contactIds);
  for (const r of rows || []) out.add(r.contact_id);
  return out;
}

// Números guardados sem indicativo ("912 345 678") ou com 00: a Twilio só aceita +351….
function normalizePhone(raw) {
  let p = String(raw || "").trim().replace(/[\s().-]/g, "");
  if (p.startsWith("00")) p = "+" + p.slice(2);
  if (!p.startsWith("+")) {
    const d = p.replace(/\D/g, "");
    if (/^[29]\d{8}$/.test(d)) p = "+351" + d;
    else if (d.length >= 10) p = "+" + d;
    else return "";
  }
  const digits = p.slice(1).replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15 ? "+" + digits : "";
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
  // Envio em lotes de 500: o 1.º lote marca "sending", os seguintes continuam, o último marca "sent".
  const batchIndex = Number.isInteger(body.batchIndex) ? body.batchIndex : 0;
  const lastBatch = body.lastBatch !== false;
  const ignoreConsent = body.includeWithoutConsent === true;
  if (campaign.status === "sent") return json({ error: "Esta campanha já foi enviada." }, 400);
  if (campaign.status === "sending" && batchIndex === 0) return json({ error: "Esta campanha já está a ser enviada." }, 400);

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const { data: account } = await adminClient
    .from("whatsapp_accounts")
    .select("provider, phone_number_id, twilio_account_sid, access_token_ref")
    .eq("brand_id", campaign.brand_id)
    .maybeSingle();
  if (!account) return json({ error: "Esta marca não tem WhatsApp ligado." }, 400);

  const { data: template } = await adminClient.from("whatsapp_templates").select("id, name, language, twilio_content_sid, status").eq("id", campaign.template_id).eq("brand_id", campaign.brand_id).maybeSingle();
  if (!template) return json({ error: "Template da campanha não encontrado." }, 400);
  // O estado guardado no Big Boss não trava o envio: com Twilio, confirma lá.
  // Aprovado (ou sem resposta clara) → envia e a Twilio decide; só espera se a
  // Twilio disser claramente que ainda está pendente, e só para se estiver rejeitado.
  if (template.status !== "approved" && account.provider === "twilio" && template.twilio_content_sid) {
    let twilioSays = "";
    const { data: twToken } = await adminClient.rpc("vault_read_secret", { p_id: account.access_token_ref });
    if (twToken) {
      try {
        const res = await fetch(`https://content.twilio.com/v1/Content/${template.twilio_content_sid}/ApprovalRequests`, {
          headers: { Authorization: `Basic ${btoa(`${account.twilio_account_sid}:${twToken}`)}` },
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) twilioSays = String(data?.whatsapp?.status || "").toLowerCase();
      } catch { /* sem resposta: segue para o envio */ }
    }
    if (twilioSays === "approved") {
      await adminClient.from("whatsapp_templates").update({ status: "approved" }).eq("id", template.id);
      template.status = "approved";
    } else if (["rejected", "paused", "disabled"].includes(twilioSays)) {
      await adminClient.from("whatsapp_templates").update({ status: "rejected" }).eq("id", template.id);
      return json({ error: "O template desta campanha foi rejeitado ou pausado pelo WhatsApp. Escolha outro." }, 400);
    } else if (["pending", "received", "unsubmitted"].includes(twilioSays)) {
      return json({ error: "O template desta campanha ainda não foi aprovado.", retryLater: true }, 409);
    }
    // Qualquer outra resposta: envia (se não estiver aprovado, a Twilio recusa e o motivo fica registado).
  } else if (template.status === "rejected") {
    return json({ error: "O template desta campanha foi rejeitado pelo WhatsApp. Escolha outro." }, 400);
  } else if (template.status !== "approved" && account.provider !== "twilio") {
    return json({ error: "O template desta campanha ainda não foi aprovado.", retryLater: true }, 409);
  }
  if (account.provider === "twilio" && !String(template.twilio_content_sid || "").trim()) return json({ error: "O template não tem o Content SID da Twilio. Volte a registá-lo em WhatsApp, Templates." }, 400);

  const { data: token } = await adminClient.rpc("vault_read_secret", { p_id: account.access_token_ref });
  if (!token) return json({ error: "Não foi possível obter o token de acesso." }, 500);

  const { data: contacts } = await adminClient
    .from("contacts")
    .select("id, name, email, phone, opted_in_whatsapp, custom_fields")
    .in("id", contactIds)
    .eq("brand_id", campaign.brand_id);

  const blocked = await blockedContacts(adminClient, campaign.brand_id, contactIds);

  if (batchIndex === 0) await adminClient.from("whatsapp_campaigns").update({ status: "sending" }).eq("id", campaignId);

  let sent = 0, skipped = 0, failed = 0;
  const errors = new Set();
  for (const contact of contacts || []) {
    const toPhone = normalizePhone(contact.phone);
    if (!toPhone || (!contact.opted_in_whatsapp && !ignoreConsent) || blocked.has(contact.id)) {
      skipped++;
      continue;
    }
    // Variáveis do template com os dados desta pessoa (ex: {{primeiro_nome|}}).
    const rendered = (variableValues || []).map((v) => renderForContact(String(v ?? ""), contact));
    if (rendered.some((r) => !r.ok)) {
      skipped++;
      continue;
    }
    // O WhatsApp não aceita variáveis vazias: fica um espaço.
    const contactValues = rendered.map((r) => (r.value.trim() ? r.value : " "));

    let conversation = (
      await adminClient.from("whatsapp_conversations").select("id").eq("brand_id", campaign.brand_id).in("wa_contact_phone", [...new Set([toPhone, contact.phone])]).limit(1).maybeSingle()
    ).data;
    if (!conversation) {
      const { data: created } = await adminClient
        .from("whatsapp_conversations")
        .insert({ brand_id: campaign.brand_id, contact_id: contact.id, wa_contact_phone: toPhone })
        .select("id")
        .single();
      conversation = created;
    }

    const result = account.provider === "twilio"
      ? await sendTemplateViaTwilio(account.twilio_account_sid, token, account.phone_number_id, toPhone, template, contactValues)
      : await sendTemplateViaMeta(account.phone_number_id, token, toPhone.slice(1), template, contactValues);

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
    else { failed++; if (result.error) errors.add(result.error); }
  }

  // Se ninguém recebeu, volta a rascunho para se poder corrigir e tentar de novo.
  if (lastBatch) {
    const { count } = await adminClient.from("whatsapp_campaign_sends").select("id", { count: "exact", head: true }).eq("campaign_id", campaignId).eq("status", "sent");
    await adminClient.from("whatsapp_campaigns").update({ status: count ? "sent" : "draft" }).eq("id", campaignId);
  }

  return json({ sent, skipped, failed, errors: [...errors].slice(0, 5) });
});
