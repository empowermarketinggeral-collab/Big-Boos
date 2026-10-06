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
// Com "template" (linha aprovada de whatsapp_templates) envia o template
// com as variáveis {{1}}, {{2}}… — obrigatório fora da janela de 24h.
async function sendWhatsappText(admin, brandId, toPhone, body, template = null, values = []) {
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
      body: new URLSearchParams(
        template
          ? {
              From: `whatsapp:${account.phone_number_id}`,
              To: `whatsapp:${toPhone}`,
              ContentSid: template.twilio_content_sid,
              ContentVariables: JSON.stringify(Object.fromEntries(values.map((v, i) => [String(i + 1), v]))),
            }
          : { From: `whatsapp:${account.phone_number_id}`, To: `whatsapp:${toPhone}`, Body: body }
      ),
    });
    const data = await res.json();
    ok = res.ok; msgId = data?.sid || null; errMsg = data?.message;
  } else {
    const res = await fetch(`https://graph.facebook.com/v20.0/${account.phone_number_id}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(
        template
          ? {
              messaging_product: "whatsapp", to: toPhone, type: "template",
              template: {
                name: template.name,
                language: { code: template.language || "pt_PT" },
                components: values.length ? [{ type: "body", parameters: values.map((text) => ({ type: "text", text })) }] : [],
              },
            }
          : { messaging_product: "whatsapp", to: toPhone, type: "text", text: { body } }
      ),
    });
    const data = await res.json();
    ok = res.ok; msgId = data?.messages?.[0]?.id || null; errMsg = data?.error?.message;
  }

  await admin.from("whatsapp_messages").insert({
    brand_id: brandId, conversation_id: conversation.id, direction: "outbound",
    wa_message_id: msgId, type: template ? "template" : "text", body, status: ok ? "sent" : "failed",
  });
  await admin.from("whatsapp_conversations").update({ last_message_at: new Date().toISOString() }).eq("id", conversation.id);

  if (!ok) throw new Error(`Falha ao enviar WhatsApp para ${toPhone}: ${errMsg || "erro desconhecido"}`);
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
  if (!res.ok) throw new Error(`Falha ao enviar SMS para ${toPhone}: ${data?.message || "erro desconhecido"}`);
}

// ---------------------------------------------------------
// Links assinados para a função email-click (mesma assinatura lá):
//   {{clique:tag|destino}}  link que põe a tag ao clicar e segue para o
//                           destino (URL ou nome de variável, ex.:
//                           proxima_oferta_link, link_anti_erros). Sem
//                           destino: página "escolha registada". Sem tag
//                           ({{clique:|destino}}): só conta o clique.
//   {{anular_subscricao}}   link para anular a subscrição
// Nos emails a contactos vai também o pixel de abertura e o cabeçalho
// List-Unsubscribe.
// ---------------------------------------------------------
const CLICK_BASE = `${Deno.env.get("SUPABASE_URL")}/functions/v1/email-click`;

function b64url(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

let linkKey = null;
async function signLink(payload) {
  if (!linkKey) {
    const secret = Deno.env.get("EMAIL_LINK_SECRET") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    linkKey = await crypto.subtle.importKey("raw", new TextEncoder().encode(`email-link:${secret}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  }
  return b64url(await crypto.subtle.sign("HMAC", linkKey, new TextEncoder().encode(payload))).slice(0, 32);
}

async function emailLink(brandId, contactId, action, extra = {}) {
  const p = b64url(new TextEncoder().encode(JSON.stringify({ b: brandId, c: contactId, a: action, ...extra })));
  return `${CLICK_BASE}?p=${p}&s=${await signLink(p)}${action === "o" ? "&o=1" : ""}`;
}

