// EMPOWER OS — liga a conta da app das clientes à ficha antiga pelo
// TELEMÓVEL, com um código enviado por SMS (Twilio da marca, sms_accounts).
// Usado quando a cliente cria conta com um email que não está na ficha,
// mas o telemóvel que indicou já está no CRM (client_portal_link devolve
// "phone_verification_required").
//
// Body: { brandId, action: "send" }              → envia o código
//       { brandId, action: "verify", code }      → confirma e liga
//
// O telemóvel é o que a cliente indicou ao criar a conta (user_metadata),
// nunca um número vindo do pedido. Código de 6 dígitos, válido 10 minutos,
// no máximo 5 tentativas; 1 envio por minuto e 5 por hora. Guarda-se só o
// hash do código (client_phone_verifications, só service role).
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

function normalizePhone(raw, countryCode = "351") {
  let p = String(raw || "").trim().replace(/[^\d+]/g, "");
  if (!p) return "";
  if (p.startsWith("00")) p = "+" + p.slice(2);
  if (!p.startsWith("+")) {
    if (p.length === 9) p = `+${countryCode}${p}`;
    else if (p.length >= 10) p = `+${p}`;
    else return "";
  }
  const digits = p.slice(1);
  if (!/^\d{8,15}$/.test(digits)) return "";
  return "+" + digits;
}

async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const masked = (phone) => `${phone.slice(0, 4)} ••• ••${phone.slice(-3)}`;

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
  const { brandId, action, code } = body;
  if (!brandId || !["send", "verify"].includes(action)) return json({ error: "Pedido inválido." }, 400);

  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: userData } = await userClient.auth.getUser();
  const user = userData?.user;
  if (!user) return json({ error: "Sessão expirada. Entre novamente." }, 401);

  const admin = createClient(supabaseUrl, serviceRoleKey);

  // Só clientes (sem perfil de equipa), com email confirmado, numa marca com app ligada, ainda sem ficha ligada.
  const { data: profile } = await admin.from("profiles").select("id").eq("id", user.id).maybeSingle();
  if (profile) return json({ error: "Esta conta é da equipa." }, 403);
  if (!user.email_confirmed_at) return json({ error: "Confirme primeiro o seu email." }, 403);
  const { data: brand } = await admin.from("brands").select("id, name, client_app_enabled").eq("id", brandId).maybeSingle();
  if (!brand?.client_app_enabled) return json({ error: "App indisponível." }, 404);
  const { data: linked } = await admin.from("client_accounts").select("contact_id").eq("user_id", user.id).eq("brand_id", brandId).maybeSingle();
  if (linked) return json({ ok: true, linked: true });

  if (action === "send") {
    const phone = normalizePhone(user.user_metadata?.phone);
    if (!phone) return json({ error: "Não indicou um telemóvel válido ao criar a conta." }, 400);
    const { data: contact } = await admin.from("contacts").select("id").eq("brand_id", brandId).eq("phone", phone).maybeSingle();
    if (!contact) return json({ error: "Não encontrámos nenhuma ficha com este telemóvel." }, 404);
    const { data: taken } = await admin.from("client_accounts").select("user_id").eq("brand_id", brandId).eq("contact_id", contact.id).maybeSingle();
    if (taken) return json({ error: "Esta ficha já está ligada a outra conta. Fale connosco." }, 409);

    const { data: previous } = await admin.from("client_phone_verifications").select("sends, last_sent_at, created_at").eq("user_id", user.id).eq("brand_id", brandId).maybeSingle();
    const now = Date.now();
    if (previous) {
      if (now - new Date(previous.last_sent_at).getTime() < 60000) return json({ error: "Aguarde um minuto antes de pedir outro código." }, 429);
      if (previous.sends >= 5 && now - new Date(previous.created_at).getTime() < 3600000) return json({ error: "Demasiados pedidos. Tente daqui a uma hora." }, 429);
    }

    const { data: account } = await admin.from("sms_accounts").select("account_sid, from_number, auth_token_ref").eq("brand_id", brandId).maybeSingle();
    if (!account) return json({ error: "O envio de SMS ainda não está ativo. Fale connosco." }, 503);
    const { data: token } = await admin.rpc("vault_read_secret", { p_id: account.auth_token_ref });
    if (!token) return json({ error: "O envio de SMS ainda não está ativo. Fale connosco." }, 503);

    const sixDigits = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, "0");
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${account.account_sid}/Messages.json`, {
      method: "POST",
      headers: { Authorization: `Basic ${btoa(`${account.account_sid}:${token}`)}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ From: account.from_number, To: phone, Body: `${brand.name}: o seu código é ${sixDigits}. Válido 10 minutos.` }),
    });
    if (!res.ok) return json({ error: "Não foi possível enviar o SMS. Tente novamente." }, 502);

    const resetWindow = !previous || now - new Date(previous.created_at).getTime() >= 3600000;
    await admin.from("client_phone_verifications").upsert({
      user_id: user.id, brand_id: brandId, contact_id: contact.id,
      code_hash: await sha256(`${user.id}:${sixDigits}`),
      expires_at: new Date(now + 10 * 60000).toISOString(),
      attempts: 0,
      sends: resetWindow ? 1 : (previous.sends || 0) + 1,
      last_sent_at: new Date(now).toISOString(),
      created_at: resetWindow ? new Date(now).toISOString() : previous.created_at,
    }, { onConflict: "user_id,brand_id" });

    return json({ ok: true, sentTo: masked(phone) });
  }

  // verify
  const { data: pending } = await admin.from("client_phone_verifications").select("*").eq("user_id", user.id).eq("brand_id", brandId).maybeSingle();
  if (!pending) return json({ error: "Peça primeiro o código." }, 400);
  if (new Date(pending.expires_at).getTime() < Date.now()) return json({ error: "O código expirou. Peça outro." }, 400);
  if (pending.attempts >= 5) return json({ error: "Demasiadas tentativas. Peça outro código." }, 429);

  const ok = (await sha256(`${user.id}:${String(code || "").trim()}`)) === pending.code_hash;
  if (!ok) {
    await admin.from("client_phone_verifications").update({ attempts: pending.attempts + 1 }).eq("user_id", user.id).eq("brand_id", brandId);
    return json({ error: "Código incorreto." }, 400);
  }

  const { error: linkError } = await admin.from("client_accounts").insert({ user_id: user.id, brand_id: brandId, contact_id: pending.contact_id, email: user.email });
  if (linkError) return json({ error: linkError.code === "23505" ? "Esta ficha já está ligada a outra conta. Fale connosco." : linkError.message }, 409);
  // A ficha antiga fica com o email da conta, se ainda não tinha.
  await admin.from("contacts").update({ email: user.email }).eq("id", pending.contact_id).is("email", null);
  await admin.from("client_phone_verifications").delete().eq("user_id", user.id).eq("brand_id", brandId);

  return json({ ok: true, linked: true });
});
