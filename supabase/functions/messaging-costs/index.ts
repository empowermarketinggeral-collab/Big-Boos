// EMPOWER OS — gastos de mensagens (SMS e WhatsApp) por marca, em euros.
//
//   POST { month: "2026-11", brandIds?: [..], summary?: true }  (sessão do utilizador)
//
// Para cada marca a que o utilizador tem acesso (RLS de brands), pergunta à
// Twilio o uso da conta no período (/Usage/Records.json com StartDate/EndDate)
// e separa SMS, WhatsApp e outros (números, etc.). Se a mesma conta Twilio
// servir várias marcas, o custo divide-se pelas mensagens de cada uma.
// Os valores passam para euros (câmbio do dia, frankfurter; reserva 0,92) e
// leva a margem da agência (messaging_cost_settings, 5% por omissão).
// A equipa recebe custo, margem e valor a cobrar; o cliente só o valor a cobrar.
//
// summary: true (com uma marca) junta o saldo pré-pago (migração 114):
// carregado, gasto desde a data de início, saldo e preço médio por mensagem.
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
const emptyCounts = () => ({ whatsapp: { sent: 0, received: 0 }, sms: { sent: 0, received: 0 } });

// Câmbio para euros (uma vez por pedido).
const fxCache = new Map();
async function toEurRate(cur) {
  const c = String(cur || "USD").toUpperCase();
  if (c === "EUR") return 1;
  if (fxCache.has(c)) return fxCache.get(c);
  let rate = null;
  for (const url of [`https://api.frankfurter.dev/v1/latest?base=${c}&symbols=EUR`, `https://api.frankfurter.app/latest?from=${c}&to=EUR`]) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
      const data = await res.json();
      if (res.ok && Number(data?.rates?.EUR) > 0) { rate = Number(data.rates.EUR); break; }
    } catch { /* tenta o seguinte */ }
  }
  if (!rate) rate = c === "USD" ? 0.92 : 1;
  fxCache.set(c, rate);
  return rate;
}

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
  const rate = await toEurRate(currency);
  return { sms: sms * rate, whatsapp: whatsapp * rate, other: Math.max(0, total - sms - whatsapp) * rate, currency, rate };
}

// Custo (em euros, sem margem) e mensagens por marca num período [start, end] (datas AAAA-MM-DD).
async function computeCosts(admin, brandIds, start, end) {
  const fromIso = `${start}T00:00:00Z`;
  const toIso = new Date(new Date(`${end}T00:00:00Z`).getTime() + 86400000).toISOString();

  const counts = {};
  const countFor = async (id) => {
    counts[id] = emptyCounts();
    await Promise.all([
      ["whatsapp", "whatsapp_messages", "outbound"], ["whatsapp", "whatsapp_messages", "inbound"],
      ["sms", "sms_messages", "outbound"], ["sms", "sms_messages", "inbound"],
    ].map(async ([ch, table, dir]) => {
      const { count } = await admin.from(table).select("id", { count: "exact", head: true })
        .eq("brand_id", id).eq("direction", dir).gte("created_at", fromIso).lt("created_at", toIso);
      counts[id][ch][dir === "outbound" ? "sent" : "received"] = count || 0;
    }));
  };
  await Promise.all(brandIds.map(countFor));

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
    const extra = new Set();
    for (const acc of accounts.values()) for (const id of acc.brands) if (!counts[id]) extra.add(id);
    await Promise.all([...extra].map(countFor));
  }

  const costs = {}; // brandId -> { sms, whatsapp, other, error }
  for (const [sid, acc] of accounts.entries()) {
    const shareOf = (id, ch) => {
      if (acc.brands.size === 1) return 1;
      const msgs = (b) => (counts[b]?.[ch]?.sent || 0) + (counts[b]?.[ch]?.received || 0);
      const all = [...acc.brands].reduce((s, b) => s + msgs(b), 0);
      return all ? msgs(id) / all : 1 / acc.brands.size;
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
      const cur = costs[id] || { sms: 0, whatsapp: 0, other: 0, error: null };
      if (usage) {
        cur.sms += usage.sms * shareOf(id, "sms");
        cur.whatsapp += usage.whatsapp * shareOf(id, "whatsapp");
        cur.other += usage.other / acc.brands.size;
      } else cur.error = error;
      costs[id] = cur;
    }
  }
  return { costs, counts };
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
  if (!brands?.length) return json({ ok: true, month, isClient, currency: "EUR", rows: [] });

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const brandIds = brands.map((b) => b.id);

  // Período do mês (até hoje, se for o mês atual).
  const [y, m] = month.split("-").map(Number);
  const start = `${month}-01`;
  const lastDay = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const end = lastDay > today ? today : lastDay;
  if (start > today) return json({ ok: true, month, isClient, currency: "EUR", rows: [] });

  const { costs, counts } = await computeCosts(admin, brandIds, start, end);

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
        currency: "EUR", error: cost.error,
        ...(isClient ? {} : { cost: round(l.cost, 4), unitCost: messages ? round(l.cost / messages, 4) : null, marginPercent: margin }),
      });
    }
  }

  // Saldo pré-pago de uma marca (migração 114).
  let summary = null;
  if (body.summary && brands.length === 1) {
    const b = brands[0];
    const k = 1 + marginOf(b.agency_id) / 100;
    const [{ data: credits }, { data: cs }] = await Promise.all([
      admin.from("messaging_credits").select("amount_eur, kind, created_at").eq("brand_id", b.id).order("created_at"),
      admin.from("messaging_credit_settings").select("start_date, low_balance_eur").eq("brand_id", b.id).maybeSingle(),
    ]);
    const credited = (credits || []).reduce((s, c) => s + Number(c.amount_eur || 0), 0);
    const firstTopup = (credits || []).find((c) => c.kind === "topup")?.created_at?.slice(0, 10) || null;
    const startDate = cs?.start_date || firstTopup;
    const monthRows = rows.filter((r) => r.brandId === b.id);
    const monthSpent = monthRows.reduce((s, r) => s + r.price, 0);
    const monthMessages = monthRows.reduce((s, r) => s + r.sent + r.received, 0);
    let spentSince = 0, sinceError = null;
    if (startDate && startDate <= today) {
      if (startDate === start && end === today) spentSince = monthSpent;
      else {
        const since = await computeCosts(admin, [b.id], startDate, today);
        const c = since.costs[b.id];
        if (c?.error) sinceError = c.error;
        spentSince = c ? (c.sms + c.whatsapp + c.other) * k : 0;
      }
    }
    const balance = startDate ? credited - spentSince : null;
    const lowBalance = Number(cs?.low_balance_eur ?? 10);
    summary = {
      currency: "EUR",
      monthSpent: round(monthSpent), monthMessages,
      avgPrice: monthMessages ? round(monthSpent / monthMessages, 4) : null,
      credited: round(credited), startDate, spentSince: round(spentSince),
      balance: balance == null ? null : round(balance), lowBalance,
      low: balance == null ? monthSpent > 0 : balance < lowBalance,
      error: monthRows[0]?.error || sinceError || null,
    };
  }

  return json({ ok: true, month, period: { start, end }, isClient, currency: "EUR", rows, summary });
});
