// EMPOWER OS — compra de um pack de sessões pela app das clientes
// (/app/<slug>). Cria o pack da cliente como "pending_payment" e devolve
// o link do Stripe Checkout na conta Stripe DA MARCA
// (brand_stripe_accounts). O stripe-brand-webhook ativa o pack quando o
// pagamento passa.
// Body: { brandId, packId, successUrl, cancelUrl }
//
// Acesso: a cliente tem de ter sessão iniciada e conta ligada a esta
// marca (client_accounts, lida com o userClient — a RLS só lhe mostra a
// dela). O pack tem de ser da mesma marca e estar ativo.
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

const isHttpUrl = (v) => typeof v === "string" && /^https?:\/\//i.test(v);

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
  const { brandId, packId, successUrl, cancelUrl } = body;
  if (!brandId || !packId) return json({ error: "Faltam campos obrigatórios." }, 400);

  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: userData } = await userClient.auth.getUser();
  const user = userData?.user;
  if (!user) return json({ error: "Entra na tua conta para comprar." }, 401);
  const { data: account } = await userClient.from("client_accounts").select("contact_id").eq("user_id", user.id).eq("brand_id", brandId).maybeSingle();
  if (!account) return json({ error: "A tua conta não está ligada a esta marca." }, 403);

  const admin = createClient(supabaseUrl, serviceRoleKey);

  const { data: pack } = await admin
    .from("booking_packs")
    .select("id, name, description, price, sessions_count, service_ids, validity_days, status")
    .eq("id", packId).eq("brand_id", brandId).maybeSingle();
  if (!pack || pack.status !== "active") return json({ error: "Este pack já não está disponível." }, 404);

  const { data: contact } = await admin.from("contacts").select("id, email").eq("id", account.contact_id).eq("brand_id", brandId).maybeSingle();
  if (!contact) return json({ error: "Ficha de cliente não encontrada." }, 404);

  const { data: stripeAccount } = await admin.from("brand_stripe_accounts").select("secret_key_ref").eq("brand_id", brandId).maybeSingle();
  const { data: secretKey } = stripeAccount?.secret_key_ref
    ? await admin.rpc("vault_read_secret", { p_id: stripeAccount.secret_key_ref })
    : { data: null };
  if (!secretKey) return json({ error: "Os pagamentos online ainda não estão ativos. Fala connosco para comprar este pack." }, 503);

  const { data: clientPack, error: insertError } = await admin.from("client_packs").insert({
    brand_id: brandId,
    contact_id: contact.id,
    pack_id: pack.id,
    name: pack.name,
    service_ids: pack.service_ids || [],
    sessions_total: pack.sessions_count,
    status: "pending_payment",
    source: "app",
  }).select("id").single();
  if (insertError) return json({ error: insertError.message }, 500);

  const origin = req.headers.get("origin") || "";
  const params = new URLSearchParams({
    mode: "payment",
    "line_items[0][price_data][currency]": "eur",
    "line_items[0][price_data][product_data][name]": `${pack.name} (${pack.sessions_count} sessões)`,
    "line_items[0][price_data][unit_amount]": String(Math.round(Number(pack.price) * 100)),
    "line_items[0][quantity]": "1",
    "metadata[type]": "pack_purchase",
    "metadata[brand_id]": brandId,
    "metadata[client_pack_id]": clientPack.id,
    "metadata[validity_days]": String(pack.validity_days || 0),
    expires_at: String(Math.floor(Date.now() / 1000) + 31 * 60),
    success_url: isHttpUrl(successUrl) ? successUrl : origin,
    cancel_url: isHttpUrl(cancelUrl) ? cancelUrl : origin,
  });
  if (pack.description) params.set("line_items[0][price_data][product_data][description]", pack.description.slice(0, 500));
  if (contact.email) params.set("customer_email", contact.email);

  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });
  const session = await res.json();
  if (!res.ok) {
    await admin.from("client_packs").update({ status: "cancelled" }).eq("id", clientPack.id);
    return json({ error: session?.error?.message || "Não foi possível iniciar o pagamento." }, 502);
  }
  await admin.from("client_packs").update({ stripe_checkout_session_id: session.id }).eq("id", clientPack.id);

  return json({ ok: true, paymentUrl: session.url });
});
