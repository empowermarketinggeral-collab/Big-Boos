// EMPOWER OS — envia uma campanha de email via Resend.
// Chamado pelo frontend via supabase.functions.invoke("email-send", { body }).
//
// Limite deliberado de 500 destinatários por chamada — para volumes
// maiores, isto precisa de passar a fila/lote (ver secção 15 do
// documento de arquitetura); não construído já, por simplicidade.
// Só envia a contactos com opted_in_email = true, com email preenchido e
// sem a tag "rgpd:opt-out". O assunto e o corpo aceitam variáveis por
// contacto: {{primeiro_nome}}, {{nome}}, campos personalizados e valor de
// reserva ({{nome_marca|tua marca}}). Sem valor nem reserva, esse contacto
// é saltado (nunca sai um email com {{...}} visível).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Mesmo formato de variáveis das automações (automations-run).
function renderForContact(text, contact, escape = true) {
  if (!text) return { ok: true, value: text || "" };
  let ok = true;
  const value = text.replace(/\{\{\s*(\w+)\s*(?:\|([^{}]*))?\}\}/g, (_m, key, fallback) => {
    let v;
    if (key === "primeiro_nome") v = (contact.name || "").trim().split(/\s+/)[0];
    else if (key === "nome") v = contact.name;
    else if (key === "email") v = contact.email;
    else v = contact.custom_fields?.[key];
    if (v === undefined || v === null || String(v).trim() === "") {
      if (fallback !== undefined) return fallback;
      ok = false;
      return "";
    }
    if (!escape) return String(v);
    return String(v).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);
  });
  return { ok, value };
}

// Links assinados para a função email-click — mesmo formato do automations-run:
// {{clique:tag|destino}} (destino = URL ou campo do contacto com um URL),
// {{anular_subscricao}}, pixel de abertura e cabeçalho List-Unsubscribe.
const CLICK_BASE = `${Deno.env.get("SUPABASE_URL")}/functions/v1/email-click`;

