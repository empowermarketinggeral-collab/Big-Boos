// EMPOWER OS — envia um SMS avulso a um contacto ou número, fora do
// contexto de automações/lembretes. Chamado pelo frontend via
// supabase.functions.invoke("sms-send", { body }).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function sendSmsText(admin, brandId, toPhone, body, contactId) {
  const { data: account } = await admin.from("sms_accounts").select("account_sid, from_number, auth_token_ref").eq("brand_id", brandId).maybeSingle();
  if (!account) throw new Error("Esta marca não tem SMS ligado.");

  const { data: token } = await admin.rpc("vault_read_secret", { p_id: account.auth_token_ref });
  if (!token) throw new Error("Não foi possível obter o token de acesso.");

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${account.account_sid}/Messages.json`, {
    method: "POST",
    headers: { Authorization: `Basic ${btoa(`${account.account_sid}:${token}`)}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ From: account.from_number, To: toPhone, Body: body }),
  });
  const data = await res.json();

  await admin.from("sms_messages").insert({
    brand_id: brandId, contact_id: contactId || null, to_number: toPhone, body, direction: "outbound",
    provider_ref: data?.sid || null, status: res.ok ? "sent" : "failed", error: res.ok ? null : data?.message || null,
  });
  if (!res.ok) throw new Error(data?.message || "Falha ao enviar SMS.");
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
  const { brandId, contactId, toPhone, text } = body;
  if (!brandId || !toPhone || !text) {
    return json({ error: "Faltam campos obrigatórios." }, 400);
  }

  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: brand, error: brandError } = await userClient.from("brands").select("id").eq("id", brandId).maybeSingle();
  if (brandError || !brand) {
    return json({ error: "Sem acesso a esta marca." }, 403);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  // contactId vem do pedido — confirma que pertence mesmo a esta
  // marca antes de o ligar à mensagem (evita ligar um contacto de
  // outra marca por engano ou de propósito).
  let verifiedContactId = null;
  if (contactId) {
    const { data: contact } = await adminClient.from("contacts").select("id").eq("id", contactId).eq("brand_id", brandId).maybeSingle();
    verifiedContactId = contact?.id || null;
  }

  try {
    await sendSmsText(adminClient, brandId, toPhone, text, verifiedContactId);
  } catch (err) {
    return json({ error: err?.message || "Falha ao enviar SMS." }, 502);
  }

  return json({ ok: true });
});
