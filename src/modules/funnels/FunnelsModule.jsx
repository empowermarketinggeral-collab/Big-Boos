import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabaseClient.js";
import { c, sans, serif, Eyebrow, Modal, inputStyle, btnPrimary, btnGhost } from "../../shared/theme.jsx";
import {
  ArrowLeft, Plus, Trash2, Pencil, ChevronUp, ChevronDown, Layers, Link2, CheckCircle2,
  Type, Image as ImageIcon, Video, MousePointerClick, Quote, HelpCircle, FileText,
} from "lucide-react";

/* ---------------------------------------------------------
   FUNIS / LANDING PAGES
   Módulo do EMPOWER OS. Ver docs/EMPOWER_OS_ARCHITECTURE_STRATEGY.md
   (secção 18). Reutiliza deliberadamente o mesmo padrão de blocos +
   página pública por slug já usado no Link na Bio, em vez de
   construir um segundo motor de página do zero.

   Um funil é uma sequência ordenada de páginas (funnel_pages); cada
   página tem o seu próprio slug e é publicamente acessível em
   /funil/:slug assim que estiver publicada — não é preciso publicar
   o funil inteiro de uma vez.
--------------------------------------------------------- */

const BLOCK_TYPES = [
  { type: "headline", label: "Título", icon: Type },
  { type: "text", label: "Texto", icon: FileText },
  { type: "image", label: "Imagem", icon: ImageIcon },
  { type: "video", label: "Vídeo", icon: Video },
  { type: "button", label: "Botão", icon: MousePointerClick },
  { type: "testimonial", label: "Testemunho", icon: Quote },
  { type: "faq", label: "Perguntas frequentes", icon: HelpCircle },
  { type: "form", label: "Formulário embutido", icon: FileText },
];
const BLOCK_TYPE_ICON = Object.fromEntries(BLOCK_TYPES.map((b) => [b.type, b.icon]));
const BLOCK_TYPE_LABEL = Object.fromEntries(BLOCK_TYPES.map((b) => [b.type, b.label]));

const PAGE_TYPES = [
  { value: "landing", label: "Landing page" },
  { value: "thank_you", label: "Página de obrigado" },
  { value: "website", label: "Página de website" },
];

const slugify = (s) =>
  (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

const publicFunnelPageUrl = (slug) => `${window.location.origin}/funil/${slug}`;

const defaultBlockFor = (type) => {
  const id = `b${Date.now()}`;
  switch (type) {
    case "headline": return { id, type, title: "Título de impacto", subtitle: "Uma frase de apoio ao título." };
    case "text": return { id, type, body: "Escreve aqui o texto desta secção." };
    case "image": return { id, type, url: "", caption: "" };
    case "video": return { id, type, url: "" };
    case "button": return { id, type, label: "Falar agora", url: "" };
    case "testimonial": return { id, type, quote: "Um testemunho de um cliente satisfeito.", author: "Nome do cliente" };
    case "faq": return { id, type, items: [{ q: "Pergunta?", a: "Resposta." }] };
    case "form": return { id, type, formId: "" };
    default: return { id, type };
  }
};

/* ---------------------------------------------------------
   DATA
--------------------------------------------------------- */
function useFunnels(brandId) {
  return useQuery({
    queryKey: ["funnels", brandId],
    enabled: !!brandId,
    queryFn: async () => {
      const { data, error } = await supabase.from("funnels").select("*").eq("brand_id", brandId).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

function useCreateFunnel(brandId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name) => {
      const { data: funnel, error } = await supabase.from("funnels").insert({ brand_id: brandId, name }).select().single();
      if (error) throw error;
      const slug = `${slugify(name) || "pagina"}-${Math.random().toString(36).slice(2, 7)}`;
      const { error: pageError } = await supabase.from("funnel_pages").insert({
        brand_id: brandId, funnel_id: funnel.id, position: 0, slug, type: "landing", blocks: [], status: "draft",
      });
      if (pageError) throw pageError;
      return funnel;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["funnels", brandId] }),
  });
}

function useDeleteFunnel(brandId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from("funnels").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["funnels", brandId] }),
  });
}

