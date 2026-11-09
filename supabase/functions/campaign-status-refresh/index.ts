// EMPOWER OS — atualiza o estado das mensagens de uma campanha (WhatsApp ou
// SMS) perguntando à Twilio por cada uma. Serve para campanhas enviadas antes
// de existir o aviso de estado (StatusCallback) e para confirmar à mão.
// Chamado pelo browser: { channel: "whatsapp" | "sms", campaignId }.
// Trata até 150 mensagens por chamada; devolve quantas faltam e lastId (a app repete com afterId).
//
// "Verify JWT" LIGADO.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const TWILIO_ERRORS = {
  "63003": "Este número não tem WhatsApp.",
  "63016": "Fora da janela de 24 horas: só se pode enviar um template aprovado.",
  "63018": "Limite de envios do número atingido. Tente mais tarde.",
  "63024": "Número de destino inválido.",
  "63027": "Template com variáveis em falta ou a mais.",
  "63030": "Template não aprovado ou com parâmetros errados.",
  "63032": "A pessoa não aceita mensagens desta empresa (bloqueou ou saiu).",
  "63049": "A Meta não entregou esta mensagem de marketing (limite de mensagens de marketing que esta pessoa recebe).",
  "63112": "A conta do WhatsApp Business foi limitada pela Meta.",
  "21211": "Número de telefone inválido.",
  "21610": "A pessoa pediu para não receber SMS (STOP).",
  "21614": "Este número não recebe SMS.",
  "30003": "O telemóvel está desligado ou sem rede.",
  "30005": "Número desconhecido ou que já não existe.",
  "30006": "Número fixo ou operadora que não recebe SMS.",
  "30007": "Mensagem filtrada pela operadora (considerada spam).",
  "30008": "Erro desconhecido da operadora.",
};
const errorText = (code, msg) => (code ? TWILIO_ERRORS[String(code)] || `Erro ${code} da Twilio.` : msg || "Não foi entregue.");
const BATCH = 150;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY"), { global: { headers: { Authorization: req.headers.get("Authorization") || "" } } });
  const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));

  let body;
  try { body = await req.json(); } catch { return json({ error: "Corpo do pedido inválido." }, 400); }
  const channel = body.channel === "sms" ? "sms" : "whatsapp";
  const campaignTable = channel === "sms" ? "sms_campaigns" : "whatsapp_campaigns";

  // Acesso: a campanha tem de ser visível para quem pede.
  const { data: campaign } = await userClient.from(campaignTable).select("id, brand_id").eq("id", body.campaignId || "").maybeSingle();
  if (!campaign) return json({ error: "Sem acesso a esta campanha." }, 403);

  // Conta Twilio da marca.
  let accountSid, tokenRef;
  if (channel === "sms") {
    const { data: acc } = await admin.from("sms_accounts").select("account_sid, auth_token_ref").eq("brand_id", campaign.brand_id).maybeSingle();
    accountSid = acc?.account_sid; tokenRef = acc?.auth_token_ref;
  } else {
    const { data: acc } = await admin.from("whatsapp_accounts").select("provider, twilio_account_sid, access_token_ref").eq("brand_id", campaign.brand_id).maybeSingle();
    if (acc?.provider !== "twilio") return json({ error: "Só disponível para WhatsApp ligado pela Twilio." }, 400);
    accountSid = acc.twilio_account_sid; tokenRef = acc.access_token_ref;
  }
  if (!accountSid || !tokenRef) return json({ error: "Conta Twilio não ligada." }, 400);
  const { data: token } = await admin.rpc("vault_read_secret", { p_id: tokenRef });
  if (!token) return json({ error: "Não foi possível obter o token da Twilio." }, 500);
  const auth = `Basic ${btoa(`${accountSid}:${token}`)}`;

  // Mensagens ainda sem confirmação.
  const sendsTable = channel === "sms" ? "sms_messages" : "whatsapp_campaign_sends";
  const sidCol = channel === "sms" ? "provider_ref" : "wa_message_id";
  const pendingQuery = () => admin.from(sendsTable).select(`id, ${sidCol}, status`, { count: "exact" })
    .eq("campaign_id", campaign.id).in("status", ["queued", "sent"]).not(sidCol, "is", null);
  // Avança por id (afterId) para não repetir as que continuam sem confirmação.
  let q = pendingQuery();
  if (typeof body.afterId === "string" && body.afterId) q = q.gt("id", body.afterId);
  const { data: rows, count } = await q.order("id").limit(BATCH);

  let updated = 0, unchanged = 0;
  for (const r of rows || []) {
    const sid = r[sidCol];
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages/${sid}.json`, { headers: { Authorization: auth } });
    const m = await res.json().catch(() => ({}));
    if (!res.ok) { unchanged++; continue; }
    const st = String(m.status || "").toLowerCase();
    let status = st === "read" ? "read" : st === "delivered" ? "delivered" : st === "undelivered" || st === "failed" ? "failed" : null;
    if (channel === "sms" && status === "read") status = "delivered";
    if (!status) { unchanged++; continue; }
    const error = status === "failed" ? errorText(m.error_code, m.error_message) : null;
    await admin.from(sendsTable).update({ status, error }).eq("id", r.id);
    if (channel === "whatsapp") await admin.from("whatsapp_messages").update({ status }).eq("brand_id", campaign.brand_id).eq("wa_message_id", sid);
    updated++;
  }
  const lastId = rows?.length ? rows[rows.length - 1].id : null;
  const remaining = Math.max(0, (count || 0) - (rows || []).length);
  return json({ ok: true, updated, unchanged, remaining, lastId });
});
