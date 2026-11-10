// EMPOWER OS — gastos de mensagens (SMS e WhatsApp) por marca e por mês.
//
//   POST { month: "2026-11", brandIds?: [..] }  (sessão do utilizador)
//
// Para cada marca a que o utilizador tem acesso (RLS de brands), pergunta à
// Twilio o uso da conta nesse mês (/Usage/Records.json com StartDate/EndDate)
// e separa SMS, WhatsApp e outros (números, etc.). Se a mesma conta Twilio
// servir várias marcas, o custo divide-se pelas mensagens de cada uma.
// Conta as mensagens enviadas e recebidas pelo Big Boss nesse mês.
// Aplica a margem da agência (messaging_cost_settings, 5% por omissão).
// A equipa recebe custo, margem e valor a cobrar; o cliente só o valor a cobrar.
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
const CLIENT_ROLES = ["aprovador_marca", "agencia_aprovador"];
const round = (v, d = 2) => Math.round((Number(v) || 0) * 10 ** d) / 10 ** d;

// Soma só as categorias "folha" (sem subcategorias na lista) para não contar duas vezes.
function leafSum(records, match) {
  const cats = records.filter((r) => match(r.category));
  const names = cats.map((r) => r.category);
  return cats
    .filter((r) => !names.some((n) => n !== r.category && n.startsWith(`${r.category}-`)))
    .reduce((s, r) => s + Math.abs(Number(r.price) || 0), 0);
}

