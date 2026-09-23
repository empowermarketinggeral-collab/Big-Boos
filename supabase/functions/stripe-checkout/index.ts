// EMPOWER OS — cria uma sessão de Checkout do Stripe para uma marca
// ou uma agência subscrever um plano (mutuamente exclusivo — vem
// sempre um brandId OU um agencyId, nunca os dois). Chamado pelo
// frontend via supabase.functions.invoke("stripe-checkout", { body }).
//
// A chave secreta do Stripe é um segredo único da plataforma (não por
// marca, ao contrário do Twilio/Meta) — vive como "Secret" das Edge
// Functions (Project Settings → Edge Functions → Secrets no
// Dashboard), lido via Deno.env.get, tal como SUPABASE_URL. Nome:
// STRIPE_SECRET_KEY.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function stripeRequest(secretKey, path, params) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || "Falha ao comunicar com o Stripe.");
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization") || "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

  let payload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Corpo do pedido inválido." }, 400);
  }
  const { brandId, agencyId, planId, successUrl, cancelUrl } = payload;
  if ((!brandId && !agencyId) || (brandId && agencyId) || !planId || !successUrl || !cancelUrl) {
    return json({ error: "Faltam campos obrigatórios (ou vieram brandId e agencyId ao mesmo tempo)." }, 400);
  }

  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  let ownerName;
  if (brandId) {
    const { data: brand, error: brandError } = await userClient.from("brands").select("id, name").eq("id", brandId).maybeSingle();
    if (brandError || !brand) return json({ error: "Sem acesso a esta marca." }, 403);
    ownerName = brand.name;
  } else {
    const { data: agency, error: agencyError } = await userClient.from("agencies").select("id, name").eq("id", agencyId).maybeSingle();
    if (agencyError || !agency) return json({ error: "Sem acesso a esta agência." }, 403);
    ownerName = agency.name;
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const secretKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!secretKey) return json({ error: "Chave do Stripe não configurada (STRIPE_SECRET_KEY em falta nos Secrets do projeto)." }, 500);

  const { data: plan } = await adminClient.from("plans").select("id, stripe_price_id, name").eq("id", planId).maybeSingle();
  if (!plan || !plan.stripe_price_id) return json({ error: "Plano não encontrado ou sem Price ID do Stripe." }, 400);

  // Reaproveita o customer do Stripe se já existir uma subscrição
  // anterior (ainda que cancelada) — evita clientes duplicados.
  const ownerColumn = brandId ? "brand_id" : "agency_id";
  const ownerId = brandId || agencyId;
  const { data: existingSub } = await adminClient.from("subscriptions").select("stripe_customer_ref").eq(ownerColumn, ownerId).maybeSingle();
  let customerId = existingSub?.stripe_customer_ref;

  if (!customerId) {
    const customer = await stripeRequest(secretKey, "customers", { name: ownerName, [`metadata[${ownerColumn}]`]: ownerId });
    customerId = customer.id;
  }

  const session = await stripeRequest(secretKey, "checkout/sessions", {
    mode: "subscription",
    customer: customerId,
    "line_items[0][price]": plan.stripe_price_id,
    "line_items[0][quantity]": "1",
    [`subscription_data[metadata][${ownerColumn}]`]: ownerId,
    "subscription_data[metadata][plan_id]": planId,
    success_url: successUrl,
    cancel_url: cancelUrl,
  });

  return json({ url: session.url });
});
