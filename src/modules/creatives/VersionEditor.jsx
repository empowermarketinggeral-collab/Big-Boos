import { useRef, useState } from "react";
import { Upload, Trash2, Plus, X, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, GalleryHorizontal } from "lucide-react";
import { c, sans, inputStyle, btnPrimary, btnGhost, Modal } from "../../shared/theme.jsx";
import { HEX_RE, KINDS, contentPaths, isContentEmpty, safeHttpUrl, isVideoPath, galleryPieces, pieceLabel } from "./creativesKinds.js";
import { removeCreativeFiles, uploadCreativeFile, useSignedUrls } from "./creativesData.js";

/* ---------------------------------------------------------
   EDITOR DE UMA VERSÃO (cria a v1, v2…). Cada tipo tem os seus campos.
   Ficheiros carregados mas não guardados são apagados ao cancelar, e
   ficheiros de versões antigas nunca são apagados (a versão antiga
   ainda os usa).
--------------------------------------------------------- */

const label = { ...sans, fontSize: 13, fontWeight: 700, color: c.mist, display: "block", marginBottom: 6 };

function Field({ title, hint, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <span style={label}>{title}</span>
      {hint && <div style={{ ...sans, fontSize: 12.5, color: c.mist, marginTop: -2, marginBottom: 8 }}>{hint}</div>}
      {children}
    </div>
  );
}

const MEDIA_ACCEPT = "image/png,image/jpeg,image/webp,image/gif,image/svg+xml,video/mp4,video/quicktime,video/webm";
const isGallery = (kind) => kind === "social_media" || kind === "other";
const newPieceId = () => crypto.randomUUID().slice(0, 8);

const arrowBtn = { position: "absolute", bottom: 4, width: 22, height: 22, borderRadius: 999, border: "none", background: "rgba(23,21,31,0.78)", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 };

