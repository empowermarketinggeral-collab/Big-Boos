// EMPOWER OS — envia as campanhas agendadas (email, SMS e WhatsApp).
// Chamada pelo cron de minuto a minuto (migração 98) com a chave service
// role. Para cada campanha agendada cuja hora já chegou, envia UM lote por
// minuto (email 100, SMS/WhatsApp 500) chamando a função de envio do canal
// (email-send, sms-campaign-send, whatsapp-campaign-send) com a chave
// service role — as regras de consentimento, tags bloqueadas, variáveis e
// estado ficam todas nessas funções.
//
// Destinatários, "incluir sem consentimento" e variáveis do WhatsApp ficam
// em scheduled_payload, guardados no momento em que se agenda.
// Se um envio for recusado (ex: campanha sem texto), a campanha volta a
// rascunho com o motivo em last_error e a equipa recebe uma notificação.
//
// "Verify JWT" DESLIGADO (chamada pelo cron); confirma a chave service role.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CHANNELS = [
  { table: "email_campaigns", fn: "email-send", size: 100, label: "email" },
  { table: "sms_campaigns", fn: "sms-campaign-send", size: 500, label: "SMS" },
  { table: "whatsapp_campaigns", fn: "whatsapp-campaign-send", size: 500, label: "WhatsApp" },
];
const TIME_BUDGET_MS = 90000;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// O cron manda a chave service role guardada no Vault. Pode não ser igual,
// letra a letra, à que a função recebe (chave nova "sb_secret_…" contra a
// antiga em JWT): nesse caso confirma-a no próprio Supabase.
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

async function notifyFailure(admin, brandId, text) {
  const { data: brand } = await admin.from("brands").select("agency_id").eq("id", brandId).maybeSingle();
  if (!brand?.agency_id) return;
  await admin.from("notifications").insert({ agency_id: brand.agency_id, brand_id: brandId, area: "crm", message: text });
}

