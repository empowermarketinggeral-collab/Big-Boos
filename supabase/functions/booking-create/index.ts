// EMPOWER OS — confirma uma marcação (serviço + profissional + upsells).
// Chamado pela página pública de marcação (sem login) e pela app das
// clientes (/app/<slug>, com a sessão da cliente no Authorization).
// Revalida a disponibilidade no momento da escrita (não confia só no
// que o browser calculou antes) para evitar duas pessoas a marcarem
// o mesmo horário do mesmo profissional em simultâneo.
//
// CONTACTO: com sessão de cliente (client_accounts desta marca) usa a
// ficha dela; sem sessão, reconhece o contacto pelo telefone (E.164),
// depois pelo email, ou cria um novo — mesma lógica do formulário.
//
// PACK: só com sessão de cliente. Gasta 1 sessão do pack
// (client_pack_consume) e a marcação fica confirmada sem sinal. Se a
// marcação for cancelada, um trigger devolve a sessão.
//
// PROFISSIONAL: staffId de um profissional ou "any" (sem preferência).
// Só profissionais atribuídos ao serviço, dentro do seu horário semanal.
//
// SINAL/DEPÓSITO: se a marca pedir sinal (booking_payment_settings),
// a marcação nasce como "pending_payment" e devolve um paymentUrl do
// Stripe Checkout — só fica "confirmed" quando o webhook recebe
// checkout.session.completed. Com Stripe próprio da marca
// (brand_stripe_accounts) o dinheiro cai na conta dela e quem confirma
// é o stripe-brand-webhook; sem isso usa a chave global
// (STRIPE_SECRET_KEY) e o stripe-webhook. "Clientes novos" = sem
// nenhuma marcação confirmada ou concluída (inclui o histórico
// importado) e sem a tag de cliente antiga (is_returning_customer). pending_payment também ocupa o horário; a
// booking-reminders cancela as abandonadas há mais de 30 minutos.
//
// UPSELLS: vêm da lista da marca ligada a este serviço
// (booking_service_upsell_links → booking_upsells).
// OPÇÕES OBRIGATÓRIAS: booking_services.option_groups; o pedido traz
// options = { idDoGrupo: idDaOpção } e cada grupo tem de ter uma opção
// válida. Preço e minutos das opções somam-se ao serviço; a escolha fica
// em booking_appointments.selected_options.
//
// "Verify JWT" DESLIGADO: a página pública chama sem sessão.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const TZ = "Europe/Lisbon";
const fmtDate = (d) => d.toLocaleDateString("pt-PT", { timeZone: TZ });
const fmtTime = (d) => d.toLocaleTimeString("pt-PT", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });

function fillTemplate(template, vars) {
  return (template || "").replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "");
}

function normalizePhone(raw, countryCode = "351") {
  let p = String(raw || "").trim().replace(/[^\d+]/g, "");
  if (!p) return "";
  if (p.startsWith("00")) p = "+" + p.slice(2);
  if (!p.startsWith("+")) {
    if (p.length === 9) p = `+${countryCode}${p}`;
    else if (p.length >= 10) p = `+${p}`;
    else return "";
  }
  const digits = p.slice(1);
  if (!/^\d{8,15}$/.test(digits)) return "";
  return "+" + digits;
}

const isHttpUrl = (v) => typeof v === "string" && /^https?:\/\//i.test(v);