function b64url(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

let linkKey = null;
async function signLink(payload) {
  if (!linkKey) {
    const secret = Deno.env.get("EMAIL_LINK_SECRET") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    linkKey = await crypto.subtle.importKey("raw", new TextEncoder().encode(`email-link:${secret}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  }
  return b64url(await crypto.subtle.sign("HMAC", linkKey, new TextEncoder().encode(payload))).slice(0, 32);
}

async function emailLink(brandId, contactId, action, extra = {}) {
  const p = b64url(new TextEncoder().encode(JSON.stringify({ b: brandId, c: contactId, a: action, ...extra })));
  return `${CLICK_BASE}?p=${p}&s=${await signLink(p)}${action === "o" ? "&o=1" : ""}`;
}

// Links da marca (CRM → Hotmart): {{link_<código>}}, hífens passam a "_".
async function brandLinks(admin, brandId) {
  const vars = {};
  const { data } = await admin.from("hotmart_products").select("slug, checkout_url").eq("brand_id", brandId);
  for (const p of data || []) if (p.checkout_url) vars[`link_${p.slug.replace(/-/g, "_")}`] = p.checkout_url;
  return vars;
}

// Devolve null se um link não tiver destino válido (o contacto é saltado).
async function renderTrackedLinks(text, brandId, contact, vars = {}) {
  let out = text || "";
  if (out.includes("{{anular_subscricao}}")) out = out.split("{{anular_subscricao}}").join(await emailLink(brandId, contact.id, "u"));
  for (const m of [...out.matchAll(/\{\{\s*clique:([^|{}]*)(?:\|([^{}]*))?\}\}/g)]) {
    const tag = m[1].trim();
    const dest = (m[2] || "").trim();
    let target = "";
    if (/^https?:\/\//i.test(dest)) target = dest;
    else if (dest) {
      const value = contact.custom_fields?.[dest] ?? vars[dest];
      if (!value || !/^https?:\/\//i.test(String(value))) return null;
      target = String(value);
    }
    const extra = {};
    if (tag) extra.t = tag;
    if (target) extra.u = target;
    out = out.replace(m[0], await emailLink(brandId, contact.id, "c", extra));
  }
  return out;
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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
  const { campaignId } = body;
  if (!campaignId) return json({ error: "Falta o campaignId." }, 400);

  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: campaign, error: campaignError } = await userClient
    .from("email_campaigns")
    .select("id, brand_id, domain_id, subject, body_html, status")
    .eq("id", campaignId)
    .maybeSingle();
  if (campaignError || !campaign) {
    return json({ error: "Sem acesso a esta campanha." }, 403);
  }
  if (campaign.status === "sent" || campaign.status === "sending") {
    return json({ error: "Esta campanha já foi enviada." }, 400);
  }
  if (/\[AJUSTAR/.test(`${campaign.subject} ${campaign.body_html || ""}`)) {
    return json({ error: "A campanha ainda tem texto por preencher ([AJUSTAR]). Edita-a antes de enviar." }, 400);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const { data: domain } = await adminClient
    .from("email_domains")
    .select("from_name, from_email, api_key_ref, reply_to")
    .eq("brand_id", campaign.brand_id)
    .maybeSingle();
  if (!domain) return json({ error: "Esta marca não tem email ligado." }, 400);

  const { data: apiKey } = await adminClient.rpc("vault_read_secret", { p_id: domain.api_key_ref });
  if (!apiKey) return json({ error: "Não foi possível obter a chave de envio." }, 500);

  const { contactIds } = body;
  if (!Array.isArray(contactIds) || contactIds.length === 0) {
    return json({ error: "Sem destinatários." }, 400);
  }
  if (contactIds.length > 500) {
    return json({ error: "Máximo de 500 destinatários por envio, por agora." }, 400);
  }

  const { data: contacts } = await adminClient
    .from("contacts")
    .select("id, name, email, opted_in_email, custom_fields")
    .in("id", contactIds)
    .eq("brand_id", campaign.brand_id);

  // Quem pediu para sair nunca recebe, mesmo que ainda tenha consentimento marcado.
  const optedOut = new Set();
  const { data: optOutTag } = await adminClient.from("tags").select("id").eq("brand_id", campaign.brand_id).ilike("name", "rgpd:opt-out").maybeSingle();
  if (optOutTag) {
    const { data: rows } = await adminClient.from("contact_tags").select("contact_id").eq("tag_id", optOutTag.id).in("contact_id", contactIds);
    for (const r of rows || []) optedOut.add(r.contact_id);
  }

  const from = domain.from_name ? `${domain.from_name} <${domain.from_email}>` : domain.from_email;
  const links = await brandLinks(adminClient, campaign.brand_id);

  await adminClient.from("email_campaigns").update({ status: "sending" }).eq("id", campaignId);

  let sent = 0, skipped = 0, failed = 0;
  for (const contact of contacts || []) {
    if (!contact.email || !contact.opted_in_email || optedOut.has(contact.id)) {
      skipped++;
      continue;
    }
    const subject = renderForContact(campaign.subject, contact, false);
    const tracked = await renderTrackedLinks(campaign.body_html || "", campaign.brand_id, contact, links);
    const html = tracked === null ? { ok: false, value: "" } : renderForContact(tracked, contact);
    if (!subject.ok || !html.ok) {
      skipped++;
      continue;
    }
    const unsubscribe = await emailLink(campaign.brand_id, contact.id, "u");
    const openPixel = `<img src="${await emailLink(campaign.brand_id, contact.id, "o")}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0">`;
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from, to: contact.email, subject: subject.value, html: html.value + openPixel,
        ...(domain.reply_to ? { reply_to: domain.reply_to } : {}),
        headers: { "List-Unsubscribe": `<${unsubscribe}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      console.error("Resend send failed", { contact: contact.email, status: res.status, data });
    }

    await adminClient.from("email_sends").insert({
      brand_id: campaign.brand_id,
      campaign_id: campaignId,
      contact_id: contact.id,
      provider_ref: data?.id || null,
      status: res.ok ? "sent" : "failed",
      error: res.ok ? null : data?.message || data?.error || JSON.stringify(data),
      sent_at: res.ok ? new Date().toISOString() : null,
    });

    if (res.ok) sent++;
    else failed++;
  }

  await adminClient.from("email_campaigns").update({ status: "sent" }).eq("id", campaignId);

  return json({ sent, skipped, failed });
});
