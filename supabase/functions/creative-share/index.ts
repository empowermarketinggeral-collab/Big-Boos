// EMPOWER OS — página pública de opções de design (Criativos).
//
// Chamada SEM login pela página /criativos/<token>. O token (256 bits) é
// a única credencial; só a equipa o consegue ler (creative_share_links).
// Ações:
//   { action: "view", token }
//   { action: "decide", token, optionId, decision: "approved"|"rejected", name, comment? }
//   { action: "comment", token, optionId, name, body, version? }
//
// Só mostra opções já enviadas (nunca rascunhos). Os ficheiros estão num
// bucket privado: a função devolve URLs assinadas e temporárias (1 hora)
// e só para caminhos da própria marca. Os ficheiros finais só saem
// quando a opção está aprovada.
//
// Precisa de "Verify JWT" DESLIGADO — a segurança vem do token.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const BUCKET = "creatives";
const URL_TTL_SECONDS = 3600;
const MAX_CLIENT_COMMENTS_PER_OPTION = 100;

// Todas as strings (dentro do conteúdo de uma versão) que são caminhos da marca.
function collectPaths(value, brandId, out) {
  if (typeof value === "string") {
    if (value.startsWith(`${brandId}/`) && !value.includes("..")) out.add(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectPaths(item, brandId, out);
  } else if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectPaths(item, brandId, out);
  }
}

async function loadProject(admin, token) {
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{32,200}$/.test(token)) return null;
  const { data: link } = await admin.from("creative_share_links").select("project_id, brand_id").eq("token", token).maybeSingle();
  if (!link) return null;
  const { data: project } = await admin.from("creative_projects").select("id, brand_id, kind, title").eq("id", link.project_id).maybeSingle();
  return project || null;
}

async function loadOption(admin, project, optionId) {
  if (typeof optionId !== "string") return null;
  const { data: option } = await admin
    .from("creative_options")
    .select("id, title, status, brand_id")
    .eq("id", optionId).eq("project_id", project.id).maybeSingle();
  if (!option || option.status === "draft") return null;
  return option;
}

async function notifyTeam(admin, project, message) {
  try {
    const { data: agencyId } = await admin.rpc("brand_agency", { target_brand: project.brand_id });
    if (!agencyId) return;
    await admin.from("notifications").insert({ agency_id: agencyId, brand_id: project.brand_id, area: "criativos", message: message.slice(0, 500) });
  } catch (err) {
    console.error("creative-share: não foi possível avisar a equipa", String(err?.message || err));
  }
}

const cleanName = (v) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, 120);

