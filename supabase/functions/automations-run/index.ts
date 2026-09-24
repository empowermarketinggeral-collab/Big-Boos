// EMPOWER OS — processa as automações que já podem avançar.
// Chamado a cada minuto pelo pg_cron (ver supabase/33_automations_cron.sql),
// nunca pelo frontend — por isso não precisa de tratar CORS nem de
// verificar um utilizador (usa sempre a service role).
//
// Cada automation_run avança passo a passo: uma sequência de ações
// corre de imediato, uma pelo outra, até encontrar um passo "esperar"
// (aí marca a data do próximo tick) ou até acabarem os passos
// (marca "completed"). Isto evita ficar preso a um passo por minuto
// quando não há nenhuma espera real a fazer.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Suporta os dois fornecedores ligados em whatsapp-connect: 'meta'
// (Cloud API direta) e 'twilio' (alternativa quando a verificação de
// negócio da Meta fica bloqueada — ver docs/GUIA_TWILIO.md).
async function sendWhatsappText(admin, brandId, toPhone, body) {
  const { data: account } = await admin
    .from("whatsapp_accounts")
    .select("provider, phone_number_id, twilio_account_sid, access_token_ref")
    .eq("brand_id", brandId)
    .maybeSingle();
  if (!account) throw new Error("Esta marca não tem WhatsApp ligado.");

  const { data: token } = await admin.rpc("vault_read_secret", { p_id: account.access_token_ref });
  if (!token) throw new Error("Não foi possível obter o token de acesso.");

  let { data: conversation } = await admin
    .from("whatsapp_conversations")
    .select("id")
    .eq("brand_id", brandId)
    .eq("wa_contact_phone", toPhone)
    .maybeSingle();

  if (!conversation) {
    const { data: created } = await admin
      .from("whatsapp_conversations")
      .insert({ brand_id: brandId, wa_contact_phone: toPhone })
      .select("id")
      .single();
    conversation = created;
  }

  let ok, msgId, errMsg;
  if (account.provider === "twilio") {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${account.twilio_account_sid}/Messages.json`, {
      method: "POST",
      headers: { Authorization: `Basic ${btoa(`${account.twilio_account_sid}:${token}`)}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ From: `whatsapp:${account.phone_number_id}`, To: `whatsapp:${toPhone}`, Body: body }),
    });
    const data = await res.json();
    ok = res.ok; msgId = data?.sid || null; errMsg = data?.message;
  } else {
    const res = await fetch(`https://graph.facebook.com/v20.0/${account.phone_number_id}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to: toPhone, type: "text", text: { body } }),
    });
    const data = await res.json();
    ok = res.ok; msgId = data?.messages?.[0]?.id || null; errMsg = data?.error?.message;
  }

  await admin.from("whatsapp_messages").insert({
    brand_id: brandId, conversation_id: conversation.id, direction: "outbound",
    wa_message_id: msgId, type: "text", body, status: ok ? "sent" : "failed",
  });
  await admin.from("whatsapp_conversations").update({ last_message_at: new Date().toISOString() }).eq("id", conversation.id);

  if (!ok) throw new Error(errMsg || "Falha ao enviar WhatsApp.");
}

async function sendSmsText(admin, brandId, toPhone, body, contactId) {
  const { data: account } = await admin.from("sms_accounts").select("account_sid, from_number, auth_token_ref").eq("brand_id", brandId).maybeSingle();
  if (!account) throw new Error("Esta marca não tem SMS ligado.");

  const { data: token } = await admin.rpc("vault_read_secret", { p_id: account.auth_token_ref });
  if (!token) throw new Error("Não foi possível obter o token de acesso.");

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${account.account_sid}/Messages.json`, {
    method: "POST",
    headers: { Authorization: `Basic ${btoa(`${account.account_sid}:${token}`)}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ From: account.from_number, To: toPhone, Body: body }),
  });
  const data = await res.json();

  await admin.from("sms_messages").insert({
    brand_id: brandId, contact_id: contactId || null, to_number: toPhone, body, direction: "outbound",
    provider_ref: data?.sid || null, status: res.ok ? "sent" : "failed",
  });
  if (!res.ok) throw new Error(data?.message || "Falha ao enviar SMS.");
}

async function sendEmailViaResend(admin, brandId, toEmail, subject, html) {
  const { data: domain } = await admin.from("email_domains").select("from_name, from_email, api_key_ref").eq("brand_id", brandId).maybeSingle();
  if (!domain) return { ok: false, providerRef: null, error: "Esta marca não tem email ligado." };

  const { data: apiKey } = await admin.rpc("vault_read_secret", { p_id: domain.api_key_ref });
  if (!apiKey) return { ok: false, providerRef: null, error: "Não foi possível obter a chave de envio." };

  const from = domain.from_name ? `${domain.from_name} <${domain.from_email}>` : domain.from_email;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: toEmail, subject, html: html || "" }),
  });
  const data = await res.json();
  return { ok: res.ok, providerRef: data?.id || null, error: res.ok ? null : data?.message || data?.error || JSON.stringify(data) };
}

// Substitui {{variavel}} pelos dados do contacto. Falha (em vez de enviar
// "Olá !") se alguma variável não tiver valor.
function renderTemplate(text, contact) {
  if (!text) return text;
  const missing = [];
  const out = text.replace(/\{\{\s*([\w]+)\s*\}\}/g, (_m, key) => {
    let value;
    if (key === "primeiro_nome") value = (contact?.name || "").trim().split(/\s+/)[0];
    else if (key === "nome") value = contact?.name;
    else if (key === "email") value = contact?.email;
    else if (key === "telefone") value = contact?.phone;
    else if (key === "ano_seguinte") value = String(new Date().getFullYear() + 1);
    else value = contact?.custom_fields?.[key];
    if (value === undefined || value === null || String(value).trim() === "") missing.push(key);
    return String(value ?? "");
  });
  if (missing.length) throw new Error(`Variável sem valor no contacto: ${[...new Set(missing)].join(", ")}`);
  return out;
}

// Paragem automática: tag de paragem (ex.: já comprou) ou resposta do contacto no WhatsApp.
async function shouldCancel(admin, run, contact, triggerConfig) {
  if (!contact) return false;
  const stopTagIds = triggerConfig?.stopTagIds;
  if (Array.isArray(stopTagIds) && stopTagIds.length) {
    const { data } = await admin.from("contact_tags").select("tag_id").eq("contact_id", contact.id).in("tag_id", stopTagIds).limit(1);
    if (data && data.length) return true;
  }
  if (triggerConfig?.stopOnReply) {
    const { data: convs } = await admin.from("whatsapp_conversations").select("id").eq("brand_id", run.brand_id).eq("contact_id", contact.id);
    if (convs && convs.length) {
      const { count } = await admin
        .from("whatsapp_messages")
        .select("id", { count: "exact", head: true })
        .in("conversation_id", convs.map((c) => c.id))
        .eq("direction", "inbound")
        .gt("created_at", run.created_at);
      if (count && count > 0) return true;
    }
  }
  return false;
}

// Espera relativa a uma data guardada no contacto (ex.: início do curso - 7 dias).
// Devolve null se a data já passou (o passo é saltado).
function computeUntilFieldTime(contact, config) {
  const raw = contact?.custom_fields?.[config.untilField];
  if (!raw) throw new Error(`O contacto não tem o campo de data "${config.untilField}".`);
  const base = new Date(`${String(raw).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(base.getTime())) throw new Error(`Data inválida em "${config.untilField}": ${raw}`);
  base.setUTCDate(base.getUTCDate() + Number(config.offsetDays || 0));
  base.setUTCHours(Number(config.hourUTC ?? 9), 0, 0, 0);
  return base.getTime() > Date.now() ? base : null;
}

async function runAction(admin, brandId, step, contact) {
  const config = step.config || {};
  switch (step.action_type) {
    case "add_tag": {
      if (!contact || !config.tagId) return;
      await admin.from("contact_tags").upsert({ brand_id: brandId, contact_id: contact.id, tag_id: config.tagId });
      return;
    }
    case "remove_tag": {
      if (!contact || !config.tagId) return;
      await admin.from("contact_tags").delete().eq("contact_id", contact.id).eq("tag_id", config.tagId);
      return;
    }
    case "update_contact": {
      // Guarda campos personalizados (ex.: linha_interesse) para as mensagens seguintes usarem.
      if (!contact || !config.fields || typeof config.fields !== "object") return;
      const merged = { ...(contact.custom_fields || {}), ...config.fields };
      const { error } = await admin.from("contacts").update({ custom_fields: merged }).eq("id", contact.id);
      if (error) throw new Error(error.message);
      contact.custom_fields = merged;
      return;
    }
    case "create_task": {
      await admin.from("activities").insert({
        brand_id: brandId,
        contact_id: contact?.id || null,
        type: "task",
        body: config.title || "Tarefa da automação",
        due_at: config.dueInMinutes ? new Date(Date.now() + config.dueInMinutes * 60000).toISOString() : null,
      });
      return;
    }
    case "send_whatsapp": {
      if (!contact?.phone) throw new Error("O contacto não tem telefone.");
      await sendWhatsappText(admin, brandId, contact.phone, renderTemplate(config.body || "", contact));
      return;
    }
    case "send_sms": {
      if (!contact?.phone) throw new Error("O contacto não tem telefone.");
      await sendSmsText(admin, brandId, contact.phone, renderTemplate(config.body || "", contact), contact.id);
      return;
    }
    case "send_email": {
      if (!contact?.email) throw new Error("O contacto não tem email.");
      const result = await sendEmailViaResend(admin, brandId, contact.email, renderTemplate(config.subject || "", contact), renderTemplate(config.body || "", contact));
      await admin.from("email_sends").insert({
        brand_id: brandId,
        automation_step_id: step.id,
        contact_id: contact.id,
        provider_ref: result.providerRef,
        status: result.ok ? "sent" : "failed",
        error: result.ok ? null : result.error,
        sent_at: result.ok ? new Date().toISOString() : null,
      });
      if (!result.ok) throw new Error(result.error || "Falha ao enviar email.");
      return;
    }
    case "http_request": {
      if (!config.url) return;
      await fetch(config.url, {
        method: config.method || "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact, ...(config.payload || {}) }),
      });
      return;
    }
    default:
      throw new Error(`Ação não suportada: ${step.action_type}`);
  }
}

async function processRun(admin, run) {
  const { data: steps } = await admin
    .from("automation_steps")
    .select("*")
    .eq("automation_id", run.automation_id)
    .order("position", { ascending: true });

  if (!steps || steps.length === 0) {
    await admin.from("automation_runs").update({ status: "completed" }).eq("id", run.id);
    return;
  }

  let idx = run.current_step_id ? steps.findIndex((s) => s.id === run.current_step_id) : -1;

  let contact = null;
  if (run.contact_id) {
    const { data } = await admin.from("contacts").select("*").eq("id", run.contact_id).maybeSingle();
    contact = data;
  }

  const { data: automation } = await admin.from("automations").select("trigger_config, status").eq("id", run.automation_id).maybeSingle();
  if (automation?.status === "paused") return;
  if (await shouldCancel(admin, run, contact, automation?.trigger_config)) {
    await admin.from("automation_runs").update({ status: "cancelled" }).eq("id", run.id);
    return;
  }

  while (true) {
    idx++;
    if (idx >= steps.length) {
      await admin.from("automation_runs").update({ status: "completed", current_step_id: steps[steps.length - 1].id }).eq("id", run.id);
      return;
    }
    const step = steps[idx];

    if (step.type === "wait") {
      let nextRunAt;
      if (step.config?.untilField) {
        try {
          const target = computeUntilFieldTime(contact, step.config);
          if (!target) continue;
          nextRunAt = target;
        } catch (err) {
          await admin.from("automation_runs").update({ status: "failed", current_step_id: step.id, error: String(err?.message || err) }).eq("id", run.id);
          return;
        }
      } else {
        nextRunAt = new Date(Date.now() + (step.wait_minutes || 0) * 60000);
      }
      await admin
        .from("automation_runs")
        .update({ status: "waiting", current_step_id: step.id, next_run_at: nextRunAt.toISOString() })
        .eq("id", run.id);
      return;
    }

    if (step.type === "action") {
      try {
        await runAction(admin, run.brand_id, step, contact);
      } catch (err) {
        // Passo opcional (ex.: email a um contacto sem email): regista o erro e continua.
        if (step.config?.optional) {
          await admin.from("automation_runs").update({ error: `Passo opcional ignorado: ${String(err?.message || err)}` }).eq("id", run.id);
          continue;
        }
        await admin
          .from("automation_runs")
          .update({ status: "failed", current_step_id: step.id, error: String(err?.message || err) })
          .eq("id", run.id);
        return;
      }
      continue; // já corre o passo seguinte, sem esperar pelo próximo ciclo do cron
    }

    // "condition" ainda não tem UI — falha em vez de ficar preso para sempre.
    await admin
      .from("automation_runs")
      .update({ status: "failed", current_step_id: step.id, error: `Tipo de passo não suportado: ${step.type}` })
      .eq("id", run.id);
    return;
  }
}

Deno.serve(async () => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const admin = createClient(supabaseUrl, serviceRoleKey);

  const { data: dueRuns, error } = await admin
    .from("automation_runs")
    .select("*")
    .eq("status", "waiting")
    .lte("next_run_at", new Date().toISOString())
    .limit(50);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  for (const run of dueRuns || []) {
    await processRun(admin, run);
  }

  return new Response(JSON.stringify({ processed: dueRuns?.length || 0 }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
