// EMPOWER OS — submete templates de WhatsApp à Meta e verifica o
// estado de aprovação. Chamado pelo frontend via
// supabase.functions.invoke("whatsapp-templates", { body }).
//
// Um template é obrigatório para iniciar conversa fora da janela de
// 24h (regra da própria WhatsApp/Meta, não uma escolha nossa). A
// aprovação da Meta é assíncrona (horas/dias) — não há webhook aqui,
// o botão "Verificar estado" no frontend chama isto com action:"check".
//
// Só suporta provider='meta' por agora. A Twilio tem a sua própria
// API de Conteúdo para templates (diferente da Graph API) — fica por
// fazer nesta fase; devolve erro claro em vez de falhar silenciosamente.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const META_STATUS_MAP = { APPROVED: "approved", PENDING: "pending", REJECTED: "rejected" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization") || "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

  let payload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Corpo do pedido inválido." }, 400);
  }
  const { brandId, action } = payload;
  if (!brandId || !action) return json({ error: "Faltam campos obrigatórios." }, 400);

  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: brand, error: brandError } = await userClient.from("brands").select("id").eq("id", brandId).maybeSingle();
  if (brandError || !brand) return json({ error: "Sem acesso a esta marca." }, 403);

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const { data: account } = await adminClient
    .from("whatsapp_accounts")
    .select("provider, waba_id, access_token_ref")
    .eq("brand_id", brandId)
    .maybeSingle();
  if (!account) return json({ error: "Esta marca não tem WhatsApp ligado." }, 400);

  // Conta Twilio: não submetemos à Meta por aqui (API de Conteúdo da
  // Twilio é diferente) — o template é criado/aprovado no Content
  // Template Builder da própria Twilio, e só registamos aqui o Content
  // SID que isso gera, para o podermos usar a enviar.
  if (action === "register_twilio") {
    if (account.provider !== "twilio") return json({ error: "Esta marca não está ligada via Twilio." }, 400);
    const { name, language, twilioContentSid, body, variables } = payload;
    if (!name || !twilioContentSid) return json({ error: "Falta o nome ou o Content SID." }, 400);

    const { error: insertError } = await adminClient.from("whatsapp_templates").insert({
      brand_id: brandId,
      name,
      language: language || "pt_PT",
      body: body || "",
      variables: variables || [],
      status: "approved",
      twilio_content_sid: twilioContentSid,
    });
    if (insertError) return json({ error: insertError.message }, 500);
    return json({ ok: true });
  }

  if (account.provider !== "meta") {
    return json({ error: "Esta ação só está disponível para contas ligadas via Meta (não via Twilio)." }, 400);
  }

  const { data: token } = await adminClient.rpc("vault_read_secret", { p_id: account.access_token_ref });
  if (!token) return json({ error: "Não foi possível obter o token de acesso." }, 500);

  if (action === "submit") {
    const { name, language, category, body, variables } = payload;
    if (!name || !body) return json({ error: "Falta o nome ou o texto do template." }, 400);

    const res = await fetch(`https://graph.facebook.com/v20.0/${account.waba_id}/message_templates`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        language: language || "pt_PT",
        category: category || "MARKETING",
        components: [{ type: "BODY", text: body }],
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      return json({ error: data?.error?.message || "A Meta recusou o template." }, 502);
    }

    const { error: upsertError } = await adminClient.from("whatsapp_templates").insert({
      brand_id: brandId,
      name,
      language: language || "pt_PT",
      category: category || "MARKETING",
      body,
      variables: variables || [],
      status: "pending",
      meta_template_id: data.id,
    });
    if (upsertError) return json({ error: upsertError.message }, 500);

    return json({ ok: true, metaTemplateId: data.id });
  }

  if (action === "check") {
    const { templateId } = payload;
    if (!templateId) return json({ error: "Falta o templateId." }, 400);

    const { data: templateRow } = await adminClient.from("whatsapp_templates").select("id, meta_template_id").eq("id", templateId).eq("brand_id", brandId).maybeSingle();
    if (!templateRow?.meta_template_id) return json({ error: "Template sem submissão à Meta." }, 400);

    const res = await fetch(`https://graph.facebook.com/v20.0/${templateRow.meta_template_id}?fields=status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok) return json({ error: data?.error?.message || "Não foi possível verificar o estado." }, 502);

    const status = META_STATUS_MAP[data.status] || "pending";
    await adminClient.from("whatsapp_templates").update({ status }).eq("id", templateId);

    return json({ ok: true, status });
  }

  return json({ error: `Ação desconhecida: ${action}` }, 400);
});