async function sendWhatsappText(admin, brandId, toPhone, body) {
  const { data: account } = await admin.from("whatsapp_accounts").select("provider, phone_number_id, twilio_account_sid, access_token_ref").eq("brand_id", brandId).maybeSingle();
  if (!account) return;
  const { data: token } = await admin.rpc("vault_read_secret", { p_id: account.access_token_ref });
  if (!token) return;

  let { data: conversation } = await admin.from("whatsapp_conversations").select("id").eq("brand_id", brandId).eq("wa_contact_phone", toPhone).maybeSingle();
  if (!conversation) {
    const { data: created } = await admin.from("whatsapp_conversations").insert({ brand_id: brandId, wa_contact_phone: toPhone }).select("id").single();
    conversation = created;
  }

  let ok, msgId;
  if (account.provider === "twilio") {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${account.twilio_account_sid}/Messages.json`, {
      method: "POST",
      headers: { Authorization: `Basic ${btoa(`${account.twilio_account_sid}:${token}`)}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ From: `whatsapp:${account.phone_number_id}`, To: `whatsapp:${toPhone}`, Body: body }),
    });
    const data = await res.json();
    ok = res.ok; msgId = data?.sid || null;
  } else {
    const res = await fetch(`https://graph.facebook.com/v20.0/${account.phone_number_id}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to: toPhone, type: "text", text: { body } }),
    });
    const data = await res.json();
    ok = res.ok; msgId = data?.messages?.[0]?.id || null;
  }

  await admin.from("whatsapp_messages").insert({
    brand_id: brandId, conversation_id: conversation.id, direction: "outbound",
    wa_message_id: msgId, type: "text", body, status: ok ? "sent" : "failed",
  });
}

async function sendSmsText(admin, brandId, toPhone, body, contactId) {
  const { data: account } = await admin.from("sms_accounts").select("account_sid, from_number, auth_token_ref").eq("brand_id", brandId).maybeSingle();
  if (!account) return;
  const { data: token } = await admin.rpc("vault_read_secret", { p_id: account.auth_token_ref });
  if (!token) return;
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
}

async function sendEmail(admin, brandId, toEmail, subject, html) {
  const { data: domain } = await admin.from("email_domains").select("from_name, from_email, api_key_ref").eq("brand_id", brandId).maybeSingle();
  if (!domain) return;
  const { data: apiKey } = await admin.rpc("vault_read_secret", { p_id: domain.api_key_ref });
  if (!apiKey) return;
  const from = domain.from_name ? `${domain.from_name} <${domain.from_email}>` : domain.from_email;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: toEmail, subject, html }),
  });
}

async function sendConfirmation(admin, brandId, contactId, name, phone, email, serviceName, start) {
  const { data: confirmationSetting } = await admin
    .from("booking_reminder_settings")
    .select("enabled, channel, message_template")
    .eq("brand_id", brandId).eq("type", "confirmation").maybeSingle();
  if (!confirmationSetting?.enabled) return;
  const vars = { nome: name, primeiro_nome: String(name || "").trim().split(/\s+/)[0] || "", servico: serviceName, data: fmtDate(start), hora: fmtTime(start) };
  const text = fillTemplate(confirmationSetting.message_template, vars) || `A tua marcação de ${serviceName} ficou confirmada para ${vars.data} às ${vars.hora}.`;
  if (confirmationSetting.channel === "whatsapp" && phone) await sendWhatsappText(admin, brandId, phone, text);
  if (confirmationSetting.channel === "sms" && phone) await sendSmsText(admin, brandId, phone, text, contactId);
  if (confirmationSetting.channel === "email" && email) await sendEmail(admin, brandId, email, "Marcação confirmada", text);
}

// Hora de Lisboa de um instante: dia da semana, dia e minutos desde a meia-noite.
const WEEKDAYS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
function lisbonClock(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, hourCycle: "h23", weekday: "short", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type).value;
  return { weekday: WEEKDAYS[get("weekday")], day: `${get("year")}-${get("month")}-${get("day")}`, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

// O profissional trabalha nesse intervalo (horário semanal), não está de
// folga e não tem outra marcação (pending_payment também ocupa o horário,
// para duas pessoas não reservarem o mesmo slot enquanto uma paga).
async function staffFree(admin, brandId, staffId, start, end) {
  const s = lisbonClock(start);
  const e = lisbonClock(end);
  const endMinutes = e.day === s.day ? e.minutes : 24 * 60 + e.minutes;
  const toMin = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
  const { data: rules } = await admin.from("booking_availability").select("start_time, end_time").eq("brand_id", brandId).eq("staff_id", staffId).eq("weekday", s.weekday);
  if (!(rules || []).some((r) => toMin(r.start_time) <= s.minutes && endMinutes <= toMin(r.end_time))) return false;

  const { data: clash } = await admin
    .from("booking_appointments").select("id")
    .eq("brand_id", brandId).eq("staff_id", staffId).in("status", ["confirmed", "pending_payment"])
    .lt("starts_at", end.toISOString()).gt("ends_at", start.toISOString()).limit(1);
  if (clash && clash.length > 0) return false;

  const { data: timeOff } = await admin
    .from("booking_time_off").select("id")
    .eq("staff_id", staffId).lt("starts_at", end.toISOString()).gt("ends_at", start.toISOString()).limit(1);
  if (timeOff && timeOff.length > 0) return false;

  // Google Agenda da profissional (se o ligou): períodos já sincronizados e,
  // por cima, uma verificação ao vivo — cobre os minutos desde a última
  // sincronização (supabase/84_google_calendar.sql).
  const { data: external } = await admin
    .from("booking_external_busy").select("id")
    .eq("staff_id", staffId).lt("starts_at", end.toISOString()).gt("ends_at", start.toISOString()).limit(1);
  if (external && external.length > 0) return false;
  return !(await googleBusyLive(admin, staffId, start, end));
}

// Pergunta ao Google Agenda da profissional, neste momento, se o intervalo
// está ocupado. Se a Google não responder (ou ela não ligou o Google Agenda),
// devolve false: nunca trava uma marcação por causa de um serviço externo.
async function googleBusyLive(admin, staffId, start, end) {
  try {
    const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
    const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
    if (!clientId || !clientSecret) return false;
    const { data: connection } = await admin.from("booking_staff_google").select("refresh_token_ref, calendar_id").eq("staff_id", staffId).eq("status", "connected").maybeSingle();
    if (!connection?.refresh_token_ref) return false;
    const { data: refreshToken } = await admin.rpc("vault_read_secret", { p_id: connection.refresh_token_ref });
    if (!refreshToken) return false;

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }),
      signal: AbortSignal.timeout(4000),
    });
    const tokens = await tokenRes.json().catch(() => ({}));
    if (!tokenRes.ok || !tokens.access_token) return false;

    const calendarId = connection.calendar_id || "primary";
    const res = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
      method: "POST",
      headers: { Authorization: `Bearer ${tokens.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ timeMin: start.toISOString(), timeMax: end.toISOString(), timeZone: TZ, items: [{ id: calendarId }] }),
      signal: AbortSignal.timeout(4000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return false;
    const entry = data.calendars?.[calendarId] || Object.values(data.calendars || {})[0];
    if (!entry || (entry.errors && entry.errors.length > 0)) return false;
    return (entry.busy || []).length > 0;
  } catch (err) {
    console.error("booking-create: verificação no Google Agenda falhou (segue sem ela)", String(err?.message || err));
    return false;
  }
}

