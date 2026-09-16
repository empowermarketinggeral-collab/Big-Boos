// EMPOWER OS — liga uma conta de rede social a uma marca.
// Chamado pelo frontend via supabase.functions.invoke("social-connect", { body }).
// O token de acesso NUNCA é guardado em claro — fica no Supabase Vault.
// Para instagram/facebook (únicas com publicação direta oficial) o
// token é obrigatório; para as restantes (tiktok/linkedin/threads),
// que ficam sempre "manual_only", não é preciso.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const PUBLISHABLE_PLATFORMS = ["instagram", "facebook"];

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
  const { brandId, platform, externalAccountId, displayName, accessToken } = body;
  if (!brandId || !platform || !displayName) {
    return json({ error: "Faltam campos obrigatórios." }, 400);
  }
  if (PUBLISHABLE_PLATFORMS.includes(platform) && (!externalAccountId || !accessToken)) {
    return json({ error: "Instagram/Facebook precisam do ID da conta e do token de acesso." }, 400);
  }

  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: brand, error: brandError } = await userClient.from("brands").select("id").eq("id", brandId).maybeSingle();
  if (brandError || !brand) {
    return json({ error: "Sem acesso a esta marca." }, 403);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  let accessTokenRef = null;
  if (accessToken) {
    const { data: secretId, error: vaultError } = await adminClient.rpc("vault_upsert_secret", {
      p_name: `social_token_${brandId}_${platform}`,
      p_secret: accessToken,
    });
    if (vaultError) {
      return json({ error: `Não foi possível guardar o token: ${vaultError.message}` }, 500);
    }
    accessTokenRef = secretId;
  }

  const { data: existing } = await adminClient
    .from("social_accounts")
    .select("id")
    .eq("brand_id", brandId)
    .eq("platform", platform)
    .maybeSingle();

  const payload = {
    brand_id: brandId,
    platform,
    external_account_id: externalAccountId || null,
    display_name: displayName,
    status: "connected",
    ...(accessTokenRef ? { access_token_ref: accessTokenRef } : {}),
  };
  const { error: upsertError } = existing
    ? await adminClient.from("social_accounts").update(payload).eq("id", existing.id)
    : await adminClient.from("social_accounts").insert(payload);
  if (upsertError) {
    return json({ error: upsertError.message }, 500);
  }

  return json({ ok: true });
});