function usePages(funnelId) {
  return useQuery({
    queryKey: ["funnel_pages", funnelId],
    enabled: !!funnelId,
    queryFn: async () => {
      const { data, error } = await supabase.from("funnel_pages").select("*").eq("funnel_id", funnelId).order("position");
      if (error) throw error;
      return data;
    },
  });
}

function useCreatePage(brandId, funnelId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ type, position, namePart }) => {
      const slug = `${slugify(namePart) || "pagina"}-${Math.random().toString(36).slice(2, 7)}`;
      const { error } = await supabase.from("funnel_pages").insert({ brand_id: brandId, funnel_id: funnelId, position, type, slug, blocks: [], status: "draft" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["funnel_pages", funnelId] }),
  });
}

function useUpdatePage(funnelId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }) => {
      const { error } = await supabase.from("funnel_pages").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["funnel_pages", funnelId] }),
  });
}

function useDeletePage(funnelId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from("funnel_pages").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["funnel_pages", funnelId] }),
  });
}

function useMovePage(funnelId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, otherId, pos, otherPos }) => {
      await supabase.from("funnel_pages").update({ position: otherPos }).eq("id", id);
      await supabase.from("funnel_pages").update({ position: pos }).eq("id", otherId);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["funnel_pages", funnelId] }),
  });
}

// Mesma queryKey do módulo de Formulários — cache partilhado.
function useForms(brandId) {
  return useQuery({
    queryKey: ["forms", brandId],
    enabled: !!brandId,
    queryFn: async () => {
      const { data, error } = await supabase.from("forms").select("id, name, slug, status").eq("brand_id", brandId).order("name");
      if (error) throw error;
      return data;
    },
  });
}

/* ---------------------------------------------------------
   RENDERIZAÇÃO DE BLOCOS — usada na pré-visualização e na página pública
--------------------------------------------------------- */
function BlockView({ block, forms }) {
  switch (block.type) {
    case "headline":
      return (
        <div style={{ textAlign: "center", padding: "8px 0" }}>
          <div style={{ ...serif, fontSize: 26, color: c.ink, marginBottom: 8, lineHeight: 1.25 }}>{block.title}</div>
          {block.subtitle && <div style={{ ...sans, fontSize: 14, color: c.mist, lineHeight: 1.5 }}>{block.subtitle}</div>}
        </div>
      );
    case "text":
      return <div style={{ ...sans, fontSize: 14, color: c.ink, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{block.body}</div>;
    case "image":
      return block.url ? (
        <figure style={{ margin: 0 }}>
          <img src={block.url} alt={block.caption || ""} style={{ width: "100%", borderRadius: 12, display: "block" }} />
          {block.caption && <figcaption style={{ ...sans, fontSize: 11.5, color: c.mist, marginTop: 6, textAlign: "center" }}>{block.caption}</figcaption>}
        </figure>
      ) : (
        <div style={{ ...sans, fontSize: 12, color: c.mistLight, textAlign: "center", padding: 24, background: c.paper, borderRadius: 12 }}>Sem imagem</div>
      );
    case "video":
      return block.url ? (
        <div style={{ position: "relative", paddingTop: "56.25%", borderRadius: 12, overflow: "hidden", background: "#000" }}>
          <iframe src={block.url} title="Vídeo" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: "none" }} allowFullScreen />
        </div>
      ) : (
        <div style={{ ...sans, fontSize: 12, color: c.mistLight, textAlign: "center", padding: 24, background: c.paper, borderRadius: 12 }}>Sem vídeo</div>
      );
    case "button":
      return (
        <div style={{ textAlign: "center" }}>
          <a
            href={block.url || "#"}
            target="_blank"
            rel="noopener noreferrer"
            style={{ ...sans, display: "inline-block", fontSize: 14, fontWeight: 600, color: "#fff", background: c.boss, borderRadius: 10, padding: "13px 28px", textDecoration: "none" }}
          >
            {block.label}
          </a>
        </div>
      );
    case "testimonial":
      return (
        <div style={{ background: c.paper, borderRadius: 12, padding: "18px 20px" }}>
          <div style={{ ...serif, fontSize: 15.5, color: c.ink, fontStyle: "italic", lineHeight: 1.5, marginBottom: 8 }}>"{block.quote}"</div>
          <div style={{ ...sans, fontSize: 12, fontWeight: 600, color: c.mist }}>— {block.author}</div>
        </div>
      );
    case "faq":
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {(block.items || []).map((item, i) => (
            <div key={i} style={{ borderBottom: `1px solid ${c.line}`, paddingBottom: 10 }}>
              <div style={{ ...sans, fontSize: 13.5, fontWeight: 700, color: c.ink, marginBottom: 4 }}>{item.q}</div>
              <div style={{ ...sans, fontSize: 13, color: c.mist, lineHeight: 1.5 }}>{item.a}</div>
            </div>
          ))}
        </div>
      );
    case "form": {
      const form = (forms || []).find((f) => f.id === block.formId);
      if (!form) return <div style={{ ...sans, fontSize: 12, color: c.mistLight, textAlign: "center", padding: 24, background: c.paper, borderRadius: 12 }}>Escolhe um formulário</div>;
      return (
        <iframe
          src={`${window.location.origin}/formulario/${form.slug}`}
          title={form.name}
          style={{ width: "100%", minHeight: 420, border: "none", borderRadius: 12 }}
        />
      );
    }
    default:
      return null;
  }
}