async function view(admin, project) {
  const { data: brand } = await admin.from("brands").select("name, logo_url").eq("id", project.brand_id).maybeSingle();
  const { data: options } = await admin
    .from("creative_options")
    .select("id, title, status, decided_at, decided_by_name, final_files, position, created_at")
    .eq("project_id", project.id).neq("status", "draft")
    .order("position", { ascending: true }).order("created_at", { ascending: true });
  const ids = (options || []).map((o) => o.id);

  const { data: versions } = ids.length
    ? await admin.from("creative_versions").select("option_id, version, note, content, created_at").in("option_id", ids).order("version", { ascending: true })
    : { data: [] };
  const { data: comments } = ids.length
    ? await admin.from("creative_comments").select("option_id, version, author_name, from_client, body, created_at").in("option_id", ids).order("created_at", { ascending: true })
    : { data: [] };

  const paths = new Set();
  for (const v of versions || []) collectPaths(v.content, project.brand_id, paths);
  const pathList = [...paths].slice(0, 300);
  const urls = {};
  if (pathList.length) {
    const { data: signed } = await admin.storage.from(BUCKET).createSignedUrls(pathList, URL_TTL_SECONDS);
    for (const s of signed || []) if (s.path && s.signedUrl) urls[s.path] = s.signedUrl;
  }

  const out = [];
  for (const o of options || []) {
    let finalFiles = [];
    if (o.status === "approved") {
      for (const f of Array.isArray(o.final_files) ? o.final_files.slice(0, 30) : []) {
        if (typeof f?.path !== "string" || !f.path.startsWith(`${project.brand_id}/`) || f.path.includes("..")) continue;
        const { data: signed } = await admin.storage.from(BUCKET).createSignedUrl(f.path, URL_TTL_SECONDS, { download: String(f.name || "ficheiro").slice(0, 120) });
        if (signed?.signedUrl) finalFiles.push({ name: f.name || "ficheiro", size: f.size || null, url: signed.signedUrl });
      }
    }
    out.push({
      id: o.id, title: o.title, status: o.status, decidedAt: o.decided_at, decidedByName: o.decided_by_name, finalFiles,
      versions: (versions || []).filter((v) => v.option_id === o.id).map((v) => ({ version: v.version, note: v.note, content: v.content, createdAt: v.created_at })),
      comments: (comments || []).filter((c) => c.option_id === o.id).map((c) => ({ version: c.version, authorName: c.author_name, fromClient: c.from_client, body: c.body, createdAt: c.created_at })),
    });
  }
  return { project: { title: project.title, kind: project.kind }, brand: { name: brand?.name || "", logoUrl: brand?.logo_url || null }, options: out, urls };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Pedido inválido." }, 400);
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
  const project = await loadProject(admin, body.token);
  if (!project) return json({ error: "Esta ligação não existe ou foi desativada." }, 404);

  if (body.action === "view") return json(await view(admin, project));

  if (body.action === "decide" || body.action === "comment") {
    const option = await loadOption(admin, project, body.optionId);
    if (!option) return json({ error: "Opção não encontrada." }, 404);
    const name = cleanName(body.name);
    if (name.length < 2) return json({ error: "Escreva o seu nome." }, 400);

    if (body.action === "decide") {
      if (body.decision !== "approved" && body.decision !== "rejected") return json({ error: "Decisão inválida." }, 400);
      const text = String(body.comment ?? "").trim().slice(0, 2000);
      if (body.decision === "rejected" && !text) return json({ error: "Diga-nos o que mudar para podermos melhorar." }, 400);
      const { error } = await admin.from("creative_options")
        .update({ status: body.decision, decided_at: new Date().toISOString(), decided_by_name: name })
        .eq("id", option.id);
      if (error) return json({ error: "Não foi possível guardar a decisão." }, 500);
      if (text) {
        const { data: last } = await admin.from("creative_versions").select("version").eq("option_id", option.id).order("version", { ascending: false }).limit(1);
        await admin.from("creative_comments").insert({ option_id: option.id, brand_id: option.brand_id, version: last?.[0]?.version ?? null, author_name: name, from_client: true, body: text });
      }
      await notifyTeam(admin, project, `${name} ${body.decision === "approved" ? "aprovou" : "rejeitou"} «${option.title}» (${project.title}).${text ? ` Comentário: ${text}` : ""}`);
      return json({ ok: true, status: body.decision });
    }

    const text = String(body.body ?? "").trim().slice(0, 2000);
    if (!text) return json({ error: "Escreva o comentário." }, 400);
    const { count } = await admin.from("creative_comments").select("id", { count: "exact", head: true }).eq("option_id", option.id).eq("from_client", true);
    if ((count || 0) >= MAX_CLIENT_COMMENTS_PER_OPTION) return json({ error: "Limite de comentários atingido. Fale diretamente com a equipa." }, 429);
    const version = Number.isInteger(body.version) ? body.version : null;
    const { error } = await admin.from("creative_comments").insert({ option_id: option.id, brand_id: option.brand_id, version, author_name: name, from_client: true, body: text });
    if (error) return json({ error: "Não foi possível guardar o comentário." }, 500);
    await notifyTeam(admin, project, `${name} comentou «${option.title}» (${project.title}): ${text}`);
    return json({ ok: true });
  }

  return json({ error: "Ação desconhecida." }, 400);
});
