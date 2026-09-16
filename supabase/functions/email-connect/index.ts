// EMPOWER OS — liga um domínio de email (Resend) a uma marca.
// Chamado pelo frontend via supabase.functions.invoke("email-connect", { body }).
// A API key NUNCA é guardada em claro — fica no Supabase Vault
// (ver supabase/31_whatsapp_vault_helpers.sql); só o id do segredo
// fica em email_domains.api_key_ref.

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
  const { brandId, domain, fromName, fromEmail, apiKey } = body;
  if (!brandId || !domain || !fromEmail || !apiKey) {
    return json({ error: "Faltam campos obrigatórios." }, 400);
  }

  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: brand, error: brandError } = await userClient.from("brands").select("id").eq("id", brandId).maybeSingle();
  if (brandError || !brand) {
    return json({ error: "Sem acesso a esta marca." }, 403);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const secretName = `email_api_key_${brandId}`;
  const { data: secretId, error: vaultError } = await adminClient.rpc("vault_upsert_secret", {
    p_name: secretName,
    p_secret: apiKey,
  });
  if (vaultError) {
    return json({ error: `Não foi possível guardar a chave: ${vaultError.message}` }, 500);
  }

  const { data: existing } = await adminClient.from("email_domains").select("id").eq("brand_id", brandId).maybeSingle();
  const payload = { brand_id: brandId, domain, from_name: fromName || null, from_email: fromEmail, verified: true, api_key_ref: secretId };
  const { error: upsertError } = existing
    ? await adminClient.from("email_domains").update(payload).eq("id", existing.id)
    : await adminClient.from("email_domains").insert(payload);
  if (upsertError) {
    return json({ error: upsertError.message }, 500);
  }

  return json({ ok: true });
});
