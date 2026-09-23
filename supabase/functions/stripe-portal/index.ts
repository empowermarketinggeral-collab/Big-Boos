// EMPOWER OS — cria uma sessão do Portal do Cliente do Stripe, onde a
// marca gere/cancela a sua subscrição sozinha (cartão, fatura-mãe,
// histórico). Chamado pelo frontend via
// supabase.functions.invoke("stripe-portal", { body }).

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

  let payload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Corpo do pedido inválido." }, 400);
  }
  const { brandId, returnUrl } = payload;
  if (!brandId || !returnUrl) return json({ error: "Faltam campos obrigatórios." }, 400);

  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: brand, error: brandError } = await userClient.from("brands").select("id").eq("id", brandId).maybeSingle();
  if (brandError || !brand) return json({ error: "Sem acesso a esta marca." }, 403);

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const secretKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!secretKey) return json({ error: "Chave do Stripe não configurada." }, 500);

  const { data: sub } = await adminClient.from("subscriptions").select("stripe_customer_ref").eq("brand_id", brandId).maybeSingle();
  if (!sub?.stripe_customer_ref) return json({ error: "Esta marca ainda não tem subscrição." }, 400);

  const res = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
    method: "POST",
    headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ customer: sub.stripe_customer_ref, return_url: returnUrl }),
  });
  const data = await res.json();
  if (!res.ok) return json({ error: data?.error?.message || "Falha ao abrir o portal." }, 502);

  return json({ url: data.url });
});
