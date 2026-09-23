// EMPOWER OS — publica os posts sociais que já venceram.
// Chamado a cada minuto pelo pg_cron (ver supabase/39_social_publish_cron.sql).
//
// instagram/facebook/threads/linkedin/youtube/tiktok publicam de
// verdade (API oficial de cada uma). Qualquer plataforma sem
// publishXxx() aqui nunca chega a esta função com status='scheduled'
// — fica sempre 'manual_only' desde a criação (ver secção 16 do
// documento de arquitetura: nunca simular uma publicação que não
// aconteceu).
//
// TikTok: mesmo com sucesso na chamada da API, a publicação pode
// ainda cair na caixa de entrada da app do TikTok do dono da conta
// para um toque de confirmação, em vez de sair logo — limitação do
// scope "Direct Post" da própria TikTok, não nossa. Do lado do nosso
// sistema, a chamada ter sido aceite já conta como "publicado".

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

// Threads API — mesma família da Graph API/Instagram, mesmo padrão de
// 2 passos (criar container, depois publicar).
async function publishThreads(accountId, token, post) {
  const hasMedia = post.media_urls && post.media_urls.length > 0;
  const createRes = await fetch(`https://graph.threads.net/v1.0/${accountId}/threads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      media_type: hasMedia ? "IMAGE" : "TEXT",
      text: post.caption || "",
      ...(hasMedia ? { image_url: post.media_urls[0] } : {}),
      access_token: token,
    }),
  });
  const createData = await createRes.json();
  if (!createRes.ok) throw new Error(createData?.error?.message || "Falha ao preparar o post do Threads.");

  const publishRes = await fetch(`https://graph.threads.net/v1.0/${accountId}/threads_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ creation_id: createData.id, access_token: token }),
  });
  const publishData = await publishRes.json();
  if (!publishRes.ok) throw new Error(publishData?.error?.message || "Falha ao publicar no Threads.");
  return publishData.id;
}

// LinkedIn Posts API (Community Management), para Páginas de
// Organização. accountId é o URN da organização (ex:
// "urn:li:organization:12345"). LIMITAÇÃO CONHECIDA: só publica
// texto por agora — anexar imagem exige o fluxo de upload de assets
// da LinkedIn (registar upload, enviar os bytes, só depois referenciar
// o asset), que ainda não está construído; se o post tiver imagem,
// sai só o texto.
async function publishLinkedin(accountId, token, post) {
  const res = await fetch("https://api.linkedin.com/rest/posts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
      "LinkedIn-Version": "202401",
    },
    body: JSON.stringify({
      author: accountId,
      commentary: post.caption || "",
      visibility: "PUBLIC",
      distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.message || "Falha ao publicar no LinkedIn.");
  }
  return res.headers.get("x-restli-id") || res.headers.get("x-linkedin-id") || null;
}

// YouTube Data API v3 — upload resumível. Só serve vídeo (não imagem);
// post.media_urls[0] tem de ser um link direto para um ficheiro de
// vídeo, que é descarregado aqui e reenviado à Google.
async function publishYoutube(accountId, token, post) {
  const videoUrl = post.media_urls?.[0];
  if (!videoUrl) throw new Error("O YouTube precisa de um vídeo — este post não tem media_urls.");

  const initRes = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": "video/*" },
    body: JSON.stringify({
      snippet: { title: (post.caption || "Vídeo").slice(0, 100), description: post.caption || "" },
      status: { privacyStatus: "public" },
    }),
  });
  if (!initRes.ok) {
    const data = await initRes.json().catch(() => ({}));
    throw new Error(data?.error?.message || "Falha ao iniciar o upload no YouTube.");
  }
  const uploadUrl = initRes.headers.get("location");
  if (!uploadUrl) throw new Error("O YouTube não devolveu um URL de upload.");

  const videoRes = await fetch(videoUrl);
  if (!videoRes.ok) throw new Error("Não foi possível descarregar o vídeo para enviar ao YouTube.");
  const videoBytes = await videoRes.arrayBuffer();

  const putRes = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": "video/*" }, body: videoBytes });
  const putData = await putRes.json();
  if (!putRes.ok) throw new Error(putData?.error?.message || "Falha ao enviar o vídeo para o YouTube.");
  return putData.id;
}

// TikTok Content Posting API (Direct Post). Sem aprovação do scope
// "Direct Post", isto ainda funciona, mas o vídeo cai na caixa de
// entrada da app do TikTok do dono da conta para confirmação manual
// — ver nota no topo do ficheiro.
async function publishTiktok(accountId, token, post) {
  const videoUrl = post.media_urls?.[0];
  if (!videoUrl) throw new Error("O TikTok precisa de um vídeo — este post não tem media_urls.");

  const res = await fetch("https://open.tiktokapis.com/v2/post/publish/video/init/", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify({
      post_info: { title: post.caption || "", privacy_level: "SELF_ONLY", disable_duplicate_check: true },
      source_info: { source: "PULL_FROM_URL", video_url: videoUrl },
    }),
  });
  const data = await res.json();
  if (!res.ok || data?.error?.code !== "ok") throw new Error(data?.error?.message || "Falha ao publicar no TikTok.");
  return data.data?.publish_id || null;
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
      else if (account.platform === "threads") platformPostId = await publishThreads(account.external_account_id, token, post);
      else if (account.platform === "linkedin") platformPostId = await publishLinkedin(account.external_account_id, token, post);
      else if (account.platform === "youtube") platformPostId = await publishYoutube(account.external_account_id, token, post);
      else if (account.platform === "tiktok") platformPostId = await publishTiktok(account.external_account_id, token, post);
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