async function renderTrackedLinks(text, brandId, contact) {
  if (!text || !contact) return text;
  let out = text;
  if (out.includes("{{anular_subscricao}}")) {
    out = out.split("{{anular_subscricao}}").join(await emailLink(brandId, contact.id, "u"));
  }
  const matches = [...out.matchAll(/\{\{\s*clique:([^|{}]*)(?:\|([^{}]*))?\}\}/g)];
  for (const m of matches) {
    const tag = m[1].trim();
    const dest = (m[2] || "").trim();
    let target = "";
    if (/^https?:\/\//i.test(dest)) target = dest;
    else if (dest) {
      const value = contact.custom_fields?.[dest] ?? contact.__vars?.[dest];
      if (!value || !/^https?:\/\//i.test(String(value))) throw new Error(`Link sem destino válido: ${dest}`);
      target = String(value);
    }
    const extra = {};
    if (tag) extra.t = tag;
    if (target) extra.u = target;
    out = out.replace(m[0], await emailLink(brandId, contact.id, "c", extra));
  }
  return out;
}

// Variáveis da marca: catálogo Hotmart → {{link_<slug>}}, {{nome_<slug>}},
// {{preco_<slug>}} (hífens do slug passam a "_": anti-erros → link_anti_erros).
async function brandVariables(admin, brandId) {
  const vars = {};
  const { data: products } = await admin.from("hotmart_products").select("slug, name, price, checkout_url").eq("brand_id", brandId);
  for (const p of products || []) {
    const key = p.slug.replace(/-/g, "_");
    vars[`nome_${key}`] = p.name;
    if (p.checkout_url) vars[`link_${key}`] = p.checkout_url;
    if (p.price !== null && p.price !== undefined) vars[`preco_${key}`] = `${Number(p.price).toLocaleString("pt-PT")}€`;
  }
  return vars;
}

async function sendEmailViaResend(admin, brandId, toEmail, subject, html, text = null, extraHeaders = null) {
  const { data: domain } = await admin.from("email_domains").select("from_name, from_email, api_key_ref").eq("brand_id", brandId).maybeSingle();
  if (!domain) return { ok: false, providerRef: null, error: "Esta marca não tem email ligado." };

  const { data: apiKey } = await admin.rpc("vault_read_secret", { p_id: domain.api_key_ref });
  if (!apiKey) return { ok: false, providerRef: null, error: "Não foi possível obter a chave de envio." };

  const from = domain.from_name ? `${domain.from_name} <${domain.from_email}>` : domain.from_email;
  const payload = { from, to: toEmail, subject, html: html || "" };
  if (text) payload.text = text;
  if (extraHeaders) payload.headers = extraHeaders;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  return { ok: res.ok, providerRef: data?.id || null, error: res.ok ? null : data?.message || data?.error || JSON.stringify(data) };
}

// Emails escritos como texto simples (sem etiquetas HTML) seguem com
// parágrafos: linha em branco = novo parágrafo, quebra simples = <br>.
// Também vai a versão só texto (melhor entrega). Com HTML, fica como está.
const HTML_TAG = /<(p|br|div|a|strong|b|em|i|span|ul|ol|li|table|h[1-6])\b/i;
const escapeHtml = (v) => String(v).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);

// No texto simples, [texto](https://…) vira link; um parágrafo que seja só
// um link destes vira botão (cores em config.button = { bg, ink }).
const MD_OR_URL = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<]+)/g;
const ONLY_LINK = /^\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)$/;

function buildEmailBodies(body, preheader, button = null) {
  const hidden = preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preheader)}</div>`
    : "";
  if (HTML_TAG.test(body)) return { html: hidden + body, text: null };
  const paragraphs = body.replace(/\r\n/g, "\n").trim().split(/\n\s*\n/);
  const html = paragraphs
    .map((raw) => {
      const para = raw.trim();
      const only = button && para.match(ONLY_LINK);
      if (only) {
        return `<p style="margin:24px 0"><a href="${escapeHtml(only[2])}" style="display:inline-block;background:${escapeHtml(button.bg || "#1F1F1F")};color:${escapeHtml(button.ink || "#FFFFFF")};text-decoration:none;font-weight:600;padding:12px 22px;border-radius:3px">${escapeHtml(only[1])}</a></p>`;
      }
      const linked = para.replace(MD_OR_URL, (_m, label, href, bare) =>
        bare ? `\u0000${bare}\u0001${bare}\u0002` : `\u0000${href}\u0001${label}\u0002`);
      return `<p>${escapeHtml(linked)
        .replace(/\u0000([^\u0001]*)\u0001([^\u0002]*)\u0002/g, '<a href="$1">$2</a>')
        .replace(/\n/g, "<br>")}</p>`;
    })
    .join("\n");
  const text = body.trim().replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, "$1: $2");
  return { html: hidden + html, text };
}

