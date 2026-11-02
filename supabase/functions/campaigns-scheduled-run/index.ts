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
      .select("id, brand_id, name, status, scheduled_at, scheduled_payload, scheduled_batch")
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
      const total = Math.ceil(ids.length / ch.size);
      const n = cp.scheduled_batch || 0;

      if (!ids.length) {
        await admin.from(ch.table).update({ status: "draft", scheduled_at: null, last_error: "Agendamento sem destinatários." }).eq("id", cp.id);
        continue;
      }
      if (n >= total) continue; // todos os lotes já foram pedidos; a função de envio fecha o estado

      // Reserva o lote n (se outra execução já o reservou, salta).
      const { data: claimed } = await admin
        .from(ch.table)
        .update({ scheduled_batch: n + 1 })
        .eq("id", cp.id)
        .eq("scheduled_batch", n)
        .in("status", ["scheduled", "sending"])
        .select("id");
      if (!claimed?.length) continue;

      const body = {
        campaignId: cp.id,
        contactIds: ids.slice(n * ch.size, (n + 1) * ch.size),
        includeWithoutConsent: payload.includeWithoutConsent === true,
        batchIndex: n,
        lastBatch: n + 1 >= total,
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
        // Sem resposta (tempo esgotado): o lote pode ter saído em parte. Não repete,
        // para ninguém receber duas vezes; regista e segue para o próximo lote.
        await admin.from(ch.table).update({ last_error: `Lote ${n + 1} sem resposta: ${e?.message || e}` }).eq("id", cp.id);
        report.push({ id: cp.id, batch: n, error: "sem resposta" });
        continue;
      }

      if (!res.ok) {
        const reason = data?.error || data?.message || `Erro ${res.status}`;
        if (n === 0) {
          // Recusado logo no início (ex: sem texto, template não aprovado): volta a rascunho.
          await admin.from(ch.table).update({ status: "draft", scheduled_at: null, scheduled_batch: 0, last_error: reason }).eq("id", cp.id);
        } else {
          await admin.from(ch.table).update({ last_error: `Lote ${n + 1}: ${reason}` }).eq("id", cp.id);
        }
        await notifyFailure(admin, cp.brand_id, `A campanha de ${ch.label} "${cp.name}" agendada não foi enviada: ${reason}`);
        report.push({ id: cp.id, batch: n, error: reason });
        continue;
      }

      if (data?.failed && Array.isArray(data.errors) && data.errors.length) {
        await admin.from(ch.table).update({ last_error: data.errors[0] }).eq("id", cp.id);
        if (!data.sent) await notifyFailure(admin, cp.brand_id, `A campanha de ${ch.label} "${cp.name}" agendada teve envios falhados: ${data.errors[0]}`);
      } else if (body.lastBatch) {
        await admin.from(ch.table).update({ last_error: null }).eq("id", cp.id);
      }
      report.push({ id: cp.id, batch: n, sent: data?.sent || 0, skipped: data?.skipped || 0, failed: data?.failed || 0 });
    }
  }

  return json({ ok: true, report });
});
