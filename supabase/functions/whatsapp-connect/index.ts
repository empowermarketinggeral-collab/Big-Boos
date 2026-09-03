// EMPOWER OS — liga uma conta WhatsApp Business (Meta Cloud API) a uma marca.
// Chamado pelo frontend via supabase.functions.invoke("whatsapp-connect", { body }).
// O token de acesso NUNCA é guardado em claro — fica no Supabase Vault
// (ver supabase/31_whatsapp_vault_helpers.sql); só o id do segredo fica
// em whatsapp_accounts.access_token_ref.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const authHeader = req.headers.get("Authorization") || "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Corpo do pedido inválido." }), { status: 400 });
  }
  const { brandId, wabaId, phoneNumberId, displayPhone, accessToken } = body;
  if (!brandId || !wabaId || !phoneNumberId || !accessToken) {
    return new Response(JSON.stringify({ error: "Faltam campos obrigatórios." }), { status: 400 });
  }

  // Cliente "como o utilizador" — confirma, via RLS, que ele pode
  // mesmo gerir esta marca. Nunca confiamos no brandId do pedido
  // sem esta verificação.
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: brand, error: brandError } = await userClient
    .from("brands")
    .select("id")
    .eq("id", brandId)
    .maybeSingle();
  if (brandError || !brand) {
    return new Response(JSON.stringify({ error: "Sem acesso a esta marca." }), { status: 403 });
  }

  // Só depois de confirmado o acesso é que usamos a service role,
  // que ignora RLS, para guardar o segredo e a conta.
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const secretName = `whatsapp_token_${brandId}`;
  const { data: secretId, error: vaultError } = await adminClient.rpc("vault_upsert_secret", {
    p_name: secretName,
    p_secret: accessToken,
  });
  if (vaultError) {
    return new Response(JSON.stringify({ error: `Não foi possível guardar o token: ${vaultError.message}` }), { status: 500 });
  }

  const { error: upsertError } = await adminClient.from("whatsapp_accounts").upsert(
    {
      brand_id: brandId,
      waba_id: wabaId,
      phone_number_id: phoneNumberId,
      display_phone: displayPhone || null,
      access_token_ref: secretId,
      status: "connected",
    },
    { onConflict: "brand_id" }
  );
  if (upsertError) {
    return new Response(JSON.stringify({ error: upsertError.message }), { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
});