// Chave Stripe da própria marca (Vault); sem ela, a global da plataforma.
async function stripeKeyFor(admin, brandId) {
  const { data: account } = await admin.from("brand_stripe_accounts").select("secret_key_ref").eq("brand_id", brandId).maybeSingle();
  if (account?.secret_key_ref) {
    const { data: key } = await admin.rpc("vault_read_secret", { p_id: account.secret_key_ref });
    if (key) return key;
  }
  return Deno.env.get("STRIPE_SECRET_KEY") || null;
}

// Cliente com sessão iniciada na app desta marca (ou null).
async function clientFromRequest(admin, req, brandId) {
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!jwt) return null;
  try {
    const { data } = await admin.auth.getUser(jwt);
    const user = data?.user;
    if (!user) return null;
    const { data: account } = await admin.from("client_accounts").select("contact_id").eq("user_id", user.id).eq("brand_id", brandId).maybeSingle();
    if (!account) return null;
    const { data: contact } = await admin.from("contacts").select("id, name, email, phone").eq("id", account.contact_id).eq("brand_id", brandId).maybeSingle();
    return contact || null;
  } catch {
    return null; // anon key ou token inválido → marcação pública normal
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const admin = createClient(supabaseUrl, serviceRoleKey);

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Corpo do pedido inválido." }, 400);
  }
  const { brandId, serviceId, staffId, startsAt, upsellIds, options, clientPackId, successUrl, cancelUrl } = body;
  if (!brandId || !serviceId || !staffId || !startsAt) {
    return json({ error: "Faltam campos obrigatórios." }, 400);
  }

  const client = await clientFromRequest(admin, req, brandId);
  const name = client ? client.name : String(body.name || "").trim().slice(0, 120);
  const phone = client ? client.phone || "" : normalizePhone(body.phone);
  const email = client ? client.email || "" : String(body.email || "").trim().slice(0, 200);
  if (!name) return json({ error: "Indique o seu nome." }, 400);
  if (!client && body.phone && !phone) return json({ error: "O telemóvel não parece válido." }, 400);
  if (!phone && !email) return json({ error: "Indique o telemóvel ou o email." }, 400);
  if (clientPackId && !client) return json({ error: "Entre na sua conta para usar um pack." }, 401);

  const { data: service } = await admin.from("booking_services").select("name, duration_minutes, price, status, option_groups").eq("id", serviceId).eq("brand_id", brandId).maybeSingle();
  if (!service || service.status !== "active") {
    return json({ error: "Serviço não encontrado." }, 404);
  }

  let selectedUpsells = [];
  if (Array.isArray(upsellIds) && upsellIds.length > 0) {
    const { data: links } = await admin
      .from("booking_service_upsell_links")
      .select("booking_upsells!inner(id, name, price, extra_duration_minutes, status)")
      .eq("service_id", serviceId).in("upsell_id", upsellIds.slice(0, 50));
    selectedUpsells = (links || [])
      .map((l) => l.booking_upsells)
      .filter((u) => u?.status === "active")
      .map((u) => ({ id: u.id, name: u.name, price: u.price, extra_duration_minutes: u.extra_duration_minutes }));
  }

  // Opções obrigatórias: uma escolha válida por grupo.
  const selectedOptions = [];
  for (const group of Array.isArray(service.option_groups) ? service.option_groups : []) {
    const choices = Array.isArray(group?.choices) ? group.choices : [];
    if (!choices.length) continue;
    const picked = choices.find((ch) => ch.id === options?.[group.id]);
    if (!picked) return json({ error: `Escolha uma opção em "${group.name || "Opções"}".` }, 400);
    selectedOptions.push({
      group_id: group.id, group: group.name || "", id: picked.id, name: picked.name || "",
      price: Number(picked.price) || 0, extra_minutes: Math.max(0, parseInt(picked.extra_minutes, 10) || 0),
    });
  }

  const extraMinutes = selectedUpsells.reduce((sum, u) => sum + (u.extra_duration_minutes || 0), 0)
    + selectedOptions.reduce((sum, o) => sum + o.extra_minutes, 0);
  const totalPrice = Math.round(((Number(service.price) || 0)
    + selectedUpsells.reduce((sum, u) => sum + (Number(u.price) || 0), 0)
    + selectedOptions.reduce((sum, o) => sum + o.price, 0)) * 100) / 100;

  const start = new Date(startsAt);
  if (Number.isNaN(start.getTime())) return json({ error: "Horário inválido." }, 400);
  const end = new Date(start.getTime() + (service.duration_minutes + extraMinutes) * 60000);
  if (start.getTime() <= Date.now()) {
    return json({ error: "Esse horário já passou." }, 400);
  }

  // Profissionais que fazem o serviço (booking_service_staff; sem ninguém
  // atribuído = qualquer um). "any" = sem preferência: fica a primeira livre.
  const { data: activeStaff } = await admin.from("booking_staff").select("id").eq("brand_id", brandId).eq("status", "active").order("created_at");
  const { data: assigned } = await admin.from("booking_service_staff").select("staff_id").eq("service_id", serviceId);
  const assignedIds = (assigned || []).map((a) => a.staff_id);
  const eligible = (activeStaff || []).map((st) => st.id).filter((id) => !assignedIds.length || assignedIds.includes(id));
  const candidates = staffId === "any" ? eligible : eligible.filter((id) => id === staffId);
  if (!candidates.length) return json({ error: "Esta profissional não faz este serviço." }, 409);
  let chosenStaffId = null;
  for (const id of candidates) {
    if (await staffFree(admin, brandId, id, start, end)) { chosenStaffId = id; break; }
  }
  if (!chosenStaffId) {
    return json({ error: "Esse horário acabou de ficar indisponível. Escolha outro." }, 409);
  }

  let contactId = client?.id || null;
  if (!contactId && phone) {
    const { data } = await admin.from("contacts").select("id").eq("brand_id", brandId).eq("phone", phone).maybeSingle();
    contactId = data?.id || null;
  }
  if (!contactId && email) {
    const escaped = email.replace(/[\\%_]/g, (ch) => "\\" + ch);
    const { data } = await admin.from("contacts").select("id").eq("brand_id", brandId).ilike("email", escaped).maybeSingle();
    contactId = data?.id || null;
  }
  if (!contactId) {
    const { data: created, error: contactError } = await admin
      .from("contacts")
      .insert({ brand_id: brandId, name, email: email || null, phone: phone || null, source: "agendamento" })
      .select("id")
      .single();
    if (contactError) return json({ error: "Não foi possível registar o contacto." }, 500);
    contactId = created.id;
  }

  // Pack: confirma que é desta cliente antes de gastar a sessão.
  let packId = null;
  if (clientPackId) {
    const { data: pack } = await admin.from("client_packs").select("id").eq("id", clientPackId).eq("brand_id", brandId).eq("contact_id", contactId).maybeSingle();
    if (!pack) return json({ error: "Pack não encontrado." }, 404);
    packId = pack.id;
  }

  // Sinal/depósito — nunca quando a marcação é paga com pack.
  let depositRequired = false;
  let paymentSettings = null;
  if (!packId) {
    const { data } = await admin.from("booking_payment_settings").select("enabled, percentage, scope").eq("brand_id", brandId).maybeSingle();
    paymentSettings = data;
    if (paymentSettings?.enabled) {
      if (paymentSettings.scope === "all") {
        depositRequired = true;
      } else {
        // Já teve marcação confirmada/concluída, ou tem a tag de cliente
        // antiga (booking_payment_settings.exempt_tag_id) = não paga sinal.
        const { data: returning } = await admin.rpc("is_returning_customer", { p_brand: brandId, p_contact: contactId });
        depositRequired = returning !== true;
      }
    }
  }
  const depositAmount = depositRequired ? Math.round(totalPrice * (paymentSettings.percentage / 100) * 100) / 100 : null;
  if (depositRequired && !(depositAmount > 0)) depositRequired = false; // serviço sem preço: não há sinal a cobrar

  const { data: appt, error: apptError } = await admin.from("booking_appointments").insert({
    brand_id: brandId, service_id: serviceId, staff_id: chosenStaffId, contact_id: contactId,
    customer_name: name, customer_phone: phone || null, customer_email: email || null,
    starts_at: start.toISOString(), ends_at: end.toISOString(),
    status: depositRequired ? "pending_payment" : "confirmed",
    selected_upsells: selectedUpsells, selected_options: selectedOptions, total_price: totalPrice,
    deposit_required: depositRequired, deposit_amount: depositRequired ? depositAmount : null,
    deposit_status: depositRequired ? "pending" : "not_required",
    client_pack_id: packId, source: client ? "app" : "online",
  }).select("id").single();
  if (apptError) return json({ error: apptError.message }, 500);

  if (packId) {
    const { data: consumed } = await admin.rpc("client_pack_consume", { p_pack: packId, p_service: serviceId });
    if (!consumed) {
      await admin.from("booking_appointments").delete().eq("id", appt.id);
      return json({ error: "Este pack já não tem sessões disponíveis para este serviço." }, 409);
    }
  }

  if (depositRequired) {
    const secretKey = await stripeKeyFor(admin, brandId);
    if (!secretKey) {
      await admin.from("booking_appointments").update({ status: "cancelled", deposit_status: "failed" }).eq("id", appt.id);
      return json({ error: "O pagamento de sinal não está configurado. Contacta a marca diretamente." }, 500);
    }
    const origin = req.headers.get("origin") || "";
    const params = new URLSearchParams({
      mode: "payment",
      "line_items[0][price_data][currency]": "eur",
      "line_items[0][price_data][product_data][name]": `Sinal: ${service.name}, ${fmtDate(start)} às ${fmtTime(start)}`,
      "line_items[0][price_data][unit_amount]": String(Math.round(depositAmount * 100)),
      "line_items[0][quantity]": "1",
      "metadata[appointment_id]": appt.id,
      "metadata[brand_id]": brandId,
      "metadata[type]": "booking_deposit",
      // O horário fica preso enquanto se paga; o Stripe fecha o checkout
      // ao fim de ~30 min, quase ao mesmo tempo que a booking-reminders
      // liberta o horário.
      expires_at: String(Math.floor(Date.now() / 1000) + 31 * 60),
      success_url: isHttpUrl(successUrl) ? successUrl : origin,
      cancel_url: isHttpUrl(cancelUrl) ? cancelUrl : origin,
    });
    if (email) params.set("customer_email", email);
    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
    });
    const session = await res.json();
    if (!res.ok) {
      await admin.from("booking_appointments").update({ status: "cancelled", deposit_status: "failed" }).eq("id", appt.id);
      return json({ error: session?.error?.message || "Não foi possível iniciar o pagamento." }, 502);
    }
    await admin.from("booking_appointments").update({ stripe_checkout_session_id: session.id }).eq("id", appt.id);
    return json({ ok: true, appointmentId: appt.id, paymentUrl: session.url, depositAmount });
  }

  await sendConfirmation(admin, brandId, contactId, name, phone, email, service.name, start);

  return json({ ok: true, appointmentId: appt.id });
});
