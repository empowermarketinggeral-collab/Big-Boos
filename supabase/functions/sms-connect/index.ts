// EMPOWER OS — liga uma conta Twilio (SMS) a uma marca.
// Chamado pelo frontend via supabase.functions.invoke("sms-connect", { body }).
// O Auth Token NUNCA é guardado em claro — fica no Supabase Vault.

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
  const { brandId, accountSid, fromNumber, authToken } = body;
  if (!brandId || !accountSid || !fromNumber || !authToken) {
    return json({ error: "Faltam campos obrigatórios." }, 400);
  }

  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: brand, error: brandError } = await userClient.from("brands").select("id").eq("id", brandId).maybeSingle();
  if (brandError || !brand) {
    return json({ error: "Sem acesso a esta marca." }, 403);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const { data: secretId, error: vaultError } = await adminClient.rpc("vault_upsert_secret", {
    p_name: `sms_auth_token_${brandId}`,
    p_secret: authToken,
  });
  if (vaultError) {
    return json({ error: `Não foi possível guardar o token: ${vaultError.message}` }, 500);
  }

  const { data: existing } = await adminClient.from("sms_accounts").select("id").eq("brand_id", brandId).maybeSingle();
  const payload = { brand_id: brandId, account_sid: accountSid, from_number: fromNumber, auth_token_ref: secretId, status: "connected" };
  const { error: upsertError } = existing
    ? await adminClient.from("sms_accounts").update(payload).eq("id", existing.id)
    : await adminClient.from("sms_accounts").insert(payload);
  if (upsertError) {
    return json({ error: upsertError.message }, 500);
  }

  return json({ ok: true });
});
