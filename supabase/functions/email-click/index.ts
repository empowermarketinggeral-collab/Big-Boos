// EMPOWER OS — links rastreados dos emails das automações.
//
// O motor (automations-run) gera links assinados:
//   ?p=<dados em base64url>&s=<assinatura HMAC>
//   dados: { b: marca, c: contacto, a: "c" | "o" | "u", t?: tag, u?: URL }
//     a = "c"  clique: põe a tag t (se existir na marca), regista a interação
//              e redireciona para u (ou para a página "escolha registada")
//     a = "o"  abertura (pixel 1x1): +1 ponto até 10 e regista a interação
//     a = "u"  anular subscrição: GET leva à página de confirmação na app;
//              POST (da página, ou "um clique" do Gmail/Apple via
//              List-Unsubscribe-Post) tira o consentimento e põe rgpd:opt-out
//
// Precisa de "Verify JWT" DESLIGADO. A assinatura usa o segredo
// EMAIL_LINK_SECRET (Edge Function Secrets; o mesmo no automations-run) ou,
// sem ele, a service role key. APP_URL = endereço da app (ex.:
// https://big-boos.vercel.app) para as páginas de confirmação.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const redirect = (location) => new Response(null, { status: 302, headers: { Location: location, "Cache-Control": "no-store" } });

const GIF = Uint8Array.from(atob("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"), (ch) => ch.charCodeAt(0));
const pixel = () => new Response(GIF, { headers: { "Content-Type": "image/gif", "Cache-Control": "no-store, max-age=0" } });

const appUrl = () => (Deno.env.get("APP_URL") || "https://big-boos.vercel.app").replace(/\/+$/, "");

function b64url(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64url(s) {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  return new TextDecoder().decode(Uint8Array.from(atob(pad), (ch) => ch.charCodeAt(0)));
}

async function sign(payload) {
  const secret = Deno.env.get("EMAIL_LINK_SECRET") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(`email-link:${secret}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload))).slice(0, 32);
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function verify(p, s) {
  if (!p || !s || p.length > 3000) return null;
  if (!safeEqual(await sign(p), s)) return null;
  try {
    const data = JSON.parse(fromB64url(p));
    if (!/^[0-9a-f-]{36}$/i.test(data.b || "") || !/^[0-9a-f-]{36}$/i.test(data.c || "")) return null;
    return data;
  } catch {
    return null;
  }
}

async function unsubscribe(admin, data) {
  const { data: contact } = await admin.from("contacts").select("id").eq("id", data.c).eq("brand_id", data.b).maybeSingle();
  if (!contact) return false;
  await admin.from("contacts").update({ opted_in_email: false }).eq("id", contact.id);
  let { data: tag } = await admin.from("tags").select("id").eq("brand_id", data.b).ilike("name", "rgpd:opt-out").maybeSingle();
  if (!tag) {
    const { data: created } = await admin.from("tags").insert({ brand_id: data.b, name: "rgpd:opt-out" }).select("id").single();
    tag = created;
  }
  if (tag) await admin.from("contact_tags").upsert({ brand_id: data.b, contact_id: contact.id, tag_id: tag.id }, { onConflict: "contact_id,tag_id", ignoreDuplicates: true });
  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = new URL(req.url);
  const admin = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));

  if (req.method === "POST") {
    // Da página de confirmação (JSON {p, s}) ou "um clique" do cliente de email (p e s no URL).
    let p = url.searchParams.get("p") || "";
    let s = url.searchParams.get("s") || "";
    if (!p) {
      try {
        const body = await req.json();
        p = String(body?.p || "");
        s = String(body?.s || "");
      } catch {
        return json({ error: "Pedido inválido." }, 400);
      }
    }
    const data = await verify(p, s);
    if (!data || data.a !== "u") return json({ error: "Link inválido." }, 400);
    const ok = await unsubscribe(admin, data);
    return ok ? json({ ok: true }) : json({ error: "Contacto não encontrado." }, 404);
  }

  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);
  const p = url.searchParams.get("p") || "";
  const s = url.searchParams.get("s") || "";
  const data = await verify(p, s);

  if (!data) {
    // Pixel com assinatura errada: devolve a imagem na mesma, sem registar nada.
    return url.searchParams.get("o") ? pixel() : redirect(`${appUrl()}/email/confirmado?erro=1`);
  }

  if (data.a === "u") return redirect(`${appUrl()}/email/anular?${new URLSearchParams({ p, s })}`);

  const { data: contact } = await admin.from("contacts").select("id, email_open_points").eq("id", data.c).eq("brand_id", data.b).maybeSingle();

  if (data.a === "o") {
    if (contact) {
      await admin.rpc("mark_contact_engaged", { p_contact_id: contact.id });
      if ((contact.email_open_points || 0) < 10) {
        await admin.from("contacts").update({ email_open_points: (contact.email_open_points || 0) + 1 }).eq("id", contact.id);
        await admin.rpc("apply_lead_score", { p_contact_id: contact.id, p_delta: 1, p_reset: false });
      }
    }
    return pixel();
  }

  // Clique
  if (contact) {
    await admin.rpc("mark_contact_engaged", { p_contact_id: contact.id });
    if (data.t) {
      const { data: tag } = await admin.from("tags").select("id").eq("brand_id", data.b).ilike("name", String(data.t).replace(/[\\%_]/g, (ch) => "\\" + ch)).maybeSingle();
      if (tag) {
        await admin.from("contact_tags").upsert({ brand_id: data.b, contact_id: contact.id, tag_id: tag.id }, { onConflict: "contact_id,tag_id", ignoreDuplicates: true });
      }
    }
  }
  const target = typeof data.u === "string" && /^https?:\/\//i.test(data.u) ? data.u : `${appUrl()}/email/confirmado`;
  return redirect(target);
});
