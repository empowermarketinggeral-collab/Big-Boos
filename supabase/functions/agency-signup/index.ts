// EMPOWER OS — completa o registo público de uma agência nova: cria a
// agencies + profiles (role agencia_admin) e devolve o URL de
// Checkout do Stripe para o plano escolhido. Chamado pelo frontend
// logo a seguir a supabase.auth.signUp(), via
// supabase.functions.invoke("agency-signup", { body }).
//
// Não depende de sessão/JWT (a confirmação de email pode atrasar a
// sessão) — a segurança vem de confirmar que o userId é mesmo um
// utilizador de auth real, com o email a bater certo, e que ainda não
// tem perfil (impede reaproveitar/sequestrar uma conta já usada).
// Por isso "Verify JWT" tem de ficar DESLIGADO nesta função.

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

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  let payload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Corpo do pedido inválido." }, 400);
  }
  const { userId, email, name, agencyName, planId, successUrl, cancelUrl } = payload;
  if (!userId || !email || !agencyName || !planId || !successUrl || !cancelUrl) {
    return json({ error: "Faltam campos obrigatórios." }, 400);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);

  const { data: authUser, error: authError } = await admin.auth.admin.getUserById(userId);
  if (authError || !authUser?.user || authUser.user.email?.toLowerCase() !== String(email).toLowerCase()) {
    return json({ error: "Utilizador inválido." }, 403);
  }

  const { data: existingProfile } = await admin.from("profiles").select("id").eq("id", userId).maybeSingle();
  if (existingProfile) return json({ error: "Esta conta já está associada a um perfil." }, 400);

  const { data: plan } = await admin.from("plans").select("id, stripe_price_id, name, contact_sales").eq("id", planId).eq("scope", "agency").maybeSingle();
  if (!plan || plan.contact_sales || !plan.stripe_price_id) return json({ error: "Plano inválido para registo direto." }, 400);

  const { data: agency, error: agencyError } = await admin
    .from("agencies")
    .insert({ name: agencyName, is_root: false, status: "active" })
    .select("id")
    .single();
  if (agencyError) return json({ error: agencyError.message }, 500);

  const { error: profileError } = await admin.from("profiles").insert({
    id: userId,
    name: name || agencyName,
    email,
    role: "agencia_admin",
    agency_id: agency.id,
  });
  if (profileError) {
    // Reverte a agência para não ficar órfã se o perfil falhar.
    await admin.from("agencies").delete().eq("id", agency.id);
    return json({ error: profileError.message }, 500);
  }

  const secretKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!secretKey) return json({ error: "Chave do Stripe não configurada." }, 500);

  const customer = await stripeRequest(secretKey, "customers", { name: agencyName, "metadata[agency_id]": agency.id });

  const session = await stripeRequest(secretKey, "checkout/sessions", {
    mode: "subscription",
    customer: customer.id,
    "line_items[0][price]": plan.stripe_price_id,
    "line_items[0][quantity]": "1",
    "subscription_data[metadata][agency_id]": agency.id,
    "subscription_data[metadata][plan_id]": planId,
    success_url: successUrl,
    cancel_url: cancelUrl,
  });

  return json({ url: session.url, agencyId: agency.id });
});
