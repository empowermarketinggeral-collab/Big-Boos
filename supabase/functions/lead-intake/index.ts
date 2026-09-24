// EMPOWER OS — entrada pública de leads vindos de landing pages externas
// (Webflow, Elementor, WordPress, Zapier, Make, código à mão…).
//
//   POST https://<project>.supabase.co/functions/v1/lead-intake
//   Cabeçalho  x-lead-token: <token da marca>      (ou ?token=… no URL,
//   ou o campo "token" no corpo — para plataformas que só deixam um URL)
//   Corpo JSON, x-www-form-urlencoded ou multipart/form-data.
//
// Campos (todos opcionais, mas é preciso email OU telefone):
//   name | nome | full_name | first_name + last_name
//   email
//   phone | telefone | telemovel | whatsapp
//   birth_date | data_nascimento        (AAAA-MM-DD ou DD/MM/AAAA)
//   source                              (origem; por omissão a da marca)
//   tags                                (lista ou "a, b, c" — criadas se não existirem)
//   consent                             (true → consentimento WhatsApp + email + SMS)
//   consent_whatsapp | consent_email | consent_sms
//   custom_fields                       (objeto) e/ou campos "cf_<chave>"
//   referrer_email | referrer_phone     (contacto que indicou este lead)
//   _honeypot                           (campo-armadilha: se vier preenchido, ignora)
//
// Precisa de "Verify JWT" DESLIGADO — a segurança vem do token por marca
// (revogável em CRM → Entrada de leads). O token só permite CRIAR/atualizar
// leads daquela marca; não lê nada.
//
// Tudo o resto é feito pelos gatilhos da base de dados: um contacto novo
// dispara as automações "Novo contacto", e cada tag nova as de "Tag
// adicionada".

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-lead-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const MAX_BODY_BYTES = 50_000;
const MAX_TAGS = 10;
const MAX_CUSTOM_FIELDS = 20;

const str = (v, max = 200) => (typeof v === "string" || typeof v === "number" ? String(v).trim().slice(0, max) : "");
// ilike trata "_" e "%" como curingas — emails com "_" apanhariam o contacto errado.
const escapeLike = (v) => v.replace(/[\\%_]/g, (ch) => "\\" + ch);
const truthy = (v) => v === true || ["true", "on", "1", "yes", "sim", "y", "s"].includes(String(v ?? "").trim().toLowerCase());

function normalizePhone(raw, countryCode) {
  let p = str(raw, 40).replace(/[^\d+]/g, "");
  if (!p) return "";
  if (p.startsWith("00")) p = "+" + p.slice(2);
  if (!p.startsWith("+")) {
    // Sem indicativo: 9 dígitos → assume o país da marca; 10-15 → já traz o indicativo.
    if (p.length === 9) p = `+${countryCode}${p}`;
    else if (p.length >= 10) p = `+${p}`;
    else return "";
  }
  const digits = p.slice(1);
  if (!/^\d{8,15}$/.test(digits)) return "";
  return "+" + digits;
}

