// EMPOWER OS — ligação de uma profissional ao Google Agenda (OAuth).
// Pública (sem login): quem a usa é a PROFISSIONAL, através do link
// pessoal que a equipa gerou (ver google-calendar-connect, ação "link").
//
//   POST { action: "info",  token }   nome da profissional/marca, para a
//                                     página de boas-vindas
//   POST { action: "start", token }   devolve o endereço da Google onde ela
//                                     autoriza (state assinado, 10 min)
//   GET  ?code=…&state=…              regresso da Google: troca o código pelo
//                                     token, guarda-o no Vault e volta à app
//
// O token do link é de uso único e expira em 7 dias; só o hash dele está na
// base de dados. O destino final (a app) vem do link, nunca do pedido.
// Permissões pedidas à Google: ver apenas ocupado/livre, escrever eventos
// (as marcações) e o email da conta. NÃO lê o conteúdo dos eventos dela.
//
// Precisa de "Verify JWT" DESLIGADO. Segredos (Edge Function Secrets):
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET (obrigatórios)
//   GOOGLE_STATE_SECRET (opcional; sem ele usa o GOOGLE_CLIENT_SECRET)
// No Google Cloud, o "Authorized redirect URI" tem de ser exatamente:
//   https://<projeto>.supabase.co/functions/v1/google-calendar-oauth

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const SCOPE_FREEBUSY = "https://www.googleapis.com/auth/calendar.freebusy";
const SCOPE_EVENTS = "https://www.googleapis.com/auth/calendar.events";
const SCOPES = [SCOPE_FREEBUSY, SCOPE_EVENTS, "openid", "email"].join(" ");
const STATE_TTL_MS = 10 * 60 * 1000;

const encoder = new TextEncoder();

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", encoder.encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const b64urlEncode = (text) => btoa(String.fromCharCode(...encoder.encode(text))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
function b64urlDecode(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
  return new TextDecoder().decode(Uint8Array.from(atob(padded), (ch) => ch.charCodeAt(0)));
}

const hexToBytes = (hex) => Uint8Array.from(hex.match(/.{2}/g) || [], (h) => parseInt(h, 16));

