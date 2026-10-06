// EMPOWER OS — webhook da Hotmart (versão 2.0.0) → CRM da marca.
//
//   POST https://<project>.supabase.co/functions/v1/hotmart-webhook?brand=<id da marca>
//   Cabeçalho X-HOTMART-HOTTOK (ou "hottok" no corpo) = hottok da conta Hotmart,
//   guardado no Vault em CRM → Hotmart (hotmart_save_hottok).
//
// Precisa de "Verify JWT" DESLIGADO — a Hotmart não envia JWT; a segurança
// vem do hottok.
//
// Eventos tratados (os outros ficam registados como "ignored"):
//   PURCHASE_APPROVED                         compra
//   PURCHASE_REFUNDED, PURCHASE_CHARGEBACK    reembolso
//   PURCHASE_OUT_OF_SHOPPING_CART             carrinho abandonado
//
// O que faz no contacto (procura por email, depois telefone; cria se não
// existir, SEM consentimento de marketing):
//   compra     tags comprou:<slug>, evento:compra (reposta, para voltar a
//              disparar), ciclo:compradora-1 / ciclo:compradora-2 e
//              comprou:dois-trilhos; campos produtos_comprados, produtos_slugs,
//              valor_total_gasto, trilho, ciclo_vida, ultimo_produto_*,
//              proxima_oferta_* (do catálogo hotmart_products).
//   reembolso  tags reembolso:<slug>, evento:reembolso; tira o produto da
//              lista e o valor do total.
//   carrinho   tags carrinho:<slug>, evento:carrinho; campos carrinho_*.
//              Ignorado se a pessoa já comprou esse produto.
// As automações arrancam pelos gatilhos de tag da base de dados.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const str = (v, max = 200) => (typeof v === "string" || typeof v === "number" ? String(v).trim().slice(0, max) : "");
const escapeLike = (v) => v.replace(/[\\%_]/g, (ch) => "\\" + ch);
const slugify = (s) =>
  String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40) || "produto";

