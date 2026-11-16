// EMPOWER OS — leitura do Big Boss para agentes (Claude e outros), só leitura.
//
//   GET https://<projeto>.supabase.co/functions/v1/agent-feed?r=<recurso>&marca=<nome ou id>&de=AAAA-MM-DD&ate=AAAA-MM-DD
//   Cabeçalho: x-agent-key: <chave>   (ou Authorization: Bearer <chave>)
//
// Recursos (r):
//   ajuda       — esta lista, em JSON
//   marcas      — marcas disponíveis
//   resumo      — números da marca no período: contactos, marcações e faturação,
//                 campanhas (WhatsApp, SMS, email), WhatsApp e formulários
//   marcacoes   — marcações do período (cliente só com primeiro nome e inicial)
//   campanhas   — campanhas do período com resultados e motivos de falha
//   conversas   — conversas de WhatsApp por ler, com a última mensagem recebida
//
// Período por omissão: últimos 7 dias. Datas em hora de Lisboa; máximo 93 dias.
// Nunca devolve telefones, emails, moradas, tokens nem palavras-passe.
//
// Segredos (Edge Function Secrets):
//   AGENT_FEED_KEY     — a chave (obrigatória; uma frase longa e aleatória)
//   AGENT_FEED_BRANDS  — opcional: nomes ou ids separados por vírgula; sem isto, todas as marcas
//
// "Verify JWT" DESLIGADO (a segurança é a chave).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-agent-key, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};
function json(body, status = 200) {
  return new Response(JSON.stringify(body, null, 1), { status, headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" } });
}
function sameKey(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// ---------- Datas em hora de Lisboa ----------
function lisbonParts(d) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hhmm: `${p.hour}:${p.minute}` };
}
function lisbonToUtc(date, hhmm = "00:00") {
  const guess = new Date(`${date}T${hhmm}:00Z`);
  const local = lisbonParts(guess);
  const diffMin = (new Date(`${local.date}T${local.hhmm}:00Z`).getTime() - guess.getTime()) / 60000;
  return new Date(guess.getTime() - diffMin * 60000);
}
const addDays = (date, n) => { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const lisbonLabel = (iso) => (iso ? new Date(iso).toLocaleString("pt-PT", { timeZone: "Europe/Lisbon", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : null);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const shortName = (name) => {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return null;
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0];
};
const round = (v) => Math.round((Number(v) || 0) * 100) / 100;
const countBy = (list, fn) => list.reduce((acc, x) => { const k = fn(x) ?? "sem"; acc[k] = (acc[k] || 0) + 1; return acc; }, {});

const HELP = {
  uso: "GET ?r=<recurso>&marca=<nome ou id>&de=AAAA-MM-DD&ate=AAAA-MM-DD com o cabeçalho x-agent-key",
  recursos: {
    marcas: "Lista das marcas disponíveis (sem marca nem datas).",
    resumo: "Números da marca no período: contactos, marcações e faturação, campanhas, WhatsApp e formulários.",
    marcacoes: "Marcações do período, uma a uma (data, serviço, profissional, estado, preço, cliente com primeiro nome e inicial).",
    campanhas: "Campanhas de WhatsApp, SMS e email do período, com enviadas, entregues, lidas, falhadas e motivos.",
    conversas: "Conversas de WhatsApp por ler, com a última mensagem recebida.",
  },
  periodo: "Por omissão os últimos 7 dias (hora de Lisboa). Máximo 93 dias.",
};

async function fetchAll(build, max = 20000) {
  const out = [];
  for (let from = 0; from < max; from += 1000) {
    const { data, error } = await build().range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") return json({ erro: "Use GET." }, 405);

  const key = Deno.env.get("AGENT_FEED_KEY") || "";
  const given = req.headers.get("x-agent-key") || (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (key.length < 24) return json({ erro: "A chave AGENT_FEED_KEY não está configurada (mínimo 24 caracteres)." }, 500);
  if (!sameKey(given, key)) return json({ erro: "Chave inválida." }, 401);

  const url = new URL(req.url);
  const r = (url.searchParams.get("r") || "ajuda").toLowerCase();
  if (r === "ajuda") return json(HELP);

  const admin = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));

  // Marcas permitidas.
  const { data: allBrands, error: brandsError } = await admin.from("brands").select("id, name, booking_slug").order("name");
  if (brandsError) return json({ erro: brandsError.message }, 500);
  const allow = String(Deno.env.get("AGENT_FEED_BRANDS") || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const brands = (allBrands || []).filter((b) => !allow.length || allow.includes(b.id.toLowerCase()) || allow.includes(String(b.name).toLowerCase()));
  if (r === "marcas") return json({ marcas: brands.map((b) => ({ id: b.id, nome: b.name, agendamento: b.booking_slug || null })) });

  const wanted = String(url.searchParams.get("marca") || "").trim().toLowerCase();
  if (!wanted) return json({ erro: "Falta ?marca= (nome ou id). Veja ?r=marcas." }, 400);
  const brand = brands.find((b) => b.id.toLowerCase() === wanted) || brands.find((b) => b.name.toLowerCase() === wanted)
    || brands.find((b) => b.name.toLowerCase().includes(wanted));
  if (!brand) return json({ erro: "Marca não encontrada ou sem acesso.", marcas: brands.map((b) => b.name) }, 404);

  // Período.
  const today = lisbonParts(new Date()).date;
  let de = url.searchParams.get("de") || addDays(today, -6);
  let ate = url.searchParams.get("ate") || today;
  if (!DATE.test(de) || !DATE.test(ate)) return json({ erro: "Datas no formato AAAA-MM-DD." }, 400);
  if (de > ate) [de, ate] = [ate, de];
  if ((new Date(ate).getTime() - new Date(de).getTime()) / 86400000 > 93) return json({ erro: "Período máximo de 93 dias." }, 400);
  const fromIso = lisbonToUtc(de).toISOString();
  const toIso = lisbonToUtc(addDays(ate, 1)).toISOString();
  const base = { marca: brand.name, periodo: { de, ate, fuso: "Europe/Lisbon" } };

  try {
    // ---------- Marcações ----------
    const loadAppointments = () => fetchAll(() => admin.from("booking_appointments")
      .select("id, contact_id, customer_name, starts_at, status, total_price, source, client_pack_id, deposit_status, booking_services(name, category), booking_staff(name)")
      .eq("brand_id", brand.id).gte("starts_at", fromIso).lt("starts_at", toIso).order("starts_at"));

    if (r === "marcacoes") {
      const rows = await loadAppointments();
      return json({ ...base, total: rows.length, marcacoes: rows.slice(0, 1000).map((a) => ({
        quando: lisbonLabel(a.starts_at), servico: a.booking_services?.name || null, categoria: a.booking_services?.category || null,
        profissional: a.booking_staff?.name || null, estado: a.status, preco: a.total_price != null ? Number(a.total_price) : null,
        cliente: shortName(a.customer_name), origem: a.source || null, com_pack: !!a.client_pack_id, sinal: a.deposit_status || null,
      })) });
    }

    // ---------- Campanhas ----------
    const loadCampaigns = async () => {
      const inPeriod = (q) => q.eq("brand_id", brand.id).or(`and(created_at.gte.${fromIso},created_at.lt.${toIso}),and(scheduled_at.gte.${fromIso},scheduled_at.lt.${toIso}),status.in.(scheduled,sending)`);
      const [wa, sms, email] = await Promise.all([
        inPeriod(admin.from("whatsapp_campaigns").select("id, name, status, created_at, scheduled_at, scheduled_offset, scheduled_payload, whatsapp_templates(name)")),
        inPeriod(admin.from("sms_campaigns").select("id, name, status, created_at, scheduled_at, scheduled_offset, scheduled_payload")),
        inPeriod(admin.from("email_campaigns").select("id, name, subject, status, created_at, scheduled_at, scheduled_offset, scheduled_payload")),
      ]);
      const out = [];
      const results = async (table, campaignId) => {
        const rows = await fetchAll(() => admin.from(table).select("status, error").eq("campaign_id", campaignId));
        const failed = rows.filter((x) => x.status === "failed" || x.status === "bounced");
        const reasons = Object.entries(countBy(failed, (x) => x.error || "Motivo não indicado")).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([motivo, n]) => ({ motivo, n }));
        return {
          enviadas: rows.length,
          entregues: rows.filter((x) => ["delivered", "read", "opened", "clicked"].includes(x.status)).length,
          lidas_ou_abertas: rows.filter((x) => ["read", "opened", "clicked"].includes(x.status)).length,
          sem_confirmacao: rows.filter((x) => ["sent", "queued"].includes(x.status)).length,
          falhadas: failed.length,
          motivos_falha: reasons,
        };
      };
      const pending = (cp) => {
        const ids = Array.isArray(cp.scheduled_payload?.contactIds) ? cp.scheduled_payload.contactIds.length : 0;
        return ids ? { na_fila: ids, ja_pedidos: Math.min(ids, cp.scheduled_offset || 0), por_dia: cp.scheduled_payload?.dailyLimit || null } : null;
      };
      for (const cp of wa.data || []) out.push({ canal: "whatsapp", nome: cp.name, template: cp.whatsapp_templates?.name || null, estado: cp.status, criada: lisbonLabel(cp.created_at), agendada: lisbonLabel(cp.scheduled_at), fila: pending(cp), ...(await results("whatsapp_campaign_sends", cp.id)) });
      for (const cp of sms.data || []) out.push({ canal: "sms", nome: cp.name, estado: cp.status, criada: lisbonLabel(cp.created_at), agendada: lisbonLabel(cp.scheduled_at), fila: pending(cp), ...(await results("sms_messages", cp.id)) });
      for (const cp of email.data || []) out.push({ canal: "email", nome: cp.name, assunto: cp.subject, estado: cp.status, criada: lisbonLabel(cp.created_at), agendada: lisbonLabel(cp.scheduled_at), fila: pending(cp), ...(await results("email_sends", cp.id)) });
      return out;
    };

    if (r === "campanhas") return json({ ...base, campanhas: await loadCampaigns() });

    // ---------- Conversas por ler ----------
    const loadUnread = async () => {
      const convs = await fetchAll(() => admin.from("whatsapp_conversations")
        .select("id, last_inbound_at, read_at, contacts(name)").eq("brand_id", brand.id).not("last_inbound_at", "is", null).order("last_inbound_at", { ascending: false }), 5000);
      return convs.filter((c) => !c.read_at || new Date(c.last_inbound_at) > new Date(c.read_at));
    };

    if (r === "conversas") {
      const unread = (await loadUnread()).slice(0, 100);
      const out = [];
      for (const c of unread) {
        const { data: last } = await admin.from("whatsapp_messages").select("body, type, created_at")
          .eq("conversation_id", c.id).eq("direction", "inbound").order("created_at", { ascending: false }).limit(1).maybeSingle();
        out.push({ cliente: shortName(c.contacts?.name) || "Sem nome", recebida: lisbonLabel(c.last_inbound_at), tipo: last?.type || null, ultima_mensagem: last?.body ? String(last.body).slice(0, 300) : null });
      }
      return json({ marca: brand.name, por_ler: out.length, conversas: out });
    }

    if (r !== "resumo") return json({ erro: `Recurso desconhecido: ${r}.`, ...HELP }, 400);

    // ---------- Resumo ----------
    const count = async (table, build) => {
      const { count: n, error } = await build(admin.from(table).select("id", { count: "exact", head: true }).eq("brand_id", brand.id));
      if (error) throw new Error(`${table}: ${error.message}`);
      return n || 0;
    };
    const [contactsTotal, newContacts, appointments, campaigns, unread, inbound, outbound, submissions] = await Promise.all([
      count("contacts", (q) => q),
      fetchAll(() => admin.from("contacts").select("source").eq("brand_id", brand.id).gte("created_at", fromIso).lt("created_at", toIso)),
      loadAppointments(),
      loadCampaigns(),
      loadUnread(),
      count("whatsapp_messages", (q) => q.eq("direction", "inbound").gte("created_at", fromIso).lt("created_at", toIso)),
      count("whatsapp_messages", (q) => q.eq("direction", "outbound").gte("created_at", fromIso).lt("created_at", toIso)),
      fetchAll(() => admin.from("form_submissions").select("form_id, forms(name)").eq("brand_id", brand.id).gte("submitted_at", fromIso).lt("submitted_at", toIso)),
    ]);

    const nowIso = new Date().toISOString();
    const done = appointments.filter((a) => a.status === "completed" || (a.status === "confirmed" && a.starts_at < nowIso));
    const upcoming = appointments.filter((a) => (a.status === "confirmed" || a.status === "pending_payment") && a.starts_at >= nowIso);
    // Clientes novas: primeira marcação de sempre dentro do período.
    const contactIds = [...new Set(appointments.map((a) => a.contact_id).filter(Boolean))];
    let newClients = 0;
    for (let i = 0; i < contactIds.length; i += 200) {
      const chunk = contactIds.slice(i, i + 200);
      const { data: before } = await admin.from("booking_appointments").select("contact_id").eq("brand_id", brand.id).in("contact_id", chunk).lt("starts_at", fromIso).neq("status", "cancelled");
      const seen = new Set((before || []).map((x) => x.contact_id));
      newClients += chunk.filter((id) => !seen.has(id)).length;
    }
    const top = (list, fn, n = 8) => Object.entries(countBy(list, fn)).sort((a, b) => b[1] - a[1]).slice(0, n).map(([nome, total]) => ({ nome, total }));

    return json({
      ...base,
      contactos: { total: contactsTotal, novos: newContacts.length, novos_por_origem: countBy(newContacts, (c) => c.source || "sem origem") },
      marcacoes: {
        total: appointments.length,
        por_estado: countBy(appointments, (a) => a.status),
        realizadas: done.length,
        por_vir: upcoming.length,
        faltas: appointments.filter((a) => a.status === "no_show").length,
        canceladas: appointments.filter((a) => a.status === "cancelled").length,
        faturacao_realizada: round(done.reduce((s, a) => s + Number(a.total_price || 0), 0)),
        faturacao_por_vir: round(upcoming.reduce((s, a) => s + Number(a.total_price || 0), 0)),
        clientes_novas: newClients,
        com_pack: appointments.filter((a) => a.client_pack_id).length,
        por_servico: top(appointments.filter((a) => a.status !== "cancelled"), (a) => a.booking_services?.name || "Sem serviço"),
        por_profissional: top(appointments.filter((a) => a.status !== "cancelled"), (a) => a.booking_staff?.name || "Sem profissional"),
        por_origem: countBy(appointments, (a) => a.source || "sem origem"),
      },
      whatsapp: { conversas_por_ler: unread.length, mensagens_recebidas: inbound, mensagens_enviadas: outbound },
      campanhas: campaigns.map((cp) => ({ canal: cp.canal, nome: cp.nome, estado: cp.estado, enviadas: cp.enviadas, entregues: cp.entregues, falhadas: cp.falhadas, fila: cp.fila })),
      formularios: { respostas: submissions.length, por_formulario: top(submissions, (s) => s.forms?.name || "Formulário") },
    });
  } catch (e) {
    console.error("agent-feed:", e?.message || e);
    return json({ erro: `Não foi possível ler: ${e?.message || e}` }, 500);
  }
});
