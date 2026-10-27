// EMPOWER OS — vendas e comportamentos da Hotmart para o Empower Hub (back-office
// dos sites). Só leitura de hotmart_events (gravados pelo hotmart-webhook).
//
//   GET https://<project>.supabase.co/functions/v1/hub-hotmart-feed?brand=<id>&since=<ISO>
//   Cabeçalho x-hub-key = HUB_FEED_SECRET (Edge Function Secrets; o mesmo valor
//   no Vercel do hub).
//
// Precisa de "Verify JWT" DESLIGADO: o hub não tem sessão do Big Boss; a
// segurança vem da chave partilhada. Devolve só os campos que o back-office
// mostra (sem documento, morada nem o pedido completo da Hotmart).
// Até 1000 eventos por pedido, do mais antigo para o mais recente depois de
// "since" (inclusive: o hub ignora repetidos pelo id); o hub pede de novo a
// partir do último até vir menos de 1000.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const str = (v, max = 200) => (typeof v === "string" || typeof v === "number" ? String(v).trim().slice(0, max) : "");
const num = (v) => (typeof v === "number" ? v : Number.isFinite(Number(v)) && v !== "" && v !== null ? Number(v) : null);

function safeEqual(a, b) {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

function pick(row) {
  const data = row.payload?.data || {};
  const purchase = data.purchase || {};
  const person = data.buyer || data.user || data.subscriber || {};
  const product = data.product || {};
  const price = purchase.price || purchase.full_price || {};
  return {
    id: row.id,
    created_at: row.created_at,
    event: row.event,
    status: row.status,
    error: row.error || "",
    product_id: row.hotmart_product_id || str(product.id, 40),
    product_name: str(product.name, 200),
    email: (row.buyer_email || str(person.email)).toLowerCase(),
    name: str(person.name, 120),
    phone: str(person.checkout_phone || person.phone || person.cellphone, 40),
    transaction: str(purchase.transaction, 80),
    purchase_status: str(purchase.status, 40),
    value: num(price.value),
    currency: str(price.currency_value || price.currency_code, 8),
    payment_type: str(purchase.payment?.type, 40),
    installments: num(purchase.payment?.installments_number),
    offer: str(purchase.offer?.code, 40),
    recurrence: num(purchase.recurrence_number),
    src: str(purchase.origin?.src, 120),
    sck: str(purchase.origin?.sck, 120),
    country: str(person.address?.country_iso || person.address?.country, 40),
    module: str(data.module?.name || data.class?.name || data.lesson?.name, 200),
  };
}

Deno.serve(async (req) => {
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);
  const secret = Deno.env.get("HUB_FEED_SECRET") || "";
  const key = req.headers.get("x-hub-key") || "";
  if (secret.length < 24 || !safeEqual(key, secret)) return json({ error: "Não autorizado." }, 401);

  const url = new URL(req.url);
  const brandId = url.searchParams.get("brand") || "";
  if (!/^[0-9a-f-]{36}$/i.test(brandId)) return json({ error: "Marca inválida." }, 400);
  const sinceRaw = url.searchParams.get("since") || "1970-01-01T00:00:00Z";
  const since = Number.isNaN(Date.parse(sinceRaw)) ? "1970-01-01T00:00:00Z" : new Date(sinceRaw).toISOString();

  const admin = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
  const [{ data: brand }, { data: rows, error }, { data: products }] = await Promise.all([
    admin.from("brands").select("id, name").eq("id", brandId).maybeSingle(),
    admin.from("hotmart_events")
      .select("id, created_at, event, status, error, hotmart_product_id, buyer_email, payload")
      .eq("brand_id", brandId).gte("created_at", since)
      .order("created_at", { ascending: true }).limit(1000),
    admin.from("hotmart_products").select("hotmart_product_id, slug, name, price").eq("brand_id", brandId),
  ]);
  if (!brand) return json({ error: "Marca não encontrada." }, 404);
  if (error) return json({ error: error.message }, 500);

  return json({ brand: brand.name, products: products || [], events: (rows || []).map(pick) });
});