function normalizeBirthDate(raw) {
  const s = str(raw, 20);
  let y, m, d;
  let match = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) [, y, m, d] = match;
  else if ((match = s.match(/^(\d{2})[/.-](\d{2})[/.-](\d{4})$/))) [, d, m, y] = match;
  else return null;
  const date = new Date(`${y}-${m}-${d}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.getUTCMonth() + 1 !== Number(m) || date.getUTCDate() !== Number(d)) return null;
  const year = Number(y);
  if (year < 1900 || date.getTime() > Date.now()) return null;
  return `${y}-${m}-${d}`;
}

async function readPayload(req) {
  const declared = Number(req.headers.get("content-length") || 0);
  if (declared > MAX_BODY_BYTES) return { tooLarge: true };
  const contentType = req.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) return { tooLarge: true };
    const parsed = JSON.parse(text);
    return { data: parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {} };
  }
  const form = await req.formData();
  const data = {};
  for (const [key, value] of form.entries()) {
    if (typeof value !== "string") continue; // ficheiros são ignorados
    if (key in data) data[key] = [].concat(data[key], value); // campos repetidos (ex: tags[])
    else data[key] = value;
  }
  return { data };
}

function pickTagNames(data) {
  const raw = data.tags ?? data["tags[]"] ?? data.tag;
  const list = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(",") : [];
  const seen = new Set();
  const names = [];
  for (const item of list) {
    const name = str(item, 60);
    if (name && !seen.has(name.toLowerCase())) {
      seen.add(name.toLowerCase());
      names.push(name);
    }
  }
  return names.slice(0, MAX_TAGS);
}

function pickCustomFields(data) {
  const out = {};
  const put = (key, value) => {
    const k = String(key).toLowerCase();
    if (!/^[a-z0-9_]{1,40}$/.test(k) || Object.keys(out).length >= MAX_CUSTOM_FIELDS) return;
    const v = str(value, 500);
    if (v) out[k] = v;
  };
  if (data.custom_fields && typeof data.custom_fields === "object" && !Array.isArray(data.custom_fields)) {
    for (const [k, v] of Object.entries(data.custom_fields)) put(k, v);
  }
  for (const [k, v] of Object.entries(data)) {
    if (k.startsWith("cf_")) put(k.slice(3), v);
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = new URL(req.url);
  let payload;
  try {
    payload = await readPayload(req);
  } catch {
    return json({ error: "Corpo do pedido inválido." }, 400);
  }
  if (payload.tooLarge) return json({ error: "Pedido demasiado grande." }, 413);
  const data = payload.data;

  const token = str(req.headers.get("x-lead-token") || url.searchParams.get("token") || data.token, 200);
  if (!token) return json({ error: "Token inválido." }, 401);

  const admin = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));

  const { data: hook } = await admin
    .from("brand_lead_webhooks")
    .select("brand_id, enabled, default_tag_ids, default_source, default_country_code")
    .eq("token", token)
    .maybeSingle();
  // Mesma resposta para token errado e para entrada desligada — não
  // revela se um token existiu.
  if (!hook || !hook.enabled) return json({ error: "Token inválido." }, 401);
  const brandId = hook.brand_id;

  // Campo-armadilha: os robôs preenchem tudo. Responde "ok" sem criar nada.
  if (str(data._honeypot) || str(data.website_url)) return json({ ok: true });

  const name =
    str(data.name || data.nome || data.full_name) ||
    [str(data.first_name || data.primeiro_nome, 60), str(data.last_name || data.apelido, 60)].filter(Boolean).join(" ");
  const rawEmail = str(data.email, 200).toLowerCase();
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(rawEmail) ? rawEmail : "";
  const phone = normalizePhone(data.phone || data.telefone || data.telemovel || data.whatsapp, hook.default_country_code || "351");
  if (!email && !phone) return json({ error: "Indica um email ou telefone válido." }, 422);

  const birthDate = normalizeBirthDate(data.birth_date || data.data_nascimento);
  const source = (str(data.source, 40).toLowerCase().replace(/[^a-z0-9_-]/g, "") || hook.default_source || "landing_page");
  const customFields = pickCustomFields(data);
  const consentAll = truthy(data.consent);
  const optIns = {
    opted_in_whatsapp: consentAll || truthy(data.consent_whatsapp),
    opted_in_email: consentAll || truthy(data.consent_email),
    opted_in_sms: consentAll || truthy(data.consent_sms),
  };

  // Procura o contacto existente: telefone primeiro, depois email (como
  // nos formulários).
  const findExisting = async () => {
    let found = null;
    if (phone) {
      const { data: row } = await admin.from("contacts").select("*").eq("brand_id", brandId).eq("phone", phone).maybeSingle();
      found = row;
    }
    if (!found && email) {
      const { data: row } = await admin.from("contacts").select("*").eq("brand_id", brandId).ilike("email", escapeLike(email)).maybeSingle();
      found = row;
    }
    return found;
  };

  let contact = await findExisting();
  let created = false;

  if (!contact) {
    const { data: inserted, error } = await admin
      .from("contacts")
      .insert({
        brand_id: brandId,
        name: name || "Sem nome",
        email: email || null,
        phone: phone || null,
        source,
        birth_date: birthDate,
        custom_fields: customFields,
        ...optIns,
      })
      .select("*")
      .single();
    if (error) {
      // Dois pedidos em simultâneo com o mesmo lead: o índice único
      // recusa o segundo — volta a procurar e trata como existente.
      if (error.code === "23505") contact = await findExisting();
      if (!contact) return json({ error: "Não foi possível guardar o lead." }, 500);
    } else {
      contact = inserted;
      created = true;
    }
  }

  if (!created) {
    // Contacto que já existia: só preenche o que faltava, nunca apaga nem
    // retira consentimentos.
    const patch = {};
    if (name && (!contact.name || contact.name === "Sem nome")) patch.name = name;
    if (email && !contact.email) patch.email = email;
    if (phone && !contact.phone) patch.phone = phone;
    if (birthDate && !contact.birth_date) patch.birth_date = birthDate;
    if (Object.keys(customFields).length > 0) patch.custom_fields = { ...(contact.custom_fields || {}), ...customFields };
    for (const [k, v] of Object.entries(optIns)) if (v && !contact[k]) patch[k] = true;
    if (Object.keys(patch).length > 0) {
      const { error } = await admin.from("contacts").update(patch).eq("id", contact.id);
      if (error) console.error("lead-intake: falha ao atualizar contacto", { brandId, error: error.message });
    }
  }

  // Quem indicou: só se este contacto ainda não tiver indicação, e nunca
  // o próprio. O gatilho da base de dados valida que é da mesma marca.
  const referrerEmail = str(data.referrer_email, 200).toLowerCase();
  const referrerPhone = normalizePhone(data.referrer_phone, hook.default_country_code || "351");
  if ((referrerEmail || referrerPhone) && !contact.referred_by) {
    let referrer = null;
    if (referrerPhone) {
      const { data: row } = await admin.from("contacts").select("id").eq("brand_id", brandId).eq("phone", referrerPhone).maybeSingle();
      referrer = row;
    }
    if (!referrer && referrerEmail) {
      const { data: row } = await admin.from("contacts").select("id").eq("brand_id", brandId).ilike("email", escapeLike(referrerEmail)).maybeSingle();
      referrer = row;
    }
    if (referrer && referrer.id !== contact.id) {
      const { error } = await admin.from("contacts").update({ referred_by: referrer.id }).eq("id", contact.id);
      if (error) console.error("lead-intake: falha ao ligar indicação", { brandId, error: error.message });
    }
  }

  // Tags: as por omissão da marca (só as que ainda são desta marca) + as
  // do pedido, criando as que não existem.
  const tagIds = new Set();
  if (Array.isArray(hook.default_tag_ids) && hook.default_tag_ids.length > 0) {
    const { data: rows } = await admin.from("tags").select("id").eq("brand_id", brandId).in("id", hook.default_tag_ids);
    for (const t of rows || []) tagIds.add(t.id);
  }
  const wantedNames = pickTagNames(data);
  if (wantedNames.length > 0) {
    const { data: existingTags } = await admin.from("tags").select("id, name").eq("brand_id", brandId);
    const byName = new Map((existingTags || []).map((t) => [t.name.toLowerCase(), t.id]));
    for (const tagName of wantedNames) {
      let id = byName.get(tagName.toLowerCase());
      if (!id) {
        const { data: createdTag, error } = await admin.from("tags").insert({ brand_id: brandId, name: tagName }).select("id").single();
        if (error) {
          // corrida com outro pedido que criou a mesma tag
          const { data: again } = await admin.from("tags").select("id").eq("brand_id", brandId).ilike("name", escapeLike(tagName)).maybeSingle();
          id = again?.id;
        } else {
          id = createdTag.id;
        }
      }
      if (id) tagIds.add(id);
    }
  }
  if (tagIds.size > 0) {
    // ignoreDuplicates: as tags que o contacto já tinha não voltam a
    // disparar automações.
    const { error } = await admin
      .from("contact_tags")
      .upsert([...tagIds].map((tag_id) => ({ brand_id: brandId, contact_id: contact.id, tag_id })), { onConflict: "contact_id,tag_id", ignoreDuplicates: true });
    if (error) console.error("lead-intake: falha ao aplicar tags", { brandId, error: error.message });
  }

  return json({ ok: true, created });
});
