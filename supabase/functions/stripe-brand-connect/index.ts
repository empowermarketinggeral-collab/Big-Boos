// EMPOWER OS — liga a conta Stripe da PRÓPRIA marca (ex: Dream Studio),
// para os sinais das marcações e os packs caírem na conta dela e não na
// da plataforma.
// Chamado pelo frontend (Agendamento → Pagamentos online) com
// { brandId, secretKey } para ligar, ou { brandId, action: "disconnect" }.
//
// Com a chave, esta função:
//   1. confirma a chave no Stripe (GET /v1/account);
//   2. cria na conta da marca o webhook para o stripe-brand-webhook
//      (checkout.session.completed / expired) e fica com o segredo dele;
//   3. guarda a chave e o segredo do webhook no Vault — nunca em claro.
// Só a equipa da agência (can_manage_brand) pode ligar/desligar.
//
// "Verify JWT" LIGADO.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function stripe(key, method, path, params = null) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: params ? new URLSearchParams(params) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

// Apaga webhooks antigos desta marca nessa conta (religar não duplica).
async function removeOldEndpoints(key, webhookUrl) {
  const { ok, data } = await stripe(key, "GET", "webhook_endpoints?limit=100");
  if (!ok) return;
  for (const ep of data.data || []) {
    if (ep.url === webhookUrl) await stripe(key, "DELETE", `webhook_endpoints/${ep.id}`);
  }
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
  const { brandId, secretKey, action } = body;
  if (!brandId) return json({ error: "Falta a marca." }, 400);

  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: brand } = await userClient.from("brands").select("id").eq("id", brandId).maybeSingle();
  const { data: canManage } = await userClient.rpc("can_manage_brand", { target_brand: brandId });
  if (!brand || canManage !== true) {
    return json({ error: "Só a equipa da agência pode ligar o Stripe desta marca." }, 403);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const webhookUrl = `${supabaseUrl}/functions/v1/stripe-brand-webhook?brand=${brandId}`;

  if (action === "disconnect") {
    const { data: existing } = await admin.from("brand_stripe_accounts").select("secret_key_ref").eq("brand_id", brandId).maybeSingle();
    if (existing?.secret_key_ref) {
      const { data: oldKey } = await admin.rpc("vault_read_secret", { p_id: existing.secret_key_ref });
      if (oldKey) await removeOldEndpoints(oldKey, webhookUrl);
    }
    await admin.from("brand_stripe_accounts").delete().eq("brand_id", brandId);
    return json({ ok: true });
  }

  const key = String(secretKey || "").trim();
  if (!/^(sk|rk)_(test|live)_[A-Za-z0-9]+$/.test(key)) {
    return json({ error: "Isto não parece uma chave secreta do Stripe (começa por sk_live_ ou sk_test_)." }, 400);
  }

  const account = await stripe(key, "GET", "account");
  if (!account.ok) {
    return json({ error: account.data?.error?.message || "O Stripe recusou esta chave." }, 400);
  }
  const accountName =
    account.data?.settings?.dashboard?.display_name || account.data?.business_profile?.name || account.data?.email || account.data?.id;

  await removeOldEndpoints(key, webhookUrl);
  const endpoint = await stripe(key, "POST", "webhook_endpoints", {
    url: webhookUrl,
    "enabled_events[0]": "checkout.session.completed",
    "enabled_events[1]": "checkout.session.expired",
    description: "Big Boss: sinais de marcações e packs",
  });
  if (!endpoint.ok || !endpoint.data?.secret) {
    return json({ error: endpoint.data?.error?.message || "Não foi possível criar o webhook no Stripe (a chave precisa de acesso a Webhook Endpoints)." }, 400);
  }

  const { data: keyRef, error: keyError } = await admin.rpc("vault_upsert_secret", { p_name: `stripe_secret_key_${brandId}`, p_secret: key });
  const { data: hookRef, error: hookError } = await admin.rpc("vault_upsert_secret", { p_name: `stripe_webhook_secret_${brandId}`, p_secret: endpoint.data.secret });
  if (keyError || hookError) {
    return json({ error: `Não foi possível guardar a chave: ${(keyError || hookError).message}` }, 500);
  }

  const { error: upsertError } = await admin.from("brand_stripe_accounts").upsert({
    brand_id: brandId,
    account_id: account.data?.id || null,
    account_name: accountName,
    livemode: key.includes("_live_"),
    secret_key_ref: keyRef,
    webhook_secret_ref: hookRef,
    webhook_endpoint_id: endpoint.data.id,
    connected_at: new Date().toISOString(),
  }, { onConflict: "brand_id" });
  if (upsertError) return json({ error: upsertError.message }, 500);

  return json({ ok: true, accountName, livemode: key.includes("_live_") });
});
