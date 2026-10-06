import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabaseClient.js";
import { c, sans, serif, Modal, inputStyle, btnPrimary, btnGhost } from "../../shared/theme.jsx";
import { Copy, Check, Plus, Trash2 } from "lucide-react";

/* ---------------------------------------------------------
   HOTMART — compras, carrinhos abandonados e reembolsos entram no CRM
   (função hotmart-webhook). Só a equipa configura: o hottok vai para o
   Vault por hotmart_save_hottok e nunca volta ao browser.
--------------------------------------------------------- */

const ENDPOINT = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/hotmart-webhook`;
const TRACKS = [
  { value: "", label: "Sem trilho" },
  { value: "tecnica", label: "Técnica" },
  { value: "marketing", label: "Marketing & Negócio" },
  { value: "ambos", label: "Ambos" },
];
const EVENT_LABEL = {
  PURCHASE_APPROVED: "Compra",
  PURCHASE_REFUNDED: "Reembolso",
  PURCHASE_CHARGEBACK: "Chargeback",
  PURCHASE_OUT_OF_SHOPPING_CART: "Carrinho abandonado",
};

function useHotmart(brandId) {
  return useQuery({
    queryKey: ["hotmart", brandId],
    enabled: !!brandId,
    queryFn: async () => {
      const [settings, products, events] = await Promise.all([
        supabase.from("brand_hotmart_settings").select("enabled, connected_at, last_event_at, hottok_ref").eq("brand_id", brandId).maybeSingle(),
        supabase.from("hotmart_products").select("*").eq("brand_id", brandId).order("created_at"),
        supabase.from("hotmart_events").select("id, event, buyer_email, status, error, created_at").eq("brand_id", brandId).order("created_at", { ascending: false }).limit(8),
      ]);
      if (settings.error) throw settings.error;
      if (products.error) throw products.error;
      return { settings: settings.data, products: products.data || [], events: events.data || [] };
    },
  });
}

function useHotmartMutations(brandId) {
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries({ queryKey: ["hotmart", brandId] });
  return {
    saveHottok: useMutation({
      mutationFn: async (hottok) => {
        const { error } = await supabase.rpc("hotmart_save_hottok", { p_brand_id: brandId, p_hottok: hottok });
        if (error) throw error;
      },
      onSuccess: done,
    }),
    setEnabled: useMutation({
      mutationFn: async (enabled) => {
        const { error } = await supabase.from("brand_hotmart_settings").update({ enabled }).eq("brand_id", brandId);
        if (error) throw error;
      },
      onSuccess: done,
    }),
    saveProduct: useMutation({
      mutationFn: async ({ id, patch }) => {
        const query = id
          ? supabase.from("hotmart_products").update(patch).eq("id", id)
          : supabase.from("hotmart_products").insert({ brand_id: brandId, ...patch });
        const { error } = await query;
        if (error) throw error;
      },
      onSuccess: done,
    }),
    deleteProduct: useMutation({
      mutationFn: async (id) => {
        const { error } = await supabase.from("hotmart_products").delete().eq("id", id);
        if (error) throw error;
      },
      onSuccess: done,
    }),
  };
}

const slugify = (s) =>
  (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40);

function CopyRow({ label, value }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // sem permissão de clipboard: o texto continua selecionável
    }
  };
  return (
    <div>
      <div style={{ ...sans, fontSize: 12.5, color: c.mist, marginBottom: 5 }}>{label}</div>
      <div style={{ display: "flex", gap: 6 }}>
        <input readOnly style={{ ...inputStyle, fontSize: 13.5, fontFamily: "monospace", minWidth: 0 }} value={value} onFocus={(e) => e.target.select()} />
        <button onClick={copy} style={btnGhost} aria-label={`Copiar ${label}`}>
          {copied ? <Check size={13} /> : <Copy size={13} />}
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: "block" }}>
      <div style={{ ...sans, fontSize: 12.5, color: c.mist, marginBottom: 4 }}>{label}</div>
      {children}
    </label>
  );
}

function ProductRow({ product, products, onSave, onDelete }) {
  const [draft, setDraft] = useState(product);
  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(product);
  const save = () =>
    onSave({
      id: product.id,
      patch: {
        name: draft.name.trim(),
        slug: slugify(draft.slug || draft.name),
        hotmart_product_id: (draft.hotmart_product_id || "").trim() || null,
        track: draft.track || null,
        price: draft.price === "" || draft.price === null ? null : Number(draft.price),
        checkout_url: (draft.checkout_url || "").trim() || null,
        next_offer_slug: draft.next_offer_slug || null,
        active: draft.active,
      },
    });

  return (
    <div style={{ border: `1px solid ${c.line}`, borderRadius: 3, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
        <Field label="Nome"><input style={inputStyle} value={draft.name} onChange={(e) => set("name", e.target.value)} /></Field>
        <Field label="Código (tags comprou:…)"><input style={inputStyle} value={draft.slug} onChange={(e) => set("slug", e.target.value)} /></Field>
        <Field label="ID do produto na Hotmart"><input style={inputStyle} value={draft.hotmart_product_id || ""} onChange={(e) => set("hotmart_product_id", e.target.value)} placeholder="Ex: 3456789" /></Field>
        <Field label="Trilho">
          <select style={inputStyle} value={draft.track || ""} onChange={(e) => set("track", e.target.value)}>
            {TRACKS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </Field>
        <Field label="Preço (€)"><input style={inputStyle} type="number" value={draft.price ?? ""} onChange={(e) => set("price", e.target.value)} /></Field>
        <Field label="Oferta seguinte">
          <select style={inputStyle} value={draft.next_offer_slug || ""} onChange={(e) => set("next_offer_slug", e.target.value)}>
            <option value="">Nenhuma</option>
            {products.filter((p) => p.id !== product.id).map((p) => <option key={p.id} value={p.slug}>{p.name}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Link de compra (checkout ou página de venda)">
        <input style={inputStyle} value={draft.checkout_url || ""} onChange={(e) => set("checkout_url", e.target.value)} placeholder="https://pay.hotmart.com/…" />
      </Field>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <label style={{ ...sans, fontSize: 13.5, color: c.ink, display: "flex", alignItems: "center", gap: 6 }}>
          <input type="checkbox" checked={draft.active} onChange={(e) => set("active", e.target.checked)} /> À venda
        </label>
        <div style={{ flex: 1 }} />
        {dirty && <button onClick={save} style={btnPrimary}>Guardar</button>}
        <button onClick={() => onDelete(product.id)} style={{ ...btnGhost, color: c.rose }} aria-label="Apagar produto"><Trash2 size={13} /></button>
      </div>
    </div>
  );
}

export default function HotmartModal({ brand, onClose }) {
  const query = useHotmart(brand.id);
  const m = useHotmartMutations(brand.id);
  const [hottok, setHottok] = useState("");
  const [newName, setNewName] = useState("");
  const [error, setError] = useState("");
  const data = query.data;

  const run = async (fn) => {
    setError("");
    try {
      await fn();
    } catch (err) {
      setError(err.message || "Não foi possível guardar.");
    }
  };

  const webhookUrl = `${ENDPOINT}?brand=${brand.id}`;
  const connected = !!data?.settings?.hottok_ref;

  return (
    <Modal title="Hotmart" onClose={onClose} width={680}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ ...sans, fontSize: 14, color: c.mist, lineHeight: 1.6 }}>
          Compras, carrinhos abandonados e reembolsos da Hotmart entram no CRM de <b>{brand.name}</b>: atualizam a ficha (produtos, valor gasto, trilho, ciclo de vida) e põem as tags <code>comprou:</code>, <code>carrinho:</code> e <code>reembolso:</code> que arrancam as automações.
        </div>

        {query.isLoading && <div style={{ ...sans, fontSize: 14.5, color: c.mist }}>A carregar…</div>}
        {query.isError && <div style={{ ...sans, fontSize: 14, color: c.rose }}>Só a equipa da agência pode configurar a Hotmart.</div>}

        {data && (
          <>
            <div style={{ ...serif, fontSize: 16, color: c.ink }}>1. Ligar</div>
            <ol style={{ ...sans, fontSize: 13.5, color: c.mist, lineHeight: 1.7, margin: 0, paddingLeft: 18 }}>
              <li>Na Hotmart: Ferramentas → Webhook (API e notificações) → Cadastrar webhook, versão 2.0.0.</li>
              <li>Cola o endereço abaixo e escolhe os eventos Compra aprovada, Compra reembolsada, Chargeback e Abandono de carrinho.</li>
              <li>Copia o hottok que a Hotmart mostra e cola-o aqui.</li>
            </ol>
            <CopyRow label="Endereço do webhook" value={webhookUrl} />
            <div style={{ display: "flex", gap: 6, alignItems: "flex-end", flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <Field label={connected ? "Hottok guardado. Para trocar, cola o novo" : "Hottok"}>
                  <input style={inputStyle} type="password" autoComplete="off" value={hottok} onChange={(e) => setHottok(e.target.value)} placeholder={connected ? "••••••••" : "Cola aqui o hottok"} />
                </Field>
              </div>
              <button
                onClick={() => run(async () => { await m.saveHottok.mutateAsync(hottok); setHottok(""); })}
                disabled={!hottok.trim() || m.saveHottok.isPending}
                style={btnPrimary}
              >
                {m.saveHottok.isPending ? "A guardar…" : "Guardar hottok"}
              </button>
            </div>
            {connected && (
              <label style={{ ...sans, fontSize: 14, color: c.ink, display: "flex", alignItems: "center", gap: 7 }}>
                <input type="checkbox" checked={data.settings.enabled} onChange={(e) => run(() => m.setEnabled.mutateAsync(e.target.checked))} />
                Receber eventos da Hotmart
                {data.settings.last_event_at && <span style={{ color: c.mist, fontSize: 12.5 }}>(último: {new Date(data.settings.last_event_at).toLocaleString("pt-PT")})</span>}
              </label>
            )}

            <div style={{ ...serif, fontSize: 16, color: c.ink, marginTop: 6 }}>2. Produtos</div>
            <div style={{ ...sans, fontSize: 13.5, color: c.mist, lineHeight: 1.6 }}>
              Liga cada produto ao ID da Hotmart. O link de compra aparece nos emails como <code>{"{{link_<código>}}"}</code> (hífens passam a "_"). "Oferta seguinte" é o produto sugerido no fim do pós-compra; com 2 ou mais compras sugere o produto com o código <code>programa</code>, se existir. Produtos vendidos que não estejam aqui são criados sozinhos na primeira compra.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {data.products.map((p) => (
                <ProductRow
                  key={`${p.id}-${p.slug}-${p.hotmart_product_id}-${p.checkout_url}-${p.next_offer_slug}-${p.price}-${p.track}-${p.active}-${p.name}`}
                  product={p}
                  products={data.products}
                  onSave={(v) => run(() => m.saveProduct.mutateAsync(v))}
                  onDelete={(id) => run(() => m.deleteProduct.mutateAsync(id))}
                />
              ))}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <input style={inputStyle} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nome do novo produto" />
              <button
                onClick={() => run(async () => {
                  await m.saveProduct.mutateAsync({ patch: { name: newName.trim(), slug: slugify(newName) } });
                  setNewName("");
                })}
                disabled={!slugify(newName)}
                style={btnGhost}
              >
                <Plus size={13} /> Adicionar
              </button>
            </div>

            {data.events.length > 0 && (
              <>
                <div style={{ ...serif, fontSize: 16, color: c.ink, marginTop: 6 }}>Últimos eventos</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {data.events.map((ev) => (
                    <div key={ev.id} style={{ ...sans, fontSize: 13, color: ev.status === "error" ? c.rose : c.ink, display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <span style={{ color: c.mist }}>{new Date(ev.created_at).toLocaleString("pt-PT")}</span>
                      <span>{EVENT_LABEL[ev.event] || ev.event}</span>
                      <span style={{ color: c.mist }}>{ev.buyer_email}</span>
                      {ev.status !== "ok" && <span>{ev.status === "ignored" ? "ignorado" : "erro"}{ev.error ? `: ${ev.error}` : ""}</span>}
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {error && <div style={{ ...sans, fontSize: 14, color: c.rose }}>{error}</div>}
        <button onClick={onClose} style={{ ...btnGhost, alignSelf: "flex-start" }}>Fechar</button>
      </div>
    </Modal>
  );
}
