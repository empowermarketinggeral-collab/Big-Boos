// EMPOWER OS — liga uma conta WhatsApp Business a uma marca.
// Chamado pelo frontend via supabase.functions.invoke("whatsapp-connect", { body }).
// Suporta dois fornecedores: 'meta' (Cloud API direta, precisa de
// verificação de negócio da Meta) e 'twilio' (alternativa quando essa
// verificação fica bloqueada — ver docs/GUIA_TWILIO.md).
// O token/auth token NUNCA é guardado em claro — fica no Supabase Vault.

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
  const { brandId, provider, wabaId, phoneNumberId, displayPhone, accessToken, twilioAccountSid } = body;
  if (!brandId || !provider) {
    return json({ error: "Faltam campos obrigatórios." }, 400);
  }
  if (provider === "meta" && (!wabaId || !phoneNumberId || !accessToken)) {
    return json({ error: "WABA ID, Phone Number ID e o token de acesso são obrigatórios." }, 400);
  }
  if (provider === "twilio" && (!twilioAccountSid || !phoneNumberId || !accessToken)) {
    return json({ error: "Account SID, número de WhatsApp e Auth Token são obrigatórios." }, 400);
  }

  // Twilio: o número de envio fica sempre como +351912345678 (sem "whatsapp:",
  // espaços ou traços) e é também o número mostrado, para nunca divergirem.
  let fromNumber = String(phoneNumberId).trim();
  if (provider === "twilio") {
    const digits = fromNumber.replace(/^whatsapp:/i, "").replace(/^00/, "").replace(/\D/g, "");
    if (digits.length < 8) return json({ error: "Número de WhatsApp inválido. Use o formato +351912345678." }, 400);
    fromNumber = `+${digits}`;
  }

  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: brand, error: brandError } = await userClient.from("brands").select("id").eq("id", brandId).maybeSingle();
  if (brandError || !brand) {
    return json({ error: "Sem acesso a esta marca." }, 403);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const secretName = `whatsapp_token_${brandId}`;
  const { data: secretId, error: vaultError } = await adminClient.rpc("vault_upsert_secret", {
    p_name: secretName,
    p_secret: accessToken,
  });
  if (vaultError) {
    return json({ error: `Não foi possível guardar o token: ${vaultError.message}` }, 500);
  }

  const { error: upsertError } = await adminClient.from("whatsapp_accounts").upsert(
    {
      brand_id: brandId,
      provider,
      waba_id: provider === "meta" ? wabaId : null,
      phone_number_id: fromNumber,
      twilio_account_sid: provider === "twilio" ? twilioAccountSid : null,
      display_phone: provider === "twilio" ? fromNumber : displayPhone || null,
      access_token_ref: secretId,
      status: "connected",
    },
    { onConflict: "brand_id" }
  );
  if (upsertError) {
    return json({ error: upsertError.message }, 500);
  }

  return json({ ok: true });
});