function Thumb({ src, onRemove, name, video, onLeft, onRight }) {
  return (
    <div style={{ position: "relative", width: 96, height: 96, border: `1px solid ${c.line}`, borderRadius: 6, background: c.folha2, overflow: "hidden", flexShrink: 0 }}>
      {!src ? <div style={{ ...sans, fontSize: 12, color: c.mist, padding: 6 }}>A carregar…</div>
        : video ? <video src={src} muted playsInline preload="metadata" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        : <img src={src} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
      {video && <span style={{ ...sans, position: "absolute", left: 4, bottom: 4, fontSize: 12, fontWeight: 700, color: "#fff", background: "rgba(23,21,31,0.78)", borderRadius: 4, padding: "1px 6px" }}>Vídeo</span>}
      {onLeft && <button type="button" onClick={onLeft} aria-label={`Passar ${name} para trás`} style={{ ...arrowBtn, right: 30 }}><ChevronLeft size={13} /></button>}
      {onRight && <button type="button" onClick={onRight} aria-label={`Passar ${name} para a frente`} style={{ ...arrowBtn, right: 4 }}><ChevronRight size={13} /></button>}
      <button type="button" onClick={onRemove} aria-label={`Remover ${name}`} style={{ position: "absolute", top: 4, right: 4, width: 22, height: 22, borderRadius: 999, border: "none", background: "rgba(23,21,31,0.78)", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
        <X size={13} />
      </button>
    </div>
  );
}

export default function VersionEditor({ kind, brandId, projectId, versionNumber, initial, onSave, onClose }) {
  const [content, setContent] = useState(() => {
    const base = structuredClone(initial || {});
    // Redes sociais / Outro: versões antigas ({ images }) passam a peças.
    if (isGallery(kind)) {
      const pieces = galleryPieces(base);
      delete base.images;
      base.pieces = pieces;
    }
    return base;
  });
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [local, setLocal] = useState({}); // caminho → pré-visualização local
  const uploaded = useRef(new Set());
  const inputs = useRef({});

  const signed = useSignedUrls(contentPaths(initial || {}, brandId));
  const preview = (path) => local[path] || signed.data?.[path] || null;

  const set = (patch) => setContent((prev) => ({ ...prev, ...patch }));

  const upload = async (field, files, multiple, allowVideo = false) => {
    setError("");
    setBusy(field);
    try {
      const paths = [];
      for (const file of files) {
        const path = await uploadCreativeFile(brandId, projectId, file, { allowVideo });
        uploaded.current.add(path);
        setLocal((prev) => ({ ...prev, [path]: URL.createObjectURL(file) }));
        paths.push(path);
      }
      if (multiple) set({ [field]: [...(content[field] || []), ...paths] });
      else if (paths[0]) set({ [field]: paths[0] });
    } catch (err) {
      setError(err.message || "Não foi possível carregar o ficheiro.");
    } finally {
      setBusy("");
    }
  };

  // Carrega ficheiros soltos (peças de Redes sociais / Outro) e devolve os caminhos.
  const uploadMedia = async (key, files) => {
    setError("");
    setBusy(key);
    const paths = [];
    try {
      for (const file of files) {
        const path = await uploadCreativeFile(brandId, projectId, file, { allowVideo: true });
        uploaded.current.add(path);
        setLocal((prev) => ({ ...prev, [path]: URL.createObjectURL(file) }));
        paths.push(path);
      }
    } catch (err) {
      setError(err.message || "Não foi possível carregar o ficheiro.");
    } finally {
      setBusy("");
    }
    return paths;
  };

  const pieces = content.pieces || [];
  const setPieces = (fn) => setContent((prev) => ({ ...prev, pieces: fn(prev.pieces || []) }));
  const move = (list, i, d) => {
    const j = i + d;
    if (j < 0 || j >= list.length) return list;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  };
  const pickFiles = (key, multiple, onFiles) => (
    <input
      ref={(el) => { inputs.current[key] = el; }}
      type="file" accept={MEDIA_ACCEPT} multiple={multiple} style={{ display: "none" }}
      onChange={async (e) => { const files = [...(e.target.files || [])]; e.target.value = ""; if (files.length) onFiles(await uploadMedia(key, files)); }}
    />
  );

  const PiecesEditor = () => (
    <Field title="Peças" hint="Cada post ou vídeo é uma peça. Num carrossel, as imagens ficam juntas numa só peça e o cliente vê-as a deslizar, pela ordem que escolheres. Vídeos em MP4, MOV ou WebM, até 50 MB.">
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 12 }}>
        {pieces.map((piece, i) => {
          const carousel = piece.type === "carousel";
          const key = `piece-${piece.id}`;
          return (
            <div key={piece.id} style={{ border: `1px solid ${c.line}`, borderRadius: 6, padding: 10, background: c.folha }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                <span style={{ ...sans, fontSize: 13.5, fontWeight: 700, color: c.ink, flex: 1 }}>
                  {pieceLabel(piece)} {i + 1}{carousel ? ` (${piece.paths.length} ${piece.paths.length === 1 ? "imagem" : "imagens"})` : ""}
                </span>
                <button type="button" onClick={() => setPieces((list) => move(list, i, -1))} disabled={i === 0} aria-label="Subir peça" style={{ ...btnGhost, padding: "6px 8px" }}><ChevronUp size={14} /></button>
                <button type="button" onClick={() => setPieces((list) => move(list, i, 1))} disabled={i === pieces.length - 1} aria-label="Descer peça" style={{ ...btnGhost, padding: "6px 8px" }}><ChevronDown size={14} /></button>
                <button type="button" onClick={() => setPieces((list) => list.filter((p) => p.id !== piece.id))} aria-label="Remover peça" style={{ ...btnGhost, padding: "6px 8px" }}><Trash2 size={14} /></button>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                {piece.paths.map((p, idx) => (
                  <Thumb
                    key={p} src={preview(p)} name={`imagem ${idx + 1}`} video={isVideoPath(p)}
                    onLeft={carousel && idx > 0 ? () => setPieces((list) => list.map((x) => (x.id === piece.id ? { ...x, paths: move(x.paths, idx, -1) } : x))) : null}
                    onRight={carousel && idx < piece.paths.length - 1 ? () => setPieces((list) => list.map((x) => (x.id === piece.id ? { ...x, paths: move(x.paths, idx, 1) } : x))) : null}
                    onRemove={() => setPieces((list) => list.map((x) => (x.id === piece.id ? { ...x, paths: x.paths.filter((y) => y !== p) } : x)).filter((x) => x.paths.length))}
                  />
                ))}
                {carousel && (
                  <>
                    {pickFiles(key, true, (paths) => paths.length && setPieces((list) => list.map((x) => (x.id === piece.id ? { ...x, paths: [...x.paths, ...paths] } : x))))}
                    <button type="button" onClick={() => inputs.current[key]?.click()} disabled={busy === key} style={btnGhost}>
                      <Plus size={14} /> {busy === key ? "A carregar…" : "Mais imagens"}
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {pickFiles("new-single", true, (paths) => paths.length && setPieces((list) => [...list, ...paths.map((p) => ({ id: newPieceId(), type: "single", paths: [p] }))]))}
        {pickFiles("new-carousel", true, (paths) => paths.length && setPieces((list) => [...list, { id: newPieceId(), type: "carousel", paths }]))}
        <button type="button" onClick={() => inputs.current["new-single"]?.click()} disabled={!!busy} style={btnGhost}>
          <Upload size={14} /> {busy === "new-single" ? "A carregar…" : "Adicionar posts ou vídeos"}
        </button>
        <button type="button" onClick={() => inputs.current["new-carousel"]?.click()} disabled={!!busy} style={btnGhost}>
          <GalleryHorizontal size={14} /> {busy === "new-carousel" ? "A carregar…" : "Adicionar carrossel"}
        </button>
      </div>
      <div style={{ ...sans, fontSize: 12.5, color: c.mist, marginTop: 8 }}>Em «Adicionar carrossel» escolhe todas as imagens do carrossel de uma vez.</div>
    </Field>
  );

  const ImagePicker = ({ field, title, hint, multiple = false, allowVideo = false }) => {
    const value = content[field];
    const list = multiple ? value || [] : value ? [value] : [];
    return (
      <Field title={title} hint={hint}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          {list.map((p) => (
            <Thumb key={p} src={preview(p)} name={title} video={isVideoPath(p)} onRemove={() => set({ [field]: multiple ? list.filter((x) => x !== p) : null })} />
          ))}
          {(multiple || list.length === 0) && (
            <>
              <input
                ref={(el) => { inputs.current[field] = el; }}
                type="file" accept={`image/png,image/jpeg,image/webp,image/gif,image/svg+xml${allowVideo ? ",video/mp4,video/quicktime,video/webm" : ""}`} multiple={multiple} style={{ display: "none" }}
                onChange={(e) => { const files = [...(e.target.files || [])]; e.target.value = ""; if (files.length) upload(field, files, multiple, allowVideo); }}
              />
              <button type="button" onClick={() => inputs.current[field]?.click()} disabled={busy === field} style={btnGhost}>
                <Upload size={14} /> {busy === field ? "A carregar…" : allowVideo ? "Adicionar imagens ou vídeos" : multiple ? "Adicionar imagens" : "Carregar imagem"}
              </button>
            </>
          )}
        </div>
      </Field>
    );
  };

  const colors = content.colors || [];
  const fonts = content.fonts || [];
  const setColor = (i, patch) => set({ colors: colors.map((col, idx) => (idx === i ? { ...col, ...patch } : col)) });
  const setFont = (i, patch) => set({ fonts: fonts.map((f, idx) => (idx === i ? { ...f, ...patch } : f)) });

  const cancel = async () => {
    await removeCreativeFiles([...uploaded.current]);
    onClose();
  };

  const save = async () => {
    setError("");
    const clean = { ...content };
    if (kind === "landing_page") {
      const url = String(clean.url || "").trim();
      if (url && !safeHttpUrl(url)) { setError("O link da página ao vivo tem de começar por http:// ou https://."); return; }
      clean.url = url || null;
    }
    if (kind === "brand_identity") {
      clean.colors = colors.filter((col) => col.hex).map((col) => ({ name: String(col.name || "").trim(), hex: col.hex }));
      if (clean.colors.some((col) => !HEX_RE.test(col.hex))) { setError("Há uma cor com um valor inválido (usa o formato #RRGGBB)."); return; }
      clean.fonts = fonts.map((f) => ({ name: String(f.name || "").trim(), role: String(f.role || "").trim() })).filter((f) => f.name);
    }
    if (isGallery(kind)) clean.pieces = pieces.filter((p) => p.paths.length).map((p) => ({ id: p.id, type: p.type, paths: p.paths }));
    if (isContentEmpty(kind, clean)) { setError("Adiciona pelo menos um ficheiro ou informação antes de guardar."); return; }
    setSaving(true);
    try {
      await onSave(note, clean);
      // Ficheiros carregados que acabaram por não ser usados.
      const used = new Set(contentPaths(clean, brandId));
      await removeCreativeFiles([...uploaded.current].filter((p) => !used.has(p)));
      onClose();
    } catch (err) {
      setError(err.message || "Não foi possível guardar a versão.");
      setSaving(false);
    }
  };

  return (
    <Modal title={`Nova versão (v${versionNumber}) — ${KINDS[kind].label}`} onClose={cancel} width={620}>
      {versionNumber > 1 && (
        <div style={{ ...sans, fontSize: 13, color: c.mist, marginBottom: 16 }}>Começa com o conteúdo da versão anterior. Troca só o que mudou; as versões antigas ficam guardadas.</div>
      )}

      {kind === "business_card" && (
        <>
          {ImagePicker({ field: "front", title: "Frente" })}
          {ImagePicker({ field: "back", title: "Verso" })}
        </>
      )}

      {kind === "landing_page" && (
        <>
          {ImagePicker({ field: "desktop", title: "Pré-visualização em computador", hint: "Uma captura de ecrã da página inteira (pode ser comprida)." })}
          {ImagePicker({ field: "mobile", title: "Pré-visualização em telemóvel" })}
          <Field title="Link da página ao vivo (opcional)">
            <input value={content.url || ""} onChange={(e) => set({ url: e.target.value })} placeholder="https://…" style={inputStyle} />
          </Field>
        </>
      )}

      {kind === "brand_identity" && (
        <>
          {ImagePicker({ field: "logo", title: "Logótipo", hint: "De preferência PNG ou SVG com fundo transparente." })}
          <Field title="Paleta de cores">
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {colors.map((col, i) => (
                <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input type="color" value={HEX_RE.test(col.hex || "") ? col.hex : "#7C52A8"} onChange={(e) => setColor(i, { hex: e.target.value })} aria-label="Escolher cor" style={{ width: 44, height: 40, padding: 2, border: `1px solid ${c.lineStrong}`, borderRadius: 6, background: c.folha, cursor: "pointer" }} />
                  <input value={col.hex || ""} onChange={(e) => setColor(i, { hex: e.target.value })} placeholder="#7C52A8" aria-label="Valor da cor" style={{ ...inputStyle, width: 110 }} />
                  <input value={col.name || ""} onChange={(e) => setColor(i, { name: e.target.value })} placeholder="Nome (ex: Roxo principal)" aria-label="Nome da cor" style={inputStyle} />
                  <button type="button" onClick={() => set({ colors: colors.filter((_, idx) => idx !== i) })} aria-label="Remover cor" style={{ ...btnGhost, padding: "9px 10px" }}><Trash2 size={14} /></button>
                </div>
              ))}
              <button type="button" onClick={() => set({ colors: [...colors, { name: "", hex: "#7C52A8" }] })} style={{ ...btnGhost, alignSelf: "flex-start" }}><Plus size={14} /> Adicionar cor</button>
            </div>
          </Field>
          <Field title="Tipografias">
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {fonts.map((f, i) => (
                <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input value={f.name || ""} onChange={(e) => setFont(i, { name: e.target.value })} placeholder="Nome (ex: Playfair Display)" aria-label="Nome da fonte" style={inputStyle} />
                  <input value={f.role || ""} onChange={(e) => setFont(i, { role: e.target.value })} placeholder="Uso (ex: Títulos)" aria-label="Uso da fonte" style={inputStyle} />
                  <button type="button" onClick={() => set({ fonts: fonts.filter((_, idx) => idx !== i) })} aria-label="Remover fonte" style={{ ...btnGhost, padding: "9px 10px" }}><Trash2 size={14} /></button>
                </div>
              ))}
              <button type="button" onClick={() => set({ fonts: [...fonts, { name: "", role: "" }] })} style={{ ...btnGhost, alignSelf: "flex-start" }}><Plus size={14} /> Adicionar tipografia</button>
            </div>
          </Field>
          {ImagePicker({ field: "applications", title: "Aplicações", hint: "A identidade em uso: papelaria, fachada, redes sociais…", multiple: true })}
        </>
      )}

      {isGallery(kind) && PiecesEditor()}

      <Field title="O que mudou nesta versão (opcional)">
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={1000} placeholder="Ex: logótipo maior e cor de fundo mais escura, como pediste." style={{ ...inputStyle, resize: "vertical" }} />
      </Field>

      {error && <div role="alert" style={{ ...sans, fontSize: 14, color: c.rose, marginBottom: 12 }}>{error}</div>}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" onClick={cancel} style={btnGhost}>Cancelar</button>
        <button type="button" onClick={save} disabled={saving || !!busy} style={btnPrimary}>{saving ? "A guardar…" : "Guardar versão"}</button>
      </div>
    </Modal>
  );
}