function safeEqual(a, b) {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

function normalizePhone(raw, code) {
  let p = str(raw, 40).replace(/[^\d+]/g, "");
  if (!p) return "";
  if (p.startsWith("00")) p = "+" + p.slice(2);
  if (!p.startsWith("+")) {
    const cc = str(code, 6).replace(/\D/g, "");
    if (cc && !p.startsWith(cc)) p = `+${cc}${p}`;
    else if (p.length === 9) p = `+351${p}`;
    else if (p.length >= 10) p = `+${p}`;
    else return "";
  }
  const digits = p.slice(1);
  return /^\d{8,15}$/.test(digits) ? "+" + digits : "";
}

const LATE_STAGES = ["candidata", "aluna programa", "top"];
const splitList = (v) => String(v || "").split(",").map((s) => s.trim()).filter(Boolean);

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const url = new URL(req.url);
  const brandId = url.searchParams.get("brand") || "";
  if (!/^[0-9a-f-]{36}$/i.test(brandId)) return json({ error: "Marca inválida." }, 400);

  let body;
  try {
    const text = await req.text();
    if (text.length > 200_000) return json({ error: "Pedido demasiado grande." }, 413);
    body = JSON.parse(text);
  } catch {
    return json({ error: "Corpo inválido." }, 400);
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));

  const { data: settings } = await admin.from("brand_hotmart_settings").select("hottok_ref, enabled").eq("brand_id", brandId).maybeSingle();
  if (!settings?.hottok_ref || !settings.enabled) return json({ error: "Não autorizado." }, 401);
  const { data: expected } = await admin.rpc("vault_read_secret", { p_id: settings.hottok_ref });
  const received = str(req.headers.get("x-hotmart-hottok") || body?.hottok, 300);
  if (!expected || !received || !safeEqual(received, expected)) return json({ error: "Não autorizado." }, 401);

  const event = str(body?.event, 60).toUpperCase();
  const data = body?.data || {};
  const product = data.product || {};
  const buyer = data.buyer || {};
  const purchase = data.purchase || {};
  const hotmartProductId = str(product.id, 40);
  const email = str(buyer.email, 200).toLowerCase();
  const eventKey = str(body?.id, 120) || `${event}:${str(purchase.transaction, 80) || `${hotmartProductId}:${email}:${str(body?.creation_date, 20)}`}`;

  // Já processado? (a Hotmart repete quando não recebe 200 a tempo)
  const { data: seen } = await admin.from("hotmart_events").select("id").eq("brand_id", brandId).eq("event_key", eventKey).maybeSingle();
  if (seen) return json({ ok: true, duplicate: true });

  const log = async (status, error = null) => {
    await admin.from("hotmart_events").insert({
      brand_id: brandId, event_key: eventKey, event: event || "?", hotmart_product_id: hotmartProductId || null,
      buyer_email: email || null, status, error, payload: body,
    });
    await admin.from("brand_hotmart_settings").update({ last_event_at: new Date().toISOString() }).eq("brand_id", brandId);
  };

  const kind =
    event === "PURCHASE_APPROVED" ? "purchase" :
    event === "PURCHASE_REFUNDED" || event === "PURCHASE_CHARGEBACK" ? "refund" :
    event === "PURCHASE_OUT_OF_SHOPPING_CART" ? "cart" : null;
  if (!kind) {
    await log("ignored");
    return json({ ok: true, ignored: event });
  }

  try {
    // ---------- produto (cria no catálogo se ainda não existir) ----------
    const { data: catalog } = await admin.from("hotmart_products").select("*").eq("brand_id", brandId);
    const products = catalog || [];
    let prod = products.find((p) => hotmartProductId && p.hotmart_product_id === hotmartProductId);
    if (!prod) {
      const name = str(product.name, 120) || `Produto ${hotmartProductId || "Hotmart"}`;
      let slug = slugify(name);
      if (products.some((p) => p.slug === slug)) slug = `${slug.slice(0, 30)}-${hotmartProductId || Date.now()}`.slice(0, 40);
      const { data: created, error } = await admin
        .from("hotmart_products")
        .insert({ brand_id: brandId, hotmart_product_id: hotmartProductId || null, slug, name })
        .select("*")
        .single();
      if (error) throw new Error(`Produto: ${error.message}`);
      prod = created;
      products.push(prod);
    }

    // ---------- contacto ----------
    const phone = normalizePhone(buyer.checkout_phone || buyer.phone, buyer.checkout_phone_code);
    if (!email && !phone) throw new Error("Evento sem email nem telefone do comprador.");
    let contact = null;
    if (email) {
      const { data: row } = await admin.from("contacts").select("*").eq("brand_id", brandId).ilike("email", escapeLike(email)).maybeSingle();
      contact = row;
    }
    if (!contact && phone) {
      const { data: row } = await admin.from("contacts").select("*").eq("brand_id", brandId).eq("phone", phone).maybeSingle();
      contact = row;
    }
    if (!contact) {
      const { data: created, error } = await admin
        .from("contacts")
        .insert({ brand_id: brandId, name: str(buyer.name, 120) || "Sem nome", email: email || null, phone: phone || null, source: "hotmart", custom_fields: {} })
        .select("*")
        .single();
      if (error) throw new Error(`Contacto: ${error.message}`);
      contact = created;
    } else if (phone && !contact.phone) {
      await admin.from("contacts").update({ phone }).eq("id", contact.id);
    }

    // ---------- tags ----------
    const { data: tagRows } = await admin.from("tags").select("id, name").eq("brand_id", brandId);
    const tagIds = new Map((tagRows || []).map((t) => [t.name.toLowerCase(), t.id]));
    const tagId = async (name) => {
      const key = name.toLowerCase();
      if (tagIds.has(key)) return tagIds.get(key);
      const { data: created, error } = await admin.from("tags").insert({ brand_id: brandId, name }).select("id").single();
      let id = created?.id;
      if (error) {
        const { data: again } = await admin.from("tags").select("id").eq("brand_id", brandId).ilike("name", escapeLike(name)).maybeSingle();
        id = again?.id;
      }
      if (!id) throw new Error(`Tag ${name}`);
      tagIds.set(key, id);
      return id;
    };
    const addTag = async (name) => {
      await admin.from("contact_tags").upsert({ brand_id: brandId, contact_id: contact.id, tag_id: await tagId(name) }, { onConflict: "contact_id,tag_id", ignoreDuplicates: true });
    };
    // Repõe a tag (apaga e volta a pôr) para voltar a disparar as automações.
    const retag = async (name) => {
      const id = await tagId(name);
      await admin.from("contact_tags").delete().eq("contact_id", contact.id).eq("tag_id", id);
      await admin.from("contact_tags").insert({ brand_id: brandId, contact_id: contact.id, tag_id: id });
    };
    const removeTag = async (name) => {
      const id = tagIds.get(name.toLowerCase());
      if (id) await admin.from("contact_tags").delete().eq("contact_id", contact.id).eq("tag_id", id);
    };

    const cf = { ...(contact.custom_fields || {}) };
    const bought = splitList(cf.produtos_slugs);
    const price = Number(purchase?.price?.value ?? purchase?.full_price?.value ?? prod.price ?? 0) || 0;

    if (kind === "cart") {
      if (bought.includes(prod.slug)) {
        await log("ignored", "Já tinha comprado este produto.");
        return json({ ok: true, ignored: "already_bought" });
      }
      Object.assign(cf, {
        carrinho_produto_nome: prod.name,
        carrinho_produto_slug: prod.slug,
        carrinho_link: prod.checkout_url || "",
      });
      await admin.from("contacts").update({ custom_fields: cf }).eq("id", contact.id);
      await addTag(`carrinho:${prod.slug}`);
      await retag("evento:carrinho");
      await log("ok");
      return json({ ok: true });
    }

    if (kind === "refund") {
      const names = splitList(cf.produtos_comprados).filter((n) => n !== prod.name);
      const slugs = bought.filter((s) => s !== prod.slug);
      Object.assign(cf, {
        produtos_comprados: names.join(", "),
        produtos_slugs: slugs.join(","),
        valor_total_gasto: String(Math.max(0, Math.round((Number(cf.valor_total_gasto || 0) - price) * 100) / 100)),
        ultimo_reembolso_nome: prod.name,
      });
      await admin.from("contacts").update({ custom_fields: cf }).eq("id", contact.id);
      await addTag(`reembolso:${prod.slug}`);
      await retag("evento:reembolso");
      await log("ok");
      return json({ ok: true });
    }

    // ---------- compra ----------
    const names = splitList(cf.produtos_comprados);
    if (!bought.includes(prod.slug)) bought.push(prod.slug);
    if (!names.includes(prod.name)) names.push(prod.name);
    const boughtProducts = bought.map((s) => products.find((p) => p.slug === s)).filter(Boolean);
    const tracks = new Set(boughtProducts.map((p) => p.track).filter((t) => t === "tecnica" || t === "marketing"));
    const trackLabel = { tecnica: "Técnica", marketing: "Marketing & Negócio", ambos: "Ambos" };
    let trilho = cf.trilho || "";
    if (prod.track && prod.track !== "ambos") {
      const label = trackLabel[prod.track];
      if (!trilho) trilho = label;
      else if (trilho !== label && trilho !== "Ambos") trilho = "Ambos";
    }

    // Próxima oferta: a definida no produto (se ainda não comprou), e com
    // 2+ produtos o "programa" (se existir no catálogo).
    const bySlug = (s) => products.find((p) => p.slug === s && p.active);
    let next = prod.next_offer_slug && !bought.includes(prod.next_offer_slug) ? bySlug(prod.next_offer_slug) : null;
    if (bought.length >= 2 || !next) next = bySlug("programa") && !bought.includes("programa") ? bySlug("programa") : next;

    const lifecycle = LATE_STAGES.includes(String(cf.ciclo_vida || "").toLowerCase())
      ? cf.ciclo_vida
      : bought.length >= 2 ? "Compradora 2+" : "Compradora 1";

    Object.assign(cf, {
      produtos_comprados: names.join(", "),
      produtos_slugs: bought.join(","),
      valor_total_gasto: String(Math.round((Number(cf.valor_total_gasto || 0) + price) * 100) / 100),
      trilho,
      ciclo_vida: lifecycle,
      ultimo_produto_nome: prod.name,
      ultimo_produto_slug: prod.slug,
      ultimo_produto_link: prod.checkout_url || "",
      proxima_oferta_nome: next?.name || "",
      proxima_oferta_slug: next?.slug || "",
      proxima_oferta_link: next?.checkout_url || "",
    });
    await admin.from("contacts").update({ custom_fields: cf }).eq("id", contact.id);
    await admin.rpc("mark_contact_engaged", { p_contact_id: contact.id });

    await addTag(`comprou:${prod.slug}`);
    await removeTag(`carrinho:${prod.slug}`);
    if (tracks.size === 2) await addTag("comprou:dois-trilhos");
    if (lifecycle === "Compradora 2+") {
      await removeTag("ciclo:compradora-1");
      await addTag("ciclo:compradora-2");
    } else if (lifecycle === "Compradora 1") {
      await addTag("ciclo:compradora-1");
    }
    await retag("evento:compra");
    await log("ok");
    return json({ ok: true });
  } catch (err) {
    const message = String(err?.message || err).slice(0, 500);
    console.error("hotmart-webhook", { brandId, event, message });
    await log("error", message);
    // 200 para a Hotmart não repetir sem fim; o erro fica em hotmart_events.
    return json({ ok: false, error: message });
  }
});
