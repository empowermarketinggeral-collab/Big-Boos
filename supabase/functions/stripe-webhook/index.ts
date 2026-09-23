// EMPOWER OS — recebe eventos do Stripe (subscrição criada/atualizada/
// cancelada, de marcas OU agências) e mantém a tabela "subscriptions"
// em sincronia. Regista este URL, depois do deploy, em Stripe →
// Developers → Webhooks → "Add endpoint":
// https://<project>.supabase.co/functions/v1/stripe-webhook
// Eventos a subscrever: customer.subscription.created,
// customer.subscription.updated, customer.subscription.deleted.
//
// Precisa de "Verify JWT" DESLIGADO (o Stripe não manda um JWT do
// Supabase) — a segurança aqui vem da verificação da assinatura
// abaixo, com o segredo que o Stripe te dá ao criares o endpoint.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const encoder = new TextEncoder();

async function verifyStripeSignature(rawBody, signatureHeader, secret) {
  const parts = Object.fromEntries((signatureHeader || "").split(",").map((p) => p.split("=")));
  const timestamp = parts.t;
  const expectedSig = parts.v1;
  if (!timestamp || !expectedSig) return false;

  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signed = await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${rawBody}`));
  const computedSig = Array.from(new Uint8Array(signed)).map((b) => b.toString(16).padStart(2, "0")).join("");

  if (computedSig.length !== expectedSig.length) return false;
  let diff = 0;
  for (let i = 0; i < computedSig.length; i++) diff |= computedSig.charCodeAt(i) ^ expectedSig.charCodeAt(i);
  return diff === 0;
}

const STRIPE_STATUS_MAP = {
  trialing: "trialing", active: "active", past_due: "past_due", canceled: "canceled",
  unpaid: "past_due", incomplete: "trialing", incomplete_expired: "canceled", paused: "canceled",
};

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  const signatureHeader = req.headers.get("stripe-signature");
  const rawBody = await req.text();

  if (!webhookSecret || !signatureHeader || !(await verifyStripeSignature(rawBody, signatureHeader, webhookSecret))) {
    return new Response("Assinatura inválida.", { status: 400 });
  }

  const event = JSON.parse(rawBody);
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const admin = createClient(supabaseUrl, serviceRoleKey);

  if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated") {
    const sub = event.data.object;
    const brandId = sub.metadata?.brand_id || null;
    const agencyId = sub.metadata?.agency_id || null;

    if (brandId || agencyId) {
      const priceId = sub.items?.data?.[0]?.price?.id;
      let planId = sub.metadata?.plan_id || null;
      if (!planId && priceId) {
        const { data: plan } = await admin.from("plans").select("id").eq("stripe_price_id", priceId).maybeSingle();
        planId = plan?.id || null;
      }

      const newStatus = STRIPE_STATUS_MAP[sub.status] || "active";
      const ownerColumn = brandId ? "brand_id" : "agency_id";
      const ownerId = brandId || agencyId;

      // past_due_since só é marcado na primeira vez que entra em
      // atraso, e limpo assim que deixa de estar — é a partir dele
      // que o aviso no topo da app conta os 7+3 dias.
      const { data: existing } = await admin.from("subscriptions").select("status, past_due_since").eq(ownerColumn, ownerId).maybeSingle();
      let pastDueSince = existing?.past_due_since || null;
      if (newStatus === "past_due" && existing?.status !== "past_due") pastDueSince = new Date().toISOString();
      else if (newStatus !== "past_due") pastDueSince = null;

      await admin.from("subscriptions").upsert(
        {
          brand_id: brandId,
          agency_id: agencyId,
          plan_id: planId,
          stripe_customer_ref: sub.customer,
          stripe_subscription_ref: sub.id,
          status: newStatus,
          current_period_end: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
          past_due_since: pastDueSince,
        },
        { onConflict: ownerColumn }
      );
    }
  }

  if (event.type === "customer.subscription.deleted") {
    const sub = event.data.object;
    await admin.from("subscriptions").update({ status: "canceled" }).eq("stripe_subscription_ref", sub.id);
  }

  return new Response(JSON.stringify({ received: true }), { status: 200, headers: { "Content-Type": "application/json" } });
});
