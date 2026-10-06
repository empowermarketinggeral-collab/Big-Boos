// EMPOWER OS — ações da EQUIPA sobre o Google Agenda de uma profissional.
// Chamada pelo painel Agendamento → Equipa → (editar profissional).
//
//   { action: "link", staffId, appUrl }          gera o link pessoal que a
//                                                profissional abre para ligar
//                                                a conta Google dela (7 dias)
//   { action: "settings", staffId, pushEnabled } liga/desliga escrever as
//                                                marcações no Google Agenda
//   { action: "disconnect", staffId }            desliga: apaga do Google os
//                                                eventos futuros que a app
//                                                criou, revoga o acesso e
//                                                apaga o token
//
// Quem chama tem de gerir a marca da profissional (can_manage_brand) —
// clientes da marca não podem. O token do Google nunca sai do servidor.
//
// Precisa de "Verify JWT" LIGADO. Segredos (Edge Function Secrets):
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET   (ver docs/GUIA_GOOGLE_AGENDA.md)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const LINK_TTL_MS = 7 * 24 * 3600 * 1000;
const MAX_EVENTS_CLEANUP = 100;

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Só aceita http(s) e usa apenas a origem (esquema + domínio + porta).
function originOf(raw) {
  try {
    const url = new URL(String(raw || ""));
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : null;
  } catch {
    return null;
  }
}

async function accessTokenFor(admin, connection) {
  const { data: refreshToken } = await admin.rpc("vault_read_secret", { p_id: connection.refresh_token_ref });
  if (!refreshToken) return { refreshToken: null, accessToken: null };
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: Deno.env.get("GOOGLE_CLIENT_ID") || "",
        client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET") || "",
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
      signal: AbortSignal.timeout(8000),
    });
    const data = await res.json().catch(() => ({}));
    return { refreshToken, accessToken: res.ok ? data.access_token || null : null };
  } catch {
    return { refreshToken, accessToken: null };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Sem sessão." }, 401);

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Corpo do pedido inválido." }, 400);
  }
  const { action, staffId } = body;
  if (!staffId || typeof staffId !== "string") return json({ error: "Falta a profissional." }, 400);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY"), { global: { headers: { Authorization: authHeader } } });
  const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));

  const { data: userData } = await userClient.auth.getUser();
  const user = userData?.user;
  if (!user) return json({ error: "Sem sessão." }, 401);

  // A profissional tem de existir e a pessoa tem de gerir a marca dela.
  const { data: staff } = await admin.from("booking_staff").select("id, brand_id, name").eq("id", staffId).maybeSingle();
  if (!staff) return json({ error: "Profissional não encontrada." }, 404);
  const { data: canManage } = await userClient.rpc("can_manage_brand", { target_brand: staff.brand_id });
  if (canManage !== true) return json({ error: "Sem permissão para gerir esta profissional." }, 403);

  // ------------------------------------------------------------ link
  if (action === "link") {
    if (!Deno.env.get("GOOGLE_CLIENT_ID") || !Deno.env.get("GOOGLE_CLIENT_SECRET")) {
      return json({ error: "A ligação ao Google ainda não está configurada (faltam os segredos GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET nas Edge Functions)." }, 500);
    }
    const origin = originOf(body.appUrl) || originOf(req.headers.get("origin"));
    if (!origin) return json({ error: "Não foi possível determinar o endereço da aplicação." }, 400);

    const token = randomToken();
    const expiresAt = new Date(Date.now() + LINK_TTL_MS).toISOString();
    // Limpa links antigos que já não servem a esta profissional.
    await admin.from("booking_google_links").delete().eq("staff_id", staff.id).or(`used_at.not.is.null,expires_at.lt.${new Date().toISOString()}`);
    const { error } = await admin.from("booking_google_links").insert({
      token_hash: await sha256Hex(token),
      staff_id: staff.id,
      brand_id: staff.brand_id,
      app_origin: origin,
      expires_at: expiresAt,
      created_by: user.id,
    });
    if (error) return json({ error: "Não foi possível criar o link." }, 500);
    return json({ ok: true, url: `${origin}/ligar-agenda/${token}`, expiresAt });
  }

  const { data: connection } = await admin.from("booking_staff_google").select("*").eq("staff_id", staff.id).maybeSingle();

  // -------------------------------------------------------- settings
  if (action === "settings") {
    if (!connection) return json({ error: "Esta profissional ainda não ligou o Google Agenda." }, 409);
    if (typeof body.pushEnabled !== "boolean") return json({ error: "Valor inválido." }, 400);
    const { error } = await admin.from("booking_staff_google").update({ push_enabled: body.pushEnabled }).eq("staff_id", staff.id);
    if (error) return json({ error: "Não foi possível guardar." }, 500);
    // Ao desligar, a próxima sincronização (≤5 min) apaga do Google os eventos que a app criou.
    return json({ ok: true });
  }

  // ------------------------------------------------------ disconnect
  if (action === "disconnect") {
    if (connection) {
      const { refreshToken, accessToken } = await accessTokenFor(admin, connection);

      // Apaga do Google os eventos futuros que a app lá escreveu (se não, ficavam
      // para sempre, sem se atualizarem quando a marcação mudasse).
      if (accessToken) {
        const { data: events } = await admin
          .from("booking_google_events").select("google_event_id, calendar_id")
          .eq("staff_id", staff.id).gt("synced_ends_at", new Date().toISOString()).limit(MAX_EVENTS_CLEANUP);
        for (const ev of events || []) {
          try {
            await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(ev.calendar_id)}/events/${encodeURIComponent(ev.google_event_id)}`, {
              method: "DELETE",
              headers: { Authorization: `Bearer ${accessToken}` },
              signal: AbortSignal.timeout(6000),
            });
          } catch {
            // best effort: o resto da limpeza continua
          }
        }
      }
      // Revoga o acesso do lado da Google (a profissional deixa de ver a app autorizada).
      if (refreshToken) {
        try {
          await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refreshToken)}`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            signal: AbortSignal.timeout(6000),
          });
        } catch {
          // best effort
        }
      }
      if (connection.refresh_token_ref) {
        try {
          await admin.rpc("vault_delete_secret", { p_id: connection.refresh_token_ref });
        } catch {
          // o token já foi revogado; um segredo órfão no Vault não dá acesso a nada
        }
      }
    }
    await admin.from("booking_google_events").delete().eq("staff_id", staff.id);
    await admin.from("booking_external_busy").delete().eq("staff_id", staff.id).eq("source", "google");
    await admin.from("booking_google_links").delete().eq("staff_id", staff.id);
    await admin.from("booking_staff_google").delete().eq("staff_id", staff.id);
    return json({ ok: true });
  }

  return json({ error: "Ação inválida." }, 400);
});