async function twilioUsage(sid, token, start, end) {
  const records = [];
  let url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Usage/Records.json?StartDate=${start}&EndDate=${end}&PageSize=1000`;
  for (let page = 0; url && page < 5; page++) {
    const res = await fetch(url, { headers: { Authorization: `Basic ${btoa(`${sid}:${token}`)}` }, signal: AbortSignal.timeout(15000) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(/not active/i.test(data?.message || "") ? "Conta Twilio suspensa." : data?.message || `Erro ${res.status} da Twilio.`);
    records.push(...(data.usage_records || []));
    url = data.next_page_uri ? `https://api.twilio.com${data.next_page_uri}` : null;
  }
  const currency = String(records.find((r) => r.price_unit)?.price_unit || "USD").toUpperCase();
  const totalRec = records.find((r) => r.category === "totalprice");
  const isSms = (c) => c === "sms" || c.startsWith("sms-") || c === "mms" || c.startsWith("mms-");
  const isWa = (c) => c === "channels-whatsapp" || c.startsWith("channels-whatsapp-") || c === "whatsapp" || c.startsWith("whatsapp-");
  const sms = leafSum(records, isSms);
  const whatsapp = leafSum(records, isWa);
  const total = totalRec ? Math.abs(Number(totalRec.price) || 0) : sms + whatsapp;
  return { sms, whatsapp, other: Math.max(0, total - sms - whatsapp), total, currency };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const authHeader = req.headers.get("Authorization") || "";

  let body = {};
  try { body = await req.json(); } catch { return json({ error: "Corpo do pedido inválido." }, 400); }
  const month = String(body?.month || "");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return json({ error: "Mês inválido (AAAA-MM)." }, 400);

  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: auth } = await userClient.auth.getUser();
  if (!auth?.user) return json({ error: "Sem sessão." }, 401);
  const { data: me } = await userClient.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
  const isClient = !me || CLIENT_ROLES.includes(me.role);

  let brandsQ = userClient.from("brands").select("id, name, agency_id").order("name");
  if (Array.isArray(body.brandIds) && body.brandIds.length) brandsQ = brandsQ.in("id", body.brandIds.slice(0, 200));
  const { data: brands, error: brandsError } = await brandsQ;
  if (brandsError) return json({ error: brandsError.message }, 500);
  if (!brands?.length) return json({ ok: true, month, isClient, rows: [] });

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const brandIds = brands.map((b) => b.id);

  // Período (até hoje, se for o mês atual).
  const [y, m] = month.split("-").map(Number);
  const start = `${month}-01`;
  const lastDay = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const end = lastDay > today ? today : lastDay;
  if (start > today) return json({ ok: true, month, isClient, rows: [] });
  const fromIso = `${start}T00:00:00Z`;
  const toIso = new Date(Date.UTC(y, m, 1)).toISOString();

  // Mensagens por marca e canal (enviadas e recebidas).
  const counts = {};
  await Promise.all(brandIds.flatMap((id) => [
    ["whatsapp", "whatsapp_messages", "outbound"], ["whatsapp", "whatsapp_messages", "inbound"],
    ["sms", "sms_messages", "outbound"], ["sms", "sms_messages", "inbound"],
  ].map(async ([ch, table, dir]) => {
    const { count } = await admin.from(table).select("id", { count: "exact", head: true })
      .eq("brand_id", id).eq("direction", dir).gte("created_at", fromIso).lt("created_at", toIso);
    counts[id] ??= { whatsapp: { sent: 0, received: 0 }, sms: { sent: 0, received: 0 } };
    counts[id][ch][dir === "outbound" ? "sent" : "received"] = count || 0;
  })));

  // Contas Twilio de cada marca.
  const [{ data: wa }, { data: sms }] = await Promise.all([
    admin.from("whatsapp_accounts").select("brand_id, twilio_account_sid, access_token_ref").eq("provider", "twilio").in("brand_id", brandIds),
    admin.from("sms_accounts").select("brand_id, account_sid, auth_token_ref").in("brand_id", brandIds),
  ]);
  const accounts = new Map(); // sid -> { tokenRef, brands:Set }
  for (const a of wa || []) if (a.twilio_account_sid) {
    const cur = accounts.get(a.twilio_account_sid) || { tokenRef: a.access_token_ref, brands: new Set() };
    cur.brands.add(a.brand_id); accounts.set(a.twilio_account_sid, cur);
  }
  for (const a of sms || []) if (a.account_sid) {
    const cur = accounts.get(a.account_sid) || { tokenRef: a.auth_token_ref, brands: new Set() };
    cur.brands.add(a.brand_id); accounts.set(a.account_sid, cur);
  }

  // A conta pode servir também marcas que este utilizador não vê: divide por todas.
  const sids = [...accounts.keys()];
  if (sids.length) {
    const [{ data: wa2 }, { data: sms2 }] = await Promise.all([
      admin.from("whatsapp_accounts").select("brand_id, twilio_account_sid").in("twilio_account_sid", sids),
      admin.from("sms_accounts").select("brand_id, account_sid").in("account_sid", sids),
    ]);
    for (const a of wa2 || []) accounts.get(a.twilio_account_sid)?.brands.add(a.brand_id);
    for (const a of sms2 || []) accounts.get(a.account_sid)?.brands.add(a.brand_id);
    for (const acc of accounts.values()) for (const id of acc.brands) {
      if (counts[id]) continue;
      counts[id] = { whatsapp: { sent: 0, received: 0 }, sms: { sent: 0, received: 0 } };
      for (const [ch, table] of [["whatsapp", "whatsapp_messages"], ["sms", "sms_messages"]]) {
        const { count } = await admin.from(table).select("id", { count: "exact", head: true }).eq("brand_id", id).gte("created_at", fromIso).lt("created_at", toIso);
        counts[id][ch].sent = count || 0;
      }
    }
  }

  // Custo por marca.
  const costs = {}; // brandId -> { sms, whatsapp, other, currency, error }
  for (const [sid, acc] of accounts.entries()) {
    const shareOf = (id, ch) => {
      const all = [...acc.brands].reduce((s, b) => s + (counts[b]?.[ch]?.sent || 0) + (counts[b]?.[ch]?.received || 0), 0);
      const mine = (counts[id]?.[ch]?.sent || 0) + (counts[id]?.[ch]?.received || 0);
      return acc.brands.size === 1 ? 1 : all ? mine / all : 1 / acc.brands.size;
    };
    let usage = null, error = null;
    try {
      const { data: token } = await admin.rpc("vault_read_secret", { p_id: acc.tokenRef });
      if (!token) throw new Error("Auth Token da Twilio em falta.");
      usage = await twilioUsage(sid, token, start, end);
    } catch (e) {
      error = e?.message || String(e);
    }
    for (const id of acc.brands) {
      if (!brandIds.includes(id)) continue;
      const cur = costs[id] || { sms: 0, whatsapp: 0, other: 0, currency: null, error: null };
      if (usage) {
        cur.sms += usage.sms * shareOf(id, "sms");
        cur.whatsapp += usage.whatsapp * shareOf(id, "whatsapp");
        cur.other += usage.other / acc.brands.size;
        cur.currency = usage.currency;
      } else cur.error = error;
      costs[id] = cur;
    }
  }

  // Margem por agência.
  const agencyIds = [...new Set(brands.map((b) => b.agency_id).filter(Boolean))];
  const { data: settings } = await admin.from("messaging_cost_settings").select("agency_id, margin_percent").in("agency_id", agencyIds);
  const marginOf = (agencyId) => Number(settings?.find((s) => s.agency_id === agencyId)?.margin_percent ?? 5);

  const rows = [];
  for (const b of brands) {
    const cost = costs[b.id];
    if (!cost) continue; // marca sem Twilio
    const margin = marginOf(b.agency_id);
    const k = 1 + margin / 100;
    const lines = [
      { channel: "whatsapp", label: "WhatsApp", cost: cost.whatsapp, ...counts[b.id]?.whatsapp },
      { channel: "sms", label: "SMS", cost: cost.sms, ...counts[b.id]?.sms },
      { channel: "other", label: "Números e outros", cost: cost.other, sent: 0, received: 0 },
    ].filter((l) => l.cost > 0.0001 || l.sent || l.received || (cost.error && l.channel !== "other"));
    for (const l of lines) {
      const messages = (l.sent || 0) + (l.received || 0);
      const price = l.cost * k;
      rows.push({
        brandId: b.id, brandName: b.name, channel: l.channel, label: l.label,
        sent: l.sent || 0, received: l.received || 0,
        price: round(price), unitPrice: messages ? round(price / messages, 4) : null,
        currency: cost.currency || "USD", error: cost.error,
        ...(isClient ? {} : { cost: round(l.cost, 4), unitCost: messages ? round(l.cost / messages, 4) : null, marginPercent: margin }),
      });
    }
  }
  return json({ ok: true, month, period: { start, end }, isClient, rows });
});