// ---------- Máximo por dia e horário (hora de Lisboa) ----------
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
function paceOf(payload) {
  const dailyLimit = Math.max(0, parseInt(payload?.dailyLimit, 10) || 0);
  let windowStart = HHMM.test(payload?.windowStart || "") ? payload.windowStart : "";
  let windowEnd = HHMM.test(payload?.windowEnd || "") ? payload.windowEnd : "";
  if (!windowStart || !windowEnd || windowEnd <= windowStart) { windowStart = ""; windowEnd = ""; }
  return { dailyLimit, windowStart, windowEnd };
}
function lisbonParts(d) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hhmm: `${p.hour}:${p.minute}` };
}
const lisbonNow = () => lisbonParts(new Date());
function addDays(date, n) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
// Dia e hora de Lisboa → instante UTC (corrige a diferença de verão/inverno).
function lisbonToUtc(date, hhmm) {
  const guess = new Date(`${date}T${hhmm}:00Z`);
  const local = lisbonParts(guess);
  const diffMin = (new Date(`${local.date}T${local.hhmm}:00Z`).getTime() - guess.getTime()) / 60000;
  return new Date(guess.getTime() - diffMin * 60000);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!(await isServiceKey(bearer, serviceRoleKey))) return json({ error: "Sem permissão." }, 401);

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const started = Date.now();
  const report = [];

  for (const ch of CHANNELS) {
    const { data: due, error } = await admin
      .from(ch.table)
      .select("id, brand_id, name, status, scheduled_at, scheduled_payload, scheduled_offset, sent_today, sent_day")
      .in("status", ["scheduled", "sending"])
      .not("scheduled_at", "is", null)
      .lte("scheduled_at", new Date().toISOString())
      .order("scheduled_at")
      .limit(20);
    if (error) {
      console.error("campaigns-scheduled-run:", ch.table, error.message);
      continue;
    }

    for (const cp of due || []) {
      if (Date.now() - started > TIME_BUDGET_MS) break;
      const payload = cp.scheduled_payload || {};
      const ids = Array.isArray(payload.contactIds) ? payload.contactIds : [];
      const offset = cp.scheduled_offset || 0;

      if (!ids.length) {
        await admin.from(ch.table).update({ status: "draft", scheduled_at: null, last_error: "Agendamento sem destinatários." }).eq("id", cp.id);
        continue;
      }
      if (offset >= ids.length) continue; // todos já pedidos; a função de envio fecha o estado

      // Horário e máximo por dia (hora de Lisboa).
      const pace = paceOf(payload);
      const now = lisbonNow();
      if (pace.windowStart && (now.hhmm < pace.windowStart || now.hhmm >= pace.windowEnd)) {
        const nextAt = now.hhmm < pace.windowStart ? lisbonToUtc(now.date, pace.windowStart) : lisbonToUtc(addDays(now.date, 1), pace.windowStart);
        await admin.from(ch.table).update({ scheduled_at: nextAt.toISOString() }).eq("id", cp.id);
        report.push({ id: cp.id, waitingWindow: nextAt.toISOString() });
        continue;
      }
      const sentToday = cp.sent_day === now.date ? cp.sent_today || 0 : 0;
      if (pace.dailyLimit && sentToday >= pace.dailyLimit) {
        const nextAt = lisbonToUtc(addDays(now.date, 1), pace.windowStart || "09:00");
        await admin.from(ch.table).update({ scheduled_at: nextAt.toISOString() }).eq("id", cp.id);
        report.push({ id: cp.id, dailyLimitReached: nextAt.toISOString() });
        continue;
      }
      const size = Math.min(ch.size, pace.dailyLimit ? pace.dailyLimit - sentToday : ch.size);
      const end = Math.min(ids.length, offset + size);

      // Reserva estes destinatários (se outra execução já os reservou, salta).
      const { data: claimed } = await admin
        .from(ch.table)
        .update({ scheduled_offset: end, sent_today: sentToday + (end - offset), sent_day: now.date })
        .eq("id", cp.id)
        .eq("scheduled_offset", offset)
        .in("status", ["scheduled", "sending"])
        .select("id");
      if (!claimed?.length) continue;
      const undo = { scheduled_offset: offset, sent_today: sentToday, sent_day: now.date };

      const body = {
        campaignId: cp.id,
        contactIds: ids.slice(offset, end),
        includeWithoutConsent: payload.includeWithoutConsent === true,
        batchIndex: offset === 0 ? 0 : 1,
        lastBatch: end >= ids.length,
        ...(ch.fn === "whatsapp-campaign-send" ? { variableValues: payload.variableValues || [] } : {}),
      };

      let res, data;
      try {
        res = await fetch(`${supabaseUrl}/functions/v1/${ch.fn}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(140000),
        });
        data = await res.json().catch(() => ({}));
      } catch (e) {
        // Sem resposta (tempo esgotado): pode ter saído em parte. Não repete,
        // para ninguém receber duas vezes; regista e segue para os seguintes.
        await admin.from(ch.table).update({ last_error: `Envio de ${offset + 1} a ${end} sem resposta: ${e?.message || e}` }).eq("id", cp.id);
        report.push({ id: cp.id, offset, error: "sem resposta" });
        continue;
      }

      // Template de WhatsApp ainda à espera de aprovação: devolve os destinatários e tenta daqui a 15 minutos.
      if (res.status === 409 && data?.retryLater && offset === 0) {
        const retryAt = new Date(Date.now() + 15 * 60000);
        const hhmm = retryAt.toLocaleTimeString("pt-PT", { timeZone: "Europe/Lisbon", hour: "2-digit", minute: "2-digit" });
        await admin.from(ch.table).update({ ...undo, scheduled_at: retryAt.toISOString(), last_error: `À espera da aprovação do template. Nova tentativa às ${hhmm}.` }).eq("id", cp.id);
        report.push({ id: cp.id, offset, waiting: true });
        continue;
      }

      if (!res.ok) {
        const reason = data?.error || data?.message || `Erro ${res.status}`;
        if (offset === 0) {
          // Recusado logo no início (ex: sem texto, template rejeitado): volta a rascunho.
          await admin.from(ch.table).update({ status: "draft", scheduled_at: null, scheduled_offset: 0, sent_today: 0, last_error: reason }).eq("id", cp.id);
        } else {
          await admin.from(ch.table).update({ last_error: `Envio de ${offset + 1} a ${end}: ${reason}` }).eq("id", cp.id);
        }
        await notifyFailure(admin, cp.brand_id, `A campanha de ${ch.label} "${cp.name}" agendada não foi enviada: ${reason}`);
        report.push({ id: cp.id, offset, error: reason });
        continue;
      }

      if (data?.failed && Array.isArray(data.errors) && data.errors.length) {
        await admin.from(ch.table).update({ last_error: data.errors[0] }).eq("id", cp.id);
        if (!data.sent) await notifyFailure(admin, cp.brand_id, `A campanha de ${ch.label} "${cp.name}" agendada teve envios falhados: ${data.errors[0]}`);
      } else if (body.lastBatch) {
        await admin.from(ch.table).update({ last_error: null }).eq("id", cp.id);
      }
      // Último lote: aviso no sino com o resumo (o detalhe fica na campanha).
      if (body.lastBatch) {
        try {
          const sendsTable = ch.fn === "email-send" ? "email_sends" : ch.fn === "sms-campaign-send" ? "sms_messages" : "whatsapp_campaign_sends";
          const { count: okCount } = await admin.from(sendsTable).select("id", { count: "exact", head: true }).eq("campaign_id", cp.id).neq("status", "failed");
          const { count: badCount } = await admin.from(sendsTable).select("id", { count: "exact", head: true }).eq("campaign_id", cp.id).eq("status", "failed");
          const skippedNote = ids.length - (okCount || 0) - (badCount || 0) > 0 ? `, ${ids.length - (okCount || 0) - (badCount || 0)} ignorados (sem contacto válido, sem consentimento ou "Não contactar")` : "";
          await notifyFailure(admin, cp.brand_id, `A campanha de ${ch.label} "${cp.name}" terminou: ${okCount || 0} enviados, ${badCount || 0} falharam${skippedNote}. Veja o detalhe na campanha.`);
        } catch (e) {
          console.error("campaigns-scheduled-run: resumo", e?.message || e);
        }
      }
      report.push({ id: cp.id, offset, sent: data?.sent || 0, skipped: data?.skipped || 0, failed: data?.failed || 0 });
    }
  }

  return json({ ok: true, report });
});
