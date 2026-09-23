// EMPOWER OS — envia os lembretes de marcações (24h antes, 1h antes,
// pós-visita). Chamado a cada ~15 minutos pelo pg_cron (ver
// supabase/42_booking_reminders_cron.sql). A confirmação imediata ao
// marcar é tratada dentro do booking-create, não aqui.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function fillTemplate(template, vars) {
  return (template || "").replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "");
}

async function sendWhatsappText(admin, brandId, toPhone, body) {
  const { data: account } = await admin.from("whatsapp_accounts").select("provider, phone_number_id, twilio_account_sid, access_token_ref").eq("brand_id", brandId).maybeSingle();
  if (!account) throw new Error("Esta marca não tem WhatsApp ligado.");
  const { data: token } = await admin.rpc("vault_read_secret", { p_id: account.access_token_ref });
  if (!token) throw new Error("Não foi possível obter o token de acesso.");

  let { data: conversation } = await admin.from("whatsapp_conversations").select("id").eq("brand_id", brandId).eq("wa_contact_phone", toPhone).maybeSingle();
  if (!conversation) {
    const { data: created } = await admin.from("whatsapp_conversations").insert({ brand_id: brandId, wa_contact_phone: toPhone }).select("id").single();
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

async function sendEmail(admin, brandId, toEmail, subject, html, contactId) {
  const { data: domain } = await admin.from("email_domains").select("from_name, from_email, api_key_ref").eq("brand_id", brandId).maybeSingle();
  if (!domain) throw new Error("Esta marca não tem email ligado.");
  const { data: apiKey } = await admin.rpc("vault_read_secret", { p_id: domain.api_key_ref });
  if (!apiKey) throw new Error("Não foi possível obter a chave de envio.");
  const from = domain.from_name ? `${domain.from_name} <${domain.from_email}>` : domain.from_email;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: toEmail, subject, html }),
  });
  const data = await res.json();

  // email_sends.contact_id é obrigatório — sem contacto CRM ligado à
  // marcação (ex: cliente convidado, sem ficha), não há onde registar
  // o envio; envia-se na mesma, só não fica esse registo de tracking.
  if (contactId) {
    await admin.from("email_sends").insert({
      brand_id: brandId,
      contact_id: contactId,
      provider_ref: data?.id || null,
      status: res.ok ? "sent" : "failed",
      error: res.ok ? null : data?.message || data?.error || JSON.stringify(data),
      sent_at: res.ok ? new Date().toISOString() : null,
    });
  }
  if (!res.ok) throw new Error(data?.message || "Falha ao enviar email.");
}

async function notify(admin, appt, setting, defaultText) {
  const vars = {
    nome: appt.customer_name,
    servico: appt.booking_services?.name || "",
    data: new Date(appt.starts_at).toLocaleDateString("pt-PT"),
    hora: new Date(appt.starts_at).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" }),
  };
  const text = fillTemplate(setting.message_template, vars) || defaultText(vars);
  if (setting.channel === "whatsapp" && appt.customer_phone) await sendWhatsappText(admin, appt.brand_id, appt.customer_phone, text);
  if (setting.channel === "sms" && appt.customer_phone) await sendSmsText(admin, appt.brand_id, appt.customer_phone, text, appt.contact_id);
  if (setting.channel === "email" && appt.customer_email) await sendEmail(admin, appt.brand_id, appt.customer_email, "Marcação", text, appt.contact_id);
}

// As funções de envio acima lançam erro em falha (ex: marca sem canal
// ligado, ou a API do fornecedor a recusar). Isola cada marcação para
// uma falha não travar o resto do lote neste ciclo do cron.
async function notifySafe(admin, appt, setting, defaultText) {
  try {
    await notify(admin, appt, setting, defaultText);
  } catch (err) {
    console.error("Falha ao notificar marcação", { apptId: appt.id, channel: setting.channel, error: String(err?.message || err) });
  }
}

Deno.serve(async () => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const admin = createClient(supabaseUrl, serviceRoleKey);

  const now = Date.now();
  let sent24h = 0, sent1h = 0, sentPostVisit = 0;

  // 24h antes — janela de 23h50 a 24h10 para caber na cadência do cron
  {
    const from = new Date(now + 23.83 * 3600000).toISOString();
    const to = new Date(now + 24.17 * 3600000).toISOString();
    const { data: settings } = await admin.from("booking_reminder_settings").select("*").eq("type", "reminder_24h").eq("enabled", true);
    for (const setting of settings || []) {
      const { data: appts } = await admin
        .from("booking_appointments")
        .select("*, booking_services(name)")
        .eq("brand_id", setting.brand_id).eq("status", "confirmed").eq("reminder_24h_sent", false)
        .gte("starts_at", from).lte("starts_at", to);
      for (const appt of appts || []) {
        await notifySafe(admin, appt, setting, (v) => `Lembrete: tens ${v.servico} marcado amanhã, ${v.data} às ${v.hora}.`);
        await admin.from("booking_appointments").update({ reminder_24h_sent: true }).eq("id", appt.id);
        sent24h++;
      }
    }
  }

  // 1h antes — janela de 50 a 70 minutos
  {
    const from = new Date(now + 50 * 60000).toISOString();
    const to = new Date(now + 70 * 60000).toISOString();
    const { data: settings } = await admin.from("booking_reminder_settings").select("*").eq("type", "reminder_1h").eq("enabled", true);
    for (const setting of settings || []) {
      const { data: appts } = await admin
        .from("booking_appointments")
        .select("*, booking_services(name)")
        .eq("brand_id", setting.brand_id).eq("status", "confirmed").eq("reminder_1h_sent", false)
        .gte("starts_at", from).lte("starts_at", to);
      for (const appt of appts || []) {
        await notifySafe(admin, appt, setting, (v) => `Lembrete: tens ${v.servico} marcado daqui a 1 hora, às ${v.hora}.`);
        await admin.from("booking_appointments").update({ reminder_1h_sent: true }).eq("id", appt.id);
        sent1h++;
      }
    }
  }

  // Pós-visita — a marcação já acabou, ainda não foi assinalada
  {
    const { data: settings } = await admin.from("booking_reminder_settings").select("*").eq("type", "post_visit").eq("enabled", true);
    for (const setting of settings || []) {
      const { data: appts } = await admin
        .from("booking_appointments")
        .select("*, booking_services(name)")
        .eq("brand_id", setting.brand_id).eq("status", "confirmed").eq("post_visit_sent", false)
        .lte("ends_at", new Date(now).toISOString());
      for (const appt of appts || []) {
        const reviewLine = setting.review_link ? ` Se gostaste, avalia-nos aqui: ${setting.review_link}` : "";
        await notifySafe(admin, appt, setting, (v) => `Obrigado pela tua visita, ${v.nome}!${reviewLine}`);
        await admin.from("booking_appointments").update({ post_visit_sent: true, status: "completed" }).eq("id", appt.id);
        sentPostVisit++;
      }
    }
  }

  return new Response(JSON.stringify({ sent24h, sent1h, sentPostVisit }), { status: 200, headers: { "Content-Type": "application/json" } });
});