async function hmacKey() {
  const secret = Deno.env.get("GOOGLE_STATE_SECRET") || Deno.env.get("GOOGLE_CLIENT_SECRET") || "";
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

async function signState(payload) {
  const data = b64urlEncode(JSON.stringify(payload));
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(), encoder.encode(data));
  return `${data}.${[...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

// Devolve o conteúdo do state só se a assinatura estiver certa e não tiver expirado.
async function readState(state) {
  if (typeof state !== "string" || !state.includes(".")) return null;
  const [data, sigHex] = state.split(".");
  if (!data || !/^[0-9a-f]+$/.test(sigHex || "")) return null;
  const ok = await crypto.subtle.verify("HMAC", await hmacKey(), hexToBytes(sigHex), encoder.encode(data));
  if (!ok) return null;
  try {
    const payload = JSON.parse(b64urlDecode(data));
    return payload && payload.e > Date.now() && typeof payload.h === "string" ? payload : null;
  } catch {
    return null;
  }
}

const redirectUri = () => `${Deno.env.get("SUPABASE_URL")}/functions/v1/google-calendar-oauth`;

// Link válido = existe, ainda não foi usado e não expirou.
async function loadLink(admin, tokenHash) {
  const { data: link } = await admin.from("booking_google_links").select("*").eq("token_hash", tokenHash).maybeSingle();
  if (!link) return { error: "Este link não é válido.", code: "invalid" };
  if (link.used_at) return { error: "Este link já foi usado. Se precisas de voltar a ligar, pede um novo à equipa.", code: "used" };
  if (new Date(link.expires_at).getTime() < Date.now()) return { error: "Este link expirou. Pede um novo à equipa.", code: "expired" };
  return { link };
}

const back = (origin, params) => new Response(null, { status: 302, headers: { Location: `${origin}/ligar-agenda-resultado?${new URLSearchParams(params)}` } });

// O id_token vem diretamente do endpoint de tokens da Google (por TLS), por isso
// basta ler o email do corpo — não é preciso validar a assinatura.
function emailFromIdToken(idToken) {
  try {
    return JSON.parse(b64urlDecode(String(idToken).split(".")[1])).email || null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const admin = createClient(supabaseUrl, serviceRoleKey);

  // ===================================================== regresso da Google
  if (req.method === "GET") {
    const url = new URL(req.url);
    const state = await readState(url.searchParams.get("state"));
    if (!state) return new Response("Pedido inválido ou expirado. Volta a abrir o link que te enviaram.", { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } });

    const { link, error: linkError, code: linkCode } = await loadLink(admin, state.h);
    if (!link) {
      // Sem link não sabemos para onde voltar.
      return new Response(linkError || "Link inválido.", { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }
    const origin = link.app_origin;

    if (url.searchParams.get("error")) return back(origin, { estado: "recusado" });
    const code = url.searchParams.get("code");
    if (!code) return back(origin, { estado: "erro", motivo: "sem-codigo" });
    if (!clientId || !clientSecret) return back(origin, { estado: "erro", motivo: "configuracao" });

    let tokens;
    try {
      const res = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri(), grant_type: "authorization_code" }),
        signal: AbortSignal.timeout(10000),
      });
      tokens = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error("google-calendar-oauth: troca do código falhou", tokens?.error, tokens?.error_description);
        return back(origin, { estado: "erro", motivo: "troca" });
      }
    } catch (err) {
      console.error("google-calendar-oauth: troca do código falhou", String(err?.message || err));
      return back(origin, { estado: "erro", motivo: "troca" });
    }

    // A Google deixa a pessoa desmarcar permissões uma a uma: o essencial é poder ler o ocupado/livre.
    const granted = String(tokens.scope || "").split(/\s+/);
    if (!granted.includes(SCOPE_FREEBUSY)) return back(origin, { estado: "erro", motivo: "permissoes" });
    if (!tokens.refresh_token) return back(origin, { estado: "erro", motivo: "sem-token" });
    const canWriteEvents = granted.includes(SCOPE_EVENTS);

    const { data: staff } = await admin.from("booking_staff").select("id, brand_id, name").eq("id", link.staff_id).maybeSingle();
    if (!staff) return back(origin, { estado: "erro", motivo: "profissional" });

    const { data: secretId, error: vaultError } = await admin.rpc("vault_upsert_secret", {
      p_name: `google_calendar_refresh_${staff.id}`,
      p_secret: tokens.refresh_token,
    });
    if (vaultError || !secretId) {
      console.error("google-calendar-oauth: vault falhou", vaultError?.message);
      return back(origin, { estado: "erro", motivo: "guardar" });
    }

    // Ao voltar a ligar mantém a escolha anterior de escrever no Google Agenda.
    const { data: previous } = await admin.from("booking_staff_google").select("push_enabled").eq("staff_id", staff.id).maybeSingle();
    const { error: saveError } = await admin.from("booking_staff_google").upsert({
      staff_id: staff.id,
      brand_id: staff.brand_id,
      google_email: emailFromIdToken(tokens.id_token),
      refresh_token_ref: secretId,
      calendar_id: "primary",
      push_enabled: previous ? previous.push_enabled && canWriteEvents : canWriteEvents,
      status: "connected",
      last_error: null,
      connected_at: new Date().toISOString(),
    }, { onConflict: "staff_id" });
    if (saveError) {
      console.error("google-calendar-oauth: guardar ligação falhou", saveError.message);
      return back(origin, { estado: "erro", motivo: "guardar" });
    }

    await admin.from("booking_google_links").update({ used_at: new Date().toISOString() }).eq("token_hash", state.h);

    // Primeira leitura do Google Agenda já, em vez de esperar pelos 5 minutos do cron.
    try {
      await fetch(`${supabaseUrl}/functions/v1/google-calendar-sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceRoleKey}` },
        body: JSON.stringify({ staffId: staff.id }),
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      // o cron apanha dentro de 5 minutos
    }

    return back(origin, { estado: "ok", nome: staff.name, escrita: canWriteEvents ? "1" : "0" });
  }

  // ============================================================== página
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Corpo do pedido inválido." }, 400);
  }
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!/^[a-f0-9]{64}$/.test(token)) return json({ error: "Este link não é válido.", code: "invalid" }, 404);

  const tokenHash = await sha256Hex(token);
  const { link, error, code } = await loadLink(admin, tokenHash);
  if (!link) return json({ error, code }, 404);

  const { data: staff } = await admin.from("booking_staff").select("name, email, brand_id").eq("id", link.staff_id).maybeSingle();
  if (!staff) return json({ error: "Este link não é válido.", code: "invalid" }, 404);

  if (body.action === "info") {
    const { data: brand } = await admin.from("brands").select("name").eq("id", staff.brand_id).maybeSingle();
    return json({ ok: true, staffName: staff.name, brandName: brand?.name || "" });
  }

  if (body.action === "start") {
    if (!clientId || !clientSecret) return json({ error: "A ligação ao Google ainda não está configurada. Avisa a equipa." }, 500);
    const state = await signState({ h: tokenHash, e: Date.now() + STATE_TTL_MS, n: crypto.randomUUID() });
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri(),
      response_type: "code",
      scope: SCOPES,
      access_type: "offline",
      prompt: "consent",
      state,
    });
    if (staff.email) params.set("login_hint", staff.email);
    return json({ ok: true, authUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
  }

  return json({ error: "Ação inválida." }, 400);
});