// Substitui {{variavel}} pelos dados do contacto. Falha (em vez de enviar
// "Olá !") se alguma variável não tiver valor.
//   {{nome_marca|tua marca}}  valor de reserva quando o campo está vazio
//                             ({{campo|}} = pode ficar vazio)
//   Um campo cujo valor tem {{...}} (ex.: uma variante de parágrafo) é
//   preenchido também com os dados do contacto.
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

function parseDateField(raw) {
  if (!raw) return null;
  const d = new Date(`${String(raw).slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Variáveis calculadas a partir de campos do contacto.
function computedVariable(key, contact) {
  const cf = contact?.custom_fields || {};
  if (key === "em_mes_reuniao") return cf.mes_reuniao ? `em ${cf.mes_reuniao}` : undefined;
  if (key === "meses_desde_projeto") {
    const end = parseDateField(cf.data_fim_projeto);
    if (!end) return undefined;
    const now = new Date();
    return String(Math.max(0, (now.getUTCFullYear() - end.getUTCFullYear()) * 12 + now.getUTCMonth() - end.getUTCMonth()));
  }
  if (key === "data_limite_integracao") {
    if (cf.data_limite_integracao) return cf.data_limite_integracao;
    const delivered = parseDateField(cf.data_entrega_mapa);
    if (!delivered) return undefined;
    delivered.setUTCDate(delivered.getUTCDate() + 30);
    return `${delivered.getUTCDate()} de ${MESES[delivered.getUTCMonth()]}`;
  }
  return undefined;
}

function renderTemplate(text, contact, depth = 0) {
  if (!text) return text;
  const missing = [];
  const out = text.replace(/\{\{\s*(\w+)\s*(?:\|([^{}]*))?\}\}/g, (_m, key, fallback) => {
    let value;
    if (key === "primeiro_nome") value = (contact?.name || "").trim().split(/\s+/)[0];
    else if (key === "nome") value = contact?.name;
    else if (key === "email") value = contact?.email;
    else if (key === "telefone") value = contact?.phone;
    else if (key === "ano_seguinte") value = String(new Date().getFullYear() + 1);
    else value = contact?.custom_fields?.[key] ?? contact?.__vars?.[key] ?? computedVariable(key, contact);
    if (value === undefined || value === null || String(value).trim() === "") {
      if (fallback !== undefined) return fallback;
      missing.push(key);
      return "";
    }
    value = String(value);
    if (depth < 1 && value.includes("{{")) {
      try {
        value = renderTemplate(value, contact, depth + 1);
      } catch (err) {
        missing.push(`${key} (${String(err?.message || err).replace(/^Variável sem valor no contacto: /, "")})`);
      }
    }
    return value;
  });
  if (missing.length) throw new Error(`Variável sem valor no contacto: ${[...new Set(missing)].join(", ")}`);
  return out;
}

// Tarefas e avisos internos: se faltar uma variável, fica o texto sem ela
// (a tarefa é para a equipa, não deve falhar por isso).
function safeRender(text, contact) {
  try {
    return renderTemplate(text, contact);
  } catch {
    return String(text).replace(/\{\{\s*(\w+)\s*(?:\|([^{}]*))?\}\}/g, (_m, key, fb) =>
      contact?.custom_fields?.[key] || contact?.__vars?.[key] || (key === "nome" ? contact?.name : "") || fb || "");
  }
}

// Nunca sai um email com texto por preencher.
function assertNoPlaceholders(...parts) {
  for (const part of parts) {
    if (/\[AJUSTAR|\{\{|\}\}/.test(part || "")) {
      throw new Error("O email ainda tem texto por preencher ([AJUSTAR] ou {{...}}). Edita o passo antes de voltar a ativar.");
    }
  }
}

// ---------------------------------------------------------
// Janela de envio e limite semanal (trigger_config da automação):
//   sendWindow: { days: [2,3,4], start: "08:30", end: "10:00", tz: "Europe/Lisbon" }
//               dias ISO (1 = segunda … 7 = domingo)
//   maxEmailsPerWeek: 2   (conta todos os emails enviados ao contacto)
// Um passo com config.sendNow ignora os dois (ex.: resumo 1h após reunião).
// ---------------------------------------------------------
function zonedParts(date, tz) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23",
    }).formatToParts(date).map((p) => [p.type, p.value]),
  );
  const weekday = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[parts.weekday];
  return { year: +parts.year, month: +parts.month, day: +parts.day, hour: +parts.hour, minute: +parts.minute, weekday };
}

// Instante UTC de uma hora local (ano, mês, dia, hh:mm) no fuso indicado.
function zonedTimeToUtc(year, month, day, hour, minute, tz) {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const p = zonedParts(new Date(guess), tz);
  const offset = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - guess;
  return new Date(guess - offset);
}

// null = pode enviar já; senão, o próximo instante dentro da janela.
function nextSendWindow(from, win) {
  const tz = win.tz || "Europe/Lisbon";
  const days = Array.isArray(win.days) && win.days.length ? win.days.map(Number) : [1, 2, 3, 4, 5];
  const [sh, sm] = String(win.start || "08:30").split(":").map(Number);
  const [eh, em] = String(win.end || "10:00").split(":").map(Number);
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;
  const now = zonedParts(from, tz);
  const nowMin = now.hour * 60 + now.minute;
  if (days.includes(now.weekday) && nowMin >= startMin && nowMin < endMin) return null;
  for (let i = 0; i < 8; i++) {
    const probe = new Date(Date.UTC(now.year, now.month - 1, now.day + i, 12));
    const weekday = ((now.weekday - 1 + i) % 7) + 1;
    if (!days.includes(weekday) || (i === 0 && nowMin >= startMin)) continue;
    // Espalha os envios pela janela para não saírem todos ao mesmo minuto.
    const jitter = Math.floor(Math.random() * Math.max(1, endMin - startMin - 5));
    const minutes = startMin + jitter;
    return zonedTimeToUtc(probe.getUTCFullYear(), probe.getUTCMonth() + 1, probe.getUTCDate(), Math.floor(minutes / 60), minutes % 60, tz);
  }
  return null;
}

const normalize = (v) => String(v ?? "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

function conditionHolds(contact, cond) {
  // Lista de condições: todas têm de se verificar.
  if (Array.isArray(cond)) return cond.every((c) => conditionHolds(contact, c));
  const value = contact?.custom_fields?.[cond.field];
  const filled = normalize(value) !== "";
  if (cond.empty) return !filled;
  if (cond.equals !== undefined) return normalize(value) === normalize(cond.equals);
  if (cond.notEquals !== undefined) return normalize(value) !== normalize(cond.notEquals);
  return filled;
}

async function emailDeferral(admin, contact, triggerConfig, step) {
  if (step.config?.sendNow || !contact) return null;
  let earliest = new Date();
  const max = Number(triggerConfig?.maxEmailsPerWeek || 0);
  if (max > 0) {
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const { data: sends } = await admin
      .from("email_sends")
      .select("sent_at")
      .eq("contact_id", contact.id)
      .eq("status", "sent")
      .gt("sent_at", weekAgo)
      .order("sent_at", { ascending: true });
    if (sends && sends.length >= max) {
      // Liberta-se quando o envio mais antigo que conta sair dos 7 dias.
      earliest = new Date(new Date(sends[sends.length - max].sent_at).getTime() + 7 * 86400000 + 60000);
    }
  }
  const win = triggerConfig?.sendWindow;
  const windowStart = win ? nextSendWindow(earliest, win) : null;
  const target = windowStart || earliest;
  return target.getTime() > Date.now() + 30000 ? target : null;
}

// Paragem automática: tag de paragem (ex.: já comprou), tag posta depois do
// arranque (ex.: respondeu) ou resposta do contacto no WhatsApp.
async function shouldCancel(admin, run, contact, triggerConfig) {
  if (!contact) return false;
  const stopTagIds = triggerConfig?.stopTagIds;
  if (Array.isArray(stopTagIds) && stopTagIds.length) {
    const { data } = await admin.from("contact_tags").select("tag_id").eq("contact_id", contact.id).in("tag_id", stopTagIds).limit(1);
    if (data && data.length) return true;
  }
  // Tags que param a automação só se forem postas DEPOIS de ela arrancar
  // (ex.: sinal:respondeu — quem respondeu no passado pode entrar num fluxo
  // novo, mas uma resposta a meio para-o).
  const stopAfterIds = triggerConfig?.stopIfTaggedAfterStartIds;
  if (Array.isArray(stopAfterIds) && stopAfterIds.length) {
    const { data, error } = await admin
      .from("contact_tags")
      .select("tag_id")
      .eq("contact_id", contact.id)
      .in("tag_id", stopAfterIds)
      .gt("created_at", run.created_at)
      .limit(1);
    if (error) console.error("automations-run: stopIfTaggedAfterStartIds", error.message);
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
      // config.consentEmail: marca o consentimento de email (ex.: quem se inscreveu
      // de propósito na newsletter já o pediu).
      if (!contact || !config.fields || typeof config.fields !== "object") return;
      const merged = { ...(contact.custom_fields || {}), ...config.fields };
      const patch = { custom_fields: merged };
      if (config.consentEmail) patch.opted_in_email = true;
      const { error } = await admin.from("contacts").update(patch).eq("id", contact.id);
      if (error) throw new Error(error.message);
      contact.custom_fields = merged;
      if (config.consentEmail) contact.opted_in_email = true;
      return;
    }
    case "create_task": {
      await admin.from("activities").insert({
        brand_id: brandId,
        contact_id: contact?.id || null,
        type: "task",
        body: safeRender(config.title || "Tarefa da automação", contact),
        due_at: config.dueInMinutes ? new Date(Date.now() + config.dueInMinutes * 60000).toISOString() : null,
      });
      return;
    }
    case "send_whatsapp": {
      if (!contact?.phone) throw new Error(`Contacto "${contact?.name || contact?.id || "desconhecido"}" sem telefone.`);
      if (config.templateName) {
        const { data: tpl } = await admin
          .from("whatsapp_templates")
          .select("name, language, body, status, twilio_content_sid")
          .eq("brand_id", brandId)
          .eq("name", config.templateName)
          .eq("status", "approved")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!tpl) throw new Error(`O template "${config.templateName}" ainda não está aprovado.`);
        const values = (config.templateVariables || []).map((v) => renderTemplate(String(v), contact));
        const text = (tpl.body || "").replace(/\{\{(\d+)\}\}/g, (_m, n) => values[Number(n) - 1] ?? "");
        await sendWhatsappText(admin, brandId, contact.phone, text, tpl, values);
        return;
      }
      await sendWhatsappText(admin, brandId, contact.phone, renderTemplate(config.body || "", contact));
      return;
    }
    case "send_sms": {
      if (!contact?.phone) throw new Error(`Contacto "${contact?.name || contact?.id || "desconhecido"}" sem telefone.`);
      await sendSmsText(admin, brandId, contact.phone, renderTemplate(config.body || "", contact), contact.id);
      return;
    }
    case "send_email": {
      if (!contact?.email) throw new Error("O contacto não tem email.");
      const subject = renderTemplate(config.subject || "", contact);
      const rendered = renderTemplate(await renderTrackedLinks(config.body || "", brandId, contact), contact);
      const preheader = config.preheader ? renderTemplate(config.preheader, contact) : "";
      assertNoPlaceholders(subject, rendered, preheader);
      const { html, text } = buildEmailBodies(rendered, preheader, config.button || null);
      const unsubscribe = await emailLink(brandId, contact.id, "u");
      const openPixel = `<img src="${await emailLink(brandId, contact.id, "o")}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0">`;
      const result = await sendEmailViaResend(admin, brandId, contact.email, subject, html + openPixel, text, {
        "List-Unsubscribe": `<${unsubscribe}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      });
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
    case "create_deal":
    case "move_pipeline_stage": {
      // config: { pipelineId, stageId, title?, value?, onlyForward? }
      //   create_deal: cria o negócio se o contacto ainda não tiver um aberto
      //                nesse pipeline (se tiver, move-o — só para a frente).
      //   move_pipeline_stage: move o negócio aberto; sem negócio, cria-o.
      if (!contact || !config.pipelineId || !config.stageId) throw new Error("Falta o pipeline ou a fase.");
      const { data: stages } = await admin
        .from("pipeline_stages")
        .select("id, position, is_won, is_lost")
        .eq("brand_id", brandId)
        .eq("pipeline_id", config.pipelineId);
      const target = (stages || []).find((s) => s.id === config.stageId);
      if (!target) throw new Error("A fase do pipeline já não existe.");
      const status = target.is_won ? "won" : target.is_lost ? "lost" : "open";
      const { data: open } = await admin
        .from("deals")
        .select("id, stage_id")
        .eq("brand_id", brandId)
        .eq("pipeline_id", config.pipelineId)
        .eq("contact_id", contact.id)
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (open) {
        const current = (stages || []).find((s) => s.id === open.stage_id);
        const forwardOnly = config.onlyForward !== false;
        if (open.stage_id === target.id || (forwardOnly && current && current.position >= target.position && !target.is_lost)) return;
        const { error } = await admin.from("deals").update({ stage_id: target.id, status }).eq("id", open.id);
        if (error) throw new Error(error.message);
        return;
      }
      const title = renderTemplate(config.title || "{{nome}}", contact);
      const { error } = await admin.from("deals").insert({
        brand_id: brandId, pipeline_id: config.pipelineId, stage_id: target.id, contact_id: contact.id,
        title, value: config.value ?? null, status,
      });
      if (error) throw new Error(error.message);
      return;
    }
    case "notify_team": {
      // Aviso interno (sino) à equipa da agência e à marca.
      const { data: brand } = await admin.from("brands").select("agency_id").eq("id", brandId).maybeSingle();
      if (!brand?.agency_id) return;
      await admin.from("notifications").insert({
        agency_id: brand.agency_id, brand_id: brandId, area: "crm",
        message: safeRender(config.message || "{{nome}} precisa de atenção.", contact),
      });
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
    if (contact) contact.__vars = { ...(await brandVariables(admin, run.brand_id)), pontuacao: String(contact.lead_score ?? 0) };
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
      // Condição simples por passo: config.onlyIf = { field, equals? , notEquals?, empty? }
      //   { field: "x" }                 corre só se o campo x estiver preenchido
      //   { field: "x", equals: "sim" }  corre só se x = "sim" (sem maiúsculas/acentos a contar)
      //   { field: "x", empty: true }    corre só se x estiver vazio
      if (step.config?.onlyIf && !conditionHolds(contact, step.config.onlyIf)) continue;
      // config.requireConsent: email de marketing — sem consentimento, salta.
      if (step.config?.requireConsent && !contact?.opted_in_email) continue;
      if (step.action_type === "send_email") {
        const deferUntil = await emailDeferral(admin, contact, automation?.trigger_config, step);
        if (deferUntil) {
          // Volta a este passo na próxima janela / quando houver folga semanal.
          await admin
            .from("automation_runs")
            .update({ status: "waiting", current_step_id: idx > 0 ? steps[idx - 1].id : null, next_run_at: deferUntil.toISOString() })
            .eq("id", run.id);
          return;
        }
      }
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

  // Agrupa as execuções que falharam neste ciclo (e nos anteriores, se
  // ainda por notificar) numa notificação por automação — ver
  // supabase/72_automation_failure_notifications.sql.
  const { data: notified, error: notifyError } = await admin.rpc("notify_automation_failures");
  if (notifyError) console.error("automations-run: falha ao agrupar notificações", notifyError.message);

  return new Response(JSON.stringify({ processed: dueRuns?.length || 0, notificationsCreated: notified ?? 0 }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
