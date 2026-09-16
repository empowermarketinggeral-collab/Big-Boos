// EMPOWER OS — publica os posts sociais que já venceram.
// Chamado a cada minuto pelo pg_cron (ver supabase/39_social_publish_cron.sql).
// Só instagram/facebook publicam de verdade (API oficial); qualquer
// outra plataforma nunca chega aqui com status='scheduled' — fica
// sempre 'manual_only' desde a criação (ver secção 16 do documento
// de arquitetura: nunca simular uma publicação que não aconteceu).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

async function publishInstagram(accountId, token, post) {
  const createRes = await fetch(`https://graph.facebook.com/v20.0/${accountId}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image_url: post.media_urls?.[0], caption: post.caption || "", access_token: token }),
  });
  const createData = await createRes.json();
  if (!createRes.ok) throw new Error(createData?.error?.message || "Falha ao preparar o post do Instagram.");

  const publishRes = await fetch(`https://graph.facebook.com/v20.0/${accountId}/media_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ creation_id: createData.id, access_token: token }),
  });
  const publishData = await publishRes.json();
  if (!publishRes.ok) throw new Error(publishData?.error?.message || "Falha ao publicar no Instagram.");
  return publishData.id;
}

async function publishFacebook(accountId, token, post) {
  const hasMedia = post.media_urls && post.media_urls.length > 0;
  const url = hasMedia ? `https://graph.facebook.com/v20.0/${accountId}/photos` : `https://graph.facebook.com/v20.0/${accountId}/feed`;
  const body = hasMedia
    ? { url: post.media_urls[0], caption: post.caption || "", access_token: token }
    : { message: post.caption || "", access_token: token };
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || "Falha ao publicar no Facebook.");
  return data.id || data.post_id;
}

Deno.serve(async () => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const admin = createClient(supabaseUrl, serviceRoleKey);

  const { data: duePosts, error } = await admin
    .from("social_posts")
    .select("*")
    .eq("status", "scheduled")
    .lte("scheduled_at", new Date().toISOString())
    .limit(50);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  let published = 0, failed = 0;
  for (const post of duePosts || []) {
    await admin.from("social_posts").update({ status: "publishing" }).eq("id", post.id);

    const { data: account } = await admin
      .from("social_accounts")
      .select("platform, external_account_id, access_token_ref")
      .eq("id", post.social_account_id)
      .maybeSingle();

    if (!account || !account.access_token_ref) {
      await admin.from("social_posts").update({ status: "failed", failure_reason: "Conta social não encontrada ou sem token." }).eq("id", post.id);
      failed++;
      continue;
    }

    try {
      const { data: token } = await admin.rpc("vault_read_secret", { p_id: account.access_token_ref });
      if (!token) throw new Error("Não foi possível obter o token de acesso.");

      let platformPostId;
      if (account.platform === "instagram") platformPostId = await publishInstagram(account.external_account_id, token, post);
      else if (account.platform === "facebook") platformPostId = await publishFacebook(account.external_account_id, token, post);
      else throw new Error(`Publicação automática não suportada para ${account.platform}.`);

      await admin.from("social_posts").update({
        status: "published", published_at: new Date().toISOString(), platform_post_id: platformPostId, failure_reason: null,
      }).eq("id", post.id);
      published++;
    } catch (err) {
      await admin.from("social_posts").update({ status: "failed", failure_reason: String(err?.message || err) }).eq("id", post.id);
      failed++;
    }
  }

  return new Response(JSON.stringify({ published, failed }), { status: 200, headers: { "Content-Type": "application/json" } });
});
