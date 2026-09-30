// EMPOWER OS — lê os produtos e preços do Stripe PRÓPRIO da marca
// (brand_stripe_accounts, chave no Vault) para os importar como serviços
// e upsells do Agendamento. Só lê: quem grava é o painel da equipa, depois
// de a pessoa escolher o que é serviço, o que é upsell e o que fica de fora.
//
// Chamado com { brandId }. Devolve os produtos ativos com os preços ativos
// (pagamento único), o nome, a descrição e os metadados de cada um.
//
// "Verify JWT" LIGADO. Só quem gere a marca (can_manage_brand).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// Lista paginada do Stripe (até 1000 itens).
async function listAll(key, path) {
  const out = [];
  let after = null;
  for (let page = 0; page < 10; page++) {
    const url = new URL(`https://api.stripe.com/v1/${path}`);
    url.searchParams.set("limit", "100");
    url.searchParams.set("active", "true");
    if (after) url.searchParams.set("starting_after", after);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error?.message || `Stripe HTTP ${res.status}`);
    out.push(...(data.data || []));
    if (!data.has_more || !data.data?.length) break;
    after = data.data[data.data.length - 1].id;
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization") || "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

  let body;
  try { body = await req.json(); } catch { return json({ error: "Corpo do pedido inválido." }, 400); }
  const { brandId } = body;
  if (!brandId) return json({ error: "Faltam campos obrigatórios." }, 400);

  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: brand } = await userClient.from("brands").select("id").eq("id", brandId).maybeSingle();
  if (!brand) return json({ error: "Sem acesso a esta marca." }, 403);
  const { data: canManage } = await userClient.rpc("can_manage_brand", { target_brand: brandId });
  if (canManage !== true) return json({ error: "Só a equipa da marca pode importar do Stripe." }, 403);

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const { data: account } = await admin.from("brand_stripe_accounts").select("secret_key_ref").eq("brand_id", brandId).maybeSingle();
  if (!account?.secret_key_ref) return json({ error: "Liga primeiro o Stripe da marca (App, packs e pagamentos)." }, 400);
  const { data: key } = await admin.rpc("vault_read_secret", { p_id: account.secret_key_ref });
  if (!key) return json({ error: "Não foi possível ler a chave do Stripe. Liga o Stripe outra vez." }, 500);

  try {
    const [products, prices] = await Promise.all([listAll(key, "products"), listAll(key, "prices")]);
    const byProduct = new Map();
    for (const p of prices) {
      if (p.type !== "one_time" || p.unit_amount == null) continue;
      const pid = typeof p.product === "string" ? p.product : p.product?.id;
      if (!byProduct.has(pid)) byProduct.set(pid, []);
      byProduct.get(pid).push({ id: p.id, nickname: p.nickname || "", amount: p.unit_amount / 100, currency: p.currency, metadata: p.metadata || {} });
    }
    const out = products.map((pr) => ({
      id: pr.id,
      name: pr.name,
      description: pr.description || "",
      metadata: pr.metadata || {},
      defaultPrice: typeof pr.default_price === "string" ? pr.default_price : pr.default_price?.id || null,
      prices: (byProduct.get(pr.id) || []).sort((a, b) => a.amount - b.amount),
    }));
    return json({ products: out });
  } catch (err) {
    return json({ error: `Stripe: ${err.message}` }, 502);
  }
});