/* ---------------------------------------------------------
   EDITOR DE BLOCOS
--------------------------------------------------------- */
function BlockEditorRow({ block, forms, onChange, onRemove, onMove, isFirst, isLast }) {
  const Icon = BLOCK_TYPE_ICON[block.type];
  const set = (patch) => onChange({ ...block, ...patch });

  return (
    <div style={{ background: c.paper, borderRadius: 10, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Icon size={14} color={c.boss} />
        <div style={{ ...sans, fontSize: 11.5, fontWeight: 700, color: c.mist, textTransform: "uppercase", flex: 1 }}>{BLOCK_TYPE_LABEL[block.type]}</div>
        <button onClick={() => onMove(-1)} disabled={isFirst} style={{ background: "none", border: "none", cursor: isFirst ? "default" : "pointer", color: isFirst ? c.line : c.mist, padding: 3 }}><ChevronUp size={13} /></button>
        <button onClick={() => onMove(1)} disabled={isLast} style={{ background: "none", border: "none", cursor: isLast ? "default" : "pointer", color: isLast ? c.line : c.mist, padding: 3 }}><ChevronDown size={13} /></button>
        <button onClick={onRemove} style={{ background: "none", border: "none", cursor: "pointer", color: c.rose, padding: 3 }}><Trash2 size={13} /></button>
      </div>

      {block.type === "headline" && (
        <>
          <input style={{ ...inputStyle, background: "#fff" }} value={block.title} onChange={(e) => set({ title: e.target.value })} placeholder="Título" />
          <input style={{ ...inputStyle, background: "#fff" }} value={block.subtitle} onChange={(e) => set({ subtitle: e.target.value })} placeholder="Subtítulo (opcional)" />
        </>
      )}
      {block.type === "text" && (
        <textarea rows={3} style={{ ...inputStyle, background: "#fff", resize: "vertical" }} value={block.body} onChange={(e) => set({ body: e.target.value })} placeholder="Texto" />
      )}
      {block.type === "image" && (
        <>
          <input style={{ ...inputStyle, background: "#fff" }} value={block.url} onChange={(e) => set({ url: e.target.value })} placeholder="Link da imagem" />
          <input style={{ ...inputStyle, background: "#fff" }} value={block.caption} onChange={(e) => set({ caption: e.target.value })} placeholder="Legenda (opcional)" />
        </>
      )}
      {block.type === "video" && (
        <input style={{ ...inputStyle, background: "#fff" }} value={block.url} onChange={(e) => set({ url: e.target.value })} placeholder="Link embutível (ex: youtube.com/embed/...)" />
      )}
      {block.type === "button" && (
        <>
          <input style={{ ...inputStyle, background: "#fff" }} value={block.label} onChange={(e) => set({ label: e.target.value })} placeholder="Texto do botão" />
          <input style={{ ...inputStyle, background: "#fff" }} value={block.url} onChange={(e) => set({ url: e.target.value })} placeholder="Para onde vai (URL, wa.me/…, etc.)" />
        </>
      )}
      {block.type === "testimonial" && (
        <>
          <textarea rows={2} style={{ ...inputStyle, background: "#fff", resize: "vertical" }} value={block.quote} onChange={(e) => set({ quote: e.target.value })} placeholder="Testemunho" />
          <input style={{ ...inputStyle, background: "#fff" }} value={block.author} onChange={(e) => set({ author: e.target.value })} placeholder="Nome de quem testemunha" />
        </>
      )}
      {block.type === "faq" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {(block.items || []).map((item, i) => (
            <div key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input
                style={{ ...inputStyle, background: "#fff", flex: 1 }}
                value={item.q}
                onChange={(e) => set({ items: block.items.map((it, j) => (j === i ? { ...it, q: e.target.value } : it)) })}
                placeholder="Pergunta"
              />
              <input
                style={{ ...inputStyle, background: "#fff", flex: 1 }}
                value={item.a}
                onChange={(e) => set({ items: block.items.map((it, j) => (j === i ? { ...it, a: e.target.value } : it)) })}
                placeholder="Resposta"
              />
              <button onClick={() => set({ items: block.items.filter((_, j) => j !== i) })} style={{ background: "none", border: "none", cursor: "pointer", color: c.rose, padding: 3, flexShrink: 0 }}>
                <Trash2 size={13} />
              </button>
            </div>
          ))}
          <button onClick={() => set({ items: [...(block.items || []), { q: "", a: "" }] })} style={{ ...btnGhost, alignSelf: "flex-start", padding: "5px 10px", fontSize: 11.5 }}>
            <Plus size={12} /> Pergunta
          </button>
        </div>
      )}
      {block.type === "form" && (
        <select style={{ ...inputStyle, background: "#fff" }} value={block.formId} onChange={(e) => set({ formId: e.target.value })}>
          <option value="">Escolhe um formulário publicado…</option>
          {(forms || []).filter((f) => f.status === "published").map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
      )}
    </div>
  );
}

/* ---------------------------------------------------------
   EDITOR DE PÁGINA
--------------------------------------------------------- */
function PageEditor({ brand, funnelId, page, onBack }) {
  const [blocks, setBlocks] = useState(page.blocks || []);
  const [status, setStatus] = useState(page.status);
  const [type, setType] = useState(page.type);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [addingBlock, setAddingBlock] = useState(false);

  const updatePage = useUpdatePage(funnelId);
  const formsQuery = useForms(brand.id);

  const addBlock = (t) => { setBlocks((b) => [...b, defaultBlockFor(t)]); setAddingBlock(false); };
  const changeBlock = (id, next) => setBlocks((b) => b.map((x) => (x.id === id ? next : x)));
  const removeBlock = (id) => setBlocks((b) => b.filter((x) => x.id !== id));
  const moveBlock = (id, dir) => {
    setBlocks((b) => {
      const i = b.findIndex((x) => x.id === id);
      const j = i + dir;
      if (j < 0 || j >= b.length) return b;
      const copy = [...b];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
  };

  const save = async () => {
    setError("");
    try {
      await updatePage.mutateAsync({ id: page.id, patch: { blocks, status, type } });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err.message || "Não foi possível guardar.");
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(publicFunnelPageUrl(page.slug));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Não foi possível copiar o link.");
    }
  };

  return (
    <div>
      <button onClick={onBack} style={{ ...sans, display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: c.mist, background: "none", border: "none", cursor: "pointer", marginBottom: 16 }}>
        <ArrowLeft size={14} /> Páginas do funil
      </button>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <select value={type} onChange={(e) => setType(e.target.value)} style={{ ...sans, fontSize: 12, border: `1px solid ${c.line}`, borderRadius: 7, padding: "6px 9px", cursor: "pointer" }}>
            {PAGE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ ...sans, fontSize: 12, border: `1px solid ${c.line}`, borderRadius: 7, padding: "6px 9px", cursor: "pointer" }}>
            <option value="draft">Rascunho</option>
            <option value="published">Publicada</option>
          </select>
          <button onClick={copyLink} style={{ ...btnGhost, display: "flex", alignItems: "center", gap: 6 }}>
            {copied ? <CheckCircle2 size={13} /> : <Link2 size={13} />} {copied ? "Copiado!" : publicFunnelPageUrl(page.slug)}
          </button>
        </div>
        <button onClick={save} disabled={updatePage.isPending} style={btnPrimary}>
          {updatePage.isPending ? "A guardar…" : saved ? "Guardado ✓" : "Guardar"}
        </button>
      </div>

      {error && <div style={{ ...sans, fontSize: 12.5, color: c.rose, marginBottom: 16 }}>{error}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 24, alignItems: "start" }}>
        <div style={{ background: "#fff", border: `1px solid ${c.line}`, borderRadius: 14, padding: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div style={{ ...serif, fontSize: 15.5, color: c.ink }}>Blocos</div>
            <button onClick={() => setAddingBlock((v) => !v)} style={{ ...sans, display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, color: "#fff", background: c.boss, border: "none", borderRadius: 7, padding: "7px 12px", cursor: "pointer" }}>
              <Plus size={13} /> Bloco
            </button>
          </div>
          {addingBlock && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
              {BLOCK_TYPES.map((bt) => (
                <button
                  key={bt.type}
                  onClick={() => addBlock(bt.type)}
                  style={{ ...sans, display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: c.ink, background: c.paper, border: `1px solid ${c.line}`, borderRadius: 8, padding: "7px 11px", cursor: "pointer" }}
                >
                  <bt.icon size={13} color={c.boss} /> {bt.label}
                </button>
              ))}
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {blocks.map((b, i) => (
              <BlockEditorRow
                key={b.id}
                block={b}
                forms={formsQuery.data}
                onChange={(next) => changeBlock(b.id, next)}
                onRemove={() => removeBlock(b.id)}
                onMove={(dir) => moveBlock(b.id, dir)}
                isFirst={i === 0}
                isLast={i === blocks.length - 1}
              />
            ))}
            {blocks.length === 0 && <div style={{ ...sans, fontSize: 12, color: c.mistLight, textAlign: "center", padding: "16px 0" }}>Ainda sem blocos.</div>}
          </div>
        </div>

        <div style={{ position: "sticky", top: 20 }}>
          <div style={{ ...sans, fontSize: 11, fontWeight: 700, color: c.mist, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Pré-visualização</div>
          <div style={{ background: "#fff", border: `1px solid ${c.line}`, borderRadius: 16, padding: 22, maxHeight: "80vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: 18 }}>
            {blocks.map((b) => <BlockView key={b.id} block={b} forms={formsQuery.data} />)}
            {blocks.length === 0 && <div style={{ ...sans, fontSize: 12, color: c.mistLight, textAlign: "center", padding: "30px 0" }}>Sem conteúdo ainda.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   PÁGINAS DE UM FUNIL
--------------------------------------------------------- */
function FunnelDetail({ brand, funnel, onBack }) {
  const pagesQuery = usePages(funnel.id);
  const createPage = useCreatePage(brand.id, funnel.id);
  const deletePage = useDeletePage(funnel.id);
  const movePage = useMovePage(funnel.id);
  const [openPageId, setOpenPageId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const pages = pagesQuery.data || [];
  const openPage = openPageId ? pages.find((p) => p.id === openPageId) : null;

  if (openPage) {
    return <PageEditor brand={brand} funnelId={funnel.id} page={openPage} onBack={() => setOpenPageId(null)} />;
  }

  return (
    <div>
      <button onClick={onBack} style={{ ...sans, display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: c.mist, background: "none", border: "none", cursor: "pointer", marginBottom: 16 }}>
        <ArrowLeft size={14} /> Funis
      </button>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <h1 style={{ ...serif, fontSize: 24, color: c.ink, margin: 0 }}>{funnel.name}</h1>
        <button
          onClick={() => createPage.mutate({ type: "landing", position: pages.length, namePart: `${funnel.name}-${pages.length + 1}` })}
          disabled={createPage.isPending}
          style={btnPrimary}
        >
          <Plus size={14} /> Nova página
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {pages.map((p, i) => (
          <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 14, background: "#fff", border: `1px solid ${c.line}`, borderRadius: 12, padding: "14px 18px" }}>
            <div style={{ width: 24, height: 24, borderRadius: 999, background: c.bossSoft, color: c.boss, display: "flex", alignItems: "center", justifyContent: "center", ...sans, fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
              {i + 1}
            </div>
            <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={() => setOpenPageId(p.id)}>
              <div style={{ ...serif, fontSize: 14.5, color: c.ink }}>{PAGE_TYPES.find((t) => t.value === p.type)?.label}</div>
              <div style={{ ...sans, fontSize: 11, color: c.mist, marginTop: 2 }}>{publicFunnelPageUrl(p.slug)}</div>
            </div>
            <span
              style={{
                ...sans, fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", borderRadius: 999, padding: "4px 10px",
                color: p.status === "published" ? c.sage : c.mist, background: p.status === "published" ? "#E7F5EC" : c.paper,
              }}
            >
              {p.status === "published" ? "Publicada" : "Rascunho"}
            </span>
            <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
              <button onClick={() => movePage.mutate({ id: p.id, otherId: pages[i - 1].id, pos: p.position, otherPos: pages[i - 1].position })} disabled={i === 0} style={{ background: "none", border: "none", cursor: i === 0 ? "default" : "pointer", color: i === 0 ? c.line : c.mist, padding: 4 }}>
                <ChevronUp size={13} />
              </button>
              <button onClick={() => movePage.mutate({ id: p.id, otherId: pages[i + 1].id, pos: p.position, otherPos: pages[i + 1].position })} disabled={i === pages.length - 1} style={{ background: "none", border: "none", cursor: i === pages.length - 1 ? "default" : "pointer", color: i === pages.length - 1 ? c.line : c.mist, padding: 4 }}>
                <ChevronDown size={13} />
              </button>
              <button onClick={() => setOpenPageId(p.id)} style={{ background: "none", border: "none", cursor: "pointer", color: c.mist, padding: 4 }}><Pencil size={13} /></button>
              <button onClick={() => setConfirmDelete(p)} style={{ background: "none", border: "none", cursor: "pointer", color: c.mist, padding: 4 }}><Trash2 size={13} /></button>
            </div>
          </div>
        ))}
        {!pagesQuery.isLoading && pages.length === 0 && (
          <div style={{ ...sans, fontSize: 13, color: c.mistLight, textAlign: "center", padding: "40px 0" }}>Ainda sem páginas.</div>
        )}
      </div>

      {confirmDelete && (
        <Modal title="Eliminar página" onClose={() => setConfirmDelete(null)} width={360}>
          <div style={{ ...sans, fontSize: 13, color: c.ink, marginBottom: 16 }}>Tens a certeza? Esta ação não pode ser desfeita.</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => deletePage.mutate(confirmDelete.id, { onSuccess: () => setConfirmDelete(null) })} style={{ ...btnPrimary, background: c.rose }}>Eliminar</button>
            <button onClick={() => setConfirmDelete(null)} style={btnGhost}>Cancelar</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ---------------------------------------------------------
   MÓDULO
--------------------------------------------------------- */
export default function FunnelsModule({ brand, onBack }) {
  const funnelsQuery = useFunnels(brand.id);
  const createFunnel = useCreateFunnel(brand.id);
  const deleteFunnel = useDeleteFunnel(brand.id);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [openId, setOpenId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const funnels = funnelsQuery.data || [];
  const open = openId ? funnels.find((f) => f.id === openId) : null;

  if (open) {
    return (
      <div className="bb-page" style={{ padding: "8px 40px 60px", maxWidth: 1200 }}>
        <FunnelDetail brand={brand} funnel={open} onBack={() => setOpenId(null)} />
      </div>
    );
  }

  return (
    <div className="bb-page" style={{ padding: "8px 40px 60px", maxWidth: 1040 }}>
      <button onClick={onBack} style={{ ...sans, display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: c.mist, background: "none", border: "none", cursor: "pointer", marginBottom: 20 }}>
        <ArrowLeft size={14} /> Voltar à marca
      </button>

      <Eyebrow>Funis</Eyebrow>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <h1 style={{ ...serif, fontSize: 24, color: c.ink, margin: 0 }}>Funis</h1>
        <button onClick={() => setShowNew(true)} style={btnPrimary}>
          <Plus size={14} /> Novo funil
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {funnels.map((f) => (
          <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 14, background: "#fff", border: `1px solid ${c.line}`, borderRadius: 12, padding: "14px 18px", cursor: "pointer" }} onClick={() => setOpenId(f.id)}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: c.bossSoft, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Layers size={16} color={c.boss} strokeWidth={1.8} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ ...serif, fontSize: 15, color: c.ink }}>{f.name}</div>
            </div>
            <button onClick={(e) => { e.stopPropagation(); setConfirmDelete(f); }} style={{ background: "none", border: "none", cursor: "pointer", color: c.mist, padding: 6, flexShrink: 0 }}>
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        {!funnelsQuery.isLoading && funnels.length === 0 && (
          <div style={{ ...sans, fontSize: 13, color: c.mistLight, textAlign: "center", padding: "40px 0" }}>Ainda não há funis.</div>
        )}
      </div>

      {showNew && (
        <Modal title="Novo funil" onClose={() => setShowNew(false)} width={360}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <input style={inputStyle} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nome do funil" autoFocus />
            <div style={{ ...sans, fontSize: 11.5, color: c.mist }}>Cria já a primeira página (landing page), em rascunho.</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => newName.trim() && createFunnel.mutate(newName.trim(), { onSuccess: (created) => { setShowNew(false); setNewName(""); setOpenId(created.id); } })}
                disabled={createFunnel.isPending}
                style={btnPrimary}
              >
                {createFunnel.isPending ? "A criar…" : "Criar"}
              </button>
              <button onClick={() => setShowNew(false)} style={btnGhost}>Cancelar</button>
            </div>
          </div>
        </Modal>
      )}

      {confirmDelete && (
        <Modal title="Eliminar funil" onClose={() => setConfirmDelete(null)} width={380}>
          <div style={{ ...sans, fontSize: 13, color: c.ink, marginBottom: 16 }}>
            Vais eliminar <strong>{confirmDelete.name}</strong> e todas as suas páginas. Esta ação não pode ser desfeita.
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => deleteFunnel.mutate(confirmDelete.id, { onSuccess: () => setConfirmDelete(null) })} style={{ ...btnPrimary, background: c.rose }}>Eliminar</button>
            <button onClick={() => setConfirmDelete(null)} style={btnGhost}>Cancelar</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ---------------------------------------------------------
   PÁGINA PÚBLICA — /funil/:slug
--------------------------------------------------------- */
export function PublicFunnelPage() {
  const { slug } = useParams();
  const [state, setState] = useState({ loading: true, error: null, page: null, forms: [] });

  useEffect(() => {
    let active = true;
    supabase
      .from("funnel_pages")
      .select("id, brand_id, blocks, status")
      .eq("slug", slug)
      .maybeSingle()
      .then(async ({ data, error }) => {
        if (!active) return;
        if (error || !data || data.status !== "published") {
          setState({ loading: false, error: "Página não encontrada.", page: null, forms: [] });
          return;
        }
        const formIds = (data.blocks || []).filter((b) => b.type === "form" && b.formId).map((b) => b.formId);
        let forms = [];
        if (formIds.length > 0) {
          const { data: formsData } = await supabase.from("forms").select("id, name, slug, status").in("id", formIds);
          forms = formsData || [];
        }
        supabase.from("funnel_events").insert({ brand_id: data.brand_id, funnel_page_id: data.id, type: "view" }).then(() => {});
        if (!active) return;
        setState({ loading: false, error: null, page: data, forms });
      });
    return () => { active = false; };
  }, [slug]);

  if (state.loading) return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", ...sans, color: c.mist }}>A carregar…</div>;
  if (state.error) return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", ...sans, color: c.mist }}>{state.error}</div>;

  return (
    <div style={{ minHeight: "100vh", background: c.paper, padding: "60px 20px", boxSizing: "border-box" }}>
      <div style={{ maxWidth: 640, margin: "0 auto", display: "flex", flexDirection: "column", gap: 26 }}>
        {(state.page.blocks || []).map((b) => <BlockView key={b.id} block={b} forms={state.forms} />)}
      </div>
    </div>
  );
}
