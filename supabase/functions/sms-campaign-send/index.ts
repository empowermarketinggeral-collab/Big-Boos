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
  if (campaign.status === "sent" || campaign.status === "sending") return json({ error: "Esta campanha já foi enviada." }, 400);

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const { data: account } = await adminClient.from("sms_accounts").select("account_sid, from_number, auth_token_ref").eq("brand_id", campaign.brand_id).maybeSingle();
  if (!account) return json({ error: "Esta marca não tem SMS ligado." }, 400);

  const { data: token } = await adminClient.rpc("vault_read_secret", { p_id: account.auth_token_ref });
  if (!token) return json({ error: "Não foi possível obter o token de acesso." }, 500);

  const { data: contacts } = await adminClient
    .from("contacts")
    .select("id, phone, opted_in_sms")
    .in("id", contactIds)
    .eq("brand_id", campaign.brand_id);

  await adminClient.from("sms_campaigns").update({ status: "sending" }).eq("id", campaignId);

  let sent = 0, skipped = 0, failed = 0;
  for (const contact of contacts || []) {
    if (!contact.phone || !contact.opted_in_sms) {
      skipped++;
      continue;
    }

    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${account.account_sid}/Messages.json`, {
      method: "POST",
      headers: { Authorization: `Basic ${btoa(`${account.account_sid}:${token}`)}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ From: account.from_number, To: contact.phone, Body: campaign.body }),
    });
    const data = await res.json();

    await adminClient.from("sms_messages").insert({
      brand_id: campaign.brand_id,
      campaign_id: campaignId,
      contact_id: contact.id,
      to_number: contact.phone,
      body: campaign.body,
      direction: "outbound",
      provider_ref: data?.sid || null,
      status: res.ok ? "sent" : "failed",
      error: res.ok ? null : data?.message || null,
    });

    if (res.ok) sent++;
    else failed++;
  }

  await adminClient.from("sms_campaigns").update({ status: "sent" }).eq("id", campaignId);

  return json({ sent, skipped, failed });
});
