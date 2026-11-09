// EMPOWER OS — envia uma campanha de SMS a uma lista de contactos.
// Chamado pelo frontend via supabase.functions.invoke("sms-campaign-send", { body }).
//
// Ao contrário do WhatsApp, um SMS normal não tem restrição de janela
// de 24h nem precisa de template aprovado — só de opted_in_sms = true.
// Mesmo limite de 500 destinatários por chamada que as outras campanhas.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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

// Motivos mais comuns da Twilio, em português (o resto fica com a mensagem original).
const TWILIO_ERRORS = {
  "21211": "Número de telefone inválido.",
  "21408": "Envios para este país não estão ativos na conta Twilio.",
  "21610": "A pessoa pediu para não receber mensagens (STOP).",
  "21614": "Este número não recebe SMS.",
  "63003": "Este número não tem WhatsApp.",
  "63016": "Fora da janela de 24 horas: só se pode enviar um template aprovado.",
  "63018": "Limite de envios do número atingido. Tente mais tarde.",
  "63024": "Número de destino inválido.",
  "63027": "Template com variáveis em falta ou a mais.",
  "63030": "Template não aprovado ou com parâmetros errados.",
  "63032": "A pessoa não aceita mensagens desta empresa (bloqueou ou saiu).",
  "63049": "A Meta não entregou esta mensagem de marketing (limite de mensagens de marketing que esta pessoa recebe).",
  "63112": "A conta do WhatsApp Business foi limitada pela Meta.",
};
const twilioError = (data) => (data?.code && TWILIO_ERRORS[String(data.code)]) || data?.message || null;

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
  const { campaignId, contactIds } = body;
  if (!campaignId) return json({ error: "Falta o campaignId." }, 400);
  if (!Array.isArray(contactIds) || contactIds.length === 0) return json({ error: "Sem destinatários." }, 400);
  if (contactIds.length > 500) return json({ error: "Máximo de 500 destinatários por envio, por agora." }, 400);

  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: campaign, error: campaignError } = await userClient
    .from("sms_campaigns")
    .select("id, brand_id, body, status")
    .eq("id", campaignId)
    .maybeSingle();
  if (campaignError || !campaign) return json({ error: "Sem acesso a esta campanha." }, 403);
  // Envio em lotes de 500: o 1.º lote marca "sending", os seguintes continuam, o último marca "sent".
  const batchIndex = Number.isInteger(body.batchIndex) ? body.batchIndex : 0;
  const lastBatch = body.lastBatch !== false;
  const ignoreConsent = body.includeWithoutConsent === true;
  if (campaign.status === "sent") return json({ error: "Esta campanha já foi enviada." }, 400);
  if (campaign.status === "sending" && batchIndex === 0) return json({ error: "Esta campanha já está a ser enviada." }, 400);
  if (!String(campaign.body || "").trim()) return json({ error: "A campanha não tem texto guardado. Escreva a mensagem e carregue em Guardar." }, 400);

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const { data: account } = await adminClient.from("sms_accounts").select("account_sid, from_number, auth_token_ref").eq("brand_id", campaign.brand_id).maybeSingle();
  if (!account) return json({ error: "Esta marca não tem SMS ligado." }, 400);

  const { data: token } = await adminClient.rpc("vault_read_secret", { p_id: account.auth_token_ref });
  if (!token) return json({ error: "Não foi possível obter o token de acesso." }, 500);

  const { data: contacts } = await adminClient
    .from("contacts")
    .select("id, name, email, phone, opted_in_sms, custom_fields")
    .in("id", contactIds)
    .eq("brand_id", campaign.brand_id);

  const blocked = await blockedContacts(adminClient, campaign.brand_id, contactIds);

  if (batchIndex === 0) await adminClient.from("sms_campaigns").update({ status: "sending" }).eq("id", campaignId);

  let sent = 0, skipped = 0, failed = 0;
  const errors = new Set();
  for (const contact of contacts || []) {
    const toPhone = normalizePhone(contact.phone);
    if (!toPhone || (!contact.opted_in_sms && !ignoreConsent) || blocked.has(contact.id)) {
      skipped++;
      continue;
    }
    const text = renderForContact(campaign.body, contact);
    if (!text.ok || !text.value.trim()) {
      skipped++;
      continue;
    }

    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${account.account_sid}/Messages.json`, {
      method: "POST",
      headers: { Authorization: `Basic ${btoa(`${account.account_sid}:${token}`)}`, "Content-Type": "application/x-www-form-urlencoded" },
      // StatusCallback: a Twilio avisa quando o SMS é entregue ou falha.
      body: new URLSearchParams({ From: account.from_number, To: toPhone, Body: text.value, StatusCallback: `${supabaseUrl}/functions/v1/twilio-whatsapp-webhook` }),
    });
    const data = await res.json();

    await adminClient.from("sms_messages").insert({
      brand_id: campaign.brand_id,
      campaign_id: campaignId,
      contact_id: contact.id,
      to_number: toPhone,
      body: text.value,
      direction: "outbound",
      provider_ref: data?.sid || null,
      status: res.ok ? "sent" : "failed",
      error: res.ok ? null : twilioError(data),
    });

    if (res.ok) sent++;
    else { failed++; const why = twilioError(data); if (why) errors.add(why); }
  }

  // Se ninguém recebeu, volta a rascunho para se poder corrigir e tentar de novo.
  if (lastBatch) {
    const { count } = await adminClient.from("sms_messages").select("id", { count: "exact", head: true }).eq("campaign_id", campaignId).eq("status", "sent");
    await adminClient.from("sms_campaigns").update({ status: count ? "sent" : "draft" }).eq("id", campaignId);
  }

  return json({ sent, skipped, failed, errors: [...errors].slice(0, 5) });
});
