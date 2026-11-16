// EMPOWER OS — carregar saldo de mensagens (SMS e WhatsApp) pelo Stripe.
//
//   POST { brandId, amountEur, returnUrl? }  (sessão da equipa ou do cliente da marca)
//   → { url } do Stripe Checkout (pagamento único em euros).
//
// O pagamento é registado pelo stripe-webhook (metadata type
// "messaging_topup") em messaging_credits (migração 114).
// Usa a chave global STRIPE_SECRET_KEY (o dinheiro entra na conta da agência,
// que paga a Twilio).
//
// "Verify JWT" LIGADO.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const appBase = () => {
  const raw = String(Deno.env.get("APP_URL") || "https://big-boos.vercel.app").trim();
  try { return new URL(raw).origin; } catch { return "https://big-boos.vercel.app"; }
};
// Só volta para o próprio Big Boss (o mesmo endereço do APP_URL ou um *.vercel.app do projeto).
function safeReturn(url, fallback) {
  try {
    const u = new URL(String(url || ""));
    const base = new URL(appBase());
    if (u.protocol === "https:" && (u.host === base.host || /^big-boo[a-z0-9-]*\.vercel\.app$/i.test(u.host))) return u.toString();
  } catch { /* usa o de reserva */ }
  return fallback;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const secretKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!secretKey) return json({ error: "Pagamentos ainda não configurados (falta STRIPE_SECRET_KEY)." }, 500);

  let body = {};
  try { body = await req.json(); } catch { return json({ error: "Corpo do pedido inválido." }, 400); }
  const brandId = String(body?.brandId || "");
  const amount = Math.round(Number(body?.amountEur) * 100) / 100;
  if (!/^[0-9a-f-]{36}$/i.test(brandId)) return json({ error: "Falta a marca." }, 400);
  if (!Number.isFinite(amount) || amount < 10 || amount > 5000) return json({ error: "Escolha um valor entre 10 € e 5000 €." }, 400);

  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: req.headers.get("Authorization") || "" } } });
  const { data: auth } = await userClient.auth.getUser();
  if (!auth?.user) return json({ error: "Sem sessão." }, 401);
  const { data: brand } = await userClient.from("brands").select("id, name").eq("id", brandId).maybeSingle();
  if (!brand) return json({ error: "Sem acesso a esta marca." }, 403);

  const fallback = `${appBase()}/?v=marcas&marca=${brandId}&m=whatsapp&aba=custos`;
  const back = safeReturn(body.returnUrl, fallback);
  const withFlag = (u, flag) => `${u}${u.includes("?") ? "&" : "?"}${flag}`;

  const params = new URLSearchParams({
    mode: "payment",
    "line_items[0][price_data][currency]": "eur",
    "line_items[0][price_data][product_data][name]": `Saldo de mensagens (SMS e WhatsApp): ${brand.name}`.slice(0, 250),
    "line_items[0][price_data][unit_amount]": String(Math.round(amount * 100)),
    "line_items[0][quantity]": "1",
    "metadata[type]": "messaging_topup",
    "metadata[brand_id]": brandId,
    "metadata[user_id]": auth.user.id,
    "payment_intent_data[metadata][type]": "messaging_topup",
    "payment_intent_data[metadata][brand_id]": brandId,
    success_url: withFlag(back, "saldo=ok"),
    cancel_url: back,
  });
  if (auth.user.email) params.set("customer_email", auth.user.email);

  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });
  const session = await res.json().catch(() => ({}));
  if (!res.ok || !session?.url) return json({ error: session?.error?.message || "O Stripe não criou o pagamento." }, 502);
  return json({ url: session.url });
});
