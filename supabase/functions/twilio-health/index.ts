// EMPOWER OS — saldo e estado das contas Twilio (WhatsApp e SMS) de cada marca.
//
//   Cron (migração 109): POST {} com a service role → verifica todas as marcas.
//   Browser: POST { brandId } com a sessão → verifica só essa marca (botão
//   "Verificar" no módulo), depois de confirmar o acesso à marca.
//
// Guarda em twilio_account_health e avisa no sino (área crm) quando o saldo
// está abaixo do limite, a conta foi suspensa ou o Auth Token já não serve.
// O mesmo aviso repete-se no máximo uma vez por dia.
//
// "Verify JWT" DESLIGADO (é chamada pelo cron); confirma aqui dentro quem chama.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
function sameKey(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// Pergunta à Twilio o saldo; uma conta suspensa responde 401 com "not active".
async function checkAccount(accountSid, token) {
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Balance.json`, {
      headers: { Authorization: `Basic ${btoa(`${accountSid}:${token}`)}` },
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) return { balance: Number(data.balance), currency: String(data.currency || "USD").toUpperCase() };
    const msg = String(data?.message || "");
    if (/not active|suspended|closed/i.test(msg)) return { status: "suspended", detail: msg };
    if (res.status === 401 || res.status === 403) return { status: "auth_failed", detail: msg || "Auth Token recusado." };
    return { status: "unknown", detail: msg || `Erro ${res.status}` };
  } catch (e) {
    return { status: "unknown", detail: String(e?.message || e) };
  }
}

const money = (v, cur) => `${Number(v).toFixed(2).replace(".", ",")} ${cur}`;
function alertText(brandName, row) {
  const canais = row.channels.map((ch) => (ch === "whatsapp" ? "WhatsApp" : "SMS")).join(" e ");
  if (row.status === "suspended") return `A conta Twilio de ${brandName} foi suspensa: o ${canais} não envia nem recebe mensagens. Veja o motivo na Twilio (aviso no topo da Console ou email da Twilio) e reative a conta.`;
  if (row.status === "auth_failed") return `A Twilio recusou o Auth Token de ${brandName}: o ${canais} deixou de funcionar. Volte a ligar a conta com o Auth Token atual.`;
  return `O saldo Twilio de ${brandName} está em ${money(row.balance, row.currency)}. Carregue saldo (e ligue a recarga automática) para o ${canais} não parar.`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const authHeader = req.headers.get("Authorization") || "";
  const admin = createClient(supabaseUrl, serviceRoleKey);

  let body = {};
  try { body = await req.json(); } catch { /* cron manda {} */ }

  let onlyBrand = null;
  if (!sameKey(authHeader.replace(/^Bearer\s+/i, ""), serviceRoleKey)) {
    const brandId = String(body?.brandId || "");
    if (!/^[0-9a-f-]{36}$/i.test(brandId)) return json({ error: "Falta a marca." }, 400);
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: brand } = await userClient.from("brands").select("id").eq("id", brandId).maybeSingle();
    if (!brand) return json({ error: "Sem acesso a esta marca." }, 403);
    onlyBrand = brandId;
  }

  // Contas por marca (WhatsApp e SMS podem usar a mesma conta Twilio).
  let waQ = admin.from("whatsapp_accounts").select("brand_id, twilio_account_sid, access_token_ref").eq("provider", "twilio");
  let smsQ = admin.from("sms_accounts").select("brand_id, account_sid, auth_token_ref");
  if (onlyBrand) { waQ = waQ.eq("brand_id", onlyBrand); smsQ = smsQ.eq("brand_id", onlyBrand); }
  const [{ data: wa }, { data: sms }] = await Promise.all([waQ, smsQ]);
  const accounts = new Map();
  for (const a of wa || []) {
    if (!a.twilio_account_sid) continue;
    const k = `${a.brand_id}|${a.twilio_account_sid}`;
    const cur = accounts.get(k) || { brandId: a.brand_id, sid: a.twilio_account_sid, tokenRef: a.access_token_ref, channels: [] };
    cur.channels.push("whatsapp");
    accounts.set(k, cur);
  }
  for (const a of sms || []) {
    if (!a.account_sid) continue;
    const k = `${a.brand_id}|${a.account_sid}`;
    const cur = accounts.get(k) || { brandId: a.brand_id, sid: a.account_sid, tokenRef: a.auth_token_ref, channels: [] };
    if (!cur.channels.includes("sms")) cur.channels.push("sms");
    accounts.set(k, cur);
  }

  const results = [];
  for (const acc of accounts.values()) {
    const { data: token } = await admin.rpc("vault_read_secret", { p_id: acc.tokenRef });
    const check = token ? await checkAccount(acc.sid, token) : { status: "auth_failed", detail: "Auth Token em falta." };
    const { data: prev } = await admin.from("twilio_account_health").select("low_threshold, alerted_status, alerted_at")
      .eq("brand_id", acc.brandId).eq("account_sid", acc.sid).maybeSingle();
    const threshold = Number(prev?.low_threshold ?? 10);
    const status = check.status || (check.balance < threshold ? "low" : "ok");
    const row = {
      brand_id: acc.brandId, account_sid: acc.sid, channels: acc.channels, status,
      balance: Number.isFinite(check.balance) ? check.balance : null, currency: check.currency || null,
      detail: check.detail || null, checked_at: new Date().toISOString(),
    };

    // Aviso no sino: quando o estado muda para mau, ou uma vez por dia enquanto se mantém.
    const bad = ["low", "suspended", "auth_failed"].includes(status);
    const lastAlert = prev?.alerted_at ? new Date(prev.alerted_at).getTime() : 0;
    if (bad && (prev?.alerted_status !== status || Date.now() - lastAlert > 23 * 3600000)) {
      const { data: brand } = await admin.from("brands").select("name, agency_id").eq("id", acc.brandId).maybeSingle();
      if (brand?.agency_id) {
        await admin.from("notifications").insert({ agency_id: brand.agency_id, brand_id: acc.brandId, area: "crm", message: alertText(brand.name, row) });
        row.alerted_status = status;
        row.alerted_at = new Date().toISOString();
      }
    } else if (!bad) {
      row.alerted_status = null;
    }

    await admin.from("twilio_account_health").upsert(row, { onConflict: "brand_id,account_sid" });
    results.push({ brandId: acc.brandId, status, balance: row.balance, currency: row.currency });
  }
  return json({ ok: true, checked: results.length, results });
});
