// EMPOWER OS — notificações no telemóvel (Web Push).
//
//   GET  → { publicKey } (chave pública VAPID, para o browser subscrever).
//          Na primeira vez cria o par de chaves: privada no Vault, ref em push_config.
//   POST → { brandId, title, body, url, tag } com a service role no Authorization
//          (chamada pelo trigger de whatsapp_messages, migração 105). Envia o aviso
//          a todos os aparelhos de quem tem acesso à marca (push_targets) e apaga
//          os que o serviço de push diz que já não existem (404/410).
//
// "Verify JWT" DESLIGADO: o GET é público (a chave é pública) e o POST confirma
// a service role aqui dentro. Sem bibliotecas: cifra (RFC 8291, aes128gcm) e
// VAPID (RFC 8292) feitos com WebCrypto.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const enc = new TextEncoder();
function b64uEncode(bytes) {
  let s = "";
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64uDecode(str) {
  const s = String(str).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(s + "===".slice((s.length + 3) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function concat(...parts) {
  const len = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
async function hkdf(salt, ikm, info, length) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, length * 8));
}

// Cifra a mensagem para um aparelho (RFC 8291 + RFC 8188, um só registo).
async function encryptPayload(text, p256dh, authSecretB64) {
  const uaPublic = b64uDecode(p256dh);
  const authSecret = b64uDecode(authSecretB64);
  const asKeys = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", asKeys.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, asKeys.privateKey, 256));
  const ikm = await hkdf(authSecret, ecdhSecret, concat(enc.encode("WebPush: info\0"), uaPublic, asPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
  const aesKey = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const plain = concat(enc.encode(text), new Uint8Array([2]));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, plain));
  const rs = new Uint8Array([0, 0, 16, 0]); // 4096
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, cipher);
}

// Cabeçalho Authorization com o JWT VAPID (ES256) para o serviço de push.
async function vapidAuth(endpoint, publicKeyB64, privateD, subject) {
  const pub = b64uDecode(publicKeyB64);
  const key = await crypto.subtle.importKey(
    "jwk",
    { kty: "EC", crv: "P-256", x: b64uEncode(pub.slice(1, 33)), y: b64uEncode(pub.slice(33, 65)), d: privateD, ext: true },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const header = b64uEncode(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64uEncode(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject })));
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(`${header}.${claims}`));
  return `vapid t=${header}.${claims}.${b64uEncode(sig)}, k=${publicKeyB64}`;
}

// Chaves VAPID: criadas na primeira vez e guardadas (privada no Vault).
async function vapidKeys(admin) {
  const { data: row } = await admin.from("push_config").select("vapid_public, vapid_private_ref").eq("id", 1).maybeSingle();
  if (row) {
    const { data: d } = await admin.rpc("vault_read_secret", { p_id: row.vapid_private_ref });
    if (d) return { publicKey: row.vapid_public, privateD: d };
  }
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  const publicKey = b64uEncode(new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey)));
  const { data: ref, error } = await admin.rpc("vault_upsert_secret", { p_name: `push_vapid_private_${publicKey.slice(0, 16)}`, p_secret: jwk.d });
  if (error || !ref) throw new Error(`Não foi possível guardar a chave: ${error?.message || "sem resposta"}`);
  if (row) await admin.from("push_config").update({ vapid_public: publicKey, vapid_private_ref: ref }).eq("id", 1);
  else await admin.from("push_config").upsert({ id: 1, vapid_public: publicKey, vapid_private_ref: ref }, { onConflict: "id", ignoreDuplicates: true });
  // Se outra execução criou as chaves ao mesmo tempo, fica a que ficou guardada.
  const { data: saved } = await admin.from("push_config").select("vapid_public, vapid_private_ref").eq("id", 1).maybeSingle();
  if (saved && saved.vapid_public !== publicKey) {
    const { data: d } = await admin.rpc("vault_read_secret", { p_id: saved.vapid_private_ref });
    return { publicKey: saved.vapid_public, privateD: d };
  }
  return { publicKey, privateD: jwk.d };
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
async function isServiceKey(bearer, serviceRoleKey) {
  if (!bearer) return false;
  if (serviceRoleKey && safeEqual(bearer, serviceRoleKey)) return true;
  try {
    const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/auth/v1/admin/users?page=1&per_page=1`, {
      headers: { apikey: bearer, Authorization: `Bearer ${bearer}` },
      signal: AbortSignal.timeout(8000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const admin = createClient(supabaseUrl, serviceRoleKey);

  if (req.method === "GET") {
    try {
      const { publicKey } = await vapidKeys(admin);
      return json({ publicKey });
    } catch (e) {
      return json({ error: e?.message || "Sem chaves." }, 500);
    }
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!(await isServiceKey(bearer, serviceRoleKey))) return json({ error: "Sem permissão." }, 401);

  let body;
  try { body = await req.json(); } catch { return json({ error: "Corpo inválido." }, 400); }
  const brandId = String(body?.brandId || "");
  if (!/^[0-9a-f-]{36}$/i.test(brandId)) return json({ error: "Falta a marca." }, 400);

  const { data: targets, error } = await admin.rpc("push_targets", { p_brand: brandId });
  if (error) return json({ error: error.message }, 500);
  if (!targets?.length) return json({ ok: true, sent: 0 });

  const { publicKey, privateD } = await vapidKeys(admin);
  const subject = Deno.env.get("VAPID_SUBJECT") || Deno.env.get("APP_URL") || "https://big-boos.vercel.app";
  const message = JSON.stringify({
    title: String(body.title || "Big Boss").slice(0, 120),
    body: String(body.body || "").slice(0, 240),
    url: String(body.url || "/").startsWith("/") ? String(body.url || "/") : "/",
    tag: String(body.tag || "").slice(0, 80) || undefined,
  });

  let sent = 0, removed = 0, failed = 0;
  await Promise.all(targets.map(async (t) => {
    try {
      const payload = await encryptPayload(message, t.p256dh, t.auth);
      const res = await fetch(t.endpoint, {
        method: "POST",
        headers: {
          Authorization: await vapidAuth(t.endpoint, publicKey, privateD, subject),
          "Content-Encoding": "aes128gcm",
          "Content-Type": "application/octet-stream",
          TTL: "86400",
          Urgency: "high",
        },
        body: payload,
        signal: AbortSignal.timeout(10000),
      });
      if (res.status === 404 || res.status === 410) {
        await admin.from("push_subscriptions").delete().eq("id", t.id);
        removed++;
      } else if (res.ok) {
        sent++;
        await admin.from("push_subscriptions").update({ last_used_at: new Date().toISOString() }).eq("id", t.id);
      } else {
        failed++;
        console.error("push-notify:", res.status, (await res.text().catch(() => "")).slice(0, 200));
      }
    } catch (e) {
      failed++;
      console.error("push-notify:", e?.message || e);
    }
  }));
  return json({ ok: true, sent, removed, failed });
});
