// EMPOWER OS — submete templates de WhatsApp à Meta e verifica o
// estado de aprovação. Chamado pelo frontend via
// supabase.functions.invoke("whatsapp-templates", { body }).
//
// Um template é obrigatório para iniciar conversa fora da janela de
// 24h (regra da própria WhatsApp/Meta, não uma escolha nossa). A
// aprovação da Meta é assíncrona (horas/dias) — não há webhook aqui,
// o botão "Verificar estado" no frontend chama isto com action:"check".
//
// Meta: submete pela Graph API. Twilio: cria o conteúdo na Content API
// da Twilio e pede a aprovação ao WhatsApp (action "submit_twilio" para
// um template em rascunho já guardado, "check" para ver o estado).

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
    .select("provider, waba_id, twilio_account_sid, access_token_ref")
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

  const { data: token } = await adminClient.rpc("vault_read_secret", { p_id: account.access_token_ref });
  if (!token) return json({ error: "Não foi possível obter o token de acesso." }, 500);

  if (account.provider === "twilio") {
    const twilioAuth = `Basic ${btoa(`${account.twilio_account_sid}:${token}`)}`;

    // Submete um template guardado em rascunho (ex.: criado por migração).
    if (action === "submit_twilio") {
      const { templateId } = payload;
      if (!templateId) return json({ error: "Falta o templateId." }, 400);
      const { data: tpl } = await adminClient
        .from("whatsapp_templates")
        .select("id, name, language, category, body, variables, status, twilio_content_sid")
        .eq("id", templateId)
        .eq("brand_id", brandId)
        .maybeSingle();
      if (!tpl) return json({ error: "Template não encontrado." }, 404);
      if (tpl.status !== "draft" && tpl.status !== "rejected") return json({ error: "Este template já foi submetido." }, 400);
      if (!tpl.body) return json({ error: "O template não tem texto." }, 400);

      // Valores de exemplo exigidos pelo WhatsApp para cada {{n}}.
      const samples = Array.isArray(tpl.variables) ? tpl.variables : [];
      const variables = {};
      for (const m of tpl.body.matchAll(/\{\{(\d+)\}\}/g)) {
        const n = m[1];
        variables[n] = String(samples[Number(n) - 1] ?? `exemplo ${n}`);
      }

      let contentSid = tpl.twilio_content_sid;
      if (!contentSid || tpl.status === "rejected") {
        const createRes = await fetch("https://content.twilio.com/v1/Content", {
          method: "POST",
          headers: { Authorization: twilioAuth, "Content-Type": "application/json" },
          body: JSON.stringify({
            friendly_name: tpl.name,
            language: tpl.language || "pt_PT",
            variables,
            types: { "twilio/text": { body: tpl.body } },
          }),
        });
        const created = await createRes.json();
        if (!createRes.ok) return json({ error: created?.message || "A Twilio recusou o conteúdo." }, 502);
        contentSid = created.sid;
        await adminClient.from("whatsapp_templates").update({ twilio_content_sid: contentSid }).eq("id", tpl.id);
      }

      const approvalRes = await fetch(`https://content.twilio.com/v1/Content/${contentSid}/ApprovalRequests/whatsapp`, {
        method: "POST",
        headers: { Authorization: twilioAuth, "Content-Type": "application/json" },
        body: JSON.stringify({ name: tpl.name, category: tpl.category || "MARKETING" }),
      });
      const approval = await approvalRes.json();
      if (!approvalRes.ok) return json({ error: approval?.message || "A Twilio recusou o pedido de aprovação." }, 502);

      await adminClient.from("whatsapp_templates").update({ status: "pending" }).eq("id", tpl.id);
      return json({ ok: true, contentSid });
    }

    if (action === "check") {
      const { templateId } = payload;
      if (!templateId) return json({ error: "Falta o templateId." }, 400);
      const { data: tpl } = await adminClient.from("whatsapp_templates").select("id, twilio_content_sid").eq("id", templateId).eq("brand_id", brandId).maybeSingle();
      if (!tpl?.twilio_content_sid) return json({ error: "Template sem submissão à Twilio." }, 400);

      const res = await fetch(`https://content.twilio.com/v1/Content/${tpl.twilio_content_sid}/ApprovalRequests`, {
        headers: { Authorization: twilioAuth },
      });
      const data = await res.json();
      if (!res.ok) return json({ error: data?.message || "Não foi possível verificar o estado." }, 502);

      const wa = data?.whatsapp || {};
      const status = wa.status === "approved" ? "approved" : wa.status === "rejected" ? "rejected" : "pending";
      await adminClient.from("whatsapp_templates").update({ status }).eq("id", tpl.id);
      return json({ ok: true, status, rejectionReason: wa.rejection_reason || null });
    }

    return json({ error: "Esta ação não está disponível para contas ligadas via Twilio." }, 400);
  }

  if (account.provider !== "meta") {
    return json({ error: "Fornecedor de WhatsApp desconhecido." }, 400);
  }

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
